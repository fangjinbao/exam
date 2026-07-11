import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';

/** 业务结果：ok 标识成功，失败时带中文提示 */
type Result<T = void> = { ok: true; data?: T } | { ok: false; message: string };

/** 分页入参归一化：page≥1，pageSize 限制 1~100 */
function normalizePage(page?: number, pageSize?: number) {
  const p = Math.max(page || 1, 1);
  const ps = Math.min(Math.max(pageSize || 10, 1), 100);
  return { p, ps, skip: (p - 1) * ps };
}

/**
 * 数据字典服务（系统管理）
 * 复用 DictType/DictInfo 表：类型列表带字典项数量统计，字典项按类型隔离并做唯一性/引用保护。
 */
@Injectable()
export class SysDictService {
  constructor(private readonly prisma: PrismaService) {}

  /** 字典类型分页（附带每类型字典项数量 itemCount） */
  async typePage(page?: number, pageSize?: number) {
    const { p, ps, skip } = normalizePage(page, pageSize);
    const [rows, total] = await Promise.all([
      this.prisma.dictType.findMany({
        skip,
        take: ps,
        orderBy: { id: 'asc' },
        select: { id: true, name: true, key: true, _count: { select: { items: true } } },
      }),
      this.prisma.dictType.count(),
    ]);
    const list = rows.map((t) => ({
      id: t.id,
      typeName: t.name,
      typeCode: t.key,
      itemCount: t._count.items,
    }));
    return { list, pagination: { page: p, pageSize: ps, total } };
  }

  /** 指定类型下字典项分页（按 sort 升序） */
  async itemPage(typeId: number, page?: number, pageSize?: number) {
    const { p, ps, skip } = normalizePage(page, pageSize);
    const where = { typeId };
    const [rows, total] = await Promise.all([
      this.prisma.dictInfo.findMany({
        where,
        skip,
        take: ps,
        orderBy: [{ orderNum: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          typeId: true,
          name: true,
          value: true,
          orderNum: true,
          status: true,
          referenced: true,
        },
      }),
      this.prisma.dictInfo.count({ where }),
    ]);
    const list = rows.map((i) => ({
      id: i.id,
      typeId: i.typeId,
      name: i.name,
      value: i.value,
      sort: i.orderNum,
      status: i.status,
      referenced: i.referenced,
    }));
    return { list, pagination: { page: p, pageSize: ps, total } };
  }

  /** 校验同一字典类型下 name、value 唯一 */
  private async assertItemUnique(
    typeId: number,
    name: string,
    value: string,
    excludeId?: number,
  ): Promise<Result> {
    const dup = await this.prisma.dictInfo.findFirst({
      where: {
        typeId,
        OR: [{ name }, { value }],
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (dup) return { ok: false, message: '该字典项已存在，请更换名称或值' };
    return { ok: true };
  }

  /** 新增字典项（类型内 name/value 唯一；新增默认未被引用） */
  async addItem(dto: any): Promise<Result<any>> {
    const type = await this.prisma.dictType.findUnique({ where: { id: dto.typeId }, select: { id: true } });
    if (!type) return { ok: false, message: '字典类型不存在' };
    const uniq = await this.assertItemUnique(dto.typeId, dto.name, dto.value);
    if (!uniq.ok) return uniq;
    const created = await this.prisma.dictInfo.create({
      data: {
        typeId: dto.typeId,
        name: dto.name,
        value: dto.value,
        orderNum: dto.sort ?? 0,
        status: dto.status ?? 1,
        referenced: false,
      },
    });
    return { ok: true, data: { id: created.id } };
  }

  /** 更新字典项（类型内 name/value 唯一） */
  async updateItem(id: number, dto: any): Promise<Result> {
    const target = await this.prisma.dictInfo.findUnique({ where: { id } });
    if (!target) return { ok: false, message: '字典项不存在' };
    const uniq = await this.assertItemUnique(target.typeId, dto.name, dto.value, id);
    if (!uniq.ok) return uniq;
    await this.prisma.dictInfo.update({
      where: { id },
      data: {
        name: dto.name,
        value: dto.value,
        orderNum: dto.sort ?? target.orderNum,
        status: dto.status ?? target.status,
      },
    });
    return { ok: true };
  }

  /** 删除字典项（被业务引用时阻止） */
  async deleteItem(id: number): Promise<Result> {
    const target = await this.prisma.dictInfo.findUnique({ where: { id } });
    if (!target) return { ok: false, message: '字典项不存在' };
    if (target.referenced) return { ok: false, message: '该字典项已被引用，无法删除' };
    await this.prisma.dictInfo.delete({ where: { id } });
    return { ok: true };
  }
}
