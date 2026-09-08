import { ApiProperty } from '@nestjs/swagger';

/**
 * 证书模板响应 VO
 * 证书模板为基础配置数据，无敏感字段，字段与 Prisma CertificateTemplate model 一致。
 */
export class CertificateTemplateVo {
  @ApiProperty({ description: '证书模板 ID' })
  id: number;

  @ApiProperty({ description: '模板名称（系统内唯一）' })
  name: string;

  @ApiProperty({ description: '证书标题' })
  title: string;

  @ApiProperty({ description: '颁发机构名称' })
  issuingOrg: string;

  @ApiProperty({ description: '证书说明文案', nullable: true })
  description: string | null;

  @ApiProperty({ description: '印章图片 URL', nullable: true })
  sealImage: string | null;

  @ApiProperty({ description: '编号规则' })
  numberRule: string;

  @ApiProperty({ description: '证书尺寸 1=A4横版 2=A4竖版' })
  size: number;

  @ApiProperty({ description: '证书底图 URL', nullable: true })
  backgroundImage: string | null;

  @ApiProperty({ description: '版式 JSON（可视化设计器排版元素）', nullable: true })
  content: string | null;

  @ApiProperty({ description: '状态 1=启用 0=停用' })
  status: number;

  @ApiProperty({ description: '创建时间' })
  createTime: string;

  @ApiProperty({ description: '更新时间' })
  updateTime: string;
}

/**
 * 证书模板下拉选项 VO
 * 供认证项目关联证书模板时选择，仅返回启用模板的 id 与名称。
 */
export class CertificateTemplateOptionVo {
  @ApiProperty({ description: '证书模板 ID' })
  id: number;

  @ApiProperty({ description: '模板名称' })
  name: string;
}
