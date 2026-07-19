import { IsInt, IsPositive, IsString, IsOptional, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 新增知识点分类接口入参
 * 名称必填；父级为空表示顶级节点；排序、备注可选。
 */
export class CreateKnowledgePointDto {
  @ApiProperty({ description: '父级知识点 ID（顶级不传或传 null）', required: false })
  @IsOptional()
  @IsInt()
  @IsPositive()
  parentId?: number;

  @ApiProperty({ description: '知识点名称（≤100 字）' })
  @IsString()
  @IsNotEmpty({ message: '请输入知识点名称' })
  @MaxLength(100, { message: '知识点名称不超过 100 字' })
  name: string;

  @ApiProperty({ description: '排序号（同级内升序）', required: false })
  @IsOptional()
  @IsInt()
  orderNum?: number;

  @ApiProperty({ description: '备注（≤200 字）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: '备注不超过 200 字' })
  remark?: string;
}

/**
 * 更新知识点分类接口入参
 * 通过 id 定位，其余字段同新增。
 */
export class UpdateKnowledgePointDto extends CreateKnowledgePointDto {
  @ApiProperty({ description: '知识点 ID' })
  @IsInt()
  @IsPositive()
  id: number;
}
