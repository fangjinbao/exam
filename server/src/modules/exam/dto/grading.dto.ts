import {
  IsInt,
  IsPositive,
  IsString,
  IsOptional,
  IsArray,
  ArrayMinSize,
  IsNumber,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/** 单题人工评分项 */
export class ReviewItemDto {
  @ApiProperty({ description: '答题项 ID' })
  @IsInt()
  @IsPositive()
  answerItemId: number;

  @ApiProperty({ description: '修改后分数（0 ~ 该题满分）' })
  @IsNumber({ maxDecimalPlaces: 1 }, { message: '分数最多 1 位小数' })
  @Min(0, { message: '分数不能为负' })
  scoreAfter: number;

  /**
   * 评语选填：阅卷员逐题打分时，多数题只给分不写话，强制填写会逼出「无」「好」这类
   * 无信息量的占位内容，反而污染评分记录。
   */
  @ApiProperty({ description: '评语（≤500 字，选填）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '评语不超过 500 字' })
  reviewComment?: string;
}

/** 提交人工评分入参（可一次提交多题） */
export class SubmitReviewDto {
  @ApiProperty({ description: '评分项列表（至少 1 项）', type: [ReviewItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: '请至少评一道题' })
  @ValidateNested({ each: true })
  @Type(() => ReviewItemDto)
  items: ReviewItemDto[];
}
