import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * 材料题下的一个小题
 *
 * 富文本字段（stem/options/analysis）上限 20000 字符，与 CreateQuestionDto 一致；
 * answer 保持 2000 纯文本上限——它是判分比对基准，不做富文本。
 */
export class CompositeChildDto {
  @ApiProperty({ description: '既有小题 ID；不传表示新增', required: false })
  @IsOptional()
  @IsInt()
  @IsPositive({ message: '小题 ID 非法' })
  id?: number;

  @ApiProperty({ description: '题型（字典 question_type 的 value，不可为 composite）' })
  @IsString()
  @IsNotEmpty({ message: '请选择小题题型' })
  type: string;

  @ApiProperty({ description: '小题题干（富文本 HTML）' })
  @IsString()
  @IsNotEmpty({ message: '请输入小题题干' })
  @MaxLength(20000, { message: '小题题干内容过长（上限 20000 字符）' })
  stem: string;

  @ApiProperty({ description: '选项（JSON 数组字符串）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20000, { message: '小题选项内容过长（上限 20000 字符）' })
  options?: string;

  @ApiProperty({ description: '标准答案（纯文本，判分基准）' })
  @IsString()
  @IsNotEmpty({ message: '请输入小题标准答案' })
  @MaxLength(2000, { message: '小题标准答案不超过 2000 字' })
  answer: string;

  @ApiProperty({ description: '答案解析（富文本 HTML）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20000, { message: '小题答案解析内容过长（上限 20000 字符）' })
  analysis?: string;

  @ApiProperty({ description: '难度（字典 difficulty 的 value）' })
  @IsString()
  @IsNotEmpty({ message: '请选择小题难度' })
  difficulty: string;

  @ApiProperty({ description: '小题分值（材料题分值为各小题之和）' })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: '小题分值最多 2 位小数' })
  @Min(0.5, { message: '小题分值不小于 0.5' })
  @Max(100, { message: '小题分值不超过 100' })
  suggestedScore: number;
}

/**
 * 保存材料题入参
 *
 * 材料题自身不带 options/answer/suggestedScore：它只承载共享材料，
 * 分值由小题之和派生并由服务端落库。
 */
export class SaveCompositeDto {
  @ApiProperty({ description: '材料题 ID；不传表示新建', required: false })
  @IsOptional()
  @IsInt()
  @IsPositive({ message: '材料题 ID 非法' })
  id?: number;

  @ApiProperty({ description: '共享材料（富文本 HTML）' })
  @IsString()
  @IsNotEmpty({ message: '请输入材料内容' })
  @MaxLength(20000, { message: '材料内容过长（上限 20000 字符）' })
  stem: string;

  @ApiProperty({ description: '整体解析（富文本 HTML）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20000, { message: '解析内容过长（上限 20000 字符）' })
  analysis?: string;

  @ApiProperty({ description: '难度（字典 difficulty 的 value）' })
  @IsString()
  @IsNotEmpty({ message: '请选择难度' })
  difficulty: string;

  @ApiProperty({ description: '关联知识点 ID 列表', required: false, type: [Number] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  knowledgePointIds?: number[];

  @ApiProperty({ description: '归属题库 ID', required: false })
  @IsOptional()
  @IsInt()
  @IsPositive({ message: '题库 ID 非法' })
  questionBankId?: number;

  @ApiProperty({ description: '小题列表（顺序即卷面顺序）', type: [CompositeChildDto] })
  @IsArray()
  @ArrayNotEmpty({ message: '材料题至少需要一个小题' })
  @ArrayMaxSize(20, { message: '单个材料题最多 20 个小题' })
  @ValidateNested({ each: true })
  @Type(() => CompositeChildDto)
  children: CompositeChildDto[];
}
