import { ApiProperty } from '@nestjs/swagger';

/**
 * 考试列表/基础响应 VO
 * 无敏感字段；paperName/paperType 由试卷关联带出，candidateCount 为已分配考生数。
 */
export class ExamVo {
  @ApiProperty({ description: '考试 ID' })
  id: number;

  @ApiProperty({ description: '考试类型：normal 普通考试 / skill 技能鉴定考试' })
  examType: string;

  @ApiProperty({ description: '考试名称' })
  name: string;

  @ApiProperty({ description: '考试说明', nullable: true })
  description: string | null;

  @ApiProperty({ description: '所选试卷 ID' })
  paperId: number;

  @ApiProperty({ description: '试卷名称' })
  paperName: string;

  @ApiProperty({ description: '试卷类型 fixed/random' })
  paperType: string;

  @ApiProperty({ description: '开始时间' })
  startTime: string;

  @ApiProperty({ description: '结束时间' })
  endTime: string;

  @ApiProperty({ description: '考试时长（分钟）' })
  duration: number;

  @ApiProperty({ description: '及格分数' })
  passScore: number;

  @ApiProperty({ description: '关联认证项目 ID', nullable: true })
  certProjectId: number | null;

  @ApiProperty({ description: '通过后自动发证' })
  autoIssueCert: boolean;

  @ApiProperty({ description: '自动发证使用的证书模板 ID', nullable: true })
  certTemplateId: number | null;

  @ApiProperty({ description: '考试状态：unpublished/published/ongoing/finished' })
  status: string;

  @ApiProperty({ description: '参考人数（已分配考生数）' })
  candidateCount: number;

  @ApiProperty({ description: '创建人用户 ID', nullable: true })
  createBy: number | null;

  @ApiProperty({ description: '创建人姓名（系统关联查询）' })
  createByName: string;

  @ApiProperty({ description: '创建人所属单位（由创建人部门上溯到公司节点，实时派生）' })
  createByOrgName: string;

  @ApiProperty({ description: '创建时间' })
  createTime: string;

  @ApiProperty({ description: '更新时间' })
  updateTime: string;
}

/** 考试考生项 VO */
export class ExamCandidateVo {
  @ApiProperty({ description: '分配记录 ID' })
  id: number;

  @ApiProperty({ description: '考生类型 internal/external' })
  candidateType: string;

  @ApiProperty({ description: '内部考生用户 ID', nullable: true })
  internalUserId: number | null;

  @ApiProperty({ description: '外部考生 ID', nullable: true })
  externalCandidateId: number | null;

  @ApiProperty({ description: '考生姓名' })
  candidateName: string;

  @ApiProperty({
    description: '登录账号：内部为统一身份账号，外部考生以手机号登录',
    nullable: true,
  })
  account: string | null;

  @ApiProperty({ description: '身份证号（内部人员无此字段，恒为 null）', nullable: true })
  idCard: string | null;

  @ApiProperty({ description: '手机号', nullable: true })
  phone: string | null;

  @ApiProperty({ description: '考点 ID', nullable: true })
  examSiteId: number | null;

  @ApiProperty({ description: '考点名称（随记录带出，考点停用后仍可回显）', nullable: true })
  examSiteName: string | null;

  @ApiProperty({ description: '考点地址', nullable: true })
  examSiteAddress: string | null;

  @ApiProperty({ description: '考点可容纳人数', nullable: true })
  examSiteCapacity: number | null;
}

/** 考试工作人员项 VO（监考 / 阅卷共用） */
export class ExamStaffVo {
  @ApiProperty({ description: '人员用户 ID' })
  userId: number;

  @ApiProperty({ description: '姓名（以库内当前记录为准，人员已删除时退回落库快照）' })
  name: string;

  @ApiProperty({ description: '登录账号（统一身份账号）', nullable: true })
  account: string | null;

  @ApiProperty({ description: '所属部门名' })
  belong: string;
}

/** 考试设置 VO（防作弊 + 重考 + 考前/考中/考后） */
export class ExamSettingVo {
  @ApiProperty({ description: '防切屏检测' })
  screenSwitchDetect: boolean;

  @ApiProperty({ description: '允许切屏次数' })
  allowSwitchTimes: number;


  @ApiProperty({ description: '题目乱序' })
  shuffleQuestions: boolean;

  @ApiProperty({ description: '操作限制' })
  operationRestrict: boolean;

  @ApiProperty({ description: '最多重考次数（0=不允许重考）' })
  retakeLimit: number;

  @ApiProperty({ description: '【考前】允许提前进场分钟数' })
  earlyEnterMinutes: number;

  @ApiProperty({ description: '【考前】需签署考试承诺书' })
  requireCommitment: boolean;

  @ApiProperty({ description: '【考中】允许提前交卷' })
  allowEarlySubmit: boolean;

  @ApiProperty({ description: '【考中】最短作答时长（分钟）' })
  minAnswerMinutes: number;

  @ApiProperty({ description: '【考中】显示剩余时间' })
  showRemainingTime: boolean;


  @ApiProperty({ description: '【考后】允许查看成绩' })
  allowViewScore: boolean;

  @ApiProperty({ description: '【考后】允许查看答案与解析' })
  allowViewAnalysis: boolean;

  // 无 scorePublishMode：公布时机按卷内有无主观题自动判定，不作为设置下发
}

/** 考试详情 VO（基本信息 + 考生 + 考试设置） */
export class ExamDetailVo extends ExamVo {
  @ApiProperty({ description: '所选试卷总分（编辑页回显及格分参照）' })
  paperTotalScore: number;

  @ApiProperty({ description: '所选试卷建议时长（分钟，编辑页回显时长参照）' })
  paperSuggestDuration: number;

  @ApiProperty({
    description: '关联认证项目名称（未关联或项目已删除为 null）',
    nullable: true,
  })
  certProjectName: string | null;

  @ApiProperty({
    description: '证书模板名称（未指定或模板已删除为 null）',
    nullable: true,
  })
  certTemplateName: string | null;

  @ApiProperty({ description: '分配的考生列表', type: [ExamCandidateVo] })
  candidates: ExamCandidateVo[];

  @ApiProperty({ description: '指派的监考人员', type: [ExamStaffVo] })
  proctors: ExamStaffVo[];

  @ApiProperty({ description: '指派的阅卷人员', type: [ExamStaffVo] })
  graders: ExamStaffVo[];

  @ApiProperty({ description: '考试设置', type: ExamSettingVo, nullable: true })
  setting: ExamSettingVo | null;
}
