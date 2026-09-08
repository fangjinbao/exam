import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma.service';
import { OrgScopeService, type AdminPayload } from './org-scope.service';

// 可见范围/权限级别枚举与类型统一由 OrgScopeService 定义，此处转出以兼容既有引用
export {
  VISIBLE_SCOPES,
  SHARE_LEVELS,
  type VisibleScope,
  type ShareLevel,
  type AdminPayload,
} from './org-scope.service';

/** 题库共享属性相关字段 */
interface BankShareInfo {
  id: number;
  createBy: number | null;
  visibleScope: string;
  shareLevel: string;
}

/**
 * 题库访问控制服务
 *
 * 组织树展开与共享可见性判定复用 OrgScopeService（与试卷共享同一套规则），
 * 本服务只负责题库维度的取数与三级断言。
 *
 * 规则（已与业务确认）：
 * - 超级管理员（username === 'admin'）通吃：可见、可管理、可改共享属性。
 * - 创建人：对自己创建的题库拥有全部权限，且是唯一可修改共享属性的角色（超管除外）。
 * - 其他人：能否看到取决于 visibleScope（self/dept/company/all），
 *   看到之后能做什么取决于 shareLevel（manage=可增删改含题目，view=只读）。
 */
@Injectable()
export class QuestionBankAccessService {
  constructor(
    private prisma: PrismaService,
    private orgScope: OrgScopeService,
  ) {}

  /** 是否超级管理员 */
  isSuperAdmin(admin: AdminPayload): boolean {
    return this.orgScope.isSuperAdmin(admin);
  }

  /**
   * 取指定部门及其所有下级部门 ID
   * @param deptId 起始部门 ID
   */
  async getDeptSubtreeIds(deptId?: number | null): Promise<number[]> {
    return this.orgScope.getDeptSubtreeIds(deptId);
  }

  /**
   * 取指定部门所属「公司」的整棵子树部门 ID
   * @param deptId 起始部门 ID
   */
  async getCompanySubtreeIds(deptId?: number | null): Promise<number[]> {
    return this.orgScope.getCompanySubtreeIds(deptId);
  }

  /**
   * 构造题库列表的可见性 where 条件
   * 超管返回空对象（不限制）；其余按「自己创建 + all + dept/company 命中」取并集。
   * @param admin 当前登录管理员
   * @returns 可直接合并进 Prisma where 的条件对象
   */
  async buildVisibleWhere(admin: AdminPayload): Promise<Prisma.QuestionBankWhereInput> {
    const or = await this.orgScope.buildVisibleOr(admin);
    if (!or) return {};
    return { OR: or as Prisma.QuestionBankWhereInput[] };
  }

  /**
   * 读取题库共享信息
   * @param bankId 题库 ID
   * @returns 共享相关字段
   * @throws NotFoundException 题库不存在
   */
  private async getBankShareInfo(bankId: number): Promise<BankShareInfo> {
    const bank = await this.prisma.questionBank.findUnique({
      where: { id: bankId },
      select: { id: true, createBy: true, visibleScope: true, shareLevel: true },
    });
    if (!bank) throw new NotFoundException('题库不存在');
    return bank;
  }

  /**
   * 计算当前用户对题库的操作能力
   * @param bankId 题库 ID
   * @param admin 当前登录管理员
   * @returns canRead/canManage/canEditShare 三个能力位
   */
  async getCapabilities(
    bankId: number,
    admin: AdminPayload,
  ): Promise<{ canRead: boolean; canManage: boolean; canEditShare: boolean }> {
    const bank = await this.getBankShareInfo(bankId);
    return this.getCapabilitiesFromBank(bank, admin);
  }

  /**
   * 基于已取出的题库记录计算能力位（避免列表场景重复查库）
   * @param bank 题库共享信息
   * @param admin 当前登录管理员
   */
  async getCapabilitiesFromBank(
    bank: BankShareInfo,
    admin: AdminPayload,
  ): Promise<{ canRead: boolean; canManage: boolean; canEditShare: boolean }> {
    return this.orgScope.getCapabilities(bank, admin);
  }

  /**
   * 断言可读，否则 403
   * @param bankId 题库 ID
   * @param admin 当前登录管理员
   */
  async assertCanRead(bankId: number, admin: AdminPayload): Promise<void> {
    const { canRead } = await this.getCapabilities(bankId, admin);
    if (!canRead) throw new ForbiddenException('无权访问该题库');
  }

  /**
   * 断言可管理（题库信息与题目的增删改），否则 403
   * @param bankId 题库 ID
   * @param admin 当前登录管理员
   */
  async assertCanManage(bankId: number, admin: AdminPayload): Promise<void> {
    const { canRead, canManage } = await this.getCapabilities(bankId, admin);
    if (!canRead) throw new ForbiddenException('无权访问该题库');
    if (!canManage) throw new ForbiddenException('该题库为只读共享，无权修改');
  }

  /**
   * 断言可修改共享属性（仅创建人与超管），否则 403
   * @param bankId 题库 ID
   * @param admin 当前登录管理员
   */
  async assertCanEditShare(bankId: number, admin: AdminPayload): Promise<void> {
    const { canEditShare } = await this.getCapabilities(bankId, admin);
    if (!canEditShare) throw new ForbiddenException('仅题库创建人可修改共享设置');
  }

  /**
   * 批量断言题库可读（组卷选题库时用）
   * @param bankIds 题库 ID 集合
   * @param admin 当前登录管理员
   */
  async assertCanReadBanks(bankIds: number[], admin: AdminPayload): Promise<void> {
    for (const id of [...new Set(bankIds)]) {
      await this.assertCanRead(id, admin);
    }
  }
}
