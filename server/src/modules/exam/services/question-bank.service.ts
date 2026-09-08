import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma.service';
import { BaseService } from '@/common/crud';
import { OrgScopeService } from './org-scope.service';
import { QuestionBankAccessService, type AdminPayload } from './question-bank-access.service';

/** 题库列表筛选条件（keyword 模糊匹配名称，status 精确） */
export interface QuestionBankListFilter {
  keyword?: string;
  status?: number;
  /** 可见范围筛选（self/dept/company/all） */
  visibleScope?: string;
  /** 仅看我创建的 */
  onlyMine?: boolean;
}

/**
 * 题库服务
 * 在基础增删改查之上，提供名称/编码唯一性校验、编码自动生成、
 * 带题目数量统计的分页查询，以及删除前的关联保护（题库下有题目 / 被试卷引用）。
 */
@Injectable()
export class QuestionBankService extends BaseService {
  constructor(
    protected prisma: PrismaService,
    private access: QuestionBankAccessService,
    private orgScope: OrgScopeService,
  ) {
    super(prisma, 'questionBank');
  }

  /**
   * 批量取创建人姓名映射（内部使用）
   * @param userIds 创建人 ID 集合（可含 null，已在调用侧过滤）
   * @returns id → 姓名（无姓名回落用户名）
   */
  private async getCreatorNameMap(userIds: number[]): Promise<Map<number, string>> {
    const ids = Array.from(new Set(userIds));
    if (ids.length === 0) return new Map();
    const users = await this.prisma.sysUser.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, username: true },
    });
    return new Map(users.map((u) => [u.id, u.name || u.username]));
  }

  /**
   * 批量取创建人所属单位映射（内部使用）
   *
   * 单位由创建人的部门沿 parentId 上溯到最近的公司节点得出，不存在题库表上：
   * 列表显示的归属须与共享可见性判定同源，两处都按账号当下的部门算，
   * 否则人调岗后会「显示 A 单位、却按 B 单位参与可见性」。
   *
   * @param userIds 创建人 ID 集合
   * @returns id → 单位名称（取不到时不含该键）
   */
  private async getCreatorOrgMap(userIds: number[]): Promise<Map<number, string>> {
    return this.orgScope.getOrgNamesByUserIds(userIds);
  }

  /**
   * 校验题库名称是否已存在
   * @param name 题库名称
   * @param excludeId 需排除的记录 ID（编辑场景排除自身）
   * @returns 已存在返回 true
   */
  async isNameExists(name: string, excludeId?: number): Promise<boolean> {
    const existing = await this.prisma.questionBank.findFirst({
      where: { name, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    return !!existing;
  }

  /**
   * 校验题库编码是否已存在
   * @param code 题库编码
   * @param excludeId 需排除的记录 ID（编辑场景排除自身）
   * @returns 已存在返回 true
   */
  async isCodeExists(code: string, excludeId?: number): Promise<boolean> {
    const existing = await this.prisma.questionBank.findFirst({
      where: { code, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    return !!existing;
  }

  /**
   * 生成全局唯一的题库编码（留空时使用）
   * 规则：QB + 时间戳后 6 位 + 2 位随机，冲突则重试，最多 5 次。
   * @returns 唯一编码
   */
  async generateCode(): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const ts = Date.now().toString().slice(-6);
      const rand = Math.floor(Math.random() * 90 + 10);
      const code = `QB${ts}${rand}`;
      if (!(await this.isCodeExists(code))) return code;
    }
    // 兜底：极端并发下用更长随机串，几乎不可能再冲突
    return `QB${Date.now()}${Math.floor(Math.random() * 1000)}`;
  }

  /**
   * 分页查询题库（带题目数量统计）
   * keyword 模糊匹配题库名称；status 精确筛选。
   * @param filter 筛选条件
   * @param page 页码
   * @param pageSize 每页条数
   * @returns 列表（每条附 questionCount）及分页信息
   */
  async pageWithCount(
    filter: QuestionBankListFilter,
    page?: number,
    pageSize?: number,
    admin?: AdminPayload,
  ) {
    const p = Math.max(page || 1, 1);
    const ps = Math.min(Math.max(pageSize || 10, 1), 100);
    const skip = (p - 1) * ps;

    const where = await this.buildListWhere(filter, admin);

    const [rows, total] = await Promise.all([
      this.prisma.questionBank.findMany({
        where,
        skip,
        take: ps,
        orderBy: { id: 'desc' },
        include: { _count: { select: { questions: true } } },
      }),
      this.prisma.questionBank.count({ where }),
    ]);

    const creatorIds = rows.map((r) => r.createBy).filter((v): v is number => v != null);
    const [nameMap, orgMap] = await Promise.all([
      this.getCreatorNameMap(creatorIds),
      this.getCreatorOrgMap(creatorIds),
    ]);

    const list = await Promise.all(
      rows.map(async ({ _count, ...qb }) => {
        const caps = admin
          ? await this.access.getCapabilitiesFromBank(qb, admin)
          : { canRead: true, canManage: true, canEditShare: true };
        return {
          ...qb,
          questionCount: _count.questions,
          createByName: qb.createBy ? nameMap.get(qb.createBy) || '' : '',
          createByOrgName: qb.createBy ? orgMap.get(qb.createBy) || '' : '',
          canManage: caps.canManage,
          canEditShare: caps.canEditShare,
        };
      }),
    );
    return { list, pagination: { page: p, pageSize: ps, total } };
  }

  /**
   * 构造列表/导出共用的 where（含可见范围过滤）
   * @param filter 筛选条件
   * @param admin 当前登录管理员，缺省则不做可见性过滤
   */
  private async buildListWhere(
    filter: QuestionBankListFilter,
    admin?: AdminPayload,
  ): Promise<Prisma.QuestionBankWhereInput> {
    const and: Prisma.QuestionBankWhereInput[] = [];
    if (filter.keyword) and.push({ name: { contains: filter.keyword } });
    if (filter.status !== undefined) and.push({ status: filter.status });
    if (filter.visibleScope) and.push({ visibleScope: filter.visibleScope });
    if (filter.onlyMine && admin) and.push({ createBy: admin.userId });
    if (admin) {
      const visibleWhere = await this.access.buildVisibleWhere(admin);
      if (Object.keys(visibleWhere).length > 0) and.push(visibleWhere);
    }
    return and.length > 0 ? { AND: and } : {};
  }

  /**
   * 按筛选条件导出题库（不分页，带题目数量统计）
   * 复用列表筛选逻辑，返回全部匹配记录供前端生成表格文件。
   * @param filter 与列表一致的筛选条件
   * @param limit 最大导出条数（默认 10000，防止全表拉取）
   * @returns 每条附 questionCount 的题库记录数组
   */
  async exportList(filter: QuestionBankListFilter, limit = 10000, admin?: AdminPayload) {
    // 导出同样受可见范围约束，避免绕过列表权限拉取全量数据
    const where = await this.buildListWhere(filter, admin);

    const rows = await this.prisma.questionBank.findMany({
      where,
      take: limit,
      orderBy: { id: 'desc' },
      include: { _count: { select: { questions: true } } },
    });
    const creatorIds = rows.map((r) => r.createBy).filter((v): v is number => v != null);
    const [nameMap, orgMap] = await Promise.all([
      this.getCreatorNameMap(creatorIds),
      this.getCreatorOrgMap(creatorIds),
    ]);
    return rows.map(({ _count, ...qb }) => ({
      ...qb,
      questionCount: _count.questions,
      createByName: qb.createBy ? nameMap.get(qb.createBy) || '' : '',
      createByOrgName: qb.createBy ? orgMap.get(qb.createBy) || '' : '',
    }));
  }

  /**
   * 批量导入题库（逐行校验，有错跳过）
   * 名称必填（2-50 字）且不可与库中/本批次重复；编码可选（≤30 字），留空自动生成，
   * 填写则不可与库中/本批次重复；描述可选（≤200 字）。合法行统一入库，导入题库默认启用。
   * @param rows 按模板解析出的题库行数组
   * @param createBy 导入操作人用户 ID（作为新建题库的创建人）
   * @returns 成功数、失败数与失败行明细
   */
  async importBanks(
    rows: { name?: string; code?: string; description?: string }[],
    createBy?: number,
  ): Promise<{ success: number; failed: number; errors: { row: number; reason: string }[] }> {
    // 预取库中已存在的名称/编码，用于冲突判定（避免逐行查库）
    const existing = await this.prisma.questionBank.findMany({
      select: { name: true, code: true },
    });
    const dbNames = new Set(existing.map((e) => e.name));
    const dbCodes = new Set(existing.map((e) => e.code));

    const errors: { row: number; reason: string }[] = [];
    const valid: {
      name: string;
      code: string;
      description: string | null;
      status: number;
      createBy: number | null;
    }[] = [];
    const seenNames = new Set<string>();
    const seenCodes = new Set<string>();

    for (let idx = 0; idx < rows.length; idx++) {
      const rowNo = idx + 1;
      const name = (rows[idx].name ?? '').trim();
      const code = (rows[idx].code ?? '').trim();
      const description = (rows[idx].description ?? '').trim();

      if (name.length < 2 || name.length > 50) {
        errors.push({ row: rowNo, reason: '题库名称长度为 2-50 字' });
        continue;
      }
      if (description.length > 200) {
        errors.push({ row: rowNo, reason: '题库描述不超过 200 字' });
        continue;
      }
      if (seenNames.has(name)) {
        errors.push({ row: rowNo, reason: `题库名称【${name}】与本次导入中的其他行重复` });
        continue;
      }
      if (dbNames.has(name)) {
        errors.push({ row: rowNo, reason: `题库名称【${name}】已存在` });
        continue;
      }
      if (code) {
        if (code.length > 30) {
          errors.push({ row: rowNo, reason: '题库编码不超过 30 字' });
          continue;
        }
        if (seenCodes.has(code)) {
          errors.push({ row: rowNo, reason: `题库编码【${code}】与本次导入中的其他行重复` });
          continue;
        }
        if (dbCodes.has(code)) {
          errors.push({ row: rowNo, reason: `题库编码【${code}】已存在` });
          continue;
        }
      }

      // 编码留空则自动生成（生成后即占位，避免同批次重复）
      let finalCode = code;
      if (!finalCode) {
        do {
          finalCode = await this.generateCode();
        } while (seenCodes.has(finalCode));
      }

      seenNames.add(name);
      seenCodes.add(finalCode);
      valid.push({
        name,
        code: finalCode,
        description: description || null,
        status: 1,
        createBy: createBy ?? null,
      });
    }

    // 合法行逐条入库（编码自动生成依赖库中已有编码，故顺序创建而非 createMany）
    for (const bank of valid) {
      await this.prisma.questionBank.create({ data: bank });
    }
    return { success: valid.length, failed: errors.length, errors };
  }

  /**
   * 删除前的关联校验
   * 1) 题库下存在题目时不可删除（SRS 3.5.1.1）；
   * 2) 被试卷/练习引用时不可删除（试卷/练习表尚未建立，逻辑预留）。
   * @param id 题库 ID
   * @throws 命中关联时抛出中文错误
   */
  async ensureDeletable(id: number): Promise<void> {
    // 注意：这里**不能**加 parentId: null。这是删除保护而非题量统计——
    // 只要题库下还挂着任何记录（含材料题下的小题）就不允许删除，
    // 加了过滤会放行「仅剩小题」的题库，删完留下悬空数据。
    const question = await this.prisma.question.findFirst({
      where: { questionBankId: id },
      select: { id: true },
    });
    if (question) {
      throw new Error('该题库下存在题目，请先清空题目后再删除');
    }
    // TODO[试卷/练习模块]: 表建立后校验 paper/practice 是否引用该题库，命中则：
    //   throw new Error('该题库已被试卷或练习引用，无法删除');
  }
}
