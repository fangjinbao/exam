import {
  IsInt,
  IsPositive,
  IsString,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  Matches,
  ValidateIf,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// 手机号正则：11 位，1 开头，第二位 3-9（与前端 validatePhone 保持一致）
const PHONE_REGEX = /^1[3-9]\d{9}$/;

/**
 * 新增考点接口入参
 * 考点名称、地址必填；容纳人数、联系人、联系电话可选（电话填写时校验 11 位手机号）。
 */
export class CreateExamSiteDto {
  @ApiProperty({ description: '考点名称（≤50 字，系统内唯一）' })
  @IsString()
  @IsNotEmpty({ message: '请输入考点名称' })
  @MaxLength(50, { message: '考点名称不超过 50 字' })
  name: string;

  @ApiProperty({ description: '考点地址（≤200 字）' })
  @IsString()
  @IsNotEmpty({ message: '请输入考点地址' })
  @MaxLength(200, { message: '考点地址不超过 200 字' })
  address: string;

  @ApiProperty({ description: '容纳人数（正整数）', required: false, nullable: true })
  // 可空：仅当传入非空值时才校验为正整数（前端未填时传 null）
  @ValidateIf((o) => o.capacity !== undefined && o.capacity !== null)
  @IsInt({ message: '容纳人数必须为整数' })
  @Min(1, { message: '容纳人数必须为正整数' })
  capacity?: number | null;

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

  @ApiProperty({ description: '状态 1=启用 0=停用', required: false })
  @IsOptional()
  @IsInt()
  status?: number;
}

/**
 * 更新考点接口入参
 * 通过 id 定位，其余字段同新增。
 */
export class UpdateExamSiteDto extends CreateExamSiteDto {
  @ApiProperty({ description: '考点 ID' })
  @IsInt()
  @IsPositive()
  id: number;
}
