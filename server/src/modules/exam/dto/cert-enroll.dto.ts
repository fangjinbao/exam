import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsInt, IsPositive } from 'class-validator';

/**
 * 提交鉴定报名入参
 *
 * 一次把选中的人员报到同一个名额行下。名额行决定了单位、部门与可选人员范围，
 * 故这里只需名额行 ID + 人员 ID，单位不由前端传（否则可被改成别的单位）。
 */
export class EnrollDto {
  @ApiProperty({ description: '名额行 ID（CertProjectQuota.id）' })
  @IsInt({ message: '请选择名额' })
  @IsPositive({ message: '请选择名额' })
  quotaId: number;

  @ApiProperty({ description: '选中的内部员工 ID 列表', type: [Number] })
  @IsArray({ message: '人员列表格式有误' })
  @ArrayNotEmpty({ message: '请先选择要报名的人员' })
  @IsInt({ each: true, message: '人员 ID 必须为整数' })
  @IsPositive({ each: true, message: '人员 ID 必须为正整数' })
  userIds: number[];
}
