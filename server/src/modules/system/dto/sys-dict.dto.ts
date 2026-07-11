import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 新增字典项入参
 * 同一字典类型下 name、value 需唯一（由 service 校验）。
 */
export class AddDictItemDto {
  @ApiProperty({ description: '所属字典类型 ID' })
  @IsInt({ message: 'typeId 必须为整数' })
  typeId: number;

  @ApiProperty({ description: '字典项名称' })
  @IsString()
  @IsNotEmpty({ message: '字典项名称不能为空' })
  @MaxLength(100)
  name: string;

  @ApiProperty({ description: '字典项值' })
  @IsString()
  @IsNotEmpty({ message: '字典项值不能为空' })
  @MaxLength(100)
  value: string;

  @ApiProperty({ description: '排序，数值越小越靠前', required: false })
  @IsOptional()
  @IsInt({ message: 'sort 必须为整数' })
  sort?: number;

  @ApiProperty({ description: '状态 1=启用 0=停用' })
  @IsInt({ message: 'status 必须为整数' })
  @IsIn([0, 1], { message: 'status 只能为 0 或 1' })
  status: number;
}

/**
 * 更新字典项入参
 */
export class UpdateDictItemDto extends AddDictItemDto {
  @ApiProperty({ description: '字典项 ID' })
  @IsInt({ message: 'id 必须为整数' })
  id: number;
}
