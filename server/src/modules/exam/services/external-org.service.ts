import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma.service';
import { BaseService } from '@/common/crud';
import { ExternalOrgOptionVo } from '../vo/external-org.vo';

// 手机号正则：11 位，1 开头，第二位 3-9（与 DTO/前端保持一致）
const PHONE_REGEX = /^1[3-9]\d{9}$/;

/** 外部单位列表/导出筛选条件（keyword 同时模糊匹配名称/编码，status 精确） */
export interface OrgListFilter {
  keyword?: string;
  status?: number;
}

/**
 * 外部单位服务
 * 在基础增删改查之上，提供名称/编码唯一性校验、删除前的引用保护，
 * 以及供外部考生表单使用的启用单位下拉选项。
 */
@Injectable()
export class ExternalOrgService extends BaseService {
  constructor(protected prisma: PrismaService) {
    super(prisma, 'externalOrg');
  }

  /**
   * 校验单位名称是否已存在
   * @param name 单位名称
   * @param excludeId 需排除的记录 ID（编辑场景排除自身）
   * @returns 已存在返回 true
   */
  async isNameExists(name: string, excludeId?: number): Promise<boolean> {
    const existing = await this.prisma.externalOrg.findFirst({
      where: { name, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    return !!existing;
  }

  /**
   * 校验单位编码是否已存在（仅在填写编码时校验）
   * @param code 单位编码
   * @param excludeId 需排除的记录 ID（编辑场景排除自身）
   * @returns 已存在返回 true
   */
  async isCodeExists(code: string, excludeId?: number): Promise<boolean> {
    const existing = await this.prisma.externalOrg.findFirst({
      where: { code, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    return !!existing;
  }

  /**
   * 删除前的关联校验
   * 外部单位被外部考生引用（存在归属于该单位的考生）时不可删除（SRS 3.5.8 业务规则）。
   * @param id 外部单位 ID
   * @throws 存在关联考生时抛出中文错误
   */
  async ensureDeletable(id: number): Promise<void> {
    const referenced = await this.prisma.externalCandidate.findFirst({
      where: { orgId: id },
      select: { id: true },
    });
    if (referenced) {
      throw new Error('该单位已被外部考生引用，无法删除');
    }
  }

  /**
   * 查询指定单位是否存在且处于启用状态
   * 供外部考生新增/编辑时校验所属单位有效性。
   * @param id 外部单位 ID
   * @returns 存在且启用返回 true
   */
  async isEnabled(id: number): Promise<boolean> {
    const org = await this.prisma.externalOrg.findFirst({
      where: { id, status: 1 },
      select: { id: true },
    });
    return !!org;
  }

  /**
   * 获取启用状态的外部单位下拉选项
   * 仅返回 id 与名称，按名称升序，供外部考生表单/筛选选择所属单位。
   * @returns 启用单位的精简列表
   */
  async options(): Promise<ExternalOrgOptionVo[]> {
    return this.prisma.externalOrg.findMany({
      where: { status: 1 },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * 批量导入外部单位（逐行校验，有错跳过）
   * 每行独立校验：单位名称必填（≤100 字）、编码/联系人/地址/备注长度、手机号格式；
   * 名称与编码在行内及库中均不可重复。校验不过的行被跳过并记入 errors，合法行统一入库（状态默认启用）。
   * @param rows 待导入的单位行数据
   * @returns 成功数量、失败数量及失败行明细
   */
  async importOrgs(
    rows: {
      name?: string;
      code?: string;
      contact?: string;
      phone?: string;
      address?: string;
      remark?: string;
    }[],
  ): Promise<{ success: number; failed: number; errors: { row: number; reason: string }[] }> {
    // 预取库中已有名称/编码，用于冲突判定（编码可空，仅收集非空）
    const existing = await this.prisma.externalOrg.findMany({
      select: { name: true, code: true },
    });
    const dbNames = new Set(existing.map((o) => o.name));
    const dbCodes = new Set(existing.map((o) => o.code).filter((c): c is string => !!c));

    const errors: { row: number; reason: string }[] = [];
    const valid: Prisma.ExternalOrgCreateManyInput[] = [];
    const seenNames = new Set<string>(); // 本批次内已占用名称
    const seenCodes = new Set<string>(); // 本批次内已占用编码

    rows.forEach((raw, idx) => {
      const rowNo = idx + 1; // 数据行号（不含表头）
      const name = (raw.name ?? '').trim();
      const code = (raw.code ?? '').trim();
      const contact = (raw.contact ?? '').trim();
      const phone = (raw.phone ?? '').trim();
      const address = (raw.address ?? '').trim();
      const remark = (raw.remark ?? '').trim();

      if (!name || name.length > 100) {
        errors.push({ row: rowNo, reason: '单位名称为空或超过 100 字' });
        return;
      }
      if (code && code.length > 30) {
        errors.push({ row: rowNo, reason: '单位编码不超过 30 字' });
        return;
      }
      if (contact.length > 50) {
        errors.push({ row: rowNo, reason: '联系人不超过 50 字' });
        return;
      }
      if (phone && !PHONE_REGEX.test(phone)) {
        errors.push({ row: rowNo, reason: '联系电话格式不正确' });
        return;
      }
      if (address.length > 200 || remark.length > 200) {
        errors.push({ row: rowNo, reason: '单位地址/备注不超过 200 字' });
        return;
      }
      if (seenNames.has(name) || dbNames.has(name)) {
        errors.push({ row: rowNo, reason: `单位名称【${name}】重复或已存在` });
        return;
      }
      if (code && (seenCodes.has(code) || dbCodes.has(code))) {
        errors.push({ row: rowNo, reason: `单位编码【${code}】重复或已存在` });
        return;
      }
      seenNames.add(name);
      if (code) seenCodes.add(code);
      valid.push({
        name,
        code: code || null,
        contact: contact || null,
        phone: phone || null,
        address: address || null,
        remark: remark || null,
        status: 1,
      });
    });

    if (valid.length) {
      await this.prisma.externalOrg.createMany({ data: valid });
    }
    return { success: valid.length, failed: errors.length, errors };
  }

  /**
   * 按筛选条件导出外部单位（不分页）
   * 复用列表筛选逻辑（keyword 模糊匹配名称/编码，status 精确），返回全部匹配记录。
   * @param filter 与列表一致的筛选条件
   * @param limit 最大导出条数（默认 10000，防止全表拉取）
   * @returns 外部单位记录数组
   */
  async exportList(filter: OrgListFilter, limit = 10000) {
    const and: Prisma.ExternalOrgWhereInput[] = [];
    if (filter.keyword) {
      and.push({
        OR: [{ name: { contains: filter.keyword } }, { code: { contains: filter.keyword } }],
      });
    }
    if (filter.status !== undefined) and.push({ status: filter.status });
    const where: Prisma.ExternalOrgWhereInput = and.length ? { AND: and } : {};
    return this.list(where, undefined, undefined, limit);
  }
}
