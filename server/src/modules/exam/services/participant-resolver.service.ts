import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma.service';

/**
 * 内部人员 + 其部门的查询形状
 * 用 Prisma 生成的 payload 类型而非手写，schema 改字段可空性时 tsc 会直接报错，
 * 不会像手写 annotation 那样悄悄与 schema 漂移。
 */
type SysUserWithDept = Prisma.SysUserGetPayload<{
  select: {
    id: true;
    name: true;
    username: true;
    phone: true;
    department: { select: { id: true; name: true; type: true; parentId: true } };
  };
}>;

/** 部门树节点的最小形状 */
type DeptNode = { id: number; name: string; type: string | null; parentId: number | null };

/** 人员记录的最小形状：类型 + 两类互斥的业务 ID */
export interface ParticipantRef {
  /** internal 内部人员（SysUser）/ external 外部考生（ExternalCandidate） */
  type: string;
  internalUserId?: number | null;
  externalCandidateId?: number | null;
}

/**
 * 人员档案：姓名 + 所属公司 + 所属部门
 * 内部人员的公司由部门沿树上溯取最近的省公司/分公司节点（没有独立公司表）；
 * 外部考生的公司即所属外部单位，且不存在部门概念，departmentName 恒为空串。
 */
export interface ParticipantProfile {
  name: string;
  companyName: string;
  departmentName: string;
  /** 登录账号：内部为统一身份账号（username），外部考生以手机号登录，故取 phone */
  account: string | null;
  /** 身份证号：仅外部考生库维护该字段，内部人员表无此列，恒为 null */
  idCard: string | null;
  phone: string | null;
}

/** 视为「公司」的部门类型，与组织管理的部门类型下拉一致 */
const COMPANY_DEPT_TYPES = ['省公司', '分公司'];

/** 部门树上溯的深度上限，防 parentId 脏数据成环 */
const MAX_DEPT_TREE_DEPTH = 20;

/**
 * 人员姓名解析服务
 * 岗位练兵的「参与人员」与自主练习的「开放人员」都是「内部人员 + 外部考生」两类混合，
 * 姓名回填逻辑完全一致，故抽出共用，避免两个 service 各写一份而分叉。
 * 与具体实体无关，只认 ParticipantRef 形状。
 */
