import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma.service';
import { OrgScopeService, type AdminPayload } from './org-scope.service';

/** 试卷共享属性相关字段 */
interface PaperShareInfo {
  id: number;
  createBy: number | null;
  visibleScope: string;
  shareLevel: string;
}

/**
 * 试卷访问控制服务
 *
 * 与题库共享同一套规则（复用 OrgScopeService 的组织树与可见性判定）：
 * - 超级管理员（username === 'admin'）通吃。
 * - 创建人对自己创建的试卷拥有全部权限，且是唯一可修改共享设置的角色（超管除外）。
 * - 其他人能否看到取决于 visibleScope（self/dept/company/all）；
 *   看到之后能否编辑/发布/删除取决于 shareLevel（manage=可管理，view=只读）。
 */
@Injectable()
export class PaperAccessService {
  constructor(
    private prisma: PrismaService,
    private orgScope: OrgScopeService,
  ) {}

  /** 是否超级管理员 */
  isSuperAdmin(admin: AdminPayload): boolean {
    return this.orgScope.isSuperAdmin(admin);
  }

  /**
   * 构造试卷列表的可见性 where 条件
   * 超管返回空对象（不限制）；其余按「自己创建 + all + dept/company 命中」取并集。
   * @param admin 当前登录管理员
   * @returns 可直接合并进 Prisma where 的条件对象
   */
  async buildVisibleWhere(admin: AdminPayload): Promise<Prisma.PaperWhereInput> {
    const or = await this.orgScope.buildVisibleOr(admin);
    if (!or) return {};
    return { OR: or as Prisma.PaperWhereInput[] };
  }

  /**
   * 读取试卷共享信息
   * @param paperId 试卷 ID
   * @throws NotFoundException 试卷不存在
   */
  private async getPaperShareInfo(paperId: number): Promise<PaperShareInfo> {
    const paper = await this.prisma.paper.findUnique({
      where: { id: paperId },
      select: { id: true, createBy: true, visibleScope: true, shareLevel: true },
    });
    if (!paper) throw new NotFoundException('试卷不存在');
    return paper;
  }

  /**
   * 计算当前用户对试卷的操作能力
   * @param paperId 试卷 ID
   * @param admin 当前登录管理员
   * @returns canRead/canManage/canEditShare 三个能力位
   */
  async getCapabilities(
    paperId: number,
    admin: AdminPayload,
  ): Promise<{ canRead: boolean; canManage: boolean; canEditShare: boolean }> {
    const paper = await this.getPaperShareInfo(paperId);
    return this.orgScope.getCapabilities(paper, admin);
  }

  /**
   * 基于已取出的试卷记录计算能力位（列表场景避免重复查库）
   * @param paper 试卷共享信息
   * @param admin 当前登录管理员
   */
  async getCapabilitiesFromPaper(
    paper: { createBy: number | null; visibleScope: string; shareLevel: string },
    admin: AdminPayload,
  ): Promise<{ canRead: boolean; canManage: boolean; canEditShare: boolean }> {
    return this.orgScope.getCapabilities(paper, admin);
  }

  /**
   * 断言可读（详情/预览），否则 403
   * @param paperId 试卷 ID
   * @param admin 当前登录管理员
   */
  async assertCanRead(paperId: number, admin: AdminPayload): Promise<void> {
    const { canRead } = await this.getCapabilities(paperId, admin);
    if (!canRead) throw new ForbiddenException('无权访问该试卷');
  }

  /**
   * 断言可管理（编辑/发布/删除），否则 403
   * @param paperId 试卷 ID
   * @param admin 当前登录管理员
   */
  async assertCanManage(paperId: number, admin: AdminPayload): Promise<void> {
    const { canRead, canManage } = await this.getCapabilities(paperId, admin);
    if (!canRead) throw new ForbiddenException('无权访问该试卷');
    if (!canManage) throw new ForbiddenException('该试卷为只读共享，无权修改');
  }

  /**
   * 断言可修改共享设置（仅创建人与超管），否则 403
   * @param paperId 试卷 ID
   * @param admin 当前登录管理员
   */
  async assertCanEditShare(paperId: number, admin: AdminPayload): Promise<void> {
    const { canEditShare } = await this.getCapabilities(paperId, admin);
    if (!canEditShare) throw new ForbiddenException('仅试卷创建人可修改共享设置');
  }
}
