import {
  IsInt,
  IsPositive,
  IsString,
  IsOptional,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 新增题目接口入参
 * 题干、题型、标准答案、难度、知识点必填；选项按题型分支校验（客观题必填，主观题免填），
 * 分支校验与字典值合法性校验在 service/controller 完成，故此处 options 声明为可选。
 */
export class CreateQuestionDto {
  @ApiProperty({ description: '题干（多行文本）' })
  @IsString()
  @IsNotEmpty({ message: '请输入题干' })
  @MaxLength(2000, { message: '题干不超过 2000 字' })
  stem: string;

  @ApiProperty({ description: '题型（字典 question_type 的 value）' })
  @IsString()
  @IsNotEmpty({ message: '请选择题型' })
  type: string;

  @ApiProperty({ description: '选项（多行文本，客观题必填）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: '选项不超过 2000 字' })
  options?: string;

  @ApiProperty({ description: '标准答案' })
  @IsString()
  @IsNotEmpty({ message: '请输入标准答案' })
  @MaxLength(2000, { message: '标准答案不超过 2000 字' })
  answer: string;

  @ApiProperty({ description: '答案解析', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: '答案解析不超过 2000 字' })
  analysis?: string;

  @ApiProperty({ description: '难度（字典 difficulty 的 value）' })
  @IsString()
  @IsNotEmpty({ message: '请选择难度' })
  difficulty: string;

  @ApiProperty({ description: '所属知识点 ID' })
  @IsInt()
  @IsPositive()
  knowledgePointId: number;

  @ApiProperty({ description: '分值建议（正整数）', required: false })
  @IsOptional()
  @IsInt()
  @IsPositive()
  suggestedScore?: number;
}

/**
 * 更新题目接口入参
 * 通过 id 定位，其余字段同新增。
 */
export class UpdateQuestionDto extends CreateQuestionDto {
  @ApiProperty({ description: '题目 ID' })
  @IsInt()
  @IsPositive()
  id: number;
}

/**
 * 审核通过入参
 */
export class ApproveQuestionDto {
  @ApiProperty({ description: '题目 ID' })
  @IsInt()
  @IsPositive()
  id: number;
}

/**
 * 审核退回入参
 * 退回原因必填，≤200 字。
 */
export class RejectQuestionDto {
  @ApiProperty({ description: '题目 ID' })
  @IsInt()
  @IsPositive()
  id: number;

  @ApiProperty({ description: '退回原因（≤200 字）' })
  @IsString()
  @IsNotEmpty({ message: '请填写退回原因' })
  @MaxLength(200, { message: '退回原因不超过 200 字' })
  reason: string;
}
