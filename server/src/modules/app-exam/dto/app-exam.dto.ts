import { IsNotEmpty, IsInt, IsString, IsOptional, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/** 按考试 ID 查询（列表项详情、取卷共用） */
export class AppExamIdQueryDto {
  @ApiProperty({ description: '考试 ID', example: 1 })
  @Type(() => Number)
  @IsInt({ message: '考试 ID 必须为整数' })
  @Min(1, { message: '考试 ID 不合法' })
  id: number;
}

/** 取卷入参（前端用 examId 而非 id，保持与既有接口契约一致） */
export class AppExamPaperQueryDto {
  @ApiProperty({ description: '考试 ID', example: 1 })
  @Type(() => Number)
  @IsInt({ message: '考试 ID 必须为整数' })
  @Min(1, { message: '考试 ID 不合法' })
  examId: number;
}

/**
 * 答案保存入参
 *
 * answer 统一用字符串承载：多选题由前端以逗号连接（如 "A,B"），
 * 与库里 AnswerItem.candidateAnswer 的文本存储保持一致，避免类型分叉。
 */
export class AppSaveAnswerDto {
  @ApiProperty({ description: '考试 ID', example: 1 })
  @Type(() => Number)
  @IsInt({ message: '考试 ID 必须为整数' })
  @Min(1, { message: '考试 ID 不合法' })
  examId: number;

  @ApiProperty({ description: '题目 ID', example: 1 })
  @Type(() => Number)
  @IsInt({ message: '题目 ID 必须为整数' })
  @Min(1, { message: '题目 ID 不合法' })
  questionId: number;

  @ApiProperty({ description: '考生作答内容，未作答传空串', example: 'A' })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: '作答内容过长' })
  answer?: string;
}

/** 交卷入参 */
export class AppSubmitExamDto {
  @ApiProperty({ description: '考试 ID', example: 1 })
  @Type(() => Number)
  @IsInt({ message: '考试 ID 必须为整数' })
  @Min(1, { message: '考试 ID 不合法' })
  examId: number;
}

/** 切屏告警上报入参 */
export class AppSwitchAlarmDto {
  @ApiProperty({ description: '考试 ID', example: 1 })
  @Type(() => Number)
  @IsInt({ message: '考试 ID 必须为整数' })
  @Min(1, { message: '考试 ID 不合法' })
  examId: number;
}

