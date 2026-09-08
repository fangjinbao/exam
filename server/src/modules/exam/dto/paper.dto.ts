import {
  IsInt,
  IsPositive,
  IsString,
  IsOptional,
  IsNotEmpty,
  IsArray,
  ArrayNotEmpty,
  ArrayMinSize,
  Max,
  MaxLength,
  MinLength,
  Min,
  ValidateNested,
  IsNumber,
  IsIn,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { VISIBLE_SCOPES, SHARE_LEVELS } from '../services/org-scope.service';

/**
 * 共享属性字段（可见范围 + 权限级别），供新建/编辑试卷入参复用
 *
 * 两字段必须成对出现：只传 shareLevel 时 visibleScope 会被后端兜成 self，
 * 而 self 下级别恒为 manage，用户指定的 view 会被静默丢弃。这里直接拦下报错，
 * 避免「我明明设了 view，为什么落库是 manage」这类查不出来的问题。
 *
 * 注意不能用 @IsOptional()：它会在值为 null/undefined 时跳过本属性所有校验，
 * 从而盖掉 @ValidateIf 的判断。改为让 @ValidateIf 兼顾「可选」与「成对」两件事：
 * 两个字段都没传 → 条件为假 → 整段跳过（保持可选）；
 * 只传了 shareLevel → 条件为真 → @IsIn 收到 undefined 而报错。
 */
export class PaperShareFieldsDto {
  @ApiProperty({
    description:
      '可见范围 self=仅自己 dept=本部门 company=本公司 all=全部组织；' +
      '缺省时后端按 self 兜底；传了 shareLevel 就必须一并传本字段',
    required: false,
    enum: VISIBLE_SCOPES,
  })
  @ValidateIf(
    (o: { visibleScope?: string; shareLevel?: string }) =>
      o.visibleScope != null || o.shareLevel != null,
  )
  // 文案要同时覆盖两种失败：漏传（设了 shareLevel 却没设 visibleScope）与值非法。
  // 故不写「必须一并指定」这种只对漏传成立的说法，改为直接列出合法取值。
  @IsIn(VISIBLE_SCOPES as unknown as string[], {
    message: '可见范围需为 self/dept/company/all 之一；设置权限级别时必须一并指定',
  })
  visibleScope?: string;

  @ApiProperty({
    description: '共享权限级别 manage=可管理 view=可查看',
    required: false,
    enum: SHARE_LEVELS,
  })
  @IsOptional()
  @IsIn(SHARE_LEVELS as unknown as string[], { message: '权限级别取值不合法' })
  shareLevel?: string;
}

/** 固定试卷题目项（组卷时逐题设分值） */
export class PaperQuestionItemDto {
  @ApiProperty({ description: '题目 ID' })
  @IsInt()
  @IsPositive()
  questionId: number;

  @ApiProperty({ description: '每题分值（正数，最多 2 位小数）' })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: '分值最多 2 位小数' })
  @IsPositive({ message: '分值必须大于 0' })
  score: number;

  /*
    不再接受 sortNo：卷面顺序由服务端按题型统一重排（PaperService.sortItemsByQuestionType），
    让管理端预览、导出与考生端答题共用一个顺序。前端本就未传此字段。
  */
}

/**
 * 抽题规则的筛选条件（题型×难度×知识点，不含数量/分值）。
 * 单独成类是为了让编辑页在用户清空「抽取数量」时也能查可用题量
 * ——PaperRuleItemDto 对 drawCount/scorePerQuestion 有正数校验，清空瞬间会让探测请求 400。
 */
export class RuleConditionDto {
  @ApiProperty({ description: '题型（字典 question_type 的 value）' })
  @IsString()
  @IsNotEmpty({ message: '请选择题型' })
  questionType: string;

  @ApiProperty({ description: '难度（字典 difficulty 的 value）；空串表示不限难度' })
  @IsString()
  difficulty: string;

  @ApiProperty({ description: '知识点 ID；0 表示不限知识点' })
  @IsInt()
  @Min(0)
  knowledgePointId: number;
}

/** 随机试卷抽题规则项（筛选条件 + 抽取数量与分值） */
export class PaperRuleItemDto extends RuleConditionDto {
  @ApiProperty({ description: '抽取数量（正整数）' })
  @IsInt()
  @IsPositive({ message: '抽取数量必须大于 0' })
  drawCount: number;

  @ApiProperty({ description: '该组合下每题分值（正数，最多 2 位小数）' })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: '分值最多 2 位小数' })
  @IsPositive({ message: '分值必须大于 0' })
  scorePerQuestion: number;
}

/**
 * 随机试卷的题库范围项（题库 + 抽题权重）。
 *
 * 权重挂在题库上而非规则上：用户要表达的是「A 库占五成、B 库占五成」，
 * 每条规则的抽取数量都按这个比例拆分，而不是每条规则各自选库。
 */
export class PaperBankWeightDto {
  @ApiProperty({ description: '题库 ID' })
  @IsInt()
  @IsPositive({ message: '题库 ID 不合法' })
  bankId: number;

  @ApiProperty({ description: '抽题权重（0~1，各库合计须为 1）' })
  @IsNumber({ maxDecimalPlaces: 4 }, { message: '权重最多 4 位小数' })
  @Min(0, { message: '权重不能为负' })
  @Max(1, { message: '权重不能大于 1' })
  weight: number;
}

/** 查询抽题规则可用题量入参（编辑页实时探测，不落库） */
export class RuleAvailabilityDto {
  @ApiProperty({ description: '题库范围 ID 列表', type: [Number] })
  @IsArray()
  @IsInt({ each: true })
  bankIds: number[];

