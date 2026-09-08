import { ApiProperty } from '@nestjs/swagger';

/**
 * 报考申请列表/详情 VO
 * 考生姓名取快照字段 candidateName（不联表查考生账号，避免带出敏感字段）；带出认证项目名称。
 */
export class CertApplicationVo {
  @ApiProperty({ description: '报考申请 ID' })
  id: number;

  @ApiProperty({ description: '报考的认证项目 ID' })
  projectId: number;

  @ApiProperty({ description: '报考认证项目名称' })
  projectName: string;

  @ApiProperty({ description: '考生类型 internal 内部 / external 外部' })
  candidateType: string;

  @ApiProperty({ description: '考生姓名' })
  candidateName: string;

  @ApiProperty({ description: '报名单位 ID（公司节点，考生自主报考时为空）', nullable: true })
  orgId: number | null;

  @ApiProperty({ description: '报名单位名称（为空表示不占单位名额）' })
  orgName: string;

  @ApiProperty({ description: '所占名额的部门 ID', nullable: true })
  deptId: number | null;

  @ApiProperty({ description: '所占名额的部门名称（为空表示名额分给整个单位）' })
  deptName: string;

  @ApiProperty({ description: '提交人姓名（单位管理员代报时记录）', nullable: true })
  submitterName: string | null;

  @ApiProperty({ description: '报考时间' })
  applyTime: string;

  @ApiProperty({ description: '审核状态 pending 待审核 / approved 已通过 / rejected 已驳回' })
  status: string;

  @ApiProperty({ description: '审核人姓名', nullable: true })
  reviewerName: string | null;

  @ApiProperty({ description: '驳回原因', nullable: true })
  rejectReason: string | null;

  @ApiProperty({ description: '审核时间', nullable: true })
  reviewTime: string | null;
}
