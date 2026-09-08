import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import { BaseService } from '@/common/crud';

/**
 * 知识点分类服务
 * 在基础增删改查之上，提供树形结构构建与删除前的引用保护
 * （存在子节点或被题目引用时不可删除）。
 */
@Injectable()
export class KnowledgePointService extends BaseService {
  constructor(protected prisma: PrismaService) {
    super(prisma, 'knowledgePoint');
  }

  /**
   * 获取知识点树
   * 一次性查全表后在内存中递归组装，按 orderNum 升序。
   * @param tenantId 租户 ID，传入时只返回该租户的知识点（可选）
   * @returns 树形数组，叶子节点 children 为空数组
   */
  async getTree(tenantId?: number) {
    const items = await this.prisma.knowledgePoint.findMany({
      where: tenantId ? { tenantId } : undefined,
      orderBy: { orderNum: 'asc' },
    });
    return this.buildTree(items, null);
  }

  /**
   * 将扁平知识点列表递归组装为树
   * @param items 扁平知识点列表
   * @param parentId 当前层级的父节点 ID，根节点传 null
   */
  private buildTree(items: any[], parentId: number | null): any[] {
    return items
      .filter((item) => (item.parentId ?? null) === parentId)
      .map((item) => ({
        ...item,
        children: this.buildTree(items, item.id),
      }));
  }

  /**
   * 校验父级知识点是否存在
   * @param parentId 父级 ID
   * @returns 存在返回 true
   */
  async isParentExists(parentId: number): Promise<boolean> {
    const parent = await this.prisma.knowledgePoint.findUnique({
      where: { id: parentId },
      select: { id: true },
    });
    return !!parent;
  }

  /**
   * 校验知识点编号是否已存在
   * @param code 知识点编号
   * @param excludeId 需排除的记录 ID（编辑场景排除自身）
   * @returns 已存在返回 true
   */
  async isCodeExists(code: string, excludeId?: number): Promise<boolean> {
    const existing = await this.prisma.knowledgePoint.findFirst({
      where: { code, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    return !!existing;
  }

  /**
   * 生成全局唯一的知识点编号（留空时使用）
   * 规则：KP + 时间戳后 6 位 + 2 位随机，冲突则重试，最多 5 次。
   * 与题库编码（QuestionBankService.generateCode）同款规则，仅前缀不同。
   * @returns 唯一编号
   */
  async generateCode(): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const ts = Date.now().toString().slice(-6);
      const rand = Math.floor(Math.random() * 90 + 10);
      const code = `KP${ts}${rand}`;
      if (!(await this.isCodeExists(code))) return code;
    }
    // 兜底：极端并发下用更长随机串，几乎不可能再冲突
    return `KP${Date.now()}${Math.floor(Math.random() * 1000)}`;
  }

  /**
   * 删除前的关联校验
   * 存在子知识点或被题目引用时不可删除（SRS 3.5.1 业务规则）。
   * @param id 知识点 ID
   * @throws 存在子节点或被题目引用时抛出中文错误
   */
  async ensureDeletable(id: number): Promise<void> {
    const child = await this.prisma.knowledgePoint.findFirst({
      where: { parentId: id },
      select: { id: true },
    });
    if (child) {
      throw new Error('该知识点存在子分类，请先删除子分类');
    }
    const ref = await this.prisma.questionKnowledgePoint.findFirst({
      where: { knowledgePointId: id },
      select: { questionId: true },
    });
    if (ref) {
      throw new Error('该知识点已被题目引用，无法删除');
    }
  }
}
