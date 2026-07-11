import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';

/** 操作日志查询条件 */
export interface OperationLogQuery {
  operator?: string;
  type?: string;
  startTime?: string;
  endTime?: string;
  page?: number;
  pageSize?: number;
}

/**
 * 操作日志服务（系统管理）
 * 只读：支持操作人模糊、类型精确、操作时间范围筛选，按操作时间倒序。
 */
@Injectable()
export class OperationLogService {
  constructor(private readonly prisma: PrismaService) {}

  /** 分页查询操作日志 */
  async pagelist(query: OperationLogQuery) {
    const page = Math.max(query.page || 1, 1);
    const pageSize = Math.min(Math.max(query.pageSize || 10, 1), 100);
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (query.operator) where.operator = { contains: query.operator };
    if (query.type) where.type = query.type;

    // 操作时间范围：startTime 取当日 00:00:00，endTime 取次日 00:00:00（左闭右开）
    if (query.startTime || query.endTime) {
      where.operateTime = {};
      if (query.startTime) where.operateTime.gte = new Date(`${query.startTime}T00:00:00`);
      if (query.endTime) {
        const end = new Date(`${query.endTime}T00:00:00`);
        end.setDate(end.getDate() + 1);
        where.operateTime.lt = end;
      }
    }

    const [list, total] = await Promise.all([
      this.prisma.sysOperationLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { operateTime: 'desc' },
        select: {
          id: true,
          operator: true,
          type: true,
          target: true,
          content: true,
          operateTime: true,
          sourceIp: true,
        },
      }),
      this.prisma.sysOperationLog.count({ where }),
    ]);

    return { list, pagination: { page, pageSize, total } };
  }
}
