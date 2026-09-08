import {
  IsInt,
  IsIn,
  IsPositive,
  IsString,
  IsOptional,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 新增证书模板接口入参
 * 模板名称（系统内唯一）、证书标题、颁发机构名称、编号规则必填；证书说明文案、印章图片可选。
 */
export class CreateCertificateTemplateDto {
  @ApiProperty({ description: '模板名称（≤50 字，系统内唯一）' })
  @IsString()
  @IsNotEmpty({ message: '请输入模板名称' })
  @MaxLength(50, { message: '模板名称不超过 50 字' })
  name: string;

  @ApiProperty({ description: '证书标题（≤100 字）' })
  @IsString()
  @IsNotEmpty({ message: '请输入证书标题' })
  @MaxLength(100, { message: '证书标题不超过 100 字' })
  title: string;

  @ApiProperty({ description: '颁发机构名称（≤100 字）' })
  @IsString()
  @IsNotEmpty({ message: '请输入颁发机构名称' })
  @MaxLength(100, { message: '颁发机构名称不超过 100 字' })
  issuingOrg: string;

  @ApiProperty({ description: '编号规则（≤50 字，如"年份+流水号"）' })
  @IsString()
  @IsNotEmpty({ message: '请输入编号规则' })
  @MaxLength(50, { message: '编号规则不超过 50 字' })
  numberRule: string;

  @ApiProperty({ description: '证书说明文案（≤500 字）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '证书说明文案不超过 500 字' })
  description?: string;

  @ApiProperty({ description: '印章图片 URL（≤255 字）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: '印章图片地址过长' })
  sealImage?: string;

  @ApiProperty({ description: '证书尺寸 1=A4横版 2=A4竖版', required: false })
  @IsOptional()
  @IsIn([1, 2], { message: '证书尺寸取值只能是 1 或 2' })
  size?: number;

  @ApiProperty({ description: '证书底图 URL（≤255 字）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: '证书底图地址过长' })
  backgroundImage?: string;

  @ApiProperty({ description: '版式 JSON（可视化设计器排版元素）', required: false })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiProperty({ description: '状态 1=启用 0=停用', required: false })
  @IsOptional()
  @IsInt()
  status?: number;
}

/**
 * 更新证书模板接口入参
 * 通过 id 定位，其余字段同新增。
 */
export class UpdateCertificateTemplateDto extends CreateCertificateTemplateDto {
  @ApiProperty({ description: '证书模板 ID' })
  @IsInt()
  @IsPositive()
  id: number;
}
