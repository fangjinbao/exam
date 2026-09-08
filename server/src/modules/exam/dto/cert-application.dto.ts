import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 报考审核接口入参
 * result=approved 通过 / rejected 驳回；驳回时 rejectReason 必填（由控制器业务校验）。
 */
export class ReviewApplicationDto {
  @ApiProperty({ description: '报考申请 ID' })
  @IsInt()
  @IsPositive()
  id: number;

  @ApiProperty({ description: '审核结果：approved 通过 / rejected 驳回' })
  @IsString()
  @IsIn(['approved', 'rejected'], { message: '审核结果只能是通过或驳回' })
  result: 'approved' | 'rejected';

  @ApiProperty({ description: '驳回原因（驳回时必填，≤200 字）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: '驳回原因不超过 200 字' })
  rejectReason?: string;
}

/**
 * 批量审核入参
 *
 * 单位一次报上来几十人，逐条点不现实。整批要么全成要么全不成，
 * 故校验不通过时不做部分提交。
 */
export class ReviewBatchDto {
  @ApiProperty({ description: '报名记录 ID 列表', type: [Number] })
  @IsArray({ message: 'ID 列表格式有误' })
  @ArrayNotEmpty({ message: '请先选择要审核的记录' })
  @IsInt({ each: true, message: 'ID 必须为整数' })
  @IsPositive({ each: true, message: 'ID 必须为正整数' })
  ids: number[];

  @ApiProperty({ description: '审核结果：approved 通过 / rejected 驳回' })
  @IsString()
  @IsIn(['approved', 'rejected'], { message: '审核结果只能是通过或驳回' })
  result: 'approved' | 'rejected';

  @ApiProperty({ description: '驳回原因（驳回时必填，≤200 字）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: '驳回原因不超过 200 字' })
  rejectReason?: string;
}
