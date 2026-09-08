import {
  IsInt,
  IsPositive,
  IsString,
  IsOptional,
  IsNotEmpty,
  IsArray,
  IsNumber,
  ArrayNotEmpty,
  ArrayMaxSize,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 新增题目接口入参
 * 题干、题型、标准答案、难度、分值必填；知识点可选（多对多）；选项按题型分支校验（客观题必填，主观题免填），
 * 分支校验与字典值合法性校验在 service/controller 完成，故此处 options 声明为可选。
 */
export class CreateQuestionDto {
  // 富文本字段的长度上限放宽到 20000：题干支持 HTML 后，标签与图片 URL 会占掉
  // 大量字符，原先按纯文本定的 2000 字上限会让「正文没超但带格式就报错」。
  // 20000 远低于 MySQL TEXT 的 64KB 上限，兼顾安全与够用。
  @ApiProperty({ description: '题干（富文本 HTML）' })
  @IsString()
  @IsNotEmpty({ message: '请输入题干' })
  @MaxLength(20000, { message: '题干内容过长（含格式与图片，上限 20000 字符）' })
  stem: string;

  @ApiProperty({ description: '题型（字典 question_type 的 value）' })
  @IsString()
  @IsNotEmpty({ message: '请选择题型' })
  type: string;

  @ApiProperty({ description: '选项（JSON 数组，value 可含富文本；客观题必填）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20000, { message: '选项内容过长（含格式与图片，上限 20000 字符）' })
  options?: string;

  @ApiProperty({ description: '标准答案' })
  @IsString()
  @IsNotEmpty({ message: '请输入标准答案' })
  @MaxLength(2000, { message: '标准答案不超过 2000 字' })
  answer: string;

  @ApiProperty({ description: '答案解析（富文本 HTML）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20000, { message: '答案解析内容过长（含格式与图片，上限 20000 字符）' })
  analysis?: string;

  @ApiProperty({ description: '难度（字典 difficulty 的 value）' })
  @IsString()
  @IsNotEmpty({ message: '请选择难度' })
  difficulty: string;

  @ApiProperty({ description: '所属知识点 ID 列表（多对多，可选，可为空数组）', type: [Number], required: false })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true, message: '知识点 ID 非法' })
  @IsPositive({ each: true, message: '知识点 ID 非法' })
  knowledgePointIds?: number[];

  @ApiProperty({ description: '所属题库 ID', required: false })
  @IsOptional()
  @IsInt()
  @IsPositive()
  questionBankId?: number;

  @ApiProperty({ description: '分值（必填，正数，最多 2 位小数）' })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: '分值最多保留 2 位小数' })
  @IsPositive({ message: '分值必须大于 0' })
  suggestedScore: number;
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

/**
 * 导入题目单行数据
 * 题型/难度按字典「名称」录入（如「单选/中等」），知识点按名称、顿号或逗号分隔；
 * 逐行导入、有错跳过，故各字段声明为可选，避免单行缺字段触发全批 400。
 */
export class ImportQuestionRowDto {
  @ApiProperty({ description: '题干', required: false })
  @IsOptional()
  @IsString()
  stem?: string;

  @ApiProperty({ description: '题型名称（字典 question_type 的 name，如 单选/多选/判断/填空/问答/论述）', required: false })
  @IsOptional()
  @IsString()
  typeName?: string;

  @ApiProperty({ description: '选项（客观题必填，多行文本）', required: false })
  @IsOptional()
  @IsString()
  options?: string;

  @ApiProperty({ description: '标准答案', required: false })
  @IsOptional()
  @IsString()
  answer?: string;

  @ApiProperty({ description: '答案解析', required: false })
  @IsOptional()
  @IsString()
  analysis?: string;

  @ApiProperty({ description: '难度名称（字典 difficulty 的 name，如 简单/中等/困难）', required: false })
  @IsOptional()
  @IsString()
  difficultyName?: string;

  @ApiProperty({ description: '分值', required: false })
  @IsOptional()
  @IsString()
  suggestedScore?: string;

  @ApiProperty({ description: '知识点名称（多个以顿号/逗号分隔）', required: false })
  @IsOptional()
  @IsString()
  knowledgePointNames?: string;
}

/**
 * 批量导入题目接口入参
 * questionBankId 指定归属题库；rows 为按模板解析出的题目行数组，逐行校验、有错跳过。
 */
export class ImportQuestionDto {
  @ApiProperty({ description: '归属题库 ID' })
  @IsInt()
  @IsPositive({ message: '题库 ID 非法' })
  questionBankId: number;

  @ApiProperty({ description: '待导入的题目行数据', type: [ImportQuestionRowDto] })
  @IsArray()
  @ArrayNotEmpty({ message: '导入数据不能为空' })
  @ArrayMaxSize(500, { message: '单次最多导入 500 道题目' })
  @ValidateNested({ each: true })
  @Type(() => ImportQuestionRowDto)
  rows: ImportQuestionRowDto[];
}
