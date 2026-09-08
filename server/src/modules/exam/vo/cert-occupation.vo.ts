import { ApiProperty } from '@nestjs/swagger';

/** 鉴定级别 VO（工种的子行） */
export class CertOccupationLevelVo {
  @ApiProperty({ description: '级别 ID' })
  id: number;

  @ApiProperty({ description: '所属工种 ID' })
  occupationId: number;

  @ApiProperty({ description: '级别名称' })
  name: string;

  @ApiProperty({ description: '排序号（同工种内升序）' })
  orderNum: number;

  @ApiProperty({ description: '级别说明', nullable: true })
  description: string | null;
}

/**
 * 鉴定工种 VO（树形表格的父行）
 *
 * children 而非 levels：前端 ElTable 的 tree-props 默认读 children 字段，
 * 后端直接按该名字下发，前端不必再做一次改名映射。
 */
export class CertOccupationVo {
  @ApiProperty({ description: '工种 ID' })
  id: number;

  @ApiProperty({ description: '工种名称' })
  name: string;

  @ApiProperty({ description: '工种编号' })
  code: string;

  @ApiProperty({ description: '工种说明', nullable: true })
  description: string | null;

  @ApiProperty({ description: '排序号' })
  orderNum: number;

  @ApiProperty({ description: '状态 1=启用 0=停用' })
  status: number;

  @ApiProperty({ description: '级别数量（便于列表直接显示，不必前端数 children）' })
  levelCount: number;

  @ApiProperty({ description: '该工种下的鉴定级别', type: [CertOccupationLevelVo] })
  children: CertOccupationLevelVo[];

  @ApiProperty({ description: '创建时间' })
  createTime: string;

  @ApiProperty({ description: '更新时间' })
  updateTime: string;
}
