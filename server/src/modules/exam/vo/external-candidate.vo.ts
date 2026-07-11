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

  @ApiProperty({ description: '准考证号（考试账号登录名，系统内唯一）' })
  admissionNo: string;

  @ApiProperty({ description: '所属单位', nullable: true })
  company: string | null;

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
 * 批量导入响应 VO
 */
export class ImportResultVo {
  @ApiProperty({ description: '成功导入的外部考生数量' })
  count: number;
}
