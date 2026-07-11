import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 新增 AI 模型配置入参
 * apiKey 为明文密钥，服务端存储时不下发完整值。
 */
export class AddAiModelDto {
  @ApiProperty({ description: '配置名称' })
  @IsString()
  @IsNotEmpty({ message: '配置名称不能为空' })
  @MaxLength(100)
  name: string;

  @ApiProperty({ description: '模型服务商' })
  @IsString()
  @IsNotEmpty({ message: '模型服务商不能为空' })
  @MaxLength(50)
  provider: string;

  @ApiProperty({ description: '模型名称' })
  @IsString()
  @IsNotEmpty({ message: '模型名称不能为空' })
  @MaxLength(100)
  model: string;

  @ApiProperty({ description: '接口地址' })
  @IsString()
  @IsNotEmpty({ message: '接口地址不能为空' })
  @MaxLength(500)
  apiUrl: string;

  @ApiProperty({ description: '接口密钥（明文）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string;

  @ApiProperty({ description: '最大并发数', required: false, nullable: true })
  @IsOptional()
  @IsInt({ message: '最大并发数必须为整数' })
  @Min(1, { message: '最大并发数至少为 1' })
  maxConcurrency?: number | null;

  @ApiProperty({ description: '超时时间（秒）', required: false, nullable: true })
  @IsOptional()
  @IsInt({ message: '超时时间必须为整数' })
  @Min(1, { message: '超时时间至少为 1 秒' })
  timeout?: number | null;
}

/**
 * 更新 AI 模型配置入参
 * apiKey 留空表示不修改密钥，保留原值。
 */
export class UpdateAiModelDto extends AddAiModelDto {
  @ApiProperty({ description: 'AI 模型配置 ID' })
  @IsInt({ message: 'id 必须为整数' })
  id: number;
}

/** 仅含 id 的入参（启用切换 / 连接测试） */
export class AiModelIdDto {
  @ApiProperty({ description: 'AI 模型配置 ID' })
  @IsInt({ message: 'id 必须为整数' })
  id: number;
}
