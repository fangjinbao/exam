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
import { QuestionBankController } from './controllers/admin/question-bank.controller';
import { QuestionBankService } from './services/question-bank.service';
import { QuestionBankAccessService } from './services/question-bank-access.service';
import { OrgScopeService } from './services/org-scope.service';
import { PaperAccessService } from './services/paper-access.service';
import { CertificateTemplateController } from './controllers/admin/certificate-template.controller';
import { CertificateTemplateService } from './services/certificate-template.service';
import { PaperController } from './controllers/admin/paper.controller';
import { PaperService } from './services/paper.service';
import { ExamController } from './controllers/admin/exam.controller';
import { ExamService } from './services/exam.service';
import { ExamScoreService } from './services/exam-score.service';
import { ExamCandidateImportService } from './services/exam-candidate-import.service';
import { ExamStaffService } from './services/exam-staff.service';
import { GradingController } from './controllers/admin/grading.controller';
import { GradingService } from './services/grading.service';
import { ProctorController } from './controllers/admin/proctor.controller';
import { ProctorService } from './services/proctor.service';
import { ProctorMutationService } from './services/proctor-mutation.service';
import { ExamAnalyticsController } from './controllers/admin/exam-analytics.controller';
import { ExamAnalyticsService } from './services/exam-analytics.service';
import { GradingSheetService } from './services/grading-sheet.service';
import { CertProjectController } from './controllers/admin/cert-project.controller';
import { CertProjectService } from './services/cert-project.service';
import { CertEnrollController } from './controllers/admin/cert-enroll.controller';
import { CertEnrollService } from './services/cert-enroll.service';
import { CertOccupationController } from './controllers/admin/cert-occupation.controller';
import { CertOccupationService } from './services/cert-occupation.service';
import { CertApplicationController } from './controllers/admin/cert-application.controller';
import { CertApplicationService } from './services/cert-application.service';
import { CertificateController } from './controllers/admin/certificate.controller';
import { CertificateService } from './services/certificate.service';
import { PracticeController } from './controllers/admin/practice.controller';
import { PracticeService } from './services/practice.service';
import { PracticeMutationService } from './services/practice-mutation.service';
import { PracticeRecordService } from './services/practice-record.service';
import { PracticeValidationService } from './services/practice-validation.service';
import { ParticipantResolverService } from './services/participant-resolver.service';
import { SelfPracticeController } from './controllers/admin/self-practice.controller';
import { SelfPracticeService } from './services/self-practice.service';

/**
 * 考试域模块（exam）
 * 聚合考试相关业务：外部单位管理、外部考生管理、题库管理（知识点分类 + 题目管理）、证书模板管理、
 * 试卷管理（固定/随机组卷）、考试管理（分配考生 + 防作弊 + 发布）、阅卷中心（客观题判分 + 主观题 AI/人工阅卷）、
 * 练习管理（岗位练兵：题库+抽题规则+参与人员+练习设置；自主练习：按题库开放给学员自主选择）。
 * 依赖 BaseModule 导出的 AuthService 进行密码哈希（不在本模块重复实现）。
 */
@Module({
  imports: [BaseModule],
  controllers: [
    ExternalCandidateController,
    ExternalOrgController,
    KnowledgePointController,
    QuestionController,
    QuestionBankController,
    CertificateTemplateController,
    PaperController,
    ExamController,
    GradingController,
    ProctorController,
    ExamAnalyticsController,
    CertProjectController,
    CertEnrollController,
    CertOccupationController,
    CertApplicationController,
    CertificateController,
    PracticeController,
    SelfPracticeController,
  ],
  providers: [
    ExternalCandidateService,
    ExternalOrgService,
    KnowledgePointService,
    QuestionService,
    QuestionBankService,
    OrgScopeService,
    QuestionBankAccessService,
    PaperAccessService,
    CertificateTemplateService,
    PaperService,
    ExamService,
    ExamScoreService,
    ExamCandidateImportService,
    ExamStaffService,
    GradingService,
    ProctorService,
    ProctorMutationService,
    ExamAnalyticsService,
    GradingSheetService,
    CertProjectService,
    CertEnrollService,
    CertOccupationService,
    CertApplicationService,
    CertificateService,
    ParticipantResolverService,
    PracticeService,
    PracticeMutationService,
    PracticeRecordService,
    PracticeValidationService,
    SelfPracticeService,
  ],
  /*
    导出给考生端复用：
    - GradingService：交卷判分复用管理端同一套判分逻辑，避免两处规则漂移
  */
  exports: [GradingService],
})
export class ExamModule {}
