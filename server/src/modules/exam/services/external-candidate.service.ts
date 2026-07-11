import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma.service';
import { BaseService } from '@/common/crud';
import { AuthService } from '@/modules/base/services/auth.service';

// 新增/导入时账号的初始密码（bcrypt 存储；管理员可在列表通过"重置密码"再改）
const DEFAULT_PASSWORD = 'Exam@123456';
// 响应统一排除的敏感字段（与 ExternalCandidateVo 声明保持一致）
const SAFE_SELECT: Prisma.ExternalCandidateSelect = {
  id: true,
  name: true,
  admissionNo: true,
  company: true,
  idCard: true,
  phone: true,
  email: true,
  status: true,
  createTime: true,
  updateTime: true,
};

/** 列表查询筛选条件 */
export interface CandidateListFilter {
  name?: string;
  company?: string;
  admissionNo?: string;
  status?: number;
}

/**
 * 外部考生服务
 * 在基础增删改查之上，提供准考证号唯一性校验、考试账号生成、密码重置与批量导入能力。
 * 密码统一经 AuthService.hashPassword（bcrypt）哈希后存储，password/passwordV 不对外返回。
 */
@Injectable()
export class ExternalCandidateService extends BaseService {
  constructor(
    protected prisma: PrismaService,
    private readonly authService: AuthService,
  ) {
    super(prisma, 'externalCandidate');
  }

  /**
   * 分页查询外部考生
   * name/company/admissionNo 各自模糊匹配且为"与"关系，status 精确匹配。
   * @param filter 筛选条件
   * @param page 页码
   * @param pageSize 每页条数
   */
  async pageList(filter: CandidateListFilter, page?: number, pageSize?: number) {
    const and: Prisma.ExternalCandidateWhereInput[] = [];
    if (filter.name) and.push({ name: { contains: filter.name } });
    if (filter.company) and.push({ company: { contains: filter.company } });
    if (filter.admissionNo) and.push({ admissionNo: { contains: filter.admissionNo } });
    if (filter.status !== undefined) and.push({ status: filter.status });
    const where: Prisma.ExternalCandidateWhereInput = and.length ? { AND: and } : {};
    // 复用基类分页，select 白名单确保 password/passwordV 不出库
    return this.page({ page, pageSize }, where, SAFE_SELECT);
  }

  /**
   * 校验准考证号是否已存在
   * @param admissionNo 准考证号
   * @param excludeId 需排除的记录 ID（编辑场景排除自身，本模块暂不支持改号，预留）
   * @returns 已存在返回 true
   */
  async isAdmissionNoExists(admissionNo: string, excludeId?: number): Promise<boolean> {
    const existing = await this.prisma.externalCandidate.findFirst({
      where: { admissionNo, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    return !!existing;
  }

  /**
   * 新增外部考生并生成考试账号
   * 以准考证号为登录名，初始密码经 bcrypt 哈希存储。
   * @param data 考生信息（不含密码）
   * @returns 脱敏后的考生记录
   */
  async createWithAccount(data: {
    name: string;
    admissionNo: string;
    company?: string;
    idCard?: string;
    phone: string;
    email?: string;
  }) {
    const password = await this.authService.hashPassword(DEFAULT_PASSWORD);
    return this.prisma.externalCandidate.create({
      data: { ...data, password },
      select: SAFE_SELECT,
    });
  }

  /**
   * 按 id 查询外部考生详情（脱敏，排除 password/passwordV）
   * @param id 考生 ID
   * @returns 脱敏后的考生记录，不存在返回 null
   */
  async detail(id: number) {
    return this.prisma.externalCandidate.findUnique({
      where: { id },
      select: SAFE_SELECT,
    });
  }

  /**
   * 切换外部考生账号状态（启用/停用），返回脱敏后的记录
   * @param id 考生 ID
   * @param status 目标状态 1=启用 0=停用
   * @returns 脱敏后的考生记录
   */
  async changeStatus(id: number, status: number) {
    return this.prisma.externalCandidate.update({
      where: { id },
      data: { status },
      select: SAFE_SELECT,
    });
  }

  /**
   * 更新外部考生信息（准考证号不可修改，调用方已从入参剔除）
   * @param id 考生 ID
   * @param data 待更新字段
   * @returns 脱敏后的考生记录
   */
  async updateInfo(
    id: number,
    data: {
      name: string;
      company?: string;
      idCard?: string;
      phone: string;
      email?: string;
    },
  ) {
    return this.prisma.externalCandidate.update({
      where: { id },
      data,
      select: SAFE_SELECT,
    });
  }

  /**
   * 重置指定考生的账号密码为默认密码，passwordV 自增使旧登录态失效
   * @param id 考生 ID
   * @returns 重置后的明文密码
   */
  async resetPassword(id: number): Promise<string> {
    const password = await this.authService.hashPassword(DEFAULT_PASSWORD);
    await this.prisma.externalCandidate.update({
      where: { id },
      data: { password, passwordV: { increment: 1 } },
    });
    return DEFAULT_PASSWORD;
  }

  /**
   * 批量导入外部考生并生成考试账号
   * 校验：导入行内准考证号不可重复、且不可与库中已有记录重复；任一冲突整体拒绝。
   * @param rows 待导入的考生行数据
   * @returns 成功导入数量
   */
  async importCandidates(
    rows: {
      name: string;
      admissionNo: string;
      company?: string;
      idCard?: string;
      phone: string;
      email?: string;
    }[],
  ): Promise<number> {
    // 1. 行内准考证号去重校验
    const seen = new Set<string>();
    for (const row of rows) {
      if (seen.has(row.admissionNo)) {
        throw new Error(`导入数据中准考证号【${row.admissionNo}】重复`);
      }
      seen.add(row.admissionNo);
    }
    // 2. 与库中已有记录的准考证号冲突校验
    const admissionNos = [...seen];
    const existing = await this.prisma.externalCandidate.findMany({
      where: { admissionNo: { in: admissionNos } },
      select: { admissionNo: true },
    });
    if (existing.length) {
      throw new Error(`准考证号【${existing[0].admissionNo}】已存在，请更换`);
    }
    // 3. 逐行哈希初始密码后批量入库（createMany 需预生成哈希）
    const hashed = await this.authService.hashPassword(DEFAULT_PASSWORD);
    const created = await this.prisma.externalCandidate.createMany({
      data: rows.map((row) => ({ ...row, password: hashed })),
    });
    return created.count;
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
