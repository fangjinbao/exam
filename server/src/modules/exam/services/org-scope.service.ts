import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';

/** 可见范围枚举（题库、试卷共用） */
export const VISIBLE_SCOPES = ['self', 'dept', 'company', 'all'] as const;
export type VisibleScope = (typeof VISIBLE_SCOPES)[number];

/** 共享权限级别枚举（题库、试卷共用） */
export const SHARE_LEVELS = ['manage', 'view'] as const;
export type ShareLevel = (typeof SHARE_LEVELS)[number];

/**
 * 被视为「公司」层级的部门类型
 *
 * 含「集团公司」是必要的：集团公司下直挂本部各部门（type=部门），若上溯时不认
 * 集团公司，会一路走到 parentId=null 仍找不到公司节点，导致 company 范围退化为
 * 「该部门自身子树」——集团本部的人反而看不到下属公司的共享资源，与语义相反。
 *
 * 上溯取「最近」的公司节点，故浙江石油分公司（省公司）下的用户仍停在浙江，
 * 不会越级扩大到全集团。
 */
export const COMPANY_DEPT_TYPES = ['集团公司', '省公司', '分公司'];

/**
 * 判断部门类型是否属于「公司」层级
 * @param type 部门类型（省公司/分公司/部门）
 * @returns 属于省公司/分公司返回 true
 */
function isCompanyType(type?: string | null): boolean {
  return !!type && COMPANY_DEPT_TYPES.includes(type);
}

/** 当前登录管理员（AuthGuard 挂在 request.admin 上的 JWT payload） */
export interface AdminPayload {
  userId: number;
  username: string;
  roleIds?: number[];
}

/** 资源的共享属性（题库与试卷同构，故共用一套判定） */
export interface ShareInfo {
  createBy: number | null;
  visibleScope: string;
  shareLevel: string;
}

/**
 * 组织范围与共享可见性判定服务
 *
 * 承载题库、试卷等资源共享属性所依赖的组织结构计算：
 * - 部门子树 / 公司子树的 ID 展开；
 * - 部门集合反查用户 ID 集合；
 * - 基于 visibleScope + shareLevel 的可见性与能力位判定。
 *
 * 规则（已与业务确认）：
 * - 超级管理员（username === 'admin'）通吃：可见、可管理、可改共享属性。
 * - 创建人对自己创建的资源拥有全部权限，且是唯一可修改共享属性的角色（超管除外）。
 * - 其他人能否看到取决于 visibleScope，看到之后能做什么取决于 shareLevel。
 * - dept 含创建人所属部门的所有下级子部门；company 沿 parentId 上溯到最近的
 *   省公司/分公司节点后取其整棵子树。
 */
@Injectable()
export class OrgScopeService {
  constructor(private prisma: PrismaService) {}

  /** 是否超级管理员 */
  isSuperAdmin(admin: AdminPayload): boolean {
    return admin?.username === 'admin';
  }

  /**
   * 取指定部门及其所有下级部门 ID
   * 一次拉取全部部门后在内存里按 parentId 递归收集，避免递归查库。
   * @param deptId 起始部门 ID
   * @returns 含自身的部门 ID 集合（deptId 为空时返回空数组）
   */
  async getDeptSubtreeIds(deptId?: number | null): Promise<number[]> {
    if (!deptId) return [];
    const all = await this.prisma.sysDepartment.findMany({
      select: { id: true, parentId: true },
    });
    const childrenMap = new Map<number, number[]>();
    all.forEach((d) => {
      if (d.parentId == null) return;
      const arr = childrenMap.get(d.parentId) || [];
      arr.push(d.id);
      childrenMap.set(d.parentId, arr);
    });

    const result: number[] = [];
    const walk = (id: number) => {
      if (result.includes(id)) return; // 防御脏数据成环
      result.push(id);
      (childrenMap.get(id) || []).forEach(walk);
    };
    walk(deptId);
    return result;
  }

  /**
   * 取指定部门所属「公司」的整棵子树部门 ID
   * 沿 parentId 上溯找到最近的省公司/分公司节点，再取其子树；
   * 找不到公司节点时退化为该部门自身子树。
   * @param deptId 起始部门 ID
   * @returns 公司子树的部门 ID 集合
   */
  async getCompanySubtreeIds(deptId?: number | null): Promise<number[]> {
    if (!deptId) return [];
    const all = await this.prisma.sysDepartment.findMany({
      select: { id: true, parentId: true, type: true },
    });
    const byId = new Map(all.map((d) => [d.id, d]));

    let companyId: number | null = null;
    let cursor = byId.get(deptId);
    const guard = new Set<number>();
    while (cursor && !guard.has(cursor.id)) {
      guard.add(cursor.id);
      if (isCompanyType(cursor.type)) {
        companyId = cursor.id;
        break;
      }
      cursor = cursor.parentId != null ? byId.get(cursor.parentId) : undefined;
    }

    return this.getDeptSubtreeIds(companyId ?? deptId);
  }

