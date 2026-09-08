import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsIn, Min, MaxLength, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

/** 取练习题：岗位练兵传 practiceId，自主练习传 bankId/knowledgePointId */
export class AppPracticeQuestionsQueryDto {
  @ApiPropertyOptional({ description: '岗位练兵 ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'practiceId 必须是整数' })
  @Min(1, { message: 'practiceId 不合法' })
  practiceId?: number;

  @ApiPropertyOptional({ description: '题库 ID（自主练习）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'bankId 必须是整数' })
  @Min(1, { message: 'bankId 不合法' })
  bankId?: number;

  @ApiPropertyOptional({ description: '知识点 ID（自主练习）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'knowledgePointId 必须是整数' })
  @Min(1, { message: 'knowledgePointId 不合法' })
  knowledgePointId?: number;

  @ApiPropertyOptional({ description: '练习模式：wrong 错题重练' })
  @IsOptional()
  @IsIn(['wrong'], { message: 'mode 只支持 wrong' })
  mode?: string;
}

/** 单题作答（练习为逐题即时提交） */
export class AppPracticeAnswerDto {
  @ApiProperty({ description: '练习记录 ID' })
  @Type(() => Number)
  @IsInt({ message: 'recordId 必须是整数' })
  @Min(1, { message: 'recordId 不合法' })
  recordId: number;

  @ApiProperty({ description: '题序（从 1 开始）' })
  @Type(() => Number)
  @IsInt({ message: 'questionNo 必须是整数' })
  @Min(1, { message: 'questionNo 不合法' })
  questionNo: number;

  @ApiProperty({ description: '我的作答' })
  @IsString({ message: 'answer 必须是字符串' })
  @MaxLength(2000, { message: '作答内容过长' })
  answer: string;
}

/** AI 答疑提问 */
export class AppPracticeAiAskDto {
  @ApiPropertyOptional({ description: '关联题目 ID（可空）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'questionId 必须是整数' })
  @Min(1, { message: 'questionId 不合法' })
  questionId?: number;

  @ApiProperty({ description: '我的问题' })
  @IsString({ message: 'question 必须是字符串' })
  @MaxLength(500, { message: '问题过长，请精简到 500 字以内' })
  question: string;
}

/** 结束整份练习 */
export class AppPracticeFinishDto {
  @ApiProperty({ description: '练习记录 ID' })
  @Type(() => Number)
  @IsInt({ message: 'recordId 必须是整数' })
  @Min(1, { message: 'recordId 不合法' })
  recordId: number;
}

/** 收藏 / 取消收藏题目 */
export class AppFavoriteToggleDto {
  @ApiProperty({ description: '题目 ID' })
  @Type(() => Number)
  @IsInt({ message: 'questionId 必须是整数' })
  @Min(1, { message: 'questionId 不合法' })
  questionId: number;
}

/**
 * 按题目 ID 批量查询状态（当前用于收藏态）
 *
 * 名字保持语义中立而不叫 AppFavoriteIdsDto：入参形状与具体业务无关，
 * 叫成某一个业务的名字，后续别处复用时读代码的人得跳到定义才敢确认字段含义。
 */
export class QuestionIdsQueryDto {
  @ApiProperty({ description: '题目 ID，逗号分隔', example: '1,2,3' })
  @IsString({ message: 'questionIds 必须是字符串' })
  @MaxLength(2000, { message: '一次查询的题目过多' })
  questionIds: string;
}
