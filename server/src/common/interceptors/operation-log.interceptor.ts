import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../prisma.service';
import { resolveClientIp } from '../utils/client-ip.util';
import { PERMS_ACTION_KEY } from '../decorators/perms.decorator';
import {
  OPERATION_LOG_KEY,
  SKIP_OPERATION_LOG_KEY,
  OperationLogOptions,
} from '../decorators/operation-log.decorator';

/** 写动作 → 操作类型映射（未命中的写动作归为「其他」） */
const WRITE_ACTION_TYPE: Record<string, string> = {
  add: '新增',
  update: '编辑',
  'update-status': '编辑',
  setMenus: '编辑',
  move: '编辑',
  'reset-password': '编辑',
  enable: '编辑',
  restore: '编辑',
  delete: '删除',
  'batch-delete': '删除',
  clear: '删除',
  import: '其他',
};

/**
 * @ApiTags 的元数据 key（@nestjs/swagger 内部常量 DECORATORS.API_TAGS）。
 * 该值稳定，直接硬编码以规避对包内部 dist 路径的深层导入（其不在 exports 白名单，运行时会报错）。
 */
const SWAGGER_API_TAGS_KEY = 'swagger/apiUseTags';

/** 读动作集合：这些 action 不记录操作日志 */
const READ_ACTIONS = new Set([
  'list',
  'detail',
  'tables',
  'preview',
  'getMenus',
  'export',
  'test',
]);

/**
 * 操作日志拦截器（全局）
 *
 * 在写操作接口成功返回后，自动向 sysOperationLog 落一条操作记录：
 * - 命中条件：方法标注 @OperationLog，或 @Perms 的 action 属于写动作集（且未标 @SkipOperationLog）；
 * - 操作人：按 request.admin.userId 查 sysUser 姓名（name || nickName || username），带进程内缓存；
 * - 操作类型/对象/内容：@OperationLog 优先，否则由 action 映射与 @ApiTags 推导；
 * - 写库为 fire-and-forget，任何异常仅记日志，绝不影响主流程与响应。
 */
@Injectable()
export class OperationLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(OperationLogInterceptor.name);
  /** userId → 操作人姓名 的进程内缓存，避免每次写日志都查库 */
  private readonly nameCache = new Map<number, string>();

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const handler = context.getHandler();
    const controller = context.getClass();

    const skip = this.reflector.get<boolean>(SKIP_OPERATION_LOG_KEY, handler);
    const options = this.reflector.get<OperationLogOptions>(OPERATION_LOG_KEY, handler);
    const action = this.reflector.get<string>(PERMS_ACTION_KEY, handler);

    // 命中判定：显式排除优先；否则「标了 @OperationLog」或「action 属于写动作」才记
    const shouldLog =
      !skip && (!!options || (!!action && !READ_ACTIONS.has(action) && this.isWriteAction(action)));

    // 来源 IP 必须在此同步捕获：record() 是响应发出后才执行的异步任务，
    // 那时 socket 可能已释放，req.ip / socket.remoteAddress 会读到空值。
    const request = context.switchToHttp().getRequest();
    const sourceIp = shouldLog ? resolveClientIp(request) : '';

    return next.handle().pipe(
      tap((result) => {
        if (!shouldLog) return;
        // 异步落库，不阻塞响应；内部自吞异常
        this.record(request, controller, action, options, result, sourceIp).catch((e) =>
          this.logger.warn(`操作日志记录失败: ${e?.message || e}`),
        );
      }),
    );
  }

  /** action 是否属于写动作（在映射表内即为写动作；未知 action 保守视为非写，交由 @OperationLog 显式声明） */
  private isWriteAction(action: string): boolean {
    return action in WRITE_ACTION_TYPE;
  }

  /** 组装并写入一条操作日志 */
  private async record(
    request: any,
    controller: any,
    action: string | undefined,
    options: OperationLogOptions | undefined,
    result: any,
    sourceIp: string,
  ): Promise<void> {
    const admin = request.admin;
    if (!admin?.userId) return; // 未登录（理论上写接口都需登录）不记

    const operator = await this.resolveOperator(admin.userId, admin.username);
    const target = options?.target || this.resolveTarget(controller);
    const type = options?.type || (action ? WRITE_ACTION_TYPE[action] : undefined) || '其他';
    const content = this.resolveContent(options, type, target, request, result);

    await this.prisma.sysOperationLog.create({
      data: {
        operator,
        type,
        target,
        content,
        sourceIp: sourceIp || '未知',
        tenantId: admin.tenantId ?? null,
      },
    });
  }

  /** 取操作人姓名：优先 sysUser.name/nickName，回退 username；带缓存 */
  private async resolveOperator(userId: number, fallback?: string): Promise<string> {
    const cached = this.nameCache.get(userId);
    if (cached) return cached;
    let name = fallback || `用户${userId}`;
    try {
      const user = await this.prisma.sysUser.findUnique({
        where: { id: userId },
        select: { name: true, nickName: true, username: true },
      });
      if (user) name = user.name || user.nickName || user.username || name;
    } catch {
      // 查库失败时用 fallback，不阻断
    }
    this.nameCache.set(userId, name);
    return name;
  }

  /** 由 controller 的 @ApiTags 推导操作对象，去掉「系统管理-」等前缀 */
  private resolveTarget(controller: any): string {
    const tags: string[] | undefined = Reflect.getMetadata(SWAGGER_API_TAGS_KEY, controller);
    const tag = tags?.[0] || '系统';
    return tag.replace(/^.*?-/, '');
  }

  /** 生成操作内容：@OperationLog.content 优先（字符串或函数），否则通用「${type}${target}」 */
  private resolveContent(
    options: OperationLogOptions | undefined,
    type: string,
    target: string,
    request: any,
    result: any,
  ): string {
    const c = options?.content;
    if (typeof c === 'function') {
      try {
        return c({
          body: request.body,
          result: this.unwrap(result),
          params: request.params,
          query: request.query,
          request,
        });
      } catch {
        return `${type}${target}`;
      }
    }
    if (typeof c === 'string' && c) return c;
    return `${type}${target}`;
  }

  /** 剥离控制器返回的 { code, data } 外壳，便于 content 函数直接读业务数据 */
  private unwrap(result: any): any {
    if (result && typeof result === 'object' && 'code' in result && 'data' in result) {
      return result.data;
    }
    return result;
  }
}

