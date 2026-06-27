import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import { BaseService, PageOptions, PageResult } from '@/common/crud';

/** 列表项（含派生的审核人姓名） */
interface IssueTypeRow {
  id: number;
  name: string;
  auditorId: number | null;
  orderNum: number;
  status: number;
  createTime: Date;
  updateTime: Date;
  auditorName?: string | null;
}

/**
 * 问题类型管理服务
 * 在基础 CRUD 之上提供列表 enrich 审核人姓名能力。
 */
@Injectable()
export class IssueTypeService extends BaseService {
  constructor(protected prisma: PrismaService) {
    super(prisma, 'issueType');
  }

  /**
   * 分页查询并追加审核人姓名
   * 先走基类分页，再批量查询审核人 ID 对应的用户姓名，合并为 auditorName 字段。
   * @param options 分页与排序参数
   * @param where Prisma 查询条件
   */
  async pageWithAuditor(
    options: PageOptions,
    where?: any,
  ): Promise<PageResult<IssueTypeRow>> {
    const result = (await this.page(options, where)) as PageResult<IssueTypeRow>;
    const auditorIds = Array.from(
      new Set(
        result.list
          .map((item) => item.auditorId)
          .filter((id): id is number => typeof id === 'number'),
      ),
    );
    if (auditorIds.length === 0) {
      result.list.forEach((item) => (item.auditorName = ''));
      return result;
    }
    // 批量查询审核人姓名，select 白名单仅取 id/name，避免拉取敏感字段
    const users = await this.prisma.sysUser.findMany({
      where: { id: { in: auditorIds } },
      select: { id: true, name: true },
    });
    const nameMap = new Map(users.map((u) => [u.id, u.name]));
    result.list.forEach((item) => {
      item.auditorName = item.auditorId ? nameMap.get(item.auditorId) ?? '' : '';
    });
    return result;
  }
}
