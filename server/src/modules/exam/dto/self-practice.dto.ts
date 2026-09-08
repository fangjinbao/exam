import {
  IsInt,
  IsPositive,
  IsOptional,
  IsArray,
  IsBoolean,
  IsIn,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/** 开放范围枚举：all 全员开放 / specified 指定员工 */
export const OPEN_SCOPES = ['all', 'specified'] as const;
export type OpenScope = (typeof OPEN_SCOPES)[number];

/** 开放人员类型枚举 */
export const SELF_PRACTICE_USER_TYPES = ['internal', 'external'] as const;

/** 开放人员入参项 */
export class SelfPracticeUserDto {
  @ApiProperty({ description: '人员类型 internal 内部人员 / external 外部考生' })
  @IsIn(SELF_PRACTICE_USER_TYPES, { message: '人员类型只能是 internal 或 external' })
  userType: string;

  @ApiProperty({ description: '内部人员用户 ID（internal 时必填）', required: false })
  @IsOptional()
  @IsInt()
  @IsPositive()
  internalUserId?: number;

  @ApiProperty({ description: '外部考生 ID（external 时必填）', required: false })
  @IsOptional()
  @IsInt()
  @IsPositive()
  externalCandidateId?: number;
}

/**
 * 保存题库自主练习配置入参
 * 覆盖式保存：users 与 knowledgePointIds 传全量，服务端先清后插。
 */
export class UpdateSelfPracticeConfigDto {
  @ApiProperty({ description: '题库 ID' })
  @IsInt()
  @IsPositive()
  bankId: number;

  @ApiProperty({ description: '开放状态', required: false })
  @IsOptional()
  @IsBoolean()
  isOpen?: boolean;

  @ApiProperty({ description: '开放范围 all 全员开放 / specified 指定员工' })
  @IsIn(OPEN_SCOPES, { message: '开放范围只能是 all 或 specified' })
  openScope: string;

  @ApiProperty({ description: '单次练习题数上限（0=不限）', required: false })
  @IsOptional()
  @IsInt()
  @Min(0, { message: '单次题数上限不能为负数' })
  maxQuestionsPerRound?: number;

  @ApiProperty({ description: '可练知识点 ID 列表（空数组表示不限）', required: false })
  @IsOptional()
  @IsArray({ message: '知识点范围格式不正确' })
  @IsInt({ each: true })
  knowledgePointIds?: number[];

  @ApiProperty({ description: '开放人员（openScope=specified 时必填）', required: false, type: [SelfPracticeUserDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelfPracticeUserDto)
  users?: SelfPracticeUserDto[];

  @ApiProperty({ description: '允许反复练习', required: false })
  @IsOptional()
  @IsBoolean()
  allowRepeat?: boolean;


  @ApiProperty({ description: '单题作答后展示对错', required: false })
  @IsOptional()
  @IsBoolean()
  showResultPerQuestion?: boolean;

  @ApiProperty({ description: '展示答案（单题反馈开启时生效）', required: false })
  @IsOptional()
  @IsBoolean()
  showAnswer?: boolean;

  @ApiProperty({ description: '展示解析（单题反馈开启时生效）', required: false })
  @IsOptional()
  @IsBoolean()
  showAnalysis?: boolean;
}
