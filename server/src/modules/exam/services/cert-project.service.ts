import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma.service';
import { BaseService } from '@/common/crud';
import { CertProjectOptionVo } from '../vo/cert-project.vo';
import { COMPANY_DEPT_TYPES, OrgScopeService, type AdminPayload } from './org-scope.service';
import { OCCUPYING_STATUS } from '../utils/cert-application-status';

/**
 * 可作为名额「单位」的部门树节点类型
 *
 * 复用 OrgScopeService 的同一份清单：那里判定共享资源的 company 范围，
 * 这里判定谁能分名额，说的是同一件事（部门树用 type 区分公司与部门）。
 * 各留一份早晚会改歪。
 */
const CERT_ORG_TYPES = COMPANY_DEPT_TYPES;

/** 单位树节点（叶子节点无 children 字段） */
export interface OrgTreeNode {
  id: number;
  name: string;
  type: string;
  children?: OrgTreeNode[];
}

// 列表查询返回的关联字段白名单（带出工种名、级别名、负责人姓名）
const LIST_INCLUDE = {
  occupation: { select: { name: true } },
  level: { select: { name: true } },
  manager: { select: { name: true, username: true } },
} satisfies Prisma.CertProjectInclude;

// 详情额外带出名额行（含单位/部门名称，供表格直接展示）
const DETAIL_INCLUDE = {
  ...LIST_INCLUDE,
  quotas: {
    include: {
      org: { select: { name: true } },
      dept: { select: { name: true } },
    },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.CertProjectInclude;

type CertProjectWithRel = Prisma.CertProjectGetPayload<{ include: typeof LIST_INCLUDE }>;
type CertProjectWithDetail = Prisma.CertProjectGetPayload<{ include: typeof DETAIL_INCLUDE }>;

/** 鉴定项目列表筛选条件（name 模糊匹配鉴定名称，status 精确） */
export interface CertProjectListFilter {
  name?: string;
  /**
   * 发布状态
   *
   * 写成联合类型而非 string：白名单目前只存在于控制器，
   * 收窄到类型层后，将来新增调用方传脏值会在编译期就报错。
   */
  publishStatus?: 'unpublished' | 'published';
}

/**
 * 鉴定项目服务
 *
 * 在基础增删改查之上，提供鉴定名称唯一性校验、工种与级别的归属校验、
 * 名额行的单位/部门归属校验、删除前的报考记录引用保护，
 * 以及供报考审核使用的启用项目下拉与名额分配用的单位/部门下拉。
 *
 * 项目与其名额是一体的编辑单元：名额没有独立生命周期，
 * 故 add/updateProject 在此显式处理「项目 + 名额整组」的写入。
 * 列表带出工种名、级别名、负责人姓名（扁平化为 occupationName/levelName/managerName）。
 */
@Injectable()
export class CertProjectService extends BaseService {
  constructor(
    protected prisma: PrismaService,
    private readonly orgScope: OrgScopeService,
  ) {
    super(prisma, 'certProject');
  }

  /** 将嵌套关联扁平化为 occupationName / levelName / managerName */
  private flatten(record: CertProjectWithRel) {
    const { occupation, level, manager, ...rest } = record;
    return {
      ...rest,
      occupationName: occupation?.name ?? '',
      levelName: level?.name ?? '',
      // 负责人优先显示姓名，无姓名时退回登录名
      managerName: manager?.name || manager?.username || '',
    };
  }

  /** 详情扁平化：在列表字段之外，把名额行的单位/部门名称也提上来 */
  private flattenDetail(record: CertProjectWithDetail) {
    const { quotas, ...rest } = record;
    return {
      ...this.flatten(rest as CertProjectWithRel),
      quotas: quotas.map((q) => ({
        id: q.id,
        orgId: q.orgId,
        deptId: q.deptId,
        quota: q.quota,
        orgName: q.org?.name ?? '',
        deptName: q.dept?.name ?? '',
      })),
    };
  }

  /**
   * 分页查询鉴定项目（带工种名、级别名、负责人姓名）
   * name 模糊匹配鉴定名称，publishStatus 精确匹配，条件间为「与」关系。
   */
  async pageList(
    filter: CertProjectListFilter,
    page?: number,
    pageSize?: number,
    admin?: AdminPayload,
  ) {
    const and: Prisma.CertProjectWhereInput[] = [];
    if (filter.name) and.push({ name: { contains: filter.name } });
    if (filter.publishStatus) and.push({ publishStatus: filter.publishStatus });
    // 创建人隔离：非超管只能看自己创建的项目。存量数据 createBy 为 null，
    // 归属不明，一并只对超管可见，避免误把他人项目暴露给普通管理员。
    if (admin && !this.orgScope.isSuperAdmin(admin)) {
      and.push({ createBy: admin.userId });
    }
    const where: Prisma.CertProjectWhereInput = and.length ? { AND: and } : {};

    const p = Math.max(page || 1, 1);
    const ps = Math.min(Math.max(pageSize || 10, 1), 100);
    const [rows, total] = await Promise.all([
      this.prisma.certProject.findMany({
        where,
        skip: (p - 1) * ps,
        take: ps,
        orderBy: { id: 'desc' },
        include: LIST_INCLUDE,
      }),
      this.prisma.certProject.count({ where }),
    ]);
    const list = rows.map((r) => this.flatten(r));
    await this.fillCreateByNames(list);
    return {
      list,
      pagination: { page: p, pageSize: ps, total },
    };
  }

  /**
   * 校验当前登录人对该鉴定项目有操作权（读/改/删共用）
   * 仅创建人本人与超管可操作。列表已按创建人过滤，此处防「知道 id 就能直接改他人项目」。
   * 存量 createBy 为 null 的项目归属不明，只放行超管。
   * @param id 鉴定项目 ID
   * @param admin 当前登录管理员；缺省时不校验（内部调用）
   * @throws ForbiddenException 无权操作
   */
  async assertOwned(id: number, admin?: AdminPayload): Promise<void> {
    if (!admin || this.orgScope.isSuperAdmin(admin)) return;
    const row = await this.prisma.certProject.findUnique({
      where: { id },
      select: { createBy: true },
    });
    // 不存在交由调用方按「不存在」处理，避免此处抛出与之矛盾的 403
    if (!row) return;
    if (row.createBy !== admin.userId) {
      throw new ForbiddenException('无权操作他人创建的鉴定项目');
    }
  }

  /**
   * 批量回填创建人姓名与所属单位（就地修改传入数组）
   *
   * 三次查询，都是批量：用户 → 用户所在部门 → 部门树（供逐级上溯找单位）。
   * 不逐行查库，也不给每个用户单独跑一次上溯。
   *
   * 单位怎么定：SysUser 只有 departmentId，没有直接的单位字段，
   * 故从创建人所在部门沿 parentId 往上找，第一个 type 命中 CERT_ORG_TYPES
   * （即名额分配里能选的那几类公司节点）的祖先就是他的单位。
   * 部门本身就是公司节点时，它自己即为单位。
   *
   * @param items 含 createBy 字段的列表项
   */
  private async fillCreateByNames(
    items: Array<{ createBy?: number | null; createByName?: string; createByOrgName?: string }>,
  ) {
    const ids = [...new Set(items.map((i) => i.createBy).filter((v): v is number => !!v))];
    if (!ids.length) return;
    const users = await this.prisma.sysUser.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, username: true, departmentId: true },
    });
    const nameMap = new Map(users.map((u) => [u.id, u.name || u.username || '']));

    // 全量部门只取 id/name/parentId/type：树本身规模小（单位+部门），
    // 一次取回在内存里上溯，比按用户逐个递归查库省得多
    const depts = await this.prisma.sysDepartment.findMany({
      select: { id: true, name: true, parentId: true, type: true },
    });
    const deptMap = new Map(depts.map((d) => [d.id, d]));

    /** 从部门沿 parentId 上溯，返回第一个公司节点的名称；找不到返回空串 */
    const findOrgName = (deptId?: number | null): string => {
      let cur = deptId ? deptMap.get(deptId) : undefined;
      // 防御性上限：部门树若被改出环，没有它这里会死循环
      let guard = 0;
      while (cur && guard++ < 50) {
        if (CERT_ORG_TYPES.includes(cur.type ?? '')) return cur.name;
        cur = cur.parentId ? deptMap.get(cur.parentId) : undefined;
      }
      return '';
    };

    const orgNameMap = new Map(users.map((u) => [u.id, findOrgName(u.departmentId)]));

    items.forEach((i) => {
      if (i.createBy) {
        i.createByName = nameMap.get(i.createBy) || '';
        i.createByOrgName = orgNameMap.get(i.createBy) || '';
      }
    });
  }

  /**
   * 查询单个鉴定项目详情（带关联名称与名额行），不存在返回 null
   *
   * 创建人姓名与所属单位同列表一样回填：详情页要展示，
   * 而 flattenDetail 只摊平 include 出来的关联，createBy 是裸 id 没有 relation。
   */
  async detail(id: number) {
    const record = await this.prisma.certProject.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });
    if (!record) return null;
    const flat = this.flattenDetail(record);
    await this.fillCreateByNames([flat]);
    return flat;
  }

  /**
   * 查询鉴定项目的阶段进展汇总（供详情页展示）
   *
   * 一次查完四段数据：项目详情（含名额行）、按单位聚合的报名数、审核状态分布、
   * 关联考试。分成四个 Promise 并行发出，不串行等待。
   *
   * **阶段不落库，运行时推导**。原因见 phase 的注释：这个模块刚因为
   * status 与 publishStatus 两个状态字段语义重叠吃过亏（已整体下线其一），
   * 再存一个 phase 就要回答「报名截止时间到了谁改它、最后一个人审完谁改它」，
   * 只能靠定时任务或惰性回写，两者都会产生与真实数据不一致的窗口。
   */
  async progress(id: number) {
    const project = await this.detail(id);
    if (!project) return null;

    const [byOrg, byStatus, exams] = await Promise.all([
      // 报名阶段：按单位+部门数已报人数（走 @@index([projectId, orgId, status])）
      this.prisma.certApplication.groupBy({
        by: ['orgId', 'deptId', 'status'],
        where: { projectId: id },
        _count: { _all: true },
      }),
      // 审核阶段：pending / approved / rejected 各多少
      this.prisma.certApplication.groupBy({
        by: ['status'],
        where: { projectId: id },
        _count: { _all: true },
      }),
      // 考试阶段：关联到本项目的考试
      this.prisma.exam.findMany({
        where: { certProjectId: id },
        select: { id: true, name: true, status: true, startTime: true, endTime: true, passScore: true },
        orderBy: { startTime: 'asc' },
      }),
    ]);

    return { project, byOrg, byStatus, exams };
  }

  /**
   * 校验鉴定名称是否已存在
   * @param name 鉴定名称
   * @param excludeId 需排除的记录 ID（编辑场景排除自身）
   * @returns 已存在返回 true
   */
  async isNameExists(name: string, excludeId?: number): Promise<boolean> {
    const existing = await this.prisma.certProject.findFirst({
      where: { name, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    return !!existing;
  }

  /**
   * 校验鉴定级别存在且属于指定工种
   *
   * 合并成一次校验而非分别查工种与级别：级别本身合法但挂在别的工种下，
   * 是这个表单最容易出的错（改了工种没改级别），分开查反而漏掉这种组合。
   *
   * @param occupationId 工种 ID
   * @param levelId 级别 ID
   * @returns 校验不通过返回提示语，通过返回 null
   */
  async checkOccupationLevel(occupationId: number, levelId: number): Promise<string | null> {
    const occupation = await this.prisma.certOccupation.findUnique({
      where: { id: occupationId },
      select: { status: true },
    });
    if (!occupation) return '所选鉴定工种不存在或已被删除';
    if (occupation.status !== 1) return '所选鉴定工种已停用，请另选';

    const level = await this.prisma.certOccupationLevel.findUnique({
      where: { id: levelId },
      select: { occupationId: true },
    });
    if (!level) return '所选鉴定级别不存在或已被删除';
    if (level.occupationId !== occupationId) return '所选级别不属于该鉴定工种，请重新选择';
    return null;
  }

  /** 校验负责人是否存在 */
  async isManagerSelectable(managerId: number): Promise<boolean> {
    const user = await this.prisma.sysUser.findUnique({
      where: { id: managerId },
      select: { id: true },
    });
    return !!user;
  }

  /**
   * 校验名额行的单位/部门是否合法
   *
   * 要求部门确实挂在所选单位下（deptId.parentId === orgId）：
   * 表单是「先选单位、再选它下面的部门」，若不校验，改了单位不改部门就会
   * 存出「A 单位 / B 单位的部门」这种对不上的组合。
   *
   * @param quotas 待校验的名额行
   * @returns 校验不通过返回提示语，通过返回 null
   */
  async checkQuotas(
    quotas?: { orgId: number; deptId?: number | null }[],
  ): Promise<string | null> {
    if (!quotas?.length) return null;

    // 同一项目内「单位+部门」不可重复：重复分配该改数量而不是加一行。
    // 部门留空的行按「单位整体」算，同一单位也只能有一行整体名额——
    // 这种情况库里的唯一索引拦不住（MySQL 认为 NULL 互不相等），只能在此拦。
    const seen = new Set<string>();
    for (const q of quotas) {
      const key = `${q.orgId}-${q.deptId ?? 'all'}`;
      if (seen.has(key)) {
        return q.deptId
          ? '同一个部门只能分配一行名额，请合并后再提交'
          : '同一个单位只能有一行「不分部门」的名额，请合并后再提交';
      }
      seen.add(key);
    }

    // 单位必须是公司节点：否则能把某个部门当单位传进来，
    // 那样「单位/部门」两列的含义就乱了
    const orgIds = [...new Set(quotas.map((q) => q.orgId))];
    const orgs = await this.prisma.sysDepartment.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, name: true, type: true },
    });
    const orgMap = new Map(orgs.map((o) => [o.id, o]));
    for (const id of orgIds) {
      const org = orgMap.get(id);
      if (!org) return '名额里有已被删除的单位，请重新选择';
      if (!CERT_ORG_TYPES.includes(org.type ?? '')) {
        return `「${org.name}」不是公司，请在单位一列选择公司`;
      }
    }

    const deptIds = [
      ...new Set(quotas.map((q) => q.deptId).filter((v): v is number => !!v)),
    ];
    if (!deptIds.length) return null;

    const depts = await this.prisma.sysDepartment.findMany({
      where: { id: { in: deptIds } },
      select: { id: true, name: true, parentId: true },
    });
    const deptMap = new Map(depts.map((d) => [d.id, d]));

    for (const q of quotas) {
      if (!q.deptId) continue;
      const dept = deptMap.get(q.deptId);
      if (!dept) return '名额里有已被删除的部门，请重新选择';
      if (dept.parentId !== q.orgId) {
        return `部门「${dept.name}」不属于所选单位，请重新选择`;
      }
    }
    return null;
  }

  /**
   * 新增鉴定项目（连带创建名额行）
   *
   * 名额用嵌套 create 一并落库，避免「项目建了但名额没建」的半成品状态。
   */
  async add(
    dto: {
      name: string;
      occupationId: number;
      levelId: number;
      managerId: number;
      contactPhone: string;
      applyDeadline: string;
      startTime: string;
      endTime: string;
      description?: string;
      applyCondition?: string;
      status?: number;
      quotas?: { orgId: number; deptId?: number | null; quota: number }[];
    },
    createBy?: number,
  ) {
    return this.prisma.certProject.create({
      data: {
        name: dto.name.trim(),
        occupationId: dto.occupationId,
        levelId: dto.levelId,
        managerId: dto.managerId,
        contactPhone: dto.contactPhone.trim(),
        applyDeadline: new Date(dto.applyDeadline),
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        description: dto.description ?? null,
        applyCondition: dto.applyCondition ?? null,
        // 不写 status：启停已下线，交给库默认值 1（见 cert-project.dto.ts 的说明）
        createBy: createBy ?? null,
        quotas: {
          create: (dto.quotas ?? []).map((q) => ({
            orgId: q.orgId,
            // 留空表示名额分给整个单位，不细分到部门
            deptId: q.deptId ?? null,
            quota: q.quota,
          })),
        },
      },
    });
  }

  /**
   * 更新鉴定项目（名额整组替换）
   *
   * 名额按「提交的即全部」处理：不在本次提交里的既有行一律删除。
   * 保留传了 id 的既有行（不重建），避免名额日后被报名占用记录引用时
   * 每次编辑项目都把外键指向的行换掉。
   *
   * 全程放在事务里：删名额与建名额若分开提交，中途失败会留下名额不全的项目。
   */
  async updateProject(dto: {
    id: number;
    name: string;
    occupationId: number;
    levelId: number;
    managerId: number;
    contactPhone: string;
    applyDeadline: string;
    startTime: string;
    endTime: string;
    description?: string;
    applyCondition?: string;
    status?: number;
    quotas?: { id?: number; orgId: number; deptId?: number | null; quota: number }[];
  }) {
    const submitted = dto.quotas ?? [];
    const keepIds = submitted.filter((q) => q.id).map((q) => q.id!);

    return this.prisma.$transaction(async (tx) => {
      await tx.certProjectQuota.deleteMany({
        where: { projectId: dto.id, ...(keepIds.length ? { id: { notIn: keepIds } } : {}) },
      });

      for (const q of submitted) {
        const data = { orgId: q.orgId, deptId: q.deptId ?? null, quota: q.quota };
        if (q.id) {
          await tx.certProjectQuota.update({ where: { id: q.id }, data });
        } else {
          await tx.certProjectQuota.create({ data: { ...data, projectId: dto.id } });
        }
      }

      return tx.certProject.update({
        where: { id: dto.id },
        data: {
          name: dto.name.trim(),
          occupationId: dto.occupationId,
          levelId: dto.levelId,
          managerId: dto.managerId,
          contactPhone: dto.contactPhone.trim(),
          applyDeadline: new Date(dto.applyDeadline),
          startTime: new Date(dto.startTime),
          endTime: new Date(dto.endTime),
          description: dto.description ?? null,
          applyCondition: dto.applyCondition ?? null,
        },
      });
    });
  }

  /**
   * 删除前的关联校验：鉴定项目下存在报考记录时不可删除（SRS 3.5.5.1 业务规则）
   * @param id 鉴定项目 ID
   * @throws 存在报考记录时抛出中文错误
   */
  async ensureDeletable(id: number): Promise<void> {
    const count = await this.prisma.certApplication.count({ where: { projectId: id } });
    if (count > 0) {
      throw new Error('该鉴定项目下存在报考记录，无法删除');
    }
  }

  /**
   * 发布项目：未发布 → 已发布，各单位从此可在「鉴定报名」里报人
   *
   * 发布前要求已配名额：名额是报名的依据，一个名额都没配就发布，
   * 各单位打开报名页会是空的，等于发了个报不了名的项目。
   *
   * @param id 项目 ID
   * @param userId 发布人用户 ID
   * @throws 状态不合法或未配名额时抛出中文错误
   */
  async publish(id: number, userId?: number): Promise<void> {
    const project = await this.prisma.certProject.findUnique({
      where: { id },
      select: { id: true, status: true, publishStatus: true },
    });
    if (!project) throw new Error('鉴定项目不存在');
    if (project.publishStatus === 'published') {
      throw new Error('该项目已发布，无需重复操作');
    }
    /*
      status 的写入口已下线（见 cert-project.dto.ts），新数据恒为 1，此校验对
      新数据永不成立。保留是为存量：早期版本可由弹窗存出 status=0，那些行
      仍应被挡在发布之外，而不是带着「已停用」的语义被发布出去。
      提示语不再说「请先启用」——界面上已无启用入口，说了等于让人找不到。
    */
    if (project.status !== 1) {
      throw new Error('该项目为历史停用数据，不能发布，请联系管理员处理');
    }
    const quotaCount = await this.prisma.certProjectQuota.count({
      where: { projectId: id },
    });
    if (quotaCount === 0) {
      throw new Error('该项目还没有分配名额，请先配置名额再发布');
    }
    await this.prisma.certProject.update({
      where: { id },
      data: { publishStatus: 'published', publishTime: new Date(), publishBy: userId ?? null },
    });
  }

  /**
   * 撤回项目：已发布 → 未发布
   *
   * 有「占着名额」的报名（待审核/已通过）时不允许撤回：撤回的目的是回到可编辑
   * 状态，而名额一改，已报的人就对不上账了。要真想改，得先让各单位撤销报名，
   * 或把这些报名审掉。
   *
   * 只数占用中的，不数已驳回的。驳回记录不占名额，是审核痕迹，且按设计不允许
   * 撤销——若把它也算进来，「已发布 + 有驳回记录」的项目会既不能撤回也不能删除，
   * 永久冻结。代价是撤回后改名额时，那些驳回记录的 orgId/deptId 可能指向已被
   * 删掉的名额行；但它们已是终态、没有下游依赖，可以接受。
   *
   * @param id 项目 ID
   * @throws 状态不合法或存在占用中的报名时抛出中文错误
   */
  async withdraw(id: number): Promise<void> {
    const project = await this.prisma.certProject.findUnique({
      where: { id },
      select: { id: true, publishStatus: true },
    });
    if (!project) throw new Error('鉴定项目不存在');
    if (project.publishStatus !== 'published') {
      throw new Error('该项目尚未发布，无需撤回');
    }
    const occupying = await this.prisma.certApplication.count({
      where: { projectId: id, status: { in: OCCUPYING_STATUS } },
    });
    if (occupying > 0) {
      throw new Error(
        `该项目有 ${occupying} 条报名正占用名额（待审核或已通过），无法撤回，` +
          '请先让各单位撤销报名或完成审核',
      );
    }
    await this.prisma.certProject.update({
      where: { id },
      data: { publishStatus: 'unpublished', publishTime: null, publishBy: null },
    });
  }

  /**
   * 已发布的项目不允许改动
   *
   * 名额已下发、各单位据此报人，此时改名额或改工种级别会让已报的人对不上账。
   * 编辑与删除都走这道闸（参照 Exam「已发布不可编辑，请先撤回」）。
   *
   * @param id 项目 ID
   * @param action 动作词，用于拼提示语（如「修改」「删除」）
   * @throws 已发布时抛出中文错误
   */
  async assertUnpublished(id: number, action = '修改'): Promise<void> {
    const project = await this.prisma.certProject.findUnique({
      where: { id },
      select: { publishStatus: true },
    });
    if (project?.publishStatus === 'published') {
      throw new Error(`该项目已发布，无法${action}，请先撤回`);
    }
  }

  /**
   * 获取鉴定项目下拉选项
   *
   * 供报考审核、证书发放、考试编辑筛选鉴定项目使用，按名称升序。
   * 不按发布状态过滤：这些页面是台账，要能筛出历史项目下的存量记录，
   * 只列已发布的会让未发布项目的记录无从查起。
   *
   * status: 1 是存量兼容——写入口已下线、新数据恒为 1，此条件对新数据恒真，
   * 仅用于挡掉早期版本存出的 status=0 行。
   */
  async options(): Promise<CertProjectOptionVo[]> {
    return this.prisma.certProject.findMany({
      where: { status: 1 },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * 单位下拉：全部公司节点，按原层级组成树
   *
   * 单位＝集团公司/省公司/分公司三类，不含 type=部门 的节点。
   * 不能按「顶层节点」取：省公司挂在集团公司下、分公司挂在省公司下，
   * 只取 parentId 为空会漏掉除集团公司外的全部 61 个单位。
   *
   * 返回树而非平铺列表：62 个单位平铺成一串很难找，
   * 按「集团 → 省公司 → 分公司」的层级展示才对得上用户认知。
   */
  async orgOptions(): Promise<OrgTreeNode[]> {
    // 先取全部公司节点（含停用），据此判断祖先链上有无停用节点。
    // 只查 status=1 会让「作废省公司下的启用分公司」失去父节点，
    // 被当成根节点与集团公司并列——单位已作废，其下分公司也不该再分名额。
    const all = await this.prisma.sysDepartment.findMany({
      where: { type: { in: CERT_ORG_TYPES } },
      select: { id: true, name: true, parentId: true, type: true, status: true },
      orderBy: [{ orderNum: 'asc' }, { id: 'asc' }],
    });

    const byId = new Map(all.map((d) => [d.id, d]));
    /** 自身或任一祖先被停用 → 整枝不可选 */
    const disabled = (d: (typeof all)[number]): boolean => {
      let cur: (typeof all)[number] | undefined = d;
      while (cur) {
        if (cur.status !== 1) return true;
        cur = cur.parentId != null ? byId.get(cur.parentId) : undefined;
      }
      return false;
    };
    const rows = all.filter((d) => !disabled(d));

    // 构建期 children 必填，省掉每次 push 的判空；返回前再剪成可选
    type Building = { id: number; name: string; type: string; children: Building[] };

    const nodes = new Map<number, Building>();
    rows.forEach((r) =>
      nodes.set(r.id, { id: r.id, name: r.name, type: r.type ?? '', children: [] }),
    );

    const roots: Building[] = [];
    rows.forEach((r) => {
      const node = nodes.get(r.id)!;
      // 父节点不在公司集合里（如挂在某个部门下）时按根节点处理，避免整枝丢失
      const parent = r.parentId != null ? nodes.get(r.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    });

    // 叶子节点去掉空 children，前端树控件据此不显示展开箭头
    const prune = (list: Building[]): OrgTreeNode[] =>
      list.map(({ id, name, type, children }) =>
        children.length ? { id, name, type, children: prune(children) } : { id, name, type },
      );
    return prune(roots);
  }

  /**
   * 某单位下的部门下拉
   *
   * 只取 type=部门 的直接下级：下级里还混着省公司/分公司，
   * 它们是单位而非部门，不该出现在部门列（这正是先前把分公司
   * 显示成部门的原因）。
   *
   * @param orgId 单位（公司节点）ID
   */
  async deptOptions(orgId: number) {
    return this.prisma.sysDepartment.findMany({
      where: { parentId: orgId, type: '部门', status: 1 },
      select: { id: true, name: true },
      orderBy: [{ orderNum: 'asc' }, { id: 'asc' }],
    });
  }
}
