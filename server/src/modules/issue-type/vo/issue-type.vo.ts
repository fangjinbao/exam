import { ApiProperty } from '@nestjs/swagger';

/**
 * 问题类型响应 VO
 * auditorName 为关联用户姓名的派生字段（非数据库列，由 service 查询用户表后追加）。
 */
export class IssueTypeVo {
  @ApiProperty({ description: '问题类型 ID' })
  id: number;

  @ApiProperty({ description: '类型名称' })
  name: string;

  @ApiProperty({ description: '默认审核人 ID', nullable: true })
  auditorId: number | null;

  @ApiProperty({ description: '默认审核人姓名（派生字段）', nullable: true })
  auditorName: string | null;

  @ApiProperty({ description: '排序号（升序）' })
  orderNum: number;

  @ApiProperty({ description: '状态 1=启用 0=停用' })
  status: number;

  @ApiProperty({ description: '创建时间' })
  createTime: string;

  @ApiProperty({ description: '更新时间' })
  updateTime: string;
}
