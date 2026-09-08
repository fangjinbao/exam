import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/** 成绩详情入参 */
export class AppScoreDetailQueryDto {
  @ApiProperty({ description: '答卷 ID', example: 1 })
  @Type(() => Number)
  @IsInt({ message: '答卷 ID 必须为整数' })
  @Min(1, { message: '答卷 ID 不合法' })
  sheetId: number;
}

/** 证书详情入参 */
export class AppCertificateQueryDto {
  @ApiProperty({ description: '证书 ID', example: 1 })
  @Type(() => Number)
  @IsInt({ message: '证书 ID 必须为整数' })
  @Min(1, { message: '证书 ID 不合法' })
  id: number;
}

/** 证书下载入参 */
export class AppCertificateDownloadDto {
  @ApiProperty({ description: '证书 ID', example: 1 })
  @Type(() => Number)
  @IsInt({ message: '证书 ID 必须为整数' })
  @Min(1, { message: '证书 ID 不合法' })
  id: number;
}
