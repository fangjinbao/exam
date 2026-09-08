import {
  IsInt,
  IsPositive,
  IsString,
  IsOptional,
  IsNotEmpty,
  IsArray,
  ArrayNotEmpty,
  ArrayMaxSize,
  ValidateNested,
  MaxLength,
  MinLength,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { VISIBLE_SCOPES, SHARE_LEVELS } from '../services/question-bank-access.service';

/**
 * 新增题库接口入参
 * 题库名称必填且全局唯一（2-50 字）；编码可选（≤30 字，留空由系统自动生成）、全局唯一；
 * 描述可选（≤200 字）；状态可选（默认启用）。
 */
export class CreateQuestionBankDto {
  @ApiProperty({ description: '题库名称（2-50 字，全局唯一）' })
  @IsString()
  @IsNotEmpty({ message: '请输入题库名称' })
  @MinLength(2, { message: '题库名称至少 2 字' })
  @MaxLength(50, { message: '题库名称不超过 50 字' })
  name: string;

  @ApiProperty({ description: '题库编码（≤30 字，全局唯一，留空自动生成）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(30, { message: '题库编码不超过 30 字' })
  code?: string;

  @ApiProperty({ description: '题库描述（≤200 字）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: '题库描述不超过 200 字' })
  description?: string;

  @ApiProperty({ description: '状态 1=启用 0=停用', required: false })
  @IsOptional()
  @IsInt()
  status?: number;

  @ApiProperty({
    description: '可见范围 self=仅自己 dept=本部门 company=本公司 all=全部',
    required: false,
    enum: VISIBLE_SCOPES,
  })
  @IsOptional()
  @IsIn(VISIBLE_SCOPES as unknown as string[], { message: '可见范围取值不合法' })
  visibleScope?: string;

  @ApiProperty({
    description: '共享权限级别 manage=可管理 view=可查看',
    required: false,
    enum: SHARE_LEVELS,
  })
  @IsOptional()
  @IsIn(SHARE_LEVELS as unknown as string[], { message: '共享权限级别取值不合法' })
  shareLevel?: string;
}

/**
 * 更新题库接口入参
 * 通过 id 定位，其余字段同新增。
 */
export class UpdateQuestionBankDto extends CreateQuestionBankDto {
  @ApiProperty({ description: '题库 ID' })
  @IsInt()
  @IsPositive()
  id: number;
}

/**
 * 导入题库单行数据
 * 逐行导入、有错跳过，故各字段声明为可选，避免单行缺字段触发全批 400。
 */
export class ImportQuestionBankRowDto {
  @ApiProperty({ description: '题库名称', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: '题库编码（留空自动生成）', required: false })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({ description: '题库描述', required: false })
  @IsOptional()
  @IsString()
  description?: string;
}

/**
 * 批量导入题库接口入参
 * rows 为按模板解析出的题库行数组；逐行校验、有错跳过，故仅校验数组规模，不做嵌套强校验。
 */
export class ImportQuestionBankDto {
  @ApiProperty({ description: '待导入的题库行数据', type: [ImportQuestionBankRowDto] })
  @IsArray()
  @ArrayNotEmpty({ message: '导入数据不能为空' })
  @ArrayMaxSize(500, { message: '单次最多导入 500 个题库' })
  @ValidateNested({ each: true })
  @Type(() => ImportQuestionBankRowDto)
  rows: ImportQuestionBankRowDto[];
}
