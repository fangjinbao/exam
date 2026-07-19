import { Module } from '@nestjs/common';
import { BaseModule } from '../base/base.module';
import { ExternalCandidateController } from './controllers/admin/external-candidate.controller';
import { ExternalCandidateService } from './services/external-candidate.service';
import { ExternalOrgController } from './controllers/admin/external-org.controller';
import { ExternalOrgService } from './services/external-org.service';
import { KnowledgePointController } from './controllers/admin/knowledge-point.controller';
import { KnowledgePointService } from './services/knowledge-point.service';
import { QuestionController } from './controllers/admin/question.controller';
import { QuestionService } from './services/question.service';

/**
 * 考试域模块（exam）
 * 聚合考试相关业务：外部单位管理、外部考生管理、题库管理（知识点分类 + 题目管理）。
 * 依赖 BaseModule 导出的 AuthService 进行密码哈希（不在本模块重复实现）。
 */
@Module({
  imports: [BaseModule],
  controllers: [
    ExternalCandidateController,
    ExternalOrgController,
    KnowledgePointController,
    QuestionController,
  ],
  providers: [
    ExternalCandidateService,
    ExternalOrgService,
    KnowledgePointService,
    QuestionService,
  ],
})
export class ExamModule {}
