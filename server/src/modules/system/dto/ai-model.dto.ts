import {
  IsInt,
  IsNotEmpty,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** 支持的模型服务商 */
export const AI_PROVIDERS = ['OpenAI', 'Anthropic'] as const;

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

  @ApiProperty({ description: '模型服务商', enum: AI_PROVIDERS })
  @IsString()
  @IsNotEmpty({ message: '模型服务商不能为空' })
  @IsIn(AI_PROVIDERS, { message: '模型服务商仅支持 OpenAI 或 Anthropic' })
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

/**
 * 拉取模型列表入参
 * 用接口地址 + 密钥调用服务商 /models；apiKey 留空时按 id 回退库中已存密钥（编辑态）。
 */
export class FetchModelsDto {
  @ApiProperty({ description: '模型服务商（OpenAI/Anthropic）', enum: AI_PROVIDERS })
  @IsString()
  @IsNotEmpty({ message: '模型服务商不能为空' })
  @IsIn(AI_PROVIDERS, { message: '模型服务商仅支持 OpenAI 或 Anthropic' })
  provider: string;

  @ApiProperty({ description: '接口地址（base url）' })
  @IsString()
  @IsNotEmpty({ message: '接口地址不能为空' })
  @MaxLength(500)
  apiUrl: string;

  @ApiProperty({ description: '接口密钥（明文，留空则按 id 回退库中密钥）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string;

  @ApiProperty({ description: '配置 ID（编辑态回退库中密钥用）', required: false })
  @IsOptional()
  @IsInt({ message: 'id 必须为整数' })
  id?: number;
}
