import {
  IsInt,
  IsPositive,
  IsString,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  IsArray,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 工种下的一个鉴定级别（新增/编辑工种时随工种一起提交）
 *
 * 级别不单独走增删改接口：它没有独立于工种的生命周期，
 * 前端在工种弹窗里整组编辑后一次提交，服务端按「全量替换」落库。
 */
export class CertOccupationLevelDto {
  @ApiProperty({ description: '级别 ID（编辑已有级别时传，新增留空）', required: false })
  @IsOptional()
  @IsInt()
  @IsPositive()
  id?: number;

  @ApiProperty({ description: '级别名称（≤50 字，同一工种内唯一）' })
  @IsString()
  @IsNotEmpty({ message: '请输入级别名称' })
  @MaxLength(50, { message: '级别名称不超过 50 字' })
  name: string;

  @ApiProperty({ description: '排序号（同工种内升序，表达级别高低次序）', required: false })
  @IsOptional()
  @IsInt({ message: '排序号必须为整数' })
  @Min(0, { message: '排序号不能为负数' })
  orderNum?: number;

  @ApiProperty({ description: '级别说明（≤500 字）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '级别说明不超过 500 字' })
  description?: string;
}

/**
 * 新增鉴定工种接口入参
 *
 * 工种名称必填且唯一；编号可留空（服务端按 GZ+序号 生成）。
 * levels 可为空数组：允许先建工种、之后再补级别。
 */
export class CreateCertOccupationDto {
  @ApiProperty({ description: '工种名称（≤50 字，唯一）' })
  @IsString()
  @IsNotEmpty({ message: '请输入工种名称' })
  @MaxLength(50, { message: '工种名称不超过 50 字' })
  name: string;

  @ApiProperty({ description: '工种编号（≤30 字，唯一；留空由系统生成）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(30, { message: '工种编号不超过 30 字' })
  code?: string;

  @ApiProperty({ description: '工种说明（≤500 字）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '工种说明不超过 500 字' })
  description?: string;

  @ApiProperty({ description: '排序号（列表内升序）', required: false })
  @IsOptional()
  @IsInt({ message: '排序号必须为整数' })
  @Min(0, { message: '排序号不能为负数' })
  orderNum?: number;

  @ApiProperty({ description: '状态 1=启用 0=停用', required: false })
  @IsOptional()
  @IsInt()
  status?: number;

  @ApiProperty({
    description: '该工种下的鉴定级别（整组提交，服务端全量替换）',
    type: [CertOccupationLevelDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  // ValidateNested + Type：数组内元素需逐个按 DTO 校验，缺 Type 时 class-validator 拿不到元素类型
  @ValidateNested({ each: true })
  @Type(() => CertOccupationLevelDto)
  levels?: CertOccupationLevelDto[];
}

/**
 * 更新鉴定工种接口入参
 * 通过 id 定位，其余字段同新增。
 */
export class UpdateCertOccupationDto extends CreateCertOccupationDto {
  @ApiProperty({ description: '工种 ID' })
  @IsInt()
  @IsPositive()
  id: number;
}

/**
 * 单独新增一个级别的入参
 *
 * 与工种弹窗里的整组提交并存：整组提交适合「一次配齐一个工种的分级」，
 * 单条接口适合「给已有工种补一级」或「只改某一级的名称」——
 * 后者若走整组替换，会把未提交的其他级别当作已删除。
 */
export class CreateCertLevelDto {
  @ApiProperty({ description: '所属工种 ID' })
  @IsInt()
  @IsPositive()
  occupationId: number;

  @ApiProperty({ description: '级别名称（≤50 字，同一工种内唯一）' })
  @IsString()
  @IsNotEmpty({ message: '请输入级别名称' })
  @MaxLength(50, { message: '级别名称不超过 50 字' })
  name: string;

  @ApiProperty({ description: '排序号（同工种内升序，表达级别高低次序）', required: false })
  @IsOptional()
  @IsInt({ message: '排序号必须为整数' })
  @Min(0, { message: '排序号不能为负数' })
  orderNum?: number;

  @ApiProperty({ description: '级别说明（≤500 字）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '级别说明不超过 500 字' })
  description?: string;
}

/**
 * 单独更新一个级别的入参
 *
 * 不含 occupationId：级别不支持改挂到别的工种下——
 * 那等于删一级再在别处建一级，语义上该由两次操作表达，
 * 也避免级别日后被鉴定记录引用后「悄悄换了归属」。
 */
export class UpdateCertLevelDto {
  @ApiProperty({ description: '级别 ID' })
  @IsInt()
  @IsPositive()
  id: number;

  @ApiProperty({ description: '级别名称（≤50 字，同一工种内唯一）' })
  @IsString()
  @IsNotEmpty({ message: '请输入级别名称' })
  @MaxLength(50, { message: '级别名称不超过 50 字' })
  name: string;

  @ApiProperty({ description: '排序号（同工种内升序，表达级别高低次序）', required: false })
  @IsOptional()
  @IsInt({ message: '排序号必须为整数' })
  @Min(0, { message: '排序号不能为负数' })
  orderNum?: number;

  @ApiProperty({ description: '级别说明（≤500 字）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '级别说明不超过 500 字' })
  description?: string;
}
