import {
  IsInt,
  IsPositive,
  IsString,
  IsOptional,
  IsNotEmpty,
  IsArray,
  ArrayNotEmpty,
  IsBoolean,
  IsIn,
  MaxLength,
  MinLength,
  Min,
  ValidateNested,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/** 抽题方式枚举：sequential 全库顺序练 / random 按规则抽题 */
export const PRACTICE_DRAW_MODES = ['sequential', 'random'] as const;
export type PracticeDrawMode = (typeof PRACTICE_DRAW_MODES)[number];

/** 参与范围枚举：specified 指定员工 / all 全员参与 */
export const PARTICIPANT_SCOPES = ['specified', 'all'] as const;
export type ParticipantScope = (typeof PARTICIPANT_SCOPES)[number];

/** 参与人类型枚举 */
export const PARTICIPANT_TYPES = ['internal', 'external'] as const;

/** 练习设置入参：反复练习 + 题目反馈 + 单题即时反馈（答案/解析） */
export class PracticeSettingDto {
  @ApiProperty({ description: '允许反复练习（关闭后每人只能完成一次）', required: false })
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

/** 抽题规则入参（drawMode=random 时必填至少一条） */
export class PracticeRuleDto {
  @ApiProperty({ description: '题型（字典 question_type 的 value）' })
  @IsString()
  @IsNotEmpty({ message: '题型不能为空' })
  questionType: string;

  @ApiProperty({ description: '难度（字典 difficulty 的 value；空串表示不限）' })
  @IsString()
  difficulty: string;

  @ApiProperty({ description: '知识点 ID（0 表示不限）' })
  @IsInt()
  @Min(0, { message: '知识点 ID 不能为负数' })
  knowledgePointId: number;

  @ApiProperty({ description: '抽取数量（正整数）' })
  @IsInt()
  @IsPositive({ message: '抽取数量须为正整数' })
  drawCount: number;
}

/** 参与人员入参项 */
export class PracticeParticipantDto {
  @ApiProperty({ description: '参与人类型 internal 内部人员 / external 外部考生' })
  @IsIn(PARTICIPANT_TYPES, { message: '参与人类型只能是 internal 或 external' })
  participantType: string;

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

/** 创建练习入参：基础信息 + 题库范围 + 抽题规则 + 参与人员 + 练习设置 */
export class CreatePracticeDto {
  @ApiProperty({ description: '练习名称（1-200 字）' })
  @IsString()
  @IsNotEmpty({ message: '练习名称不能为空' })
  @MinLength(1)
  @MaxLength(200, { message: '练习名称不能超过 200 字' })
  name: string;

  @ApiProperty({ description: '练习编号（≤30 字，留空自动生成）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(30, { message: '练习编号不能超过 30 字' })
  code?: string;

  @ApiProperty({ description: '练习说明（≤500 字）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '练习说明不能超过 500 字' })
  description?: string;

  @ApiProperty({ description: '抽题方式 sequential 全库顺序练 / random 按规则抽题' })
  @IsIn(PRACTICE_DRAW_MODES, { message: '抽题方式只能是 sequential 或 random' })
  drawMode: string;

  @ApiProperty({ description: '题库 ID 列表（至少一个）' })
  @IsArray({ message: '题库范围格式不正确' })
  @IsInt({ each: true })
  bankIds: number[];

  @ApiProperty({ description: '练习开始时间（可空表示不限时）', required: false })
  @IsOptional()
  @IsDateString({}, { message: '开始时间格式不正确' })
  startTime?: string;

  @ApiProperty({ description: '练习结束时间（可空表示不限时）', required: false })
  @IsOptional()
  @IsDateString({}, { message: '结束时间格式不正确' })
  endTime?: string;

  @ApiProperty({ description: '自动结束：到结束时间自动置为已结束', required: false })
  @IsOptional()
  @IsBoolean()
  autoFinish?: boolean;

  @ApiProperty({ description: '参与范围 specified 指定员工 / all 全员参与' })
  @IsIn(PARTICIPANT_SCOPES, { message: '参与范围只能是 specified 或 all' })
  participantScope: string;

  @ApiProperty({ description: '抽题规则（drawMode=random 时必填）', required: false, type: [PracticeRuleDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PracticeRuleDto)
  rules?: PracticeRuleDto[];

  @ApiProperty({ description: '指定参与人员（participantScope=specified 时必填）', required: false, type: [PracticeParticipantDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PracticeParticipantDto)
  participants?: PracticeParticipantDto[];

  @ApiProperty({ description: '练习设置', required: false, type: PracticeSettingDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PracticeSettingDto)
  setting?: PracticeSettingDto;
}

/** 编辑练习入参（仅未发布可编辑），字段同创建 + id */
export class UpdatePracticeDto extends CreatePracticeDto {
  @ApiProperty({ description: '练习 ID' })
  @IsInt()
  @IsPositive()
  id: number;
}

/** 单独分配/更新参与人员入参 */
export class AssignParticipantsDto {
  @ApiProperty({ description: '练习 ID' })
  @IsInt()
  @IsPositive()
  practiceId: number;

  @ApiProperty({ description: '参与人员列表（空数组表示清空）', type: [PracticeParticipantDto] })
  @IsArray({ message: '参与人员格式不正确' })
  @ValidateNested({ each: true })
  @Type(() => PracticeParticipantDto)
  participants: PracticeParticipantDto[];
}

/**
 * 追加参与人员入参（只增不减）
 *
 * 与 AssignParticipantsDto 分开而非放宽后者：后者是全量替换，对已发布的练习用它，
 * 前端漏传一个人就会删掉那人的分配，而他可能已经在练了。
 */
export class AppendParticipantsDto {
  @ApiProperty({ description: '练习 ID' })
  @IsInt()
  @IsPositive()
  practiceId: number;

  @ApiProperty({ description: '要追加的参与人员列表', type: [PracticeParticipantDto] })
  @IsArray({ message: '参与人员格式不正确' })
  @ArrayNotEmpty({ message: '请选择要追加的人员' })
  @ValidateNested({ each: true })
  @Type(() => PracticeParticipantDto)
  participants: PracticeParticipantDto[];
}

/** 移除参与人员入参：ids 为 PracticeParticipant 行 id */
export class RemoveParticipantsDto {
  @ApiProperty({ description: '练习 ID' })
  @IsInt()
  @IsPositive()
  practiceId: number;

  @ApiProperty({ description: '要移除的参与人员行 ID 列表' })
  @IsArray({ message: '参数格式不正确' })
  @ArrayNotEmpty({ message: '请选择要移除的人员' })
  @IsInt({ each: true })
  ids: number[];
}

/** 抽题可用量查询入参：按题库范围统计各规则组合的可抽题量 */
export class PracticeRuleAvailabilityDto {
  @ApiProperty({ description: '题库 ID 列表' })
  @IsArray({ message: '题库范围格式不正确' })
  @IsInt({ each: true })
  bankIds: number[];

  @ApiProperty({ description: '待统计的规则组合', type: [PracticeRuleDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PracticeRuleDto)
  rules: PracticeRuleDto[];
}

/** 批量删除入参 */
export class BatchDeletePracticeDto {
  @ApiProperty({ description: '练习 ID 列表' })
  @IsArray({ message: 'ID 列表格式不正确' })
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids: number[];
}


