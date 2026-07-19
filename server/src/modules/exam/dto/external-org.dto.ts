import {
  IsInt,
  IsPositive,
  IsString,
  IsOptional,
  IsNotEmpty,
  IsArray,
  MaxLength,
  Matches,
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
 * 新增外部单位接口入参
 * 单位名称必填且系统内唯一；编码、联系人、联系电话、地址、备注可选（电话填写时校验 11 位手机号）。
 */
export class CreateExternalOrgDto {
  @ApiProperty({ description: '单位名称（≤100 字，系统内唯一）' })
  @IsString()
  @IsNotEmpty({ message: '请输入单位名称' })
  @MaxLength(100, { message: '单位名称不超过 100 字' })
  name: string;

  @ApiProperty({ description: '单位编码（≤30 字，系统内唯一）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(30, { message: '单位编码不超过 30 字' })
  code?: string;

  @ApiProperty({ description: '联系人（≤50 字）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: '联系人不超过 50 字' })
  contact?: string;

  @ApiProperty({ description: '联系电话（11 位手机号）', required: false })
  // 非必填：仅当传入非空值时才校验手机号格式（避免空串触发正则报错）
  @ValidateIf((o) => o.phone !== undefined && o.phone !== null && o.phone !== '')
  @IsString()
  @Matches(PHONE_REGEX, { message: '请输入正确的11位手机号' })
  phone?: string;

  @ApiProperty({ description: '单位地址（≤200 字）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: '单位地址不超过 200 字' })
  address?: string;

  @ApiProperty({ description: '备注（≤200 字）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: '备注不超过 200 字' })
  remark?: string;

  @ApiProperty({ description: '状态 1=启用 0=停用', required: false })
  @IsOptional()
  @IsInt()
  status?: number;
}

/**
 * 更新外部单位接口入参
 * 通过 id 定位，其余字段同新增。
 */
export class UpdateExternalOrgDto extends CreateExternalOrgDto {
  @ApiProperty({ description: '外部单位 ID' })
  @IsInt()
  @IsPositive()
  id: number;
}

/**
 * 批量导入的单行外部单位数据
 * 逐行导入策略：字段仅做类型约束，各行的必填/格式/唯一性校验由 service 逐行判定，
 * 不合格行跳过并记入失败明细（不整体拒绝）。故各字段声明为可选、不加格式校验。
 */
export class ImportOrgRowDto {
  @ApiProperty({ description: '单位名称', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: '单位编码', required: false })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({ description: '联系人', required: false })
  @IsOptional()
  @IsString()
  contact?: string;

  @ApiProperty({ description: '联系电话', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ description: '单位地址', required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ description: '备注', required: false })
  @IsOptional()
  @IsString()
  remark?: string;
}

/**
 * 批量导入外部单位接口入参
 * rows 为按模板解析出的单位行数组；逐行校验、有错跳过，故仅校验数组规模。
 */
export class ImportExternalOrgDto {
  @ApiProperty({ description: '待导入的外部单位行数据', type: [ImportOrgRowDto] })
  @IsArray()
  @ArrayNotEmpty({ message: '导入数据不能为空' })
  @ArrayMaxSize(500, { message: '单次最多导入 500 个外部单位' })
  @ValidateNested({ each: true })
  @Type(() => ImportOrgRowDto)
  rows: ImportOrgRowDto[];
}
