import { IsString, IsNotEmpty, IsOptional, IsInt, Min, MaxLength, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 新增问题类型入参
 * 名称必填且 ≤50 字；审核人、排序、状态均可选，由 service/默认值兜底。
 */
export class AddIssueTypeDto {
  @ApiProperty({ description: '类型名称（≤50 字）' })
  @IsString()
  @IsNotEmpty({ message: '请输入类型名称' })
  @MaxLength(50, { message: '类型名称不能超过 50 字' })
  name: string;

  @ApiProperty({ description: '默认审核人 ID', required: false, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '默认审核人 ID 必须为整数' })
  @Min(1, { message: '默认审核人 ID 必须为正整数' })
  auditorId?: number | null;

  @ApiProperty({ description: '排序号（升序，默认 0）', required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '排序必须为整数' })
  @Min(0, { message: '排序不能为负数' })
  orderNum?: number;

  @ApiProperty({ description: '状态 1=启用 0=停用（默认 1）', required: false })
  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1], { message: '状态值只能为 0 或 1' })
  status?: number;
}

/**
 * 更新问题类型入参
 * 须含 id；其余字段同新增。
 */
export class UpdateIssueTypeDto extends AddIssueTypeDto {
  @ApiProperty({ description: '问题类型 ID' })
  @Type(() => Number)
  @IsInt({ message: 'id 必须为整数' })
  @IsNotEmpty({ message: 'id 不能为空' })
  id: number;
}
