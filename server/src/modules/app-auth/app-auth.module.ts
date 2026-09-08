import { Module } from '@nestjs/common';
import { AppAuthController } from './controllers/app-auth.controller';
import { AppAuthService } from './services/app-auth.service';

/**
 * 考生端认证模块（app-auth）
 *
 * 独立于 base 模块（管理后台基座）存在：C 端有自己的 token 命名空间、
 * 鉴权守卫与用户体系（跨 SysUser 与 ExternalCandidate 两张表），
 * 与管理端认证互不影响。
 * PrismaService / RedisService / JwtModule 均由 CommonModule 全局提供，无需在此 imports。
 */
@Module({
  controllers: [AppAuthController],
  providers: [AppAuthService],
})
export class AppAuthModule {}
