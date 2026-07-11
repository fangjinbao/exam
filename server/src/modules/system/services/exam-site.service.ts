import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import { BaseService } from '@/common/crud';

/**
 * 考点服务
 * 在基础增删改查之上，提供考点名称唯一性校验与删除前的引用保护钩子。
 */
@Injectable()
export class ExamSiteService extends BaseService {
  constructor(protected prisma: PrismaService) {
    super(prisma, 'examSite');
  }

  /**
   * 校验考点名称是否已存在
   * @param name 考点名称
   * @param excludeId 需排除的记录 ID（编辑场景排除自身）
   * @returns 已存在返回 true
   */
  async isNameExists(name: string, excludeId?: number): Promise<boolean> {
    const existing = await this.prisma.examSite.findFirst({
      where: { name, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    return !!existing;
  }

  /**
   * 删除前的关联校验
   * 考点被考试引用时不可删除（SRS 3.5.10.2 业务规则）。
   * 考试表尚未建立，暂不阻断删除；考试模块落地后在此补充引用校验。
   * @param _id 考点 ID
   */
  async ensureDeletable(_id: number): Promise<void> {
    // 预留：待考试管理模块落地后补充"该考点已被考试引用，无法删除"校验
  }
}
