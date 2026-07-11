import { ApiProperty } from '@nestjs/swagger';

/**
 * 考点响应 VO
 * 考点为基础数据，无敏感字段，字段与 Prisma ExamSite model 一致。
 */
export class ExamSiteVo {
  @ApiProperty({ description: '考点 ID' })
  id: number;

  @ApiProperty({ description: '考点名称（系统内唯一）' })
  name: string;

  @ApiProperty({ description: '考点地址' })
  address: string;

  @ApiProperty({ description: '容纳人数（可空，正整数）', nullable: true })
  capacity: number | null;

  @ApiProperty({ description: '联系人', nullable: true })
  contact: string | null;

  @ApiProperty({ description: '联系电话（11 位手机号）', nullable: true })
  phone: string | null;

  @ApiProperty({ description: '状态 1=启用 0=停用' })
  status: number;

  @ApiProperty({ description: '创建时间' })
  createTime: string;

  @ApiProperty({ description: '更新时间' })
  updateTime: string;
}
