import { Module } from '@nestjs/common';
import { AppHomeController } from './controllers/app-home.controller';
import { AppHomeService } from './services/app-home.service';

/**
 * 考生端首页模块（app-home）
 *
 * 提供移动端首页的统计概览与待考提醒。鉴权由全局 AppAuthGuard 负责，
 * PrismaService 由 CommonModule 全局提供，无需在此 imports。
 */
@Module({
  controllers: [AppHomeController],
  providers: [AppHomeService],
})
export class AppHomeModule {}
