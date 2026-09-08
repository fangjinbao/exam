import { ApiProperty } from '@nestjs/swagger';

/**
 * 阅卷任务列表项 VO（一份答卷一条）
 * 无敏感字段；未判分/未完成的分值以 null 返回，前端显示「-」。
 *
 * 注意：项目未启用 ClassSerializerInterceptor，本 VO 不做运行时字段裁剪，仅供 Swagger 文档。
 * 「无敏感字段」是靠 grading.service.ts 的 pageList 用 Prisma `select` 限定列来保证的；
 * 若改回 `include`（整表列全取）+ `...sheet` 展开，会把 tenantId、internalUserId 等
 * 内部标识一并下发，上面那句即不再成立。
 */
export class GradingTaskVo {
  @ApiProperty({ description: '答卷 ID' })
  id: number;

  @ApiProperty({ description: '所属考试 ID' })
  examId: number;

  @ApiProperty({ description: '考试名称' })
  examName: string;

  @ApiProperty({ description: '考生姓名' })
  candidateName: string;

  @ApiProperty({ description: '客观题题量' })
  objectiveCount: number;

  @ApiProperty({ description: '主观题题量' })
  subjectiveCount: number;

  @ApiProperty({ description: '客观题得分', nullable: true })
  objectiveScore: number | null;

  @ApiProperty({ description: '主观题得分', nullable: true })
  subjectiveScore: number | null;

  @ApiProperty({ description: '总分', nullable: true })
  totalScore: number | null;

  @ApiProperty({ description: '阅卷状态 pending 待批阅 / completed 已阅完' })
  gradingStatus: string;

  @ApiProperty({ description: '成绩是否已发布' })
  scorePublished: boolean;

  @ApiProperty({ description: '是否及格', nullable: true })
  passed: boolean | null;

  @ApiProperty({ description: '交卷时间', nullable: true })
  submitTime: string | null;
}

/** 考试维度阅卷列表行 VO（一场考试一条） */
export class GradingExamVo {
  @ApiProperty({ description: '考试 ID' })
  id: number;

  @ApiProperty({ description: '考试编号（JCKS-创建日期+4位ID 派生，非库中字段）' })
  examNo: string;

  @ApiProperty({ description: '考试名称' })
  name: string;

  @ApiProperty({ description: '试卷名称' })
  paperName: string;

  @ApiProperty({ description: '来源：关联认证项目名，未关联时回落试卷名' })
  sourceName: string;

  @ApiProperty({ description: '考试状态 unpublished/published/ongoing/finished' })
  status: string;

  @ApiProperty({ description: '开始时间' })
  startTime: string;

  @ApiProperty({ description: '结束时间' })
  endTime: string;

  @ApiProperty({ description: '及格分数' })
  passScore: number;

  @ApiProperty({ description: '应考人数（考生分配数，含未交卷）' })
  candidateCount: number;

  @ApiProperty({ description: '已交答卷总份数' })
  sheetCount: number;

  @ApiProperty({ description: '待批阅份数（尚有未评分主观题的答卷数）' })
  pendingCount: number;

  @ApiProperty({ description: '已发布成绩份数' })
  publishedCount: number;
}

/** 阅卷工作台的考生名单项 VO */
export class GradingCandidateVo {
  @ApiProperty({ description: '答卷 ID' })
  id: number;

  @ApiProperty({ description: '考生姓名' })
  candidateName: string;

  @ApiProperty({ description: '考生类型 internal/external' })
  candidateType: string;

  @ApiProperty({ description: '所属组织：内部取部门名，外部取所属单位名；缺失为空串' })
  orgName: string;

  @ApiProperty({ description: '客观题得分', nullable: true })
  objectiveScore: number | null;

  @ApiProperty({ description: '主观题得分', nullable: true })
  subjectiveScore: number | null;

  @ApiProperty({ description: '总分', nullable: true })
  totalScore: number | null;

  @ApiProperty({ description: '阅卷状态 pending 待批阅 / completed 已阅完' })
  gradingStatus: string;

  @ApiProperty({ description: '成绩是否已发布' })
  scorePublished: boolean;

  @ApiProperty({ description: '是否及格', nullable: true })
  passed: boolean | null;

  @ApiProperty({ description: '交卷时间', nullable: true })
  submitTime: string | null;

  @ApiProperty({ description: '尚未给出最终分的主观题数' })
  pendingSubjectiveCount: number;
}

/** 整场发布成绩结果 VO */
export class GradingBatchPublishVo {
  @ApiProperty({ description: '成功发布份数' })
  published: number;

