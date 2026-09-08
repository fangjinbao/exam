import { ApiProperty } from '@nestjs/swagger';

/**
 * 自主练习题库列表项 VO
 * 对应管理端「自主练习」列表：题库名称 / 创建人 / 试题数 / 开放人数 / 考核点 / 开放状态。
 * 未配置过开放的题库同样出现在列表中，此时 isOpen=false、openUserCount=0。
 */
export class SelfPracticeBankVo {
  @ApiProperty({ description: '题库 ID' })
  bankId: number;

  @ApiProperty({ description: '题库名称' })
  bankName: string;

  @ApiProperty({ description: '题库创建人用户 ID', nullable: true })
  createBy: number | null;

  @ApiProperty({ description: '题库创建人姓名' })
  createByName: string;

  @ApiProperty({ description: '试题数（题库内正式题目数）' })
  questionCount: number;

  @ApiProperty({ description: '开放人数；openScope=all 时为 -1 表示全员' })
  openUserCount: number;

  @ApiProperty({ description: '考核点数（限定的可练知识点数，0 表示不限）' })
  knowledgePointCount: number;

  @ApiProperty({ description: '开放状态' })
  isOpen: boolean;

  @ApiProperty({ description: '开放范围 all/specified' })
  openScope: string;
}

/** 开放人员 VO（含姓名，设置抽屉回显用） */
export class SelfPracticeUserVo {
  @ApiProperty({ description: '记录 ID' })
  id: number;

  @ApiProperty({ description: '人员类型 internal/external' })
  userType: string;

  @ApiProperty({ description: '内部人员用户 ID', nullable: true })
  internalUserId: number | null;

  @ApiProperty({ description: '外部考生 ID', nullable: true })
  externalCandidateId: number | null;

  @ApiProperty({ description: '姓名（人员被删除时为空串）' })
  userName: string;
}

/** 可练知识点 VO */
export class SelfPracticeKnowledgePointVo {
  @ApiProperty({ description: '知识点 ID' })
  knowledgePointId: number;

  @ApiProperty({ description: '知识点名称' })
  knowledgePointName: string;
}

/** 题库自主练习配置详情 VO */
export class SelfPracticeConfigVo {
  @ApiProperty({ description: '题库 ID' })
  bankId: number;

  @ApiProperty({ description: '题库名称' })
  bankName: string;

  @ApiProperty({ description: '开放状态' })
  isOpen: boolean;

  @ApiProperty({ description: '开放范围 all/specified' })
  openScope: string;

  @ApiProperty({ description: '单次练习题数上限（0=不限）' })
  maxQuestionsPerRound: number;

  @ApiProperty({ description: '允许反复练习' })
  allowRepeat: boolean;

  @ApiProperty({ description: '单题作答后展示对错' })
  showResultPerQuestion: boolean;

  @ApiProperty({ description: '展示答案' })
  showAnswer: boolean;

  @ApiProperty({ description: '展示解析' })
  showAnalysis: boolean;

  @ApiProperty({ description: '开放人员', type: [SelfPracticeUserVo] })
  users: SelfPracticeUserVo[];

  @ApiProperty({ description: '可练知识点（空数组表示不限）', type: [SelfPracticeKnowledgePointVo] })
  knowledgePoints: SelfPracticeKnowledgePointVo[];
}
