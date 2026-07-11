import { Module } from '@nestjs/common';
import { BaseModule } from '../base/base.module';
import { ExternalCandidateController } from './controllers/admin/external-candidate.controller';
import { ExternalCandidateService } from './services/external-candidate.service';

/**
 * 考试域模块（exam）
 * 聚合考试相关业务，当前包含外部考生管理。
 * 依赖 BaseModule 导出的 AuthService 进行密码哈希（不在本模块重复实现）。
 */
@Module({
  imports: [BaseModule],
  controllers: [ExternalCandidateController],
  providers: [ExternalCandidateService],
})
export class ExamModule {}
