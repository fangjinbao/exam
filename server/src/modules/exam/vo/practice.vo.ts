import { ApiProperty } from '@nestjs/swagger';

/**
 * 练习列表/基础响应 VO
 * bankNames 由题库关联带出，participantCount 为参与人数
 * （participantScope=all 时为 -1，前端展示「全员」而非具体数字）。
 */
export class PracticeVo {
  @ApiProperty({ description: '练习 ID' })
  id: number;

  @ApiProperty({ description: '练习名称' })
  name: string;

  @ApiProperty({ description: '练习编号' })
  code: string;

  @ApiProperty({ description: '练习说明', nullable: true })
  description: string | null;

  @ApiProperty({ description: '抽题方式 sequential 全库顺序练 / random 按规则抽题' })
  drawMode: string;

  @ApiProperty({ description: '关联题库 ID 列表' })
  bankIds: number[];

  @ApiProperty({ description: '关联题库名称列表（列表页展示用）' })
  bankNames: string[];

  @ApiProperty({ description: '练习开始时间', nullable: true })
  startTime: string | null;

  @ApiProperty({ description: '练习结束时间', nullable: true })
  endTime: string | null;

  @ApiProperty({ description: '自动结束' })
  autoFinish: boolean;

  @ApiProperty({ description: '参与范围 specified 指定员工 / all 全员参与' })
  participantScope: string;

  @ApiProperty({ description: '参与人数；participantScope=all 时为 -1 表示全员' })
  participantCount: number;

  @ApiProperty({ description: '题目总数：顺序练=题库题量合计，规则抽题=各规则抽取数合计' })
  questionCount: number;

  @ApiProperty({ description: '练习状态 unpublished/published/ongoing/finished' })
  status: string;

  @ApiProperty({ description: '创建人用户 ID', nullable: true })
  createBy: number | null;

  @ApiProperty({ description: '创建人姓名' })
  createByName: string;

  @ApiProperty({ description: '创建时间' })
  createTime: string;

  @ApiProperty({ description: '更新时间' })
  updateTime: string;
}

/** 练习设置 VO */
export class PracticeSettingVo {
  @ApiProperty({ description: '允许反复练习' })
  allowRepeat: boolean;

  @ApiProperty({ description: '单题作答后展示对错' })
  showResultPerQuestion: boolean;

  @ApiProperty({ description: '展示答案' })
  showAnswer: boolean;

  @ApiProperty({ description: '展示解析' })
  showAnalysis: boolean;
}

/** 抽题规则 VO（含知识点名称，编辑页回显用） */
export class PracticeRuleVo {
  @ApiProperty({ description: '规则 ID' })
  id: number;

  @ApiProperty({ description: '题型' })
  questionType: string;

  @ApiProperty({ description: '难度' })
  difficulty: string;

  @ApiProperty({ description: '知识点 ID' })
  knowledgePointId: number;

  @ApiProperty({ description: '知识点名称（知识点被删除时为空串）' })
  knowledgePointName: string;

  @ApiProperty({ description: '抽取数量' })
  drawCount: number;
}

/** 参与人员 VO（含姓名，编辑页回显用） */
export class PracticeParticipantVo {
  @ApiProperty({ description: '记录 ID' })
  id: number;

  @ApiProperty({ description: '参与人类型 internal/external' })
  participantType: string;

  @ApiProperty({ description: '内部人员用户 ID', nullable: true })
  internalUserId: number | null;

  @ApiProperty({ description: '外部考生 ID', nullable: true })
  externalCandidateId: number | null;

  @ApiProperty({ description: '姓名（人员被删除时为空串）' })
  participantName: string;
}

/** 题库范围项 VO（含名称与题量，编辑页回显用） */
export class PracticeBankVo {
  @ApiProperty({ description: '题库 ID' })
  bankId: number;

  @ApiProperty({ description: '题库名称' })
  bankName: string;

  @ApiProperty({ description: '题库内正式题目数' })
  questionCount: number;
}

/** 练习详情 VO：基础信息 + 题库范围 + 抽题规则 + 参与人员 + 练习设置 */
export class PracticeDetailVo extends PracticeVo {
  @ApiProperty({ description: '题库范围（含名称与题量）', type: [PracticeBankVo] })
  banks: PracticeBankVo[];

  @ApiProperty({ description: '抽题规则', type: [PracticeRuleVo] })
  rules: PracticeRuleVo[];

  @ApiProperty({ description: '指定参与人员', type: [PracticeParticipantVo] })
  participants: PracticeParticipantVo[];

  @ApiProperty({ description: '练习设置', type: PracticeSettingVo, nullable: true })
  setting: PracticeSettingVo | null;
}

