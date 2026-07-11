import {
  IsInt,
  IsPositive,
  IsString,
  IsOptional,
  IsArray,
  MaxLength,
  MinLength,
  Matches,
  IsEmail,
  ValidateIf,
  ValidateNested,
  ArrayNotEmpty,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

// 手机号正则：11 位，1 开头，第二位 3-9（与前端 validatePhone 保持一致）
const PHONE_REGEX = /^1[3-9]\d{9}$/;

/**
 * 新增外部考生接口入参
 * 姓名、准考证号、联系电话必填；所属单位、证件号、电子邮箱可选（邮箱填写时校验格式）。
 * 提交后系统以准考证号为登录名生成考试账号。
 */
export class CreateExternalCandidateDto {
  @ApiProperty({ description: '姓名（2-20 字）' })
  @IsString()
  @MinLength(2, { message: '姓名长度为 2-20 字' })
  @MaxLength(20, { message: '姓名长度为 2-20 字' })
  name: string;

  @ApiProperty({ description: '准考证号（考试账号登录名，系统内唯一，≤30 字）' })
  @IsString()
  @MaxLength(30, { message: '准考证号不超过 30 字' })
  admissionNo: string;

  @ApiProperty({ description: '所属单位（≤50 字）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: '所属单位不超过 50 字' })
  company?: string;

  @ApiProperty({ description: '证件号（≤30 字）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(30, { message: '证件号不超过 30 字' })
  idCard?: string;

  @ApiProperty({ description: '联系电话（11 位手机号）' })
  @IsString()
  @Matches(PHONE_REGEX, { message: '请输入正确的联系电话' })
  phone: string;

  @ApiProperty({ description: '电子邮箱（≤50 字）', required: false })
  // 非必填：仅当传入非空值时才校验邮箱格式（避免空串穿透 @IsOptional 触发格式报错）
  @ValidateIf((o) => o.email !== undefined && o.email !== null && o.email !== '')
  @IsEmail({}, { message: '请输入正确的电子邮箱' })
  @MaxLength(50, { message: '电子邮箱不超过 50 字' })
  email?: string;
}

/**
 * 更新外部考生接口入参
 * 通过 id 定位；准考证号不可修改（不声明该字段，配合全局 whitelist 校验拒绝前端传入）。
 */
export class UpdateExternalCandidateDto {
  @ApiProperty({ description: '外部考生 ID' })
  @IsInt()
  @IsPositive()
  id: number;

  @ApiProperty({ description: '姓名（2-20 字）' })
  @IsString()
  @MinLength(2, { message: '姓名长度为 2-20 字' })
  @MaxLength(20, { message: '姓名长度为 2-20 字' })
  name: string;

  @ApiProperty({ description: '所属单位（≤50 字）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: '所属单位不超过 50 字' })
  company?: string;

  @ApiProperty({ description: '证件号（≤30 字）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(30, { message: '证件号不超过 30 字' })
  idCard?: string;

  @ApiProperty({ description: '联系电话（11 位手机号）' })
  @IsString()
  @Matches(PHONE_REGEX, { message: '请输入正确的联系电话' })
  phone: string;

  @ApiProperty({ description: '电子邮箱（≤50 字）', required: false })
  @ValidateIf((o) => o.email !== undefined && o.email !== null && o.email !== '')
  @IsEmail({}, { message: '请输入正确的电子邮箱' })
  @MaxLength(50, { message: '电子邮箱不超过 50 字' })
  email?: string;
}

/**
 * 重置外部考生账号密码接口入参
 */
export class ResetPasswordDto {
  @ApiProperty({ description: '外部考生 ID' })
  @IsInt()
  @IsPositive()
  id: number;
}

/**
 * 批量导入的单行外部考生数据
 * 校验规则与新增一致，逐行独立校验后统一入库。
 */
export class ImportCandidateRowDto {
  @ApiProperty({ description: '姓名（2-20 字）' })
  @IsString()
  @MinLength(2, { message: '姓名长度为 2-20 字' })
  @MaxLength(20, { message: '姓名长度为 2-20 字' })
  name: string;

  @ApiProperty({ description: '准考证号（≤30 字）' })
  @IsString()
  @MaxLength(30, { message: '准考证号不超过 30 字' })
  admissionNo: string;

  @ApiProperty({ description: '所属单位（≤50 字）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: '所属单位不超过 50 字' })
  company?: string;

  @ApiProperty({ description: '证件号（≤30 字）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(30, { message: '证件号不超过 30 字' })
  idCard?: string;

  @ApiProperty({ description: '联系电话（11 位手机号）' })
  @IsString()
  @Matches(PHONE_REGEX, { message: '请输入正确的联系电话' })
  phone: string;

  @ApiProperty({ description: '电子邮箱（≤50 字）', required: false })
  @ValidateIf((o) => o.email !== undefined && o.email !== null && o.email !== '')
  @IsEmail({}, { message: '请输入正确的电子邮箱' })
  @MaxLength(50, { message: '电子邮箱不超过 50 字' })
  email?: string;
}

/**
 * 批量导入外部考生接口入参
 * rows 为按模板解析出的考生行数组，逐行嵌套校验。
 */
export class ImportExternalCandidateDto {
  @ApiProperty({ description: '待导入的外部考生行数据', type: [ImportCandidateRowDto] })
  @IsArray()
  @ArrayNotEmpty({ message: '导入数据不能为空' })
  @ArrayMaxSize(500, { message: '单次最多导入 500 名外部考生' })
  @ValidateNested({ each: true })
  @Type(() => ImportCandidateRowDto)
  rows: ImportCandidateRowDto[];
}
