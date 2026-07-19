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
 * 姓名、手机号、所属单位、身份证号必填；电子邮箱、密码可选（邮箱/密码填写时校验格式）。
 * 提交后系统以手机号为登录名生成考试账号，密码留空则默认取手机号后 6 位。
 */
export class CreateExternalCandidateDto {
  @ApiProperty({ description: '姓名（2-20 字）' })
  @IsString()
  @MinLength(2, { message: '姓名长度为 2-20 字' })
  @MaxLength(20, { message: '姓名长度为 2-20 字' })
  name: string;

  @ApiProperty({ description: '所属外部单位 ID（必填，来源于外部单位中已启用的单位）' })
  @IsInt({ message: '请选择所属单位' })
  @IsPositive({ message: '请选择所属单位' })
  orgId: number;

  @ApiProperty({ description: '身份证号（必填，≤30 字）' })
  @IsString()
  @MinLength(1, { message: '请输入身份证号' })
  @MaxLength(30, { message: '证件号不超过 30 字' })
  idCard: string;

  @ApiProperty({ description: '联系电话（11 位手机号，同时作为考试账号登录名，系统内唯一）' })
  @IsString()
  @Matches(PHONE_REGEX, { message: '请输入正确的联系电话' })
  phone: string;

  @ApiProperty({ description: '电子邮箱（≤50 字）', required: false })
  // 非必填：仅当传入非空值时才校验邮箱格式（避免空串穿透 @IsOptional 触发格式报错）
  @ValidateIf((o) => o.email !== undefined && o.email !== null && o.email !== '')
  @IsEmail({}, { message: '请输入正确的电子邮箱' })
  @MaxLength(50, { message: '电子邮箱不超过 50 字' })
  email?: string;

  @ApiProperty({ description: '账号密码（6-20 字，留空则默认使用手机号后 6 位）', required: false })
  // 非必填：留空时 service 以手机号后 6 位兜底；填写时才校验长度
  @ValidateIf((o) => o.password !== undefined && o.password !== null && o.password !== '')
  @IsString()
  @MinLength(6, { message: '密码长度为 6-20 位' })
  @MaxLength(20, { message: '密码长度为 6-20 位' })
  password?: string;
}

/**
 * 更新外部考生接口入参
 * 通过 id 定位；手机号可修改，但作为登录账号需保持系统内唯一（service 排除自身校验）。
 * 密码不在此维护，改密统一走 reset-password 接口。
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

  @ApiProperty({ description: '所属外部单位 ID（必填，来源于外部单位中已启用的单位）' })
  @IsInt({ message: '请选择所属单位' })
  @IsPositive({ message: '请选择所属单位' })
  orgId: number;

  @ApiProperty({ description: '身份证号（必填，≤30 字）' })
  @IsString()
  @MinLength(1, { message: '请输入身份证号' })
  @MaxLength(30, { message: '证件号不超过 30 字' })
  idCard: string;

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
 * 逐行导入策略：字段仅做类型约束，各行的必填/格式/唯一性校验由 service 逐行判定，
 * 校验不过的行被跳过并计入失败明细（不整体拒绝）。故此处不加必填/格式校验，
 * 且各字段声明为可选，避免单行缺字段触发全批 400。
 */
export class ImportCandidateRowDto {
  @ApiProperty({ description: '姓名', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: '所属单位名称', required: false })
  @IsOptional()
  @IsString()
  company?: string;

  @ApiProperty({ description: '证件号', required: false })
  @IsOptional()
  @IsString()
  idCard?: string;

  @ApiProperty({ description: '联系电话', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ description: '电子邮箱', required: false })
  @IsOptional()
  @IsString()
  email?: string;
}

/**
 * 批量导入外部考生接口入参
 * rows 为按模板解析出的考生行数组；逐行校验、有错跳过，故仅校验数组规模，不做嵌套强校验。
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
