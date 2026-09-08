import { ApiProperty } from '@nestjs/swagger';

/** 考生成绩行 VO */
export class ExamScoreItemVo {
  @ApiProperty({ description: '考生类型 internal 内部 / external 外部' })
  candidateType: string;

  @ApiProperty({ description: '考生业务 ID（内部为用户 ID，外部为外部考生 ID）' })
  candidateId: number;

  @ApiProperty({ description: '考生姓名' })
  name: string;

  @ApiProperty({ description: '所属公司' })
  companyName: string;

  @ApiProperty({ description: '所属部门（外部考生恒为空串）' })
  departmentName: string;

  @ApiProperty({
    description: '考试状态 not_started 未参加 / ongoing 考试中 / pending_grading 待阅卷 / completed 已完成',
  })
  status: string;

  @ApiProperty({ description: '客观题得分（未判分为 null）', nullable: true })
  objectiveScore: number | null;

  @ApiProperty({ description: '主观题得分（未阅完为 null）', nullable: true })
  subjectiveScore: number | null;

  @ApiProperty({ description: '总分（成绩未发布为 null）', nullable: true })
  totalScore: number | null;

  @ApiProperty({ description: '是否及格（成绩未发布为 null）', nullable: true })
  passed: boolean | null;

  @ApiProperty({ description: '作答用时（分钟，时间缺失为 null）', nullable: true })
  durationMinutes: number | null;

  @ApiProperty({ description: '开考时间', nullable: true })
  startTime: string | null;

  @ApiProperty({ description: '交卷时间', nullable: true })
  submitTime: string | null;

  @ApiProperty({ description: '切屏次数' })
  switchCount: number;
}

/** 导入考生匹配成功项 VO */
export class ResolvedCandidateVo {
  @ApiProperty({ description: '考生类型 internal / external' })
  type: string;

  @ApiProperty({ description: '考生业务 ID' })
  id: number;

  @ApiProperty({ description: '库内姓名（以系统记录为准）' })
  name: string;

  @ApiProperty({ description: '所属：内部为部门名，外部为单位名' })
  belong: string;

  @ApiProperty({
    description: '登录账号：内部为统一身份账号，外部考生以手机号登录',
    nullable: true,
  })
  account: string | null;

  @ApiProperty({ description: '身份证号（内部人员无此字段，恒为 null）', nullable: true })
  idCard: string | null;

  @ApiProperty({ description: '手机号', nullable: true })
  phone: string | null;
}

/** 被跳过的行 VO */
export class SkippedRowVo {
  @ApiProperty({ description: 'Excel 行号（含表头）' })
  row: number;

  @ApiProperty({ description: '跳过原因' })
  reason: string;
}

/** 导入考生匹配结果 VO */
export class ResolveImportResultVo {
  @ApiProperty({ description: '匹配到的考生', type: [ResolvedCandidateVo] })
  matched: ResolvedCandidateVo[];

  @ApiProperty({ description: '被跳过的行明细', type: [SkippedRowVo] })
  errors: SkippedRowVo[];
}
