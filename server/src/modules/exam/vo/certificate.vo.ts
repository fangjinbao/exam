import { ApiProperty } from '@nestjs/swagger';

/**
 * 证书发放记录列表/详情 VO
 * 考生姓名取快照字段；带出认证项目名称、证书模板名称；证书状态按有效期至运行时判定。
 */
export class CertificateVo {
  @ApiProperty({ description: '证书 ID' })
  id: number;

  @ApiProperty({ description: '证书编号（全局唯一）' })
  certNo: string;

  @ApiProperty({ description: '关联认证项目 ID' })
  projectId: number;

  @ApiProperty({ description: '认证项目名称' })
  projectName: string;

  @ApiProperty({ description: '关联证书模板 ID' })
  templateId: number;

  @ApiProperty({ description: '证书模板名称' })
  templateName: string;

  @ApiProperty({ description: '考生类型 internal 内部 / external 外部' })
  candidateType: string;

  @ApiProperty({ description: '考生姓名' })
  candidateName: string;

  @ApiProperty({ description: '颁发日期' })
  issueDate: string;

  @ApiProperty({ description: '有效期至' })
  expireDate: string;

  @ApiProperty({ description: '证书状态 valid 有效 / expired 已过期（运行时按有效期至判定）' })
  certStatus: string;
}

/**
 * 证书详情 VO（含证书模板版式内容，供查看/下载渲染）
 * 在列表字段基础上补充模板标题、颁发机构、说明文案、印章、编号规则等内容。
 */
export class CertificateDetailVo extends CertificateVo {
  @ApiProperty({ description: '证书标题' })
  title: string;

  @ApiProperty({ description: '颁发机构名称' })
  issuingOrg: string;

  @ApiProperty({ description: '证书说明文案', nullable: true })
  templateDescription: string | null;

  @ApiProperty({ description: '印章图片 URL', nullable: true })
  sealImage: string | null;

  @ApiProperty({ description: '证书底图 URL', nullable: true })
  backgroundImage: string | null;

  @ApiProperty({ description: '版式 JSON', nullable: true })
  content: string | null;
}