  @ApiProperty({ description: '待统计的抽题规则条件列表', type: [RuleConditionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleConditionDto)
  rules: RuleConditionDto[];
}

/** 新增固定试卷（手动/AI 组卷保存）入参 */
export class CreateFixedPaperDto extends PaperShareFieldsDto {
  @ApiProperty({ description: '试卷名称（2-50 字）' })
  @IsString()
  @IsNotEmpty({ message: '请输入试卷名称' })
  @MinLength(2, { message: '试卷名称至少 2 字' })
  @MaxLength(50, { message: '试卷名称不超过 50 字' })
  name: string;

  @ApiProperty({ description: '建议时长（分钟）' })
  @IsInt()
  @IsPositive({ message: '建议时长必须大于 0' })
  suggestDuration: number;

  @ApiProperty({ description: '题库范围 ID 列表（至少 1 个）', type: [Number] })
  @IsArray()
  @ArrayNotEmpty({ message: '请至少选择一个题库' })
  @IsInt({ each: true })
  bankIds: number[];

  @ApiProperty({ description: '题目项列表（至少 1 题）', type: [PaperQuestionItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: '请至少添加一道题目' })
  @ValidateNested({ each: true })
  @Type(() => PaperQuestionItemDto)
  items: PaperQuestionItemDto[];

  @ApiProperty({ description: '知识点分布要求（AI 组卷原始描述，可空）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '知识点分布描述不超过 500 字' })
  knowledgeDistribution?: string;
}

/** 新增随机试卷入参 */
export class CreateRandomPaperDto extends PaperShareFieldsDto {
  @ApiProperty({ description: '试卷名称（2-50 字）' })
  @IsString()
  @IsNotEmpty({ message: '请输入试卷名称' })
  @MinLength(2, { message: '试卷名称至少 2 字' })
  @MaxLength(50, { message: '试卷名称不超过 50 字' })
  name: string;

  @ApiProperty({ description: '建议时长（分钟）' })
  @IsInt()
  @IsPositive({ message: '建议时长必须大于 0' })
  suggestDuration: number;

  @ApiProperty({
    description: '题库范围及各库抽题权重（至少 1 个，权重合计须为 1）',
    type: [PaperBankWeightDto],
  })
  @IsArray()
  @ArrayNotEmpty({ message: '请至少选择一个题库' })
  @ValidateNested({ each: true })
  @Type(() => PaperBankWeightDto)
  banks: PaperBankWeightDto[];

  @ApiProperty({ description: '抽题规则列表（至少 1 条）', type: [PaperRuleItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: '请至少添加一条抽题配置' })
  @ValidateNested({ each: true })
  @Type(() => PaperRuleItemDto)
  rules: PaperRuleItemDto[];
}

/**
 * 单独更新试卷共享设置入参（不受草稿态限制，仅创建人/超管可调）
 *
 * 本入口是「整段替换」语义，不是部分更新：visibleScope 必填，shareLevel 缺省按 manage 处理。
 * 与编辑试卷入参（PaperShareFieldsDto，两字段可选且要求成对）刻意不同——那边缺省代表
 * 「调用方没打算碰共享」必须保留原值，这边则是用户在共享弹窗里显式设定最终状态。
 */
export class UpdatePaperShareDto {
  @ApiProperty({ description: '试卷 ID' })
  @IsInt()
  @IsPositive()
  id: number;

  @ApiProperty({
    description: '可见范围 self=仅自己 dept=本部门 company=本公司 all=全部组织',
    enum: VISIBLE_SCOPES,
  })
  @IsIn(VISIBLE_SCOPES as unknown as string[], { message: '可见范围取值不合法' })
  visibleScope: string;

  @ApiProperty({
    description:
      '共享权限级别 manage=可管理 view=可查看；' +
      '缺省按 manage 处理（本入口为整段替换，不会保留原级别）；' +
      'visibleScope=self 时级别无意义，一律存 manage',
    required: false,
    enum: SHARE_LEVELS,
  })
  @IsOptional()
  @IsIn(SHARE_LEVELS as unknown as string[], { message: '权限级别取值不合法' })
  shareLevel?: string;
}

/** 编辑固定试卷入参（仅草稿可编辑） */
export class UpdateFixedPaperDto extends CreateFixedPaperDto {
  @ApiProperty({ description: '试卷 ID' })
  @IsInt()
  @IsPositive()
  id: number;
}

/** 编辑随机试卷入参（仅草稿可编辑） */
export class UpdateRandomPaperDto extends CreateRandomPaperDto {
  @ApiProperty({ description: '试卷 ID' })
  @IsInt()
  @IsPositive()
  id: number;
}

/** AI 组卷生成方案入参（仅返回推荐方案，不落库） */
export class AiComposePaperDto {
  @ApiProperty({ description: '题库范围 ID 列表（至少 1 个）', type: [Number] })
  @IsArray()
  @ArrayNotEmpty({ message: '请至少选择一个题库' })
  @IsInt({ each: true })
  bankIds: number[];

  @ApiProperty({ description: '目标总分（正数）' })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: '总分最多 2 位小数' })
  @IsPositive({ message: '总分必须大于 0' })
  totalScore: number;

  @ApiProperty({ description: '建议时长（分钟）', required: false })
  @IsOptional()
  @IsInt()
  @IsPositive()
  suggestDuration?: number;

  @ApiProperty({ description: '知识点分布要求（自然语言描述，可空）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '知识点分布描述不超过 500 字' })
  knowledgeDistribution?: string;
}
