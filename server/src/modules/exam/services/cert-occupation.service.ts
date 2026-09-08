import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import {
  CreateCertOccupationDto,
  UpdateCertOccupationDto,
  CreateCertLevelDto,
  UpdateCertLevelDto,
} from '../dto/cert-occupation.dto';

/**
 * 鉴定工种服务
 *
 * 工种与其级别是一体的编辑单元：级别没有独立生命周期，
 * 故不继承 BaseService 的通用增删改，改为在此显式处理「工种 + 级别整组」的写入。
 */
@Injectable()
export class CertOccupationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 取工种树（工种为父行，级别为 children）
   *
   * 不分页：工种是基础数据，量级在几十条，树形表格也需要一次拿全才能正确展开。
   * @param keyword 工种名称/编号模糊筛选（可空）
   * @param status 状态精确筛选（可空）
   */
  async getTree(keyword?: string, status?: number) {
    const occupations = await this.prisma.certOccupation.findMany({
      where: {
        ...(keyword
          ? { OR: [{ name: { contains: keyword } }, { code: { contains: keyword } }] }
          : {}),
        ...(status !== undefined && status !== null ? { status } : {}),
      },
      include: {
        // 级别按 orderNum 升序、同序号时按 id：级别的次序表达高低，必须稳定
        levels: { orderBy: [{ orderNum: 'asc' }, { id: 'asc' }] },
      },
      orderBy: [{ orderNum: 'asc' }, { id: 'asc' }],
    });

    return occupations.map((o) => ({
      id: o.id,
      name: o.name,
      code: o.code,
      description: o.description,
      orderNum: o.orderNum,
      status: o.status,
      levelCount: o.levels.length,
      createTime: o.createTime,
      updateTime: o.updateTime,
      children: o.levels.map((l) => ({
        id: l.id,
        occupationId: l.occupationId,
        name: l.name,
        orderNum: l.orderNum,
        description: l.description,
      })),
    }));
  }

  /** 按 id 取单个工种（含级别），供编辑回填 */
  async findById(id: number) {
    return this.prisma.certOccupation.findUnique({
      where: { id },
      include: { levels: { orderBy: [{ orderNum: 'asc' }, { id: 'asc' }] } },
    });
  }

  /**
   * 校验工种名称是否重复
   * @param name 工种名称
   * @param excludeId 编辑场景排除自身
   */
  async isNameExists(name: string, excludeId?: number): Promise<boolean> {
    const found = await this.prisma.certOccupation.findFirst({
      where: { name, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    return !!found;
  }

  /**
   * 校验工种编号是否重复
   * @param code 工种编号
   * @param excludeId 编辑场景排除自身
   */
  async isCodeExists(code: string, excludeId?: number): Promise<boolean> {
    const found = await this.prisma.certOccupation.findFirst({
      where: { code, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    return !!found;
  }

  /**
   * 生成工种编号（GZ + 3 位序号）
   *
   * 取现有 GZ 编号的最大序号加一，而非按总数加一：
   * 按总数会在删除过某条后重新撞上已用过的编号。
   * 极端并发下仍可能撞号，由 add 的唯一性校验兜底。
   */
  private async nextCode(): Promise<string> {
    const rows = await this.prisma.certOccupation.findMany({
      where: { code: { startsWith: 'GZ' } },
      select: { code: true },
    });
    const maxSeq = rows.reduce((max, r) => {
      const n = Number(r.code.slice(2));
      return Number.isInteger(n) && n > max ? n : max;
    }, 0);
    return `GZ${String(maxSeq + 1).padStart(3, '0')}`;
  }

  /**
   * 校验同一工种内级别名称不重复
   * @param levels 待校验的级别数组
   * @returns 重复的名称，无重复返回 null
   */
  findDuplicateLevelName(levels?: { name: string }[]): string | null {
    if (!levels?.length) return null;
    const seen = new Set<string>();
    for (const l of levels) {
      const name = l.name.trim();
      if (seen.has(name)) return name;
      seen.add(name);
    }
    return null;
  }

  /**
   * 新增工种（连带创建级别）
   *
   * 编号留空时自动生成。级别用嵌套 create 一并落库，
   * 保证「工种建了但级别没建」这种半成品状态不会出现。
   */
  async add(dto: CreateCertOccupationDto) {
    const code = dto.code?.trim() || (await this.nextCode());
    return this.prisma.certOccupation.create({
      data: {
        name: dto.name.trim(),
        code,
        description: dto.description ?? null,
        orderNum: dto.orderNum ?? 0,
        status: dto.status ?? 1,
        levels: {
          create: (dto.levels ?? []).map((l, idx) => ({
            name: l.name.trim(),
            // 未显式给排序号时按提交顺序编号：前端拖动排序后的顺序即为级别高低
            orderNum: l.orderNum ?? idx + 1,
            description: l.description ?? null,
          })),
        },
      },
      include: { levels: true },
    });
  }

  /**
   * 更新工种（级别整组替换）
   *
   * 级别按「提交的即全部」处理：不在本次提交里的既有级别一律删除。
   * 保留传了 id 的既有级别（不重建），避免日后级别被其他表引用时
   * 每次编辑工种都把外键指向的行换掉。
   *
   * 全程放在事务里：删级别与建级别若分开提交，中途失败会留下缺级别的工种。
   */
  async update(dto: UpdateCertOccupationDto) {
    const submitted = dto.levels ?? [];
    const keepIds = submitted.filter((l) => l.id).map((l) => l.id!);

    return this.prisma.$transaction(async (tx) => {
      await tx.certOccupationLevel.deleteMany({
        where: { occupationId: dto.id, ...(keepIds.length ? { id: { notIn: keepIds } } : {}) },
      });

      for (const [idx, l] of submitted.entries()) {
        const data = {
          name: l.name.trim(),
          orderNum: l.orderNum ?? idx + 1,
          description: l.description ?? null,
        };
        if (l.id) {
          await tx.certOccupationLevel.update({ where: { id: l.id }, data });
        } else {
          await tx.certOccupationLevel.create({ data: { ...data, occupationId: dto.id } });
        }
      }

      return tx.certOccupation.update({
        where: { id: dto.id },
        data: {
          name: dto.name.trim(),
          // 编号留空时保持原值，不重新生成：编号是对外标识，不应因编辑而变
          ...(dto.code?.trim() ? { code: dto.code.trim() } : {}),
          description: dto.description ?? null,
          orderNum: dto.orderNum ?? 0,
          status: dto.status ?? 1,
        },
        include: { levels: true },
      });
    });
  }

  /** 按 id 取单个级别，供编辑回填与归属校验 */
  async findLevelById(id: number) {
    return this.prisma.certOccupationLevel.findUnique({ where: { id } });
  }

  /**
   * 校验同一工种内级别名称是否重复
   *
   * 只在本工种内查：不同工种有同名级别是正常的
   * （加油员和电工都有「三级/高级工」），全局唯一会误拦。
   *
   * @param occupationId 所属工种
   * @param name 级别名称
   * @param excludeId 编辑场景排除自身
   */
  async isLevelNameExists(
    occupationId: number,
    name: string,
    excludeId?: number,
  ): Promise<boolean> {
    const found = await this.prisma.certOccupationLevel.findFirst({
      where: {
        occupationId,
        name: name.trim(),
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    return !!found;
  }

  /**
   * 单独新增一个级别
   *
   * 排序号留空时排到该工种末尾（现有最大 orderNum + 1），而不是 0：
   * 补一级通常是补更高的等级，落到队尾比插到最前更符合预期。
   */
  async addLevel(dto: CreateCertLevelDto) {
    let orderNum = dto.orderNum;
    if (orderNum === undefined || orderNum === null) {
      const max = await this.prisma.certOccupationLevel.aggregate({
        where: { occupationId: dto.occupationId },
        _max: { orderNum: true },
      });
      orderNum = (max._max.orderNum ?? 0) + 1;
    }
    return this.prisma.certOccupationLevel.create({
      data: {
        occupationId: dto.occupationId,
        name: dto.name.trim(),
        orderNum,
        description: dto.description ?? null,
      },
    });
  }

  /** 单独更新一个级别（不改归属工种） */
  async updateLevel(dto: UpdateCertLevelDto) {
    return this.prisma.certOccupationLevel.update({
      where: { id: dto.id },
      data: {
        name: dto.name.trim(),
        ...(dto.orderNum === undefined || dto.orderNum === null
          ? {}
          : { orderNum: dto.orderNum }),
        description: dto.description ?? null,
      },
    });
  }

  /** 单独删除一个级别 */
  async deleteLevel(id: number) {
    return this.prisma.certOccupationLevel.delete({ where: { id } });
  }

  /**
   * 删除工种（级别随之删除）
   *
   * 级别由 schema 的 onDelete: Cascade 带走，此处不必手动清理。
   * 工种日后被鉴定业务引用后，需在此补引用校验再放行删除。
   */
  async delete(id: number) {
    return this.prisma.certOccupation.delete({ where: { id } });
  }

  /** 批量删除工种 */
  async batchDelete(ids: number[]) {
    return this.prisma.certOccupation.deleteMany({ where: { id: { in: ids } } });
  }

  /** 启用/停用工种 */
  async updateStatus(id: number, status: number) {
    return this.prisma.certOccupation.update({ where: { id }, data: { status } });
  }
}
