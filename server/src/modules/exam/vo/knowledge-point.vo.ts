import { ApiProperty } from '@nestjs/swagger';

/**
 * 知识点分类响应 VO
 * 知识点为基础分类数据，无敏感字段，字段与 Prisma KnowledgePoint model 一致；
 * children 用于树形返回，叶子节点为空数组。
 */
export class KnowledgePointVo {
  @ApiProperty({ description: '知识点 ID' })
  id: number;

  @ApiProperty({ description: '父级知识点 ID（顶级为 null）', nullable: true })
  parentId: number | null;

  @ApiProperty({ description: '知识点名称' })
  name: string;

  @ApiProperty({ description: '排序号（同级内升序）' })
  orderNum: number;

  @ApiProperty({ description: '备注', nullable: true })
  remark: string | null;

  @ApiProperty({ description: '创建时间' })
  createTime: string;

  @ApiProperty({ description: '更新时间' })
  updateTime: string;

  @ApiProperty({ description: '子知识点列表（树形）', type: [KnowledgePointVo] })
  children: KnowledgePointVo[];
}
