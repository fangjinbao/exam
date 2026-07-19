import { ApiProperty } from '@nestjs/swagger';

/**
 * 外部考生响应 VO
 * 注意：密码（password）、密码版本（passwordV）为敏感字段，不对外暴露，不在 VO 中声明。
 */
export class ExternalCandidateVo {
  @ApiProperty({ description: '外部考生 ID' })
  id: number;

  @ApiProperty({ description: '姓名' })
  name: string;

  @ApiProperty({ description: '所属外部单位 ID' })
  orgId: number;

  @ApiProperty({ description: '所属外部单位名称（关联展示）' })
  orgName: string;

  @ApiProperty({ description: '证件号', nullable: true })
  idCard: string | null;

  @ApiProperty({ description: '联系电话' })
  phone: string;

  @ApiProperty({ description: '电子邮箱', nullable: true })
  email: string | null;

  @ApiProperty({ description: '账号状态 1=启用 0=停用' })
  status: number;

  @ApiProperty({ description: '创建时间' })
  createTime: string;

  @ApiProperty({ description: '更新时间' })
  updateTime: string;
}

/**
 * 重置密码响应 VO
 * 返回重置后的明文密码，供管理员一次性告知考生（不落日志）。
 */
export class ResetPasswordVo {
  @ApiProperty({ description: '重置后的明文密码' })
  password: string;
}

/**
 * 批量导入单行错误明细
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
