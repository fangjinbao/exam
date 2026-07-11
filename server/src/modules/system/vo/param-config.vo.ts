import { ApiProperty } from '@nestjs/swagger';

/**
 * 参数配置响应 VO
 * 对齐前端契约：min/max 为允许范围（对应库字段 minValue/maxValue）。
 */
export class ParamConfigVo {
  @ApiProperty({ description: '参数配置 ID' })
  id: number;

  @ApiProperty({ description: '参数名称' })
  name: string;

  @ApiProperty({ description: '参数值（字符串存储）' })
  value: string;

  @ApiProperty({ description: '参数说明', nullable: true })
  description: string | null;

  @ApiProperty({ description: '参数值类型，如 int' })
  valueType: string;

  @ApiProperty({ description: '允许最小值', nullable: true })
  min: number | null;

  @ApiProperty({ description: '允许最大值', nullable: true })
  max: number | null;

  @ApiProperty({ description: '更新时间' })
  updateTime: string;
}
