import { IsString, IsOptional, IsNotEmpty, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 保存系统基础配置入参
 * 整体覆盖式保存：系统名称必填，其余字段可选；Logo 大小/格式由前端校验，后端仅存字符串。
 */
export class SaveBaseConfigDto {
  @ApiProperty({ description: '系统名称' })
  @IsString()
  @IsNotEmpty({ message: '请填写系统名称' })
  @MaxLength(50, { message: '系统名称不能超过 50 字' })
  sysName: string;

  /**
   * 系统Logo（图片地址或 base64）
   * 安全提示：前端渲染必须用 <img src="...">，禁止 v-html/innerHTML。
   * 后端已拒绝 data:image/svg+xml（SVG 可内嵌脚本）。
   */
  @ApiProperty({ description: '系统Logo（图片地址或 base64，不支持 SVG）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(700000, { message: 'Logo 内容过大，请压缩后重试' })
  @Matches(/^(?!data:image\/svg\+xml)/i, { message: '不支持 SVG 格式的图片' })
  sysLogo?: string;

  @ApiProperty({ description: '系统描述', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: '系统描述不能超过 200 字' })
  sysDesc?: string;

  @ApiProperty({ description: '默认时区' })
  @IsString()
  @IsNotEmpty({ message: '请选择默认时区' })
  @MaxLength(50)
  timezone: string;

  @ApiProperty({ description: '日期格式' })
  @IsString()
  @IsNotEmpty({ message: '请选择日期格式' })
  @MaxLength(50)
  dateFormat: string;
}
