import { ApiProperty } from '@nestjs/swagger';

/**
 * 名额分配行 VO
 * 单位/部门名称一并带出，列表直接展示，前端不必再查部门。
 */
export class CertProjectQuotaVo {
  @ApiProperty({ description: '名额行 ID' })
  id: number;

  @ApiProperty({ description: '单位 ID（公司节点）' })
  orgId: number;

  @ApiProperty({ description: '单位名称' })
  orgName: string;

  @ApiProperty({ description: '部门 ID（可空，空表示名额分给整个单位）', nullable: true })
  deptId: number | null;

  @ApiProperty({ description: '部门名称（部门为空时返回空串）' })
  deptName: string;

  @ApiProperty({ description: '分配名额数' })
  quota: number;
}

/**
 * 鉴定项目响应 VO
 *
 * 基础配置数据，无敏感字段。
 * 工种名、级别名、负责人姓名扁平化为 occupationName/levelName/managerName。
 */
export class CertProjectVo {
  @ApiProperty({ description: '鉴定项目 ID' })
  id: number;

  @ApiProperty({ description: '鉴定名称（全局唯一）' })
  name: string;

  @ApiProperty({ description: '鉴定简介', nullable: true })
  description: string | null;

  @ApiProperty({ description: '鉴定工种 ID' })
  occupationId: number;

  @ApiProperty({ description: '鉴定工种名称' })
  occupationName: string;

  @ApiProperty({ description: '鉴定级别 ID' })
  levelId: number;

  @ApiProperty({ description: '鉴定级别名称' })
  levelName: string;

  @ApiProperty({ description: '负责人用户 ID' })
  managerId: number;

  @ApiProperty({ description: '负责人姓名' })
  managerName: string;

  @ApiProperty({ description: '联系电话' })
  contactPhone: string;

  @ApiProperty({ description: '报名截止时间（精确到秒）' })
  applyDeadline: string;

  @ApiProperty({ description: '鉴定开始时间' })
  startTime: string;

  @ApiProperty({ description: '鉴定结束时间' })
  endTime: string;

  @ApiProperty({ description: '报考条件说明', nullable: true })
  applyCondition: string | null;

  @ApiProperty({ description: '状态 1=启用 0=停用' })
  status: number;

  @ApiProperty({ description: '发布状态：unpublished 未发布 / published 已发布' })
  publishStatus: string;

  @ApiProperty({ description: '发布时间（未发布为空）', nullable: true })
  publishTime: Date | null;

  @ApiProperty({
    description: '名额分配（仅详情接口返回，列表不带）',
    type: [CertProjectQuotaVo],
    required: false,
  })
  quotas?: CertProjectQuotaVo[];

  @ApiProperty({ description: '创建人用户 ID', nullable: true })
  createBy: number | null;

  @ApiProperty({ description: '创建人姓名（列表带出）' })
  createByName: string;

  @ApiProperty({
    description: '创建人所属单位名称（从其部门沿上级找到的第一个公司节点；查不到为空串）',
  })
  createByOrgName: string;

  @ApiProperty({ description: '创建时间' })
  createTime: string;

  @ApiProperty({ description: '更新时间' })
  updateTime: string;
}

/**
 * 鉴定项目下拉选项 VO
 * 供报考审核、证书发放筛选鉴定项目时使用，仅返回 id 与名称。
 */
export class CertProjectOptionVo {
  @ApiProperty({ description: '鉴定项目 ID' })
  id: number;

  @ApiProperty({ description: '鉴定名称' })
  name: string;
}

/**
 * 部门下拉选项 VO
 * 供名额分配选择某单位下的部门时使用。
 */
export class DeptOptionVo {
  @ApiProperty({ description: '部门 ID' })
  id: number;

  @ApiProperty({ description: '部门名称' })
  name: string;
}

/**
 * 单位树节点 VO
 *
 * 单位是公司节点（集团公司/省公司/分公司），按原层级返回成树：
 * 62 个单位平铺很难找，按「集团 → 省公司 → 分公司」展示才对得上认知。
 */
export class OrgTreeNodeVo {
  @ApiProperty({ description: '单位 ID' })
  id: number;

  @ApiProperty({ description: '单位名称' })
  name: string;

  @ApiProperty({ description: '单位类型：集团公司/省公司/分公司' })
  type: string;

  @ApiProperty({
    description: '下级单位（叶子节点无此字段）',
    type: [OrgTreeNodeVo],
    required: false,
  })
  children?: OrgTreeNodeVo[];
}
