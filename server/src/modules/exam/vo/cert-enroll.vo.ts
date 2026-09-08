import { ApiProperty } from '@nestjs/swagger';

/**
 * 可报名项目 VO
 *
 * 只列已发布且给「我的单位」分了名额的项目——没分到名额的项目对该单位
 * 没有意义，列出来只会让人点进去发现无处可报。
 */
export class EnrollProjectVo {
  @ApiProperty({ description: '项目 ID' })
  id: number;

  @ApiProperty({ description: '鉴定名称' })
  name: string;

  @ApiProperty({ description: '鉴定工种名称' })
  occupationName: string;

  @ApiProperty({ description: '鉴定级别名称' })
  levelName: string;

  @ApiProperty({ description: '负责人姓名' })
  managerName: string;

  @ApiProperty({ description: '联系电话' })
  contactPhone: string;

  @ApiProperty({ description: '报名截止时间（精确到秒）' })
  applyDeadline: Date;

  @ApiProperty({ description: '鉴定开始时间' })
  startTime: Date;

  @ApiProperty({ description: '鉴定结束时间' })
  endTime: Date;

  @ApiProperty({ description: '发布时间' })
  publishTime: Date | null;

  @ApiProperty({ description: '报名是否已截止（到截止时刻即关闭）' })
  closed: boolean;

  @ApiProperty({ description: '我的单位名额合计（超管未指定单位时为空）', nullable: true })
  quotaTotal: number | null;

  @ApiProperty({ description: '已占用（pending + approved）', nullable: true })
  quotaUsed: number | null;

  @ApiProperty({ description: '剩余可报', nullable: true })
  quotaRemain: number | null;
}

/**
 * 名额行 VO（我的单位在某项目下的一行名额）
 *
 * 各行是独立的桶：一个单位可能有多个名额行（按部门分，外加一行整个单位），
 * 安全监督部的名额不该被综合办公室的人占掉，故 used/remain 按行统计。
 */
export class MyQuotaVo {
  @ApiProperty({ description: '名额行 ID' })
  quotaId: number;

  @ApiProperty({ description: '单位 ID' })
  orgId: number;

  @ApiProperty({ description: '单位名称' })
  orgName: string;

  @ApiProperty({ description: '部门 ID（名额分给整个单位时为空）', nullable: true })
  deptId: number | null;

  @ApiProperty({ description: '部门名称（为空表示不分部门）' })
  deptName: string;

  @ApiProperty({ description: '分配名额' })
  quota: number;

  @ApiProperty({ description: '已占用（pending + approved）' })
  used: number;

  @ApiProperty({ description: '剩余可报' })
  remain: number;
}

/** 可选人员 VO（本名额范围内、且未在本项目占名额的启用员工） */
export class EnrollCandidateVo {
  @ApiProperty({ description: '用户 ID' })
  id: number;

  @ApiProperty({ description: '姓名' })
  name: string;

  @ApiProperty({ description: '工号' })
  workId: string;

  @ApiProperty({ description: '手机号' })
  phone: string;

  @ApiProperty({ description: '所属部门名称' })
  deptName: string;
}

/** 我的单位已报人员 VO */
export class MyApplicationVo {
  @ApiProperty({ description: '报名记录 ID' })
  id: number;

  @ApiProperty({ description: '考生姓名' })
  candidateName: string;

  @ApiProperty({ description: '内部员工 ID' })
  internalUserId: number | null;

  @ApiProperty({ description: '所占名额的部门 ID', nullable: true })
  deptId: number | null;

  @ApiProperty({ description: '所占名额的部门名称（为空表示不分部门）' })
  deptName: string;

  @ApiProperty({ description: '审核状态：pending / approved / rejected' })
  status: string;

  @ApiProperty({ description: '驳回原因', nullable: true })
  rejectReason: string | null;

  @ApiProperty({ description: '审核人姓名', nullable: true })
  reviewerName: string | null;

  @ApiProperty({ description: '审核时间', nullable: true })
  reviewTime: Date | null;

  @ApiProperty({ description: '提交人姓名', nullable: true })
  submitterName: string | null;

  @ApiProperty({ description: '报名时间' })
  applyTime: Date;
}
