import {
  IsInt,
  IsPositive,
  IsString,
  IsOptional,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  MaxLength,
  Min,
  Matches,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/** 前端三个时间字段统一提交的格式，与 ElDatePicker 的 value-format 一致 */
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

/**
 * 名额分配的一行（单位 + 部门 + 名额数）
 *
 * 随项目整组提交：名额是项目的组成部分，
 * 单独一行没有意义（脱离项目的「某部门 5 个名额」无从解释）。
 */
export class CertProjectQuotaDto {
  @ApiProperty({ description: '名额行 ID（编辑已有行时传，新增留空）', required: false })
  @IsOptional()
  @IsInt()
  @IsPositive()
  id?: number;

  @ApiProperty({ description: '单位 ID（公司节点：集团公司/省公司/分公司）' })
  @IsInt({ message: '请选择单位' })
  @IsPositive({ message: '请选择单位' })
  orgId: number;

  @ApiProperty({
    description: '部门 ID（单位下的部门，可空；留空表示名额分给整个单位）',
    required: false,
  })
  // 选填：多数分公司下面没有再设部门，强制选部门那些单位就分不了名额
  @IsOptional()
  @IsInt({ message: '部门选择有误' })
  @IsPositive({ message: '部门选择有误' })
  deptId?: number | null;

  @ApiProperty({ description: '分配名额数（正整数）' })
  @IsInt({ message: '名额必须为整数' })
  @Min(1, { message: '名额至少为 1' })
  quota: number;
}

/**
 * 新增鉴定项目接口入参
 *
 * 字段对齐业务表单：除「简介」外全部必填。
 * 不含关联考试/证书模板/证书有效期——当前业务不涉及自动发证。
 */
export class CreateCertProjectDto {
  @ApiProperty({ description: '鉴定名称（≤50 字，全局唯一）' })
  @IsString()
  @IsNotEmpty({ message: '请输入鉴定名称' })
  @MaxLength(50, { message: '鉴定名称不超过 50 字' })
  name: string;

  @ApiProperty({ description: '鉴定工种 ID' })
  @IsInt({ message: '请选择鉴定工种' })
  @IsPositive({ message: '请选择鉴定工种' })
  occupationId: number;

  @ApiProperty({ description: '鉴定级别 ID（须属于所选工种）' })
  @IsInt({ message: '请选择鉴定级别' })
  @IsPositive({ message: '请选择鉴定级别' })
  levelId: number;

  @ApiProperty({ description: '负责人用户 ID' })
  @IsInt({ message: '请选择负责人' })
  @IsPositive({ message: '请选择负责人' })
  managerId: number;

  @ApiProperty({ description: '联系电话（≤20 字）' })
  @IsString()
  @IsNotEmpty({ message: '请输入联系电话' })
  @MaxLength(20, { message: '联系电话不超过 20 字' })
  // 放宽到「数字、连字符、括号、加号、空格」：除手机号外还要能填座机与分机（010-1234-5678 转 800）
  @Matches(/^[0-9+\-() ]+$/, { message: '联系电话只能包含数字、+、-、括号与空格' })
  contactPhone: string;

  /*
   * 三个时间字段一律要求「YYYY-MM-DD HH:mm:ss」，不接受纯日期串。
   *
   * 不能只靠 @IsDateString：它底层是 isISO8601，'2026-10-15' 同样通过。而纯日期串
   * 按 ES 规范走 UTC 解析（带时分的按本地解析），东八区下会凭空偏移 8 小时，
   * 且不报错。checkDates 的先后比较与报名截止判定都按时刻算，故在入口就要求带上时分秒。
   */
  @ApiProperty({ description: '报名截止时间（YYYY-MM-DD HH:mm:ss）' })
  @Matches(DATETIME_PATTERN, { message: '报名截止时间格式须为 YYYY-MM-DD HH:mm:ss' })
  @IsDateString({}, { message: '请选择报名截止时间' })
  applyDeadline: string;

  @ApiProperty({ description: '鉴定开始时间（YYYY-MM-DD HH:mm:ss）' })
  @Matches(DATETIME_PATTERN, { message: '鉴定开始时间格式须为 YYYY-MM-DD HH:mm:ss' })
  @IsDateString({}, { message: '请选择鉴定开始时间' })
  startTime: string;

  @ApiProperty({ description: '鉴定结束时间（YYYY-MM-DD HH:mm:ss）' })
  @Matches(DATETIME_PATTERN, { message: '鉴定结束时间格式须为 YYYY-MM-DD HH:mm:ss' })
  @IsDateString({}, { message: '请选择鉴定结束时间' })
  endTime: string;

  @ApiProperty({ description: '鉴定简介（≤500 字，非必填）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '鉴定简介不超过 500 字' })
  description?: string;

  @ApiProperty({ description: '报考条件说明（≤500 字）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '报考条件说明不超过 500 字' })
  applyCondition?: string;

  /*
    此处原有 status（启用/停用）。已随启停能力一并下线：本模块的生命周期只有
    「未发布 ↔ 已发布」，要停止各单位报名用撤回。留着这个字段的害处是
    全局 forbidNonWhitelisted 不会拦它（它是合法声明字段），调用方仍能把项目
    存成 status=0，而列表页已不展示该状态——管理端看着正常，却在
    「鉴定报名」里静默消失（cert-enroll 三处按 status: 1 过滤）。
    库中 status 列保留、默认 1，仅去掉写入口，故无需回填。
  */

  @ApiProperty({
    description: '名额分配（整组提交，服务端全量替换）',
    type: [CertProjectQuotaDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  // ValidateNested + Type：数组内元素需逐个按 DTO 校验，缺 Type 时拿不到元素类型
  @ValidateNested({ each: true })
  @Type(() => CertProjectQuotaDto)
  quotas?: CertProjectQuotaDto[];
}

/**
 * 更新鉴定项目接口入参
 * 通过 id 定位，其余字段同新增。
 */
export class UpdateCertProjectDto extends CreateCertProjectDto {
  @ApiProperty({ description: '鉴定项目 ID' })
  @IsInt()
  @IsPositive()
  id: number;
}
