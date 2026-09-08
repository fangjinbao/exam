import { ApiProperty } from '@nestjs/swagger';

/**
 * 题库响应 VO
 * 题库为基础数据，无敏感字段，字段与 Prisma QuestionBank model 一致；
 * questionCount 为列表附带的题目数量统计（非表字段，由 service 聚合得出）。
 */
export class QuestionBankVo {
  @ApiProperty({ description: '题库 ID' })
  id: number;

  @ApiProperty({ description: '题库名称（全局唯一）' })
  name: string;

  @ApiProperty({ description: '题库编码（全局唯一）' })
  code: string;

  @ApiProperty({ description: '题库描述', nullable: true })
  description: string | null;

  @ApiProperty({ description: '状态 1=启用 0=停用' })
  status: number;

  @ApiProperty({ description: '该题库下题目总数（系统统计）' })
  questionCount: number;

  @ApiProperty({ description: '创建人用户 ID', nullable: true })
  createBy: number | null;

  @ApiProperty({ description: '创建人姓名（系统关联查询）' })
  createByName: string;

  @ApiProperty({ description: '创建人所属单位（由创建人部门上溯到公司节点，实时派生）' })
  createByOrgName: string;

  @ApiProperty({ description: '可见范围 self=仅自己 dept=本部门 company=本公司 all=全部' })
  visibleScope: string;

  @ApiProperty({ description: '共享权限级别 manage=可管理 view=可查看' })
  shareLevel: string;

  @ApiProperty({ description: '当前用户是否可管理该题库（含题目增删改）' })
  canManage: boolean;

  @ApiProperty({ description: '当前用户是否可修改共享设置（仅创建人与超管）' })
  canEditShare: boolean;

  @ApiProperty({ description: '创建时间' })
  createTime: string;

  @ApiProperty({ description: '更新时间' })
  updateTime: string;
}

/**
 * 导入失败行明细
 */
export class ImportRowErrorVo {
  @ApiProperty({ description: '出错行号（从 1 开始，对应文件数据行，不含表头）' })
  row: number;

  @ApiProperty({ description: '跳过原因' })
  reason: string;
}

/**
 * 批量导入响应 VO
 * 逐行导入：成功行入库，失败行跳过并在 errors 中给出行号与原因。
 */
export class ImportResultVo {
  @ApiProperty({ description: '成功导入数量' })
  success: number;

  @ApiProperty({ description: '跳过（失败）行数' })
  failed: number;

  @ApiProperty({ description: '失败行明细', type: [ImportRowErrorVo] })
  errors: ImportRowErrorVo[];
}
