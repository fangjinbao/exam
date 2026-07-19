import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma.service';
import { BaseService } from '@/common/crud';
import { AuthService } from '@/modules/base/services/auth.service';
import { ExternalOrgService } from './external-org.service';

// 手机号正则：11 位，1 开头，第二位 3-9（与 DTO/前端保持一致）
const PHONE_REGEX = /^1[3-9]\d{9}$/;
// 邮箱正则：导入逐行校验用（与常规邮箱格式一致）
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 账号初始/重置密码规则：管理员未指定时默认取手机号后 6 位（手机号即登录账号）
function defaultPassword(phone: string): string {
  return phone.slice(-6);
}
// 响应统一的字段白名单（select）：排除敏感字段 password/passwordV，并关联所属单位名称。
// org 关系仅取 name，供列表/详情展示 orgName（flatten 后返回）。
const SAFE_SELECT = {
  id: true,
  name: true,
  orgId: true,
  idCard: true,
  phone: true,
  email: true,
  status: true,
  createTime: true,
  updateTime: true,
  org: { select: { name: true } },
} satisfies Prisma.ExternalCandidateSelect;

// SAFE_SELECT 查询结果类型（含嵌套 org.name）
type CandidateWithOrg = Prisma.ExternalCandidateGetPayload<{
  select: typeof SAFE_SELECT;
}>;

/** 列表查询筛选条件 */
export interface CandidateListFilter {
  name?: string;
  orgId?: number;
  phone?: string;
  status?: number;
}

/**
 * 外部考生服务
 * 在基础增删改查之上，提供手机号（登录账号）唯一性校验、所属单位有效性校验、考试账号生成、
 * 密码重置与批量导入能力。密码统一经 AuthService.hashPassword（bcrypt）哈希后存储，
 * password/passwordV 不对外返回；响应统一将关联单位名称扁平化为 orgName。
 */
@Injectable()
export class ExternalCandidateService extends BaseService {
  constructor(
    protected prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly externalOrgService: ExternalOrgService,
  ) {
    super(prisma, 'externalCandidate');
  }

  /**
   * 将 SAFE_SELECT 查询结果的嵌套 org.name 扁平化为 orgName，去除嵌套 org 对象。
   * @param record 含嵌套 org 的考生记录
   * @returns 扁平化后的考生记录（orgName 展示字段）
   */
  private flatten(record: CandidateWithOrg) {
    const { org, ...rest } = record;
    return { ...rest, orgName: org?.name ?? '' };
  }

  /**
   * 分页查询外部考生
   * name/phone 各自模糊匹配，orgId/status 精确匹配，条件间为"与"关系。
   * @param filter 筛选条件
   * @param page 页码
   * @param pageSize 每页条数
   */
  async pageList(filter: CandidateListFilter, page?: number, pageSize?: number) {
    const and: Prisma.ExternalCandidateWhereInput[] = [];
    if (filter.name) and.push({ name: { contains: filter.name } });
    if (filter.phone) and.push({ phone: { contains: filter.phone } });
    if (filter.orgId !== undefined) and.push({ orgId: filter.orgId });
    if (filter.status !== undefined) and.push({ status: filter.status });
    const where: Prisma.ExternalCandidateWhereInput = and.length ? { AND: and } : {};
    // 复用基类分页，select 白名单确保 password/passwordV 不出库
    const result = await this.page({ page, pageSize }, where, SAFE_SELECT);
    const list = (result.list as CandidateWithOrg[]).map((item) => this.flatten(item));
    return { ...result, list };
  }

