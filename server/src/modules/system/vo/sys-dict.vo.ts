import { ApiProperty } from '@nestjs/swagger';

/**
 * 字典类型响应 VO
 * typeName/typeCode 对应库字段 name/key；itemCount 为该类型下字典项数量（统计得出）。
 */
export class DictTypeVo {
  @ApiProperty({ description: '字典类型 ID' })
  id: number;

  @ApiProperty({ description: '字典类型名称' })
  typeName: string;

  @ApiProperty({ description: '字典类型编码' })
  typeCode: string;

  @ApiProperty({ description: '该类型下字典项数量' })
  itemCount: number;
}

/**
 * 字典项响应 VO
 * sort 对应库字段 orderNum。
 */
export class DictItemVo {
  @ApiProperty({ description: '字典项 ID' })
  id: number;

  @ApiProperty({ description: '所属字典类型 ID' })
  typeId: number;

  @ApiProperty({ description: '字典项名称' })
  name: string;

  @ApiProperty({ description: '字典项值' })
  value: string;

  @ApiProperty({ description: '排序，数值越小越靠前' })
  sort: number;

  @ApiProperty({ description: '状态 1=启用 0=停用' })
  status: number;

  @ApiProperty({ description: '是否被业务引用（引用时禁止删除）' })
  referenced: boolean;
}
