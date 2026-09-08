import { Module } from '@nestjs/common';
import { SystemModule } from '@/modules/system/system.module';
import { AppPracticeController } from './controllers/app-practice.controller';
import { AppPracticeService } from './services/app-practice.service';

/**
 * 考生端练习模块（app-practice）
 *
 * 提供移动端在线练习接口：岗位练兵、自主练习、错题重练。
 * 鉴权由全局 AppAuthGuard 负责，PrismaService 由 CommonModule 全局提供，
 * 由 src/common/module-loader 自动发现，无需在 AppModule 手动注册。
 *
 * 不依赖 ExamModule：与管理端共用的判分、练习状态、抽题条件等都是
 * utils/ 下的纯函数，不需要管理端的服务实例。
 */
@Module({
  imports: [SystemModule],
  controllers: [AppPracticeController],
  providers: [AppPracticeService],
})
export class AppPracticeModule {}
