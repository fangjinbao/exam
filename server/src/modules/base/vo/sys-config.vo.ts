import { ApiProperty } from '@nestjs/swagger';

/**
 * 系统基础配置响应 VO
 * 由 base_sys_param 键值对表的多行配置组装为单个扁平对象返回。
 */
export class BaseConfigVo {
  @ApiProperty({ description: '系统名称' })
  sysName: string;

  @ApiProperty({ description: '系统Logo（图片地址或 base64）', nullable: true })
  sysLogo: string;

  @ApiProperty({ description: '系统描述', nullable: true })
  sysDesc: string;

  @ApiProperty({ description: '默认时区' })
  timezone: string;

  @ApiProperty({ description: '日期格式' })
  dateFormat: string;
}
