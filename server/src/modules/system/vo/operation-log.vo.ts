import { ApiProperty } from '@nestjs/swagger';

/**
 * 操作日志响应 VO
 */
export class OperationLogVo {
  @ApiProperty({ description: '日志 ID' })
  id: number;

  @ApiProperty({ description: '操作人姓名' })
  operator: string;

  @ApiProperty({ description: '操作类型：新增/编辑/删除/登录/其他' })
  type: string;

  @ApiProperty({ description: '操作对象' })
  target: string;

  @ApiProperty({ description: '操作内容描述' })
  content: string;

  @ApiProperty({ description: '操作时间 YYYY-MM-DD HH:mm:ss' })
  operateTime: string;

  @ApiProperty({ description: '来源网络地址' })
  sourceIp: string;
}
