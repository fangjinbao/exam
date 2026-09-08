import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma.service';
import { BaseService } from '@/common/crud';
import {
  CERT_TEMPLATE_SNAPSHOT_SELECT,
  resolveCertTemplate,
} from '../utils/cert-template-snapshot';

// 列表带出认证项目名称、证书模板名称的关联白名单
const LIST_INCLUDE = {
  project: { select: { name: true } },
  template: { select: { name: true } },
} satisfies Prisma.CertificateInclude;

type CertWithRel = Prisma.CertificateGetPayload<{ include: typeof LIST_INCLUDE }>;

/** 证书发放列表筛选条件 */
export interface CertificateListFilter {
  projectId?: number;
  keyword?: string;
  certStatus?: string;
}

/**
 * 证书发放服务（台账）
 * 提供已发放证书的分页查询（按认证项目/考生关键词/证书状态筛选）与详情。
 * 证书状态（有效/已过期）不落库，按「有效期至 vs 当前时间」运行时判定；
 * 考生姓名取发证时快照，不联表查考生账号。
 */
@Injectable()
export class CertificateService extends BaseService {
  constructor(protected prisma: PrismaService) {
    super(prisma, 'certificate');
  }

  /**
   * 按有效期至计算证书状态
   * @param expireDate 有效期至
   * @param now 当前时间
   * @returns valid 有效 / expired 已过期
   */
  private computeCertStatus(expireDate: Date, now: Date): string {
    return now > expireDate ? 'expired' : 'valid';
  }

  /** 扁平化关联名称并附加运行时证书状态 */
  private flatten(record: CertWithRel, now: Date) {
    const { project, template, ...rest } = record;
    return {
      ...rest,
      projectName: project?.name ?? '',
      templateName: template?.name ?? '',
      certStatus: this.computeCertStatus(record.expireDate, now),
    };
  }

  /**
   * 分页查询证书发放记录
   * projectId 精确匹配，keyword 模糊匹配考生姓名，certStatus 为运行时计算值需应用层过滤。
   */
  async pageList(filter: CertificateListFilter, page?: number, pageSize?: number) {
    const and: Prisma.CertificateWhereInput[] = [];
    if (filter.projectId !== undefined) and.push({ projectId: filter.projectId });
    if (filter.keyword) and.push({ candidateName: { contains: filter.keyword } });
    const where: Prisma.CertificateWhereInput = and.length ? { AND: and } : {};

    const p = Math.max(page || 1, 1);
    const ps = Math.min(Math.max(pageSize || 10, 1), 100);
    const skip = (p - 1) * ps;
    const now = new Date();

    // certStatus 为运行时计算值，无法进 DB where：有筛选时全量取出→过滤→应用层分页，
    // 保证 total 与列表一致；无该筛选时走 DB 分页（高效）。
    if (filter.certStatus) {
      const rows = await this.prisma.certificate.findMany({
        where,
        orderBy: { id: 'desc' },
        include: LIST_INCLUDE,
      });
      const all = rows
        .map((r) => this.flatten(r, now))
        .filter((c) => c.certStatus === filter.certStatus);
      return {
        list: all.slice(skip, skip + ps),
        pagination: { page: p, pageSize: ps, total: all.length },
      };
    }

    const [rows, total] = await Promise.all([
      this.prisma.certificate.findMany({
        where,
        skip,
        take: ps,
        orderBy: { id: 'desc' },
        include: LIST_INCLUDE,
      }),
      this.prisma.certificate.count({ where }),
    ]);
    return {
      list: rows.map((r) => this.flatten(r, now)),
      pagination: { page: p, pageSize: ps, total },
    };
  }

  /**
   * 查询证书详情（含证书模板版式内容，供查看/下载渲染）
   * @param id 证书 ID
   * @returns 详情结构；不存在返回 null
   */
  async detail(id: number) {
    const record = await this.prisma.certificate.findUnique({
      where: { id },
      include: {
        project: { select: { name: true } },
        // name 用于显示「用了哪个模板」，取当前值；其余渲染字段一律走快照
        template: { select: { name: true, ...CERT_TEMPLATE_SNAPSHOT_SELECT } },
      },
    });
    if (!record) return null;
    const now = new Date();
    const { project, template, ...rest } = record;
    // 模板改版不应改写已发出的证书，故渲染字段以发证时的快照为准
    const tpl = resolveCertTemplate(record.templateSnapshot, template);
    return {
      ...rest,
      projectName: project?.name ?? '',
      templateName: template?.name ?? '',
      certStatus: this.computeCertStatus(record.expireDate, now),
      title: tpl.title,
      issuingOrg: tpl.issuingOrg,
      templateDescription: tpl.description,
      sealImage: tpl.sealImage,
      backgroundImage: tpl.backgroundImage,
      content: tpl.content,
    };
  }
}
