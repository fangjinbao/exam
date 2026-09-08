import { ApiProperty } from '@nestjs/swagger';

/** 监考中心考试列表行 VO（一场考试一条） */
export class ProctorExamVo {
  @ApiProperty({ description: '考试 ID' })
  id: number;

  @ApiProperty({ description: '考试编号（JCKS-创建日期+4位ID 派生，非库中字段）' })
  examNo: string;

  @ApiProperty({ description: '考试名称' })
  name: string;

  @ApiProperty({ description: '考试状态 published/ongoing/finished（按当前时间实时推算）' })
  status: string;

  @ApiProperty({ description: '开始时间' })
  startTime: string;

  @ApiProperty({ description: '结束时间' })
  endTime: string;

  @ApiProperty({ description: '考试时长（分钟）' })
  duration: number;

  @ApiProperty({ description: '应考人数' })
  candidateCount: number;

  @ApiProperty({ description: '已交卷份数' })
  submittedCount: number;

  @ApiProperty({ description: '进行中份数（已取卷未交卷）' })
  ongoingCount: number;
}

/** 监考名单的一行：一份答卷一行，允许重考时同一考生有多行 */
export class ProctorCandidateVo {
  @ApiProperty({ description: '行唯一键（一人多行时 candidateId 不唯一，前端 row-key 用此字段）' })
  rowKey: string;

  @ApiProperty({ description: '考生分配行 ID（ExamCandidate.id）' })
  candidateId: number;

  @ApiProperty({ description: '第几次考试，从 1 开始；未取卷为 0' })
  attemptNo: number;

  @ApiProperty({ description: '是否重考（第 2 次及以后）' })
  isRetake: boolean;

  @ApiProperty({ description: '答卷 ID；未取卷时为 null（此时无任何监考动作可执行）' })
  sheetId: number | null;

  @ApiProperty({ description: '考生类型 internal/external' })
  candidateType: string;

  @ApiProperty({ description: '考生姓名' })
  candidateName: string;

  @ApiProperty({ description: '账号：内部为统一身份账号，外部考生为登录手机号' })
  account: string | null;

  @ApiProperty({ description: '所属公司' })
  companyName: string;

  @ApiProperty({ description: '监考状态 not_started 未开考 / ongoing 进行中 / submitted 已交卷' })
  status: string;

  @ApiProperty({ description: '已切屏次数' })
  switchCount: number;

  @ApiProperty({
    description:
      '是否已超出允许切屏次数（需检测开关开启且 allowSwitchTimes > 0，与考生端判定同口径）',
  })
  switchExceeded: boolean;

  @ApiProperty({ description: '开考时间（首次取卷）' })
  startTime: string | null;

  @ApiProperty({ description: '交卷时间' })
  submitTime: string | null;

  @ApiProperty({ description: '卷面总题数；未取卷为 0' })
  totalCount: number;

  @ApiProperty({ description: '已答题数' })
  answeredCount: number;

  @ApiProperty({ description: '阅卷状态；未取卷为 null' })
  gradingStatus: string | null;

  @ApiProperty({ description: '本人已交卷次数（不含正在答的这次；同一考生各行相同）' })
  attemptUsed: number;

  @ApiProperty({ description: '总机会数 = 考试设置 retakeLimit + 1' })
  attemptLimit: number;

  @ApiProperty({
    description: '成绩；无已交卷答卷、或主观题未阅完时为 null',
    nullable: true,
  })
  score: number | null;

  @ApiProperty({
    description:
      '成绩状态：none 本次未交卷 / pending 待阅卷（尚有未评分主观题） / graded 已阅完未发布 / published 已发布',
    enum: ['none', 'pending', 'graded', 'published'],
  })
  scoreState: 'none' | 'pending' | 'graded' | 'published';
}

/**
 * 监考名单的概览计数（按「人」统计）
 *
 * 列表是一行一次考试，重考的人占多行，前端数行数只会得到答卷数，
 * 故这几个数必须由后端按人算好下发。
 */
export class ProctorStatsVo {
  @ApiProperty({ description: '应考人数' })
  total: number;

  @ApiProperty({ description: '未开考人数（无答卷，或已取卷但未开始作答）' })
  notStarted: number;

  @ApiProperty({ description: '进行中人数（按每人当前那份答卷判定）' })
  ongoing: number;

  @ApiProperty({ description: '已交卷人数' })
  submitted: number;

  @ApiProperty({ description: '切屏超次人数（一人多次超次只计一次）' })
  exceeded: number;
}
