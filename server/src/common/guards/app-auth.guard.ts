import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../redis.service';
import { IS_PUBLIC_KEY } from './perms.guard';
import { isAppRoute } from './route-scope.util';

/** C 端 token 的 scope 标记值（与 AppAuthService.APP_TOKEN_SCOPE 保持一致） */
const APP_SCOPE = 'app';

/**
 * C 端（考生端）鉴权守卫
 *
 * 只负责 /app 前缀的路由，与管理端 AuthGuard 对称：
 * 校验 JWT → 确认 scope 为 'app' → 与 Redis 中 `app:token:{userType}:{userId}` 比对
 * → 校验密码版本 → 通过后将 payload 写入 request.currentUser 供 @CurrentUser 取用。
 *
 * 非 /app 前缀的请求本守卫直接放行（由 AuthGuard 接管），
 * 两个守卫都以 APP_GUARD 全局注册，Nest 对多个全局守卫是「全部通过才放行」的 AND 语义。
 */
@Injectable()
export class AppAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwtService: JwtService,
    private redisService: RedisService,
  ) {}

  /**
   * C 端鉴权主流程
   * @param context 执行上下文
   * @returns 是否放行；token 缺失或失效时抛出 UnauthorizedException
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // @Public 标记的接口跳过鉴权（/app/auth/login、/app/auth/refreshToken）
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();

    // 非 C 端路由不介入，交由管理端 AuthGuard 校验
    if (!isAppRoute(request)) return true;

    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('登录失效~');
    }

    try {
      const payload = this.jwtService.verify(token);

      // 管理端 token 与 C 端 token 用同一 JWT_SECRET 签发，仅靠验签无法区分，
      // 必须校验 scope，防止拿管理端 token 访问 C 端接口
      if (payload.scope !== APP_SCOPE) {
        throw new UnauthorizedException('登录失效~');
      }

      // 刷新 token 不能用于访问业务接口
      if (payload.isRefresh) {
        throw new UnauthorizedException('登录失效~');
      }

      const { userId, userType } = payload;
      if (!userId || !userType) {
        throw new UnauthorizedException('登录失效~');
      }

      // 与 Redis 缓存比对，确保主动登出、被顶号后立即失效
      const cachedToken = await this.redisService.get(
        `app:token:${userType}:${userId}`,
      );
      if (!cachedToken || cachedToken !== token) {
        throw new UnauthorizedException('登录失效~');
      }

      // 密码版本不一致说明已改密/重置密码，旧 token 立即失效
      const passwordV = await this.redisService.get(
        `app:passwordVersion:${userType}:${userId}`,
      );
      if (passwordV && Number(passwordV) !== payload.passwordVersion) {
        throw new UnauthorizedException('登录失效~');
      }

      // 鉴权信息挂到请求对象，供 @CurrentUser 使用
      request.currentUser = payload;
      return true;
    } catch (error) {
      // 已是鉴权异常则原样抛出，其余（验签失败、过期等）统一归为登录失效
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('登录失效~');
    }
  }

  /**
   * 从请求头提取 Bearer token
   * @param request 请求对象
   * @returns token 字符串，缺失时返回 null
   */
  private extractToken(request: any): string | null {
    const authorization = request.headers['authorization'] || '';
    if (authorization.startsWith('Bearer ')) {
      return authorization.slice(7);
    }
    return null;
  }
}