  /**
   * 取某管理员所属的单位（公司节点）ID
   *
   * 由账号的 departmentId 沿 parentId 上溯到最近的公司节点得出，而不是让前端传
   * ——传了就能被改成别的单位。超管不受此限，由调用方按 isSuperAdmin 决定放开范围。
   *
   * @param admin 当前登录管理员
   * @returns 单位 ID；账号没挂部门或一路到根都没有公司节点时返回 null
   */
  async getAdminOrgId(admin: AdminPayload): Promise<number | null> {
    const me = await this.prisma.sysUser.findUnique({
      where: { id: admin.userId },
      select: { departmentId: true },
    });
    return this.getCompanyId(me?.departmentId);
  }

  /**
   * 沿 parentId 上溯，取指定部门所属「最近的公司节点」ID
   *
   * 与 getCompanySubtreeIds 的区别：这里要的是公司节点本身，
   * 用于回答「当前管理员属于哪个单位」——鉴定报名按此确定可报的名额行。
   *
   * @param deptId 起始部门 ID
   * @returns 公司节点 ID；deptId 为空或一路到根都没有公司节点时返回 null
   */
  async getCompanyId(deptId?: number | null): Promise<number | null> {
    if (!deptId) return null;
    const all = await this.prisma.sysDepartment.findMany({
      select: { id: true, parentId: true, type: true },
    });
    const byId = new Map(all.map((d) => [d.id, d]));

    let cursor = byId.get(deptId);
    const guard = new Set<number>(); // 防御脏数据成环
    while (cursor && !guard.has(cursor.id)) {
      guard.add(cursor.id);
      if (isCompanyType(cursor.type)) return cursor.id;
      cursor = cursor.parentId != null ? byId.get(cursor.parentId) : undefined;
    }
    return null;
  }

  /**
   * 批量取一批用户各自的所属单位名称（列表页「所属单位」列用）
   *
   * 单位口径与 getCompanyId 完全一致：由用户的 departmentId 沿 parentId 上溯到
   * 最近的公司节点。抽成批量方法而不是在列表里逐行调 getCompanyId，是因为后者
   * 每次都全量拉一遍部门表——一页 10 行就是 10 次全表查询。
   *
   * 单位是**实时派生**的，不落库快照：列表要显示的归属应当与 buildVisibleOr 的
   * 可见性判定同源，两处都按账号当下的部门算。若存成快照，人调岗后会出现
   * 「列表显示 A 单位、但按 B 单位的范围参与隔离」的对不上。
   *
   * @param userIds 用户 ID 集合（可含重复，内部去重）
   * @returns userId → 单位名称；账号没挂部门、或一路到根都没有公司节点时不写入该键
   */
  async getOrgNamesByUserIds(userIds: number[]): Promise<Map<number, string>> {
    const ids = [...new Set(userIds.filter((v) => !!v))];
    const result = new Map<number, string>();
    if (!ids.length) return result;

    const [users, all] = await Promise.all([
      this.prisma.sysUser.findMany({
        where: { id: { in: ids } },
        select: { id: true, departmentId: true },
      }),
      this.prisma.sysDepartment.findMany({
        select: { id: true, parentId: true, type: true, name: true },
      }),
    ]);
    const byId = new Map(all.map((d) => [d.id, d]));

    // 同一个部门可能被本页多个用户共用，缓存上溯结果避免重复走链
    const orgNameByDept = new Map<number, string>();
    const resolve = (deptId: number): string => {
      const cached = orgNameByDept.get(deptId);
      if (cached !== undefined) return cached;
      let cursor = byId.get(deptId);
      const guard = new Set<number>(); // 防御脏数据成环，同 getCompanyId
      let name = '';
      while (cursor && !guard.has(cursor.id)) {
        guard.add(cursor.id);
        if (isCompanyType(cursor.type)) {
          name = cursor.name;
          break;
        }
        cursor = cursor.parentId != null ? byId.get(cursor.parentId) : undefined;
      }
      orgNameByDept.set(deptId, name);
      return name;
    };

    users.forEach((u) => {
      if (u.departmentId == null) return;
      const name = resolve(u.departmentId);
      if (name) result.set(u.id, name);
    });
    return result;
  }

  /**
   * 取某公司「仅本单位」的部门 ID 集合：含自身与其下的部门，但不进入子公司
   *
   * 与 getDeptSubtreeIds 的区别是遇到公司节点就停。名额是按单位分的，
   * 子公司有自己的名额行，若并入上级单位，同一个人会被两个名额各报一次
   * ——集团的管理员能挑到全部 163 人，与各分公司的名额直接打架。
   *
   * 按此口径，59 个单位各自的人数之和恰好等于全部启用员工数，不重不漏。
   *
   * @param companyId 公司节点 ID
   * @returns 部门 ID 集合（含 companyId 自身）
   */
  async getOwnDeptIds(companyId?: number | null): Promise<number[]> {
    if (!companyId) return [];
    const all = await this.prisma.sysDepartment.findMany({
      select: { id: true, parentId: true, type: true },
    });
    const childrenMap = new Map<number, typeof all>();
    all.forEach((d) => {
      if (d.parentId == null) return;
      const arr = childrenMap.get(d.parentId) || [];
      arr.push(d);
      childrenMap.set(d.parentId, arr);
    });

    const result = [companyId];
    const stack = [companyId];
    const guard = new Set<number>([companyId]);
    while (stack.length) {
      const cur = stack.pop()!;
      for (const child of childrenMap.get(cur) || []) {
        if (guard.has(child.id)) continue;
        if (isCompanyType(child.type)) continue; // 子公司自有名额，不并入
        guard.add(child.id);
        result.push(child.id);
        stack.push(child.id);
      }
    }
    return result;
  }

