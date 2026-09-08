import { IsInt, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 监考写动作的共用入参（强制交卷 / 解锁续答 / 清空重考）
 *
 * examId 与 sheetId 都必传：examId 用于校验监考权与考试状态，
 * sheetId 用于定位答卷，且服务层会用 examId 限定查询范围——
 * 只传 sheetId 就无法判断调用方是否有权动这份答卷。
 */
export class ProctorSheetActionDto {
  @ApiProperty({ description: '考试 ID' })
  @IsInt()
  @IsPositive()
  examId: number;

  @ApiProperty({ description: '答卷 ID' })
  @IsInt()
  @IsPositive()
  sheetId: number;
}
