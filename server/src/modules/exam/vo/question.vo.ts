import { ApiProperty } from '@nestjs/swagger';

/**
 * 题目响应 VO
 * 题目为业务明文数据，无敏感字段，字段与 Prisma Question model 一致；
 * knowledgePointName 由关联的知识点带出，便于列表直接展示所属知识点。
 */
export class QuestionVo {
  @ApiProperty({ description: '题目 ID' })
  id: number;

  @ApiProperty({ description: '题干（多行文本）' })
  stem: string;

  @ApiProperty({ description: '题型（字典 question_type 的 value：single/multiple/judge/blank/qa/essay）' })
  type: string;

  @ApiProperty({ description: '选项（多行文本，主观题为空）', nullable: true })
  options: string | null;

  @ApiProperty({ description: '标准答案' })
  answer: string;

  @ApiProperty({ description: '答案解析', nullable: true })
  analysis: string | null;

  @ApiProperty({ description: '难度（字典 difficulty 的 value：easy/medium/hard）' })
  difficulty: string;

  @ApiProperty({ description: '所属知识点 ID' })
  knowledgePointId: number;

  @ApiProperty({ description: '所属知识点名称', nullable: true })
  knowledgePointName?: string | null;

  @ApiProperty({ description: '分值建议', nullable: true })
  suggestedScore: number | null;

  @ApiProperty({ description: '状态：formal 正式 / pending 待审' })
  status: string;

  @ApiProperty({ description: '退回原因（审核退回时记录）', nullable: true })
  rejectReason: string | null;

  @ApiProperty({ description: '创建时间' })
  createTime: string;

  @ApiProperty({ description: '更新时间' })
  updateTime: string;
}