  /**
   * 取指定部门集合下的全部用户 ID
   * @param deptIds 部门 ID 集合
   * @returns 用户 ID 集合
   */
  async getUserIdsByDepts(deptIds: number[]): Promise<number[]> {
    if (deptIds.length === 0) return [];
    const users = await this.prisma.sysUser.findMany({
      where: { departmentId: { in: deptIds } },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  /**
   * 取当前用户「本部门可见」与「本公司可见」两个范围各自覆盖的创建人 ID 集合
   * @param admin 当前登录管理员
   * @returns deptUserIds / companyUserIds；用户无部门时均为空数组
   */
  async getScopeUserIds(
    admin: AdminPayload,
  ): Promise<{ deptUserIds: number[]; companyUserIds: number[] }> {
    const me = await this.prisma.sysUser.findUnique({
      where: { id: admin.userId },
      select: { departmentId: true },
    });
    if (!me?.departmentId) return { deptUserIds: [], companyUserIds: [] };

    const [deptIds, companyIds] = await Promise.all([
      this.getDeptSubtreeIds(me.departmentId),
      this.getCompanySubtreeIds(me.departmentId),
    ]);
    const [deptUserIds, companyUserIds] = await Promise.all([
      this.getUserIdsByDepts(deptIds),
      this.getUserIdsByDepts(companyIds),
    ]);
    return { deptUserIds, companyUserIds };
  }

  /**
   * 构造列表可见性的 OR 条件分支
   * 超管返回 null 表示不加限制；其余按「自己创建 + all + dept/company 命中」取并集。
   * 注意：dept/company 判定的是**创建人**所在部门是否落在**当前访问者**的部门/公司子树内。
   * @param admin 当前登录管理员
   * @returns OR 分支数组；超管返回 null
   */
  async buildVisibleOr(admin: AdminPayload): Promise<Record<string, any>[] | null> {
    if (this.isSuperAdmin(admin)) return null;

    const or: Record<string, any>[] = [
      { createBy: admin.userId }, // 自己创建的，恒可见
      { visibleScope: 'all' },
    ];

    const { deptUserIds, companyUserIds } = await this.getScopeUserIds(admin);
    if (deptUserIds.length > 0) {
      or.push({ visibleScope: 'dept', createBy: { in: deptUserIds } });
    }
    if (companyUserIds.length > 0) {
      or.push({ visibleScope: 'company', createBy: { in: companyUserIds } });
    }
    return or;
  }

  /**
   * 判断当前用户对资源是否可见
   * @param info 资源共享属性
   * @param admin 当前登录管理员
   * @returns 可见返回 true
   */
  async canRead(info: ShareInfo, admin: AdminPayload): Promise<boolean> {
    if (this.isSuperAdmin(admin)) return true;
    if (info.createBy === admin.userId) return true;
    if (info.visibleScope === 'all') return true;
    if (info.visibleScope === 'self') return false;
    if (!info.createBy) return false;

    const me = await this.prisma.sysUser.findUnique({
      where: { id: admin.userId },
      select: { departmentId: true },
    });
    if (!me?.departmentId) return false;

    const scopeDeptIds =
      info.visibleScope === 'dept'
        ? await this.getDeptSubtreeIds(me.departmentId)
        : await this.getCompanySubtreeIds(me.departmentId);
    const scopeUserIds = await this.getUserIdsByDepts(scopeDeptIds);
    return scopeUserIds.includes(info.createBy);
  }

  /**
   * 计算当前用户对资源的能力位
   * @param info 资源共享属性
   * @param admin 当前登录管理员
   * @returns canRead/canManage/canEditShare 三个能力位
   */
  async getCapabilities(
    info: ShareInfo,
    admin: AdminPayload,
  ): Promise<{ canRead: boolean; canManage: boolean; canEditShare: boolean }> {
    const isSuper = this.isSuperAdmin(admin);
    const isOwner = info.createBy === admin.userId;
    const canRead = await this.canRead(info, admin);
    // 可管理：超管、创建人，或在可见范围内且级别为 manage
    const canManage = isSuper || isOwner || (canRead && info.shareLevel === 'manage');
    // 共享属性仅创建人与超管可改
    const canEditShare = isSuper || isOwner;
    return { canRead, canManage, canEditShare };
  }
}
