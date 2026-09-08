import { Module } from '@nestjs/common';
import { AppProfileController } from './controllers/app-profile.controller';
import { AppProfileService } from './services/app-profile.service';

/**
 * 考生端个人中心模块（app-profile）
 *
 * 提供成绩与证书查询。鉴权由全局 AppAuthGuard 负责，
 * PrismaService 由 CommonModule 全局提供，无需在此 imports。
 */
@Module({
  controllers: [AppProfileController],
  providers: [AppProfileService],
})
export class AppProfileModule {}
