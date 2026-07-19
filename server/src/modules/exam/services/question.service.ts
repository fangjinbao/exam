import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma.service';
import { BaseService } from '@/common/crud';

/** 客观题题型（选项必填）；其余（qa/essay）为主观题，选项免填 */
const OBJECTIVE_TYPES = ['single', 'multiple', 'judge', 'blank'];

/** 题目状态枚举 */
export const QUESTION_STATUS = { FORMAL: 'formal', PENDING: 'pending' } as const;

/**
 * 题目服务
 * 在基础增删改查之上，提供题型/难度字典值校验、客观题选项分支校验、
 * 列表带出知识点名称，以及审核（通过/退回）流转。
 */
@Injectable()
export class QuestionService extends BaseService {
  constructor(protected prisma: PrismaService) {
    super(prisma, 'question');
  }

  /**
   * 校验字典 value 是否为指定类型下已启用的项
   * @param typeKey 字典类型 key（question_type / difficulty）
   * @param value 字典项 value
   * @returns 合法启用返回 true
   */
  async isDictValueEnabled(typeKey: string, value: string): Promise<boolean> {
    const item = await this.prisma.dictInfo.findFirst({
      where: { value, status: 1, type: { key: typeKey } },
      select: { id: true },
    });
    return !!item;
  }

  /** 判断题型是否为客观题（选项必填） */
  isObjectiveType(type: string): boolean {
    return OBJECTIVE_TYPES.includes(type);
  }

  /**
   * 校验知识点是否存在
   * @param id 知识点 ID
   * @returns 存在返回 true
   */
  async isKnowledgePointExists(id: number): Promise<boolean> {
    const kp = await this.prisma.knowledgePoint.findUnique({
      where: { id },
      select: { id: true },
    });
    return !!kp;
  }

  /**
   * 分页查询题目（带知识点名称）
   * keyword 模糊匹配题干；type/difficulty/knowledgePointId/status 精确筛选。
   * @param filter 筛选条件
   * @param page 页码
   * @param pageSize 每页条数
   * @returns 列表（每条附 knowledgePointName）及分页信息
   */
  async pageWithKnowledge(
    filter: {
      keyword?: string;
      type?: string;
      difficulty?: string;
      knowledgePointId?: number;
      status?: string;
    },
    page?: number,
    pageSize?: number,
  ) {
    const p = Math.max(page || 1, 1);
    const ps = Math.min(Math.max(pageSize || 10, 1), 100);
    const skip = (p - 1) * ps;

    const where: Prisma.QuestionWhereInput = {};
    if (filter.keyword) where.stem = { contains: filter.keyword };
    if (filter.type) where.type = filter.type;
    if (filter.difficulty) where.difficulty = filter.difficulty;
    if (filter.knowledgePointId) where.knowledgePointId = filter.knowledgePointId;
    if (filter.status) where.status = filter.status;

    const [rows, total] = await Promise.all([
      this.prisma.question.findMany({
        where,
        skip,
        take: ps,
        orderBy: { id: 'desc' },
        include: { knowledgePoint: { select: { name: true } } },
      }),
      this.prisma.question.count({ where }),
    ]);

    const list = rows.map(({ knowledgePoint, ...q }) => ({
      ...q,
      knowledgePointName: knowledgePoint?.name ?? null,
    }));
    return { list, pagination: { page: p, pageSize: ps, total } };
  }

  /**
   * 按 id 查询题目详情（带知识点名称）
   * @param id 题目 ID
   * @returns 题目详情，不存在返回 null
   */
  async detailWithKnowledge(id: number) {
    const row = await this.prisma.question.findUnique({
      where: { id },
      include: { knowledgePoint: { select: { name: true } } },
    });
    if (!row) return null;
    const { knowledgePoint, ...q } = row;
    return { ...q, knowledgePointName: knowledgePoint?.name ?? null };
  }

  /**
   * 删除前的关联校验
   * 题目被固定试卷引用时不可删除（SRS 3.5.1 业务规则）。
   * 注：试卷表尚未建立，当前无引用来源，此处为逻辑预留，待试卷模块落地后补充引用统计。
   * @param _id 题目 ID
   */
  async ensureDeletable(_id: number): Promise<void> {
    // TODO[试卷模块]: 试卷表建立后，校验 paper_question 是否引用该题目，命中则抛出
    //   throw new Error('该题目已被试卷引用，无法删除');
    return;
  }

  /**
   * 审核通过：待审 → 正式
   * @param id 题目 ID
   * @returns ok=false 时带中文原因
   */
  async approve(id: number): Promise<{ ok: boolean; message?: string }> {
    const target = await this.prisma.question.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!target) return { ok: false, message: '题目不存在' };
    if (target.status !== QUESTION_STATUS.PENDING) {
      return { ok: false, message: '仅待审题目可执行审核通过' };
    }
    await this.prisma.question.update({
      where: { id },
      data: { status: QUESTION_STATUS.FORMAL, rejectReason: null },
    });
    return { ok: true };
  }

  /**
   * 审核退回：保持待审状态并记录退回原因
   * @param id 题目 ID
   * @param reason 退回原因
   * @returns ok=false 时带中文原因
   */
  async reject(id: number, reason: string): Promise<{ ok: boolean; message?: string }> {
    const target = await this.prisma.question.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!target) return { ok: false, message: '题目不存在' };
    if (target.status !== QUESTION_STATUS.PENDING) {
      return { ok: false, message: '仅待审题目可执行退回' };
    }
    await this.prisma.question.update({
      where: { id },
      data: { rejectReason: reason },
    });
    return { ok: true };
  }
}
