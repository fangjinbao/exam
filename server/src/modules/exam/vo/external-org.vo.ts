import { ApiProperty } from '@nestjs/swagger';

/**
 * 外部单位响应 VO
 * 外部单位为基础数据，无敏感字段，字段与 Prisma ExternalOrg model 一致。
 */
export class ExternalOrgVo {
  @ApiProperty({ description: '外部单位 ID' })
  id: number;

  @ApiProperty({ description: '单位名称（系统内唯一）' })
  name: string;

  @ApiProperty({ description: '单位编码（系统内唯一）', nullable: true })
  code: string | null;

  @ApiProperty({ description: '联系人', nullable: true })
  contact: string | null;

  @ApiProperty({ description: '联系电话（11 位手机号）', nullable: true })
  phone: string | null;

  @ApiProperty({ description: '单位地址', nullable: true })
  address: string | null;

  @ApiProperty({ description: '备注', nullable: true })
  remark: string | null;

  @ApiProperty({ description: '状态 1=启用 0=停用' })
  status: number;

  @ApiProperty({ description: '创建时间' })
  createTime: string;

  @ApiProperty({ description: '更新时间' })
  updateTime: string;
}

/**
 * 外部单位下拉选项 VO
 * 供外部考生新增/编辑表单及筛选选择所属单位，仅返回启用单位的 id 与名称。
 */
export class ExternalOrgOptionVo {
  @ApiProperty({ description: '外部单位 ID' })
  id: number;

  @ApiProperty({ description: '单位名称' })
  name: string;
}

/**
 * 批量导入单行错误明细
 */
export class ImportOrgRowErrorVo {
  @ApiProperty({ description: '出错行号（从 1 开始，对应文件数据行，不含表头）' })
  row: number;

  @ApiProperty({ description: '跳过原因' })
  reason: string;
}

/**
 * 外部单位批量导入响应 VO
 * 逐行导入：成功行入库，失败行跳过并在 errors 中给出行号与原因。
 */
export class ImportOrgResultVo {
  @ApiProperty({ description: '成功导入数量' })
  success: number;

  @ApiProperty({ description: '跳过（失败）行数' })
  failed: number;

  @ApiProperty({ description: '失败行明细', type: [ImportOrgRowErrorVo] })
  errors: ImportOrgRowErrorVo[];
}