  /**
   * 校验手机号（登录账号）是否已被占用
   * @param phone 手机号
   * @param excludeId 需排除的记录 ID（编辑场景排除自身）
   * @returns 已存在返回 true
   */
  async isPhoneExists(phone: string, excludeId?: number): Promise<boolean> {
    const existing = await this.prisma.externalCandidate.findFirst({
      where: { phone, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    return !!existing;
  }

  /**
   * 校验所属单位是否存在且启用
   * @param orgId 外部单位 ID
   * @returns 存在且启用返回 true
   */
  async isOrgSelectable(orgId: number): Promise<boolean> {
    return this.externalOrgService.isEnabled(orgId);
  }

  /**
   * 新增外部考生并生成考试账号
   * 以手机号为登录名；密码留空时默认取手机号后 6 位，经 bcrypt 哈希存储。
   * @param data 考生信息（password 可选，orgId 为已校验的所属单位）
   * @returns 脱敏并扁平化后的考生记录
   */
  async createWithAccount(data: {
    name: string;
    orgId: number;
    idCard?: string;
    phone: string;
    email?: string;
    password?: string;
  }) {
    const { password: rawPassword, ...rest } = data;
    const plain = rawPassword || defaultPassword(data.phone);
    const password = await this.authService.hashPassword(plain);
    const created = await this.prisma.externalCandidate.create({
      data: { ...rest, password },
      select: SAFE_SELECT,
    });
    return this.flatten(created);
  }

  /**
   * 按 id 查询外部考生详情（脱敏，排除 password/passwordV）
   * @param id 考生 ID
   * @returns 扁平化后的考生记录，不存在返回 null
   */
  async detail(id: number) {
    const record = await this.prisma.externalCandidate.findUnique({
      where: { id },
      select: SAFE_SELECT,
    });
    return record ? this.flatten(record) : null;
  }

  /**
   * 切换外部考生账号状态（启用/停用），返回脱敏并扁平化后的记录
   * @param id 考生 ID
   * @param status 目标状态 1=启用 0=停用
   * @returns 扁平化后的考生记录
   */
  async changeStatus(id: number, status: number) {
    const updated = await this.prisma.externalCandidate.update({
      where: { id },
      data: { status },
      select: SAFE_SELECT,
    });
    return this.flatten(updated);
  }

  /**
   * 更新外部考生信息（含手机号，唯一性由调用方校验）
   * @param id 考生 ID
   * @param data 待更新字段（orgId 为已校验的所属单位）
   * @returns 扁平化后的考生记录
   */
  async updateInfo(
    id: number,
    data: {
      name: string;
      orgId: number;
      idCard?: string;
      phone: string;
      email?: string;
    },
  ) {
    const updated = await this.prisma.externalCandidate.update({
      where: { id },
      data,
      select: SAFE_SELECT,
    });
    return this.flatten(updated);
  }

  /**
   * 重置指定考生的账号密码为默认密码（手机号后 6 位），passwordV 自增使旧登录态失效
   * @param id 考生 ID
   * @returns 重置后的明文密码，不存在返回 null
   */
  async resetPassword(id: number): Promise<string | null> {
    const record = await this.prisma.externalCandidate.findUnique({
      where: { id },
      select: { phone: true },
    });
    if (!record) return null;
    const plain = defaultPassword(record.phone);
    const password = await this.authService.hashPassword(plain);
    await this.prisma.externalCandidate.update({
      where: { id },
      data: { password, passwordV: { increment: 1 } },
    });
    return plain;
  }

  /**
   * 批量导入外部考生并生成考试账号（逐行校验，有错跳过）
   * 每行独立校验：必填/格式（姓名 2-20 字、手机号、邮箱）、所属单位须匹配已启用单位、
   * 手机号在行内及库中均不可重复。校验不过的行被跳过并记入 errors，合法行统一入库。
   * 密码统一取手机号后 6 位（bcrypt 哈希）。
   * @param rows 待导入的考生行数据（company 为所属单位名称）
   * @returns 成功数量、失败数量及失败行明细
   */
  async importCandidates(
    rows: {
      name?: string;
      company?: string;
      idCard?: string;
      phone?: string;
      email?: string;
    }[],
  ): Promise<{ success: number; failed: number; errors: { row: number; reason: string }[] }> {
    // 预取全部启用单位名称 → id，避免逐行查库
    const orgs = await this.prisma.externalOrg.findMany({
      where: { status: 1 },
      select: { id: true, name: true },
    });
    const nameToId = new Map(orgs.map((o) => [o.name, o.id]));
    // 预取库中已存在手机号，用于冲突判定
    const dbPhones = new Set(
      (await this.prisma.externalCandidate.findMany({ select: { phone: true } })).map(
        (c) => c.phone,
      ),
    );

    const errors: { row: number; reason: string }[] = [];
    const valid: { name: string; orgId: number; idCard?: string; phone: string; email?: string }[] = [];
    const seenPhones = new Set<string>(); // 本批次内已占用的手机号

    rows.forEach((raw, idx) => {
      const rowNo = idx + 1; // 数据行号（不含表头）
      const name = (raw.name ?? '').trim();
      const company = (raw.company ?? '').trim();
      const idCard = (raw.idCard ?? '').trim();
      const phone = (raw.phone ?? '').trim();
      const email = (raw.email ?? '').trim();

      if (name.length < 2 || name.length > 20) {
        errors.push({ row: rowNo, reason: '姓名长度为 2-20 字' });
        return;
      }
      if (!PHONE_REGEX.test(phone)) {
        errors.push({ row: rowNo, reason: '联系电话格式不正确' });
        return;
      }
      if (!idCard) {
        errors.push({ row: rowNo, reason: '请输入身份证号' });
        return;
      }
      if (email && !EMAIL_REGEX.test(email)) {
        errors.push({ row: rowNo, reason: '电子邮箱格式不正确' });
        return;
      }
      if (email.length > 50) {
        errors.push({ row: rowNo, reason: '电子邮箱不超过 50 字' });
        return;
      }
      if (idCard.length > 30) {
        errors.push({ row: rowNo, reason: '证件号不超过 30 字' });
        return;
      }
      const orgId = nameToId.get(company);
      if (orgId === undefined) {
        errors.push({ row: rowNo, reason: `所属单位【${company || '空'}】不存在或已停用` });
        return;
      }
      if (seenPhones.has(phone)) {
        errors.push({ row: rowNo, reason: `联系电话【${phone}】与本次导入中的其他行重复` });
        return;
      }
      if (dbPhones.has(phone)) {
        errors.push({ row: rowNo, reason: `联系电话【${phone}】已存在` });
        return;
      }
      seenPhones.add(phone);
      valid.push({
        name,
        orgId,
        idCard: idCard || undefined,
        phone,
        email: email || undefined,
      });
    });

    // 合法行逐条哈希（密码取各自手机号后 6 位）后批量入库
    if (valid.length) {
      const data = await Promise.all(
        valid.map(async (v) => ({
          ...v,
          password: await this.authService.hashPassword(defaultPassword(v.phone)),
        })),
      );
      await this.prisma.externalCandidate.createMany({ data });
    }
    return { success: valid.length, failed: errors.length, errors };
  }

  /**
   * 按筛选条件导出外部考生（不分页，脱敏并扁平化）
   * 复用列表筛选逻辑，返回全部匹配记录供前端生成表格文件。
   * @param filter 与列表一致的筛选条件
   * @param limit 最大导出条数（默认 10000，防止全表拉取）
   * @returns 扁平化后的考生记录数组
   */
  async exportList(filter: CandidateListFilter, limit = 10000) {
    const and: Prisma.ExternalCandidateWhereInput[] = [];
    if (filter.name) and.push({ name: { contains: filter.name } });
    if (filter.phone) and.push({ phone: { contains: filter.phone } });
    if (filter.orgId !== undefined) and.push({ orgId: filter.orgId });
    if (filter.status !== undefined) and.push({ status: filter.status });
    const where: Prisma.ExternalCandidateWhereInput = and.length ? { AND: and } : {};
    const list = (await this.list(where, SAFE_SELECT, undefined, limit)) as CandidateWithOrg[];
    return list.map((item) => this.flatten(item));
  }

  /**
   * 删除前的关联校验
   * TODO: 考试分配表建立后，需在此校验"该考生已分配考试则阻止删除"（SRS 3.5.8 业务规则）。
   * 当前考试分配功能尚未实现，暂不阻断删除。
   * @param _id 考生 ID
   */
  async ensureDeletable(_id: number): Promise<void> {
    // 预留：待 exam 考试分配模块落地后补充关联校验
  }
}