  @ApiProperty({ description: '跳过份数（主观题未阅完等）' })
  skipped: number;

  @ApiProperty({ description: '跳过原因（去重）', type: [String] })
  reasons: string[];
}

/** 整场撤回成绩结果 VO */
export class GradingBatchWithdrawVo {
  @ApiProperty({ description: '成功撤回份数' })
  withdrawn: number;

  @ApiProperty({ description: '跳过份数' })
  skipped: number;

  @ApiProperty({ description: '跳过原因（去重）', type: [String] })
  reasons: string[];
}

/** 整卷单题 VO（客观题只读、主观题可评分） */
export class SheetQuestionItemVo {
  @ApiProperty({ description: '答题项 ID，提交评分时回传' })
  id: number;

  @ApiProperty({ description: '题号（卷面顺序）' })
  questionNo: number;

  @ApiProperty({ description: '题型 single/multiple/judge/blank/qa/essay，前端按此分大题' })
  questionType: string;

  @ApiProperty({ description: '题目大类 objective/subjective' })
  questionCategory: string;

  @ApiProperty({ description: '题干（富文本）' })
  stem: string;

  @ApiProperty({ description: '选项原文（选择题有值）', nullable: true })
  options: string | null;

  @ApiProperty({ description: '考生答案', nullable: true })
  candidateAnswer: string | null;

  @ApiProperty({ description: '标准答案', nullable: true })
  standardAnswer: string | null;

  @ApiProperty({ description: '评分标准（主观题）', nullable: true })
  scoringCriteria: string | null;

  @ApiProperty({ description: '该题满分' })
  fullScore: number;

  @ApiProperty({ description: '得分：客观题自动判分 / 主观题人工评分，null 为未评', nullable: true })
  score: number | null;

  @ApiProperty({ description: '客观题对错，主观题为 null', nullable: true })
  isCorrect: boolean | null;

  @ApiProperty({
    description:
      '最近一次人工评分的评语（主观题；未评或未写评语为空串）。' +
      '取自 ReviewRecord 留痕表，供工作台重新打开该卷时回显',
  })
  reviewComment: string;

  @ApiProperty({ description: '最近一次人工评分的阅卷人姓名（主观题；未评为 null）', nullable: true })
  reviewerName: string | null;

  @ApiProperty({ description: '最近一次人工评分时间（主观题；未评为 null）', nullable: true })
  reviewTime: string | null;
}

/** 整卷阅卷详情 VO（工作台打开一份卷的全部数据） */
export class SheetDetailVo {
  @ApiProperty({ description: '答卷 ID' })
  id: number;

  @ApiProperty({ description: '所属考试 ID' })
  examId: number;

  @ApiProperty({ description: '考试名称' })
  examName: string;

  @ApiProperty({ description: '考生姓名' })
  candidateName: string;

  @ApiProperty({ description: '试卷总分' })
  paperTotalScore: number;

  @ApiProperty({ description: '及格分数' })
  passScore: number;

  @ApiProperty({ description: '客观题得分', nullable: true })
  objectiveScore: number | null;

  @ApiProperty({ description: '主观题得分', nullable: true })
  subjectiveScore: number | null;

  @ApiProperty({ description: '总分', nullable: true })
  totalScore: number | null;

  @ApiProperty({ description: '阅卷状态 pending/completed' })
  gradingStatus: string;

  @ApiProperty({ description: '成绩是否已发布' })
  scorePublished: boolean;

  @ApiProperty({ description: '是否及格', nullable: true })
  passed: boolean | null;

  @ApiProperty({ description: '交卷时间', nullable: true })
  submitTime: string | null;

  @ApiProperty({ description: '全部题目（题号升序）', type: [SheetQuestionItemVo] })
  items: SheetQuestionItemVo[];
}

/** 评分记录 VO（append-only 留痕） */
export class ReviewRecordVo {
  @ApiProperty({ description: '记录 ID' })
  id: number;

  @ApiProperty({ description: '答题项 ID' })
  answerItemId: number;

  @ApiProperty({ description: '阅卷人姓名' })
  reviewerName: string;

  @ApiProperty({ description: '修改前分数', nullable: true })
  scoreBefore: number | null;

  @ApiProperty({ description: '修改后分数' })
  scoreAfter: number;

  @ApiProperty({ description: '评语（可为空串）' })
  reviewComment: string;

  @ApiProperty({ description: '评分时间' })
  reviewTime: string;
}
