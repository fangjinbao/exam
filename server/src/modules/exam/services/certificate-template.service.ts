import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma.service';
import { BaseService } from '@/common/crud';
import { CertificateTemplateOptionVo } from '../vo/certificate-template.vo';

/** 证书模板列表/导出筛选条件（keyword 模糊匹配名称/标题/颁发机构，status 精确） */
export interface CertTemplateListFilter {
  keyword?: string;
  status?: number;
}

/**
 * 证书模板服务
 * 在基础增删改查之上，提供模板名称唯一性校验、删除前的引用保护，
 * 以及供认证项目关联使用的启用模板下拉选项。
 */
@Injectable()
export class CertificateTemplateService extends BaseService {
  constructor(protected prisma: PrismaService) {
    super(prisma, 'certificateTemplate');
  }

  /**
   * 校验模板名称是否已存在
   * @param name 模板名称
   * @param excludeId 需排除的记录 ID（编辑场景排除自身）
   * @returns 已存在返回 true
   */
  async isNameExists(name: string, excludeId?: number): Promise<boolean> {
    const existing = await this.prisma.certificateTemplate.findFirst({
      where: { name, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    return !!existing;
  }

  /**
   * 删除前的关联校验
   * 证书模板被认证项目引用时不可删除（SRS 3.5.7.1 业务规则）。
   * 认证项目模块（certification）后端尚未建表，暂无引用关系可查，此处放行；
   * 待认证项目表落地后，在此查询引用并在命中时 throw new Error('该证书模板已被认证项目引用，无法删除')，
   * 控制器已按 try/catch 调用，届时接入零改动。
   * @param _id 证书模板 ID（认证项目表落地后启用）
   */
  async ensureDeletable(_id: number): Promise<void> {
    // 认证项目模块未建表，暂无引用可校验，直接放行（不谎称已校验）
    return;
  }

  /**
   * 获取启用状态的证书模板下拉选项
   * 仅返回 id 与名称，按名称升序，供认证项目关联证书模板时选择。
   * @returns 启用模板的精简列表
   */
  async options(): Promise<CertificateTemplateOptionVo[]> {
    return this.prisma.certificateTemplate.findMany({
      where: { status: 1 },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * 按筛选条件导出证书模板（不分页）
   * 复用列表筛选逻辑（keyword 模糊匹配名称/标题/颁发机构，status 精确），返回全部匹配记录。
   * @param filter 与列表一致的筛选条件
   * @param limit 最大导出条数（默认 10000，防止全表拉取）
   * @returns 证书模板记录数组
   */
  async exportList(filter: CertTemplateListFilter, limit = 10000) {
    const and: Prisma.CertificateTemplateWhereInput[] = [];
    if (filter.keyword) {
      and.push({
        OR: [
          { name: { contains: filter.keyword } },
          { title: { contains: filter.keyword } },
          { issuingOrg: { contains: filter.keyword } },
        ],
      });
    }
    if (filter.status !== undefined) and.push({ status: filter.status });
    const where: Prisma.CertificateTemplateWhereInput = and.length ? { AND: and } : {};
    return this.list(where, undefined, undefined, limit);
  }
}
