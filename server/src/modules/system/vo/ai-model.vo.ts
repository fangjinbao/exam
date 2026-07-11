import { ApiProperty } from '@nestjs/swagger';

/**
 * AI 模型配置响应 VO
 * 注意：完整密钥 apiKey 不在 VO 中，仅下发脱敏值 apiKeyMasked。
 */
export class AiModelVo {
  @ApiProperty({ description: 'AI 模型配置 ID' })
  id: number;

  @ApiProperty({ description: '配置名称' })
  name: string;

  @ApiProperty({ description: '模型服务商' })
  provider: string;

  @ApiProperty({ description: '模型名称' })
  model: string;

  @ApiProperty({ description: '接口地址' })
  apiUrl: string;

  @ApiProperty({ description: '脱敏后的密钥（仅展示，不含完整密钥）' })
  apiKeyMasked: string;

  @ApiProperty({ description: '最大并发数', nullable: true })
  maxConcurrency: number | null;

  @ApiProperty({ description: '超时时间（秒）', nullable: true })
  timeout: number | null;

  @ApiProperty({ description: '启用状态 1=启用 0=停用' })
  status: number;

  @ApiProperty({ description: '连接状态：normal/error/unknown' })
  connStatus: string;

  @ApiProperty({ description: '创建时间' })
  createTime: string;

  @ApiProperty({ description: '更新时间' })
  updateTime: string;
}

/** 连接测试结果 VO */
export class AiModelTestVo {
  @ApiProperty({ description: '连接是否成功' })
  success: boolean;
}
