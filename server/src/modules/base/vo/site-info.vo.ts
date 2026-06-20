import { ApiProperty } from '@nestjs/swagger';

/**
 * 站点公开信息 VO
 * 供登录页、全局标题等未登录场景展示，仅暴露系统名称与 Logo，不含其他内部配置。
 */
export class SiteInfoVo {
  @ApiProperty({ description: '系统名称' })
  sysName: string;

  @ApiProperty({ description: '系统Logo（图片地址或 base64）', nullable: true })
  sysLogo: string;
}
