import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';
import { SeedService } from './seed.service';
import { PermsSyncService } from './perms-sync.service';

/**
 * 应用启动初始化（对齐 fastapi 的 lifespan 初始化思路）
 *
 * 生产环境：自动迁移数据库 + 幂等初始化种子数据；开发环境用 `pnpm setup` 脚本初始化。
 * 权限点自动同步（PermsSyncService）则在所有环境执行——它依赖代码声明而非环境，
 * 新增接口重启即自动登记权限，是声明式 RBAC 的核心环节。
 */
@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly seedService: SeedService,
    private readonly permsSyncService: PermsSyncService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const env = this.config.get<string>('NODE_ENV', 'development');
    if (env === 'production') {
      // 迁移已由容器 entrypoint.sh 在应用启动前执行（prisma migrate deploy），此处不再重复
      await this.seedIfEmpty();
    } else {
      this.logger.log('非生产环境，跳过种子初始化（开发请用 pnpm setup）');
    }

    // 数据字典单独补齐：所有环境、每次启动都执行，不受「库为空」判断限制。
    //
    // 字典项是代码里定死的枚举（题型、难度、事件类型），新增一项属于功能上线的
    // 一部分，必须能进到已有库里。原先它只在整体种子里跑，而种子的三处调用点
    // （bootstrap 的 seedIfEmpty、dev-setup.sh 的 init_seed、以及非生产直接跳过）
    // 都以「已有数据」为由整体跳过，导致 seedDict 内部逐项补齐的能力永远触发不到——
    // 表现就是新加的题型在界面上死活不出现，且没有任何报错。
    await this.syncDict();

    // 导航菜单单独补齐：同 syncDict，所有环境、每次启动都执行。
    // 菜单是代码里定死的导航结构，新增模块必须能进到已有库里；
    // 挂在 seedIfEmpty 里会被「已有用户则跳过」挡掉，新菜单永远不出现。
    // 必须在 syncPerms 之前——按钮权限要挂到已存在的菜单节点下。
    await this.syncNavMenus();

    // 权限点自动同步：所有环境执行，在 seed 之后（按钮需挂到已存在的菜单下）
    await this.syncPerms();
  }

  /**
   * 补齐数据字典（幂等，失败不阻断启动）
   *
   * 只新增缺失项，不覆盖已有项——管理员在后台改过的名称/排序/启用状态都会保留。
   */
  private async syncDict(): Promise<void> {
    try {
      await this.seedService.syncDict();
    } catch (e) {
      // 字典补齐失败不应导致服务无法启动，记录错误待人工排查
      this.logger.error(`数据字典补齐失败: ${(e as Error).message}`);
    }
  }

  /**
   * 补齐导航菜单（幂等，失败不阻断启动）
   *
   * 按 router upsert，只回填代码声明的字段；管理员在菜单管理页新建的菜单不受影响。
   */
  private async syncNavMenus(): Promise<void> {
    try {
      await this.seedService.seedNavMenus();
    } catch (e) {
      // 菜单补齐失败不应导致服务无法启动，记录错误待人工排查
      this.logger.error(`导航菜单补齐失败: ${(e as Error).message}`);
    }
  }

  /**
   * 同步声明式权限点到菜单按钮节点（幂等，失败不阻断启动）
   */
  private async syncPerms(): Promise<void> {
    try {
      await this.permsSyncService.sync();
    } catch (e) {
      // 权限同步失败不应导致服务无法启动，记录错误待人工排查
      this.logger.error(`权限点自动同步失败: ${(e as Error).message}`);
    }
  }

  /** 幂等种子数据：检测无用户才初始化（seed 逻辑已编译进 dist，无需 ts-node） */
  private async seedIfEmpty(): Promise<void> {
    const count = await this.prisma.sysUser.count();
    if (count > 0) {
      this.logger.log(`已有 ${count} 个用户，跳过种子数据初始化`);
      return;
    }
    await this.seedService.run();
  }
}