@Injectable()
export class ParticipantResolverService {
  private readonly logger = new Logger(ParticipantResolverService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 人员唯一键：类型 + 对应类型的业务 ID
   * @param ref 人员记录
   * @returns `类型:ID` 形式的键
   */
  key(ref: ParticipantRef): string {
    const id = ref.type === 'internal' ? ref.internalUserId : ref.externalCandidateId;
    return `${ref.type}:${id ?? ''}`;
  }

  /**
   * 批量解析姓名（内部人员查 SysUser，外部考生查 ExternalCandidate）
   * 两类各一次查询，避免逐行往返；人员已被删除时该键无值，调用方回填空串。
   * @param refs 人员记录列表
   * @returns `类型:ID` → 姓名 的映射
   */
  async resolveNames(refs: ParticipantRef[]): Promise<Map<string, string>> {
    const internalIds = [
      ...new Set(
        refs
          .filter((r) => r.type === 'internal' && r.internalUserId)
          .map((r) => r.internalUserId as number),
      ),
    ];
    const externalIds = [
      ...new Set(
        refs
          .filter((r) => r.type === 'external' && r.externalCandidateId)
          .map((r) => r.externalCandidateId as number),
      ),
    ];

    const [users, candidates] = await Promise.all([
      internalIds.length
        ? this.prisma.sysUser.findMany({
            where: { id: { in: internalIds } },
            select: { id: true, name: true, username: true },
          })
        : Promise.resolve<Array<{ id: number; name: string | null; username: string }>>([]),
      externalIds.length
        ? this.prisma.externalCandidate.findMany({
            where: { id: { in: externalIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve<Array<{ id: number; name: string }>>([]),
    ]);

    const map = new Map<string, string>();
    users.forEach((u) => map.set(`internal:${u.id}`, u.name || u.username || ''));
    candidates.forEach((c) => map.set(`external:${c.id}`, c.name));
    return map;
  }

  /**
   * 批量解析姓名 + 所属（内部人员取部门名，外部考生取单位名）
   * 与 resolveNames 的差别只在多带一个 belong，练习记录列表要按人展示所属。
   * 未让 resolveNames 转调本方法，是为了不给「只要姓名」的高频调用点（人员校验、
   * 自主练习开放人员回填）附带一次用不上的 department/org join——查询往返次数两者相同。
   * @param refs 人员记录列表
   * @returns `类型:ID` → { name, companyName, departmentName } 的映射；人员已被删除时该键无值
   */
  async resolveProfiles(refs: ParticipantRef[]): Promise<Map<string, ParticipantProfile>> {
    const internalIds = [
      ...new Set(
        refs
          .filter((r) => r.type === 'internal' && r.internalUserId)
          .map((r) => r.internalUserId as number),
      ),
    ];
    const externalIds = [
      ...new Set(
        refs
          .filter((r) => r.type === 'external' && r.externalCandidateId)
          .map((r) => r.externalCandidateId as number),
      ),
    ];

    const [users, candidates] = await Promise.all([
      internalIds.length
        ? this.prisma.sysUser.findMany({
            where: { id: { in: internalIds } },
            select: {
              id: true,
              name: true,
              username: true,
              phone: true,
              // 取 type/parentId 用于沿部门树上溯定位所属公司
              department: { select: { id: true, name: true, type: true, parentId: true } },
            },
          })
        : Promise.resolve<Array<SysUserWithDept>>([]),
      externalIds.length
        ? this.prisma.externalCandidate.findMany({
            where: { id: { in: externalIds } },
            select: {
              id: true,
              name: true,
              idCard: true,
              phone: true,
              org: { select: { name: true } },
            },
          })
        : Promise.resolve<
            Array<{
              id: number;
              name: string;
              idCard: string | null;
              phone: string | null;
              org: { name: string };
            }>
          >([]),
    ]);

    // 上溯所属公司需要祖先节点，一次取全表建索引后在内存里走，
    // 避免每人逐级查库（人数 × 树深 次往返）。部门表通常只有几十到几百行。
    const deptIndex = await this.loadDeptIndex(users);

    const map = new Map<string, ParticipantProfile>();
    users.forEach((u) => {
      const dept = u.department;
      map.set(`internal:${u.id}`, {
        name: u.name || u.username || '',
        companyName: dept ? (this.resolveCompanyName(dept, deptIndex) ?? '') : '',
        // 人直接挂在公司节点下时没有部门可填，留空而非把公司名重复填一遍
        departmentName: dept && !this.isCompanyDept(dept) ? dept.name : '',
        account: u.username ?? null,
        idCard: null,
        phone: u.phone ?? null,
      });
    });
    // org 是必填关系（ExternalCandidate.orgId 非空），无需兜底；外部考生无部门概念
    candidates.forEach((c) =>
      map.set(`external:${c.id}`, {
        name: c.name,
        companyName: c.org.name,
        departmentName: '',
        account: c.phone ?? null,
        idCard: c.idCard ?? null,
        phone: c.phone ?? null,
      }),
    );
    return map;
  }

  /** 部门类型是否属于「公司」 */
  private isCompanyDept(dept: { type: string | null }): boolean {
    return !!dept.type && COMPANY_DEPT_TYPES.includes(dept.type);
  }

  /**
   * 取部门表索引（id → 节点）
   * 仅在有内部人员且存在挂了部门的人时才查，纯外部考生场景不产生这次查询。
   * @param users 内部人员及其部门
   * @returns id → 部门节点 的映射
   */
  private async loadDeptIndex(users: SysUserWithDept[]): Promise<Map<number, DeptNode>> {
    if (!users.some((u) => u.department)) return new Map();
    const depts = await this.prisma.sysDepartment.findMany({
      select: { id: true, name: true, type: true, parentId: true },
    });
    return new Map(depts.map((d) => [d.id, d]));
  }

  /**
   * 沿部门树上溯，找到离该部门最近的公司节点名
   *
   * 内部员工的组织结构只有 SysDepartment 一张树表（type 取值：省公司/分公司/部门），
   * 没有独立公司表，故「所属公司」只能由部门反查：自身即公司则用自身，否则逐级向上。
   * 与考生端 app-auth.service 的 resolveCompanyOfDepartment 同规则，差别是这里走内存索引。
   *
   * @param dept 员工所在部门
   * @param index id → 部门节点 的映射
   * @returns 最近的公司名；树上没有公司节点或断链时返回 null
   */
  private resolveCompanyName(dept: DeptNode, index: Map<number, DeptNode>): string | null {
    let current = dept;
    // 记录已访问节点，parentId 成环时立即中断而不是耗到深度上限
    const visited = new Set<number>([current.id]);

    for (let depth = 0; depth < MAX_DEPT_TREE_DEPTH; depth += 1) {
      if (this.isCompanyDept(current)) return current.name;
      if (current.parentId === null) break;
      if (visited.has(current.parentId)) {
        this.logger.warn(
          `部门树存在环：部门 ${current.id} 的 parentId ${current.parentId} 已访问过，停止上溯`,
        );
        break;
      }
      // 父节点被删但子节点未清理，视为断链，按「查不到公司」处理
      const parent = index.get(current.parentId);
      if (!parent) break;
      visited.add(parent.id);
      current = parent;
    }
    return null;
  }

  /**
   * 校验人员是否都存在且可用（内部人员须启用，外部考生须启用）
   * @param refs 人员记录列表
   * @returns 错误文案；全部有效时返回 null
   */
  async validateExist(refs: ParticipantRef[]): Promise<string | null> {
    const internalIds = [
      ...new Set(
        refs
          .filter((r) => r.type === 'internal')
          .map((r) => r.internalUserId)
          .filter((v): v is number => !!v),
      ),
    ];
    const externalIds = [
      ...new Set(
        refs
          .filter((r) => r.type === 'external')
          .map((r) => r.externalCandidateId)
          .filter((v): v is number => !!v),
      ),
    ];

    // 类型与 ID 不匹配（如 internal 却没传 internalUserId）先行拦下
    const malformed = refs.some((r) =>
      r.type === 'internal' ? !r.internalUserId : !r.externalCandidateId,
    );
    if (malformed) return '人员数据不完整：类型与所选人员不匹配';

    const [users, candidates] = await Promise.all([
      internalIds.length
        ? this.prisma.sysUser.findMany({
            where: { id: { in: internalIds }, status: 1 },
            select: { id: true },
          })
        : Promise.resolve([]),
      externalIds.length
        ? this.prisma.externalCandidate.findMany({
            where: { id: { in: externalIds }, status: 1 },
            select: { id: true },
          })
        : Promise.resolve([]),
    ]);

    if (users.length !== internalIds.length) {
      return '所选内部人员中存在不存在或已停用的账号';
    }
    if (candidates.length !== externalIds.length) {
      return '所选外部考生中存在不存在或已停用的账号';
    }
    return null;
  }
}
