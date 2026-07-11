import { IsInt, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 更新参数值入参
 * 仅允许修改参数值；值超出预设范围时由 service 阻止。
 */
export class UpdateParamConfigDto {
  @ApiProperty({ description: '参数配置 ID' })
  @IsInt({ message: 'id 必须为整数' })
  id: number;

  @ApiProperty({ description: '参数值（字符串）' })
  @IsString()
  @IsNotEmpty({ message: '参数值不能为空' })
  value: string;
}
