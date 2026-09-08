import { Module } from '@nestjs/common';
import { ExamModule } from '@/modules/exam/exam.module';
import { AppExamController } from './controllers/app-exam.controller';
import { AppExamService } from './services/app-exam.service';

/**
 * 考生端考试模块（app-exam）
 *
 * 提供移动端考试全流程接口。鉴权由全局 AppAuthGuard 负责，
 * PrismaService 由 CommonModule 全局提供，无需在此 imports。
 *
 * 引入 ExamModule 是为了复用管理端的 GradingService：交卷判分与后台阅卷
 * 必须用同一套规则，否则考生看到的分数与管理端复核结果会不一致。
 */
@Module({
  imports: [ExamModule],
  controllers: [AppExamController],
  providers: [AppExamService],
})
export class AppExamModule {}
