import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma.service';
import { BaseService } from '@/common/crud';
import { sanitizeRichText, stripHtml } from '@/common/utils/rich-text.util';
import { countStemBlanks as countBlanksInStem } from '@/common/utils/objective-judge.util';
import {
  parseQuestionOptions,
  sanitizeOptionsPayload,
} from '@/common/utils/question-option.util';
import { ROOT_ONLY } from '../utils/rule-where';

/** 可自动判分题型（客观题）：单选/多选/判断/填空 */
const OBJECTIVE_TYPES = ['single', 'multiple', 'judge', 'blank'];

/** 需要维护「选项列表」的题型：单选/多选/判断；填空以「题干挖空 + 多空答案」表达，不需要选项 */
const OPTION_REQUIRED_TYPES = ['single', 'multiple', 'judge'];


/** 填空题多空答案分隔符：每空一行 */
export const BLANK_ANSWER_SEPARATOR = '\n';

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

  /**
   * 取指定字典类型下「已启用项」的 name↔value 双向映射
   * 用于导入（中文名称 → value）与导出（value → 中文名称）。
   * @param typeKey 字典类型 key（question_type / difficulty）
   * @returns { nameToValue, valueToName } 两个映射表
   */
  async getDictMaps(
    typeKey: string,
  ): Promise<{ nameToValue: Map<string, string>; valueToName: Map<string, string> }> {
    const items = await this.prisma.dictInfo.findMany({
      where: { status: 1, type: { key: typeKey } },
      select: { name: true, value: true },
    });
    const nameToValue = new Map<string, string>();
    const valueToName = new Map<string, string>();
    for (const it of items) {
      nameToValue.set(it.name.trim(), it.value);
      valueToName.set(it.value, it.name);
    }
    return { nameToValue, valueToName };
  }

  /** 判断题型是否为客观题（可自动判分） */
  isObjectiveType(type: string): boolean {
    return OBJECTIVE_TYPES.includes(type);
  }

  /** 判断题型是否需要维护选项列表（单选/多选/判断；填空不需要） */
  requiresOptions(type: string): boolean {
    return OPTION_REQUIRED_TYPES.includes(type);
  }

  /**
   * 统计题干中的填空空位数（连续 ≥3 个下划线记为一个空）
   *
   * 委托给 objective-judge.util 的同名函数：该规则同时决定考生端渲染几个输入框、
   * 以及判分时按 \n 切出几段来比对，三处必须同源，不能各留一份正则。
   */
  countStemBlanks(stem: string): number {
    return countBlanksInStem(stem);
  }

  /**
   * 校验题库是否存在
   * @param id 题库 ID
   * @returns 存在返回 true
   */
  async isQuestionBankExists(id: number): Promise<boolean> {
    const bank = await this.prisma.questionBank.findUnique({
      where: { id },
      select: { id: true },
    });
    return !!bank;
  }

  /**
   * 校验一组知识点是否全部存在
   * @param ids 知识点 ID 列表（去重后校验）
   * @returns 全部存在返回 true；空列表视为通过（知识点可选）
   */
  async areKnowledgePointsExist(ids: number[]): Promise<boolean> {
    const uniq = Array.from(new Set(ids));
    if (!uniq.length) return true;
    const count = await this.prisma.knowledgePoint.count({
      where: { id: { in: uniq } },
    });
    return count === uniq.length;
  }

  /**
   * 取一组题目各自所属的题库 ID（去重、过滤空值）
   * 供控制器在只拿到题目 ID 的场景（删除/审核/详情）反查题库做权限校验。
   * @param ids 题目 ID 列表
   * @returns 去重后的题库 ID 列表；题目不存在或未归属题库时不计入
   */
  async getBankIdsByQuestionIds(ids: number[]): Promise<number[]> {
    const uniqIds = Array.from(new Set(ids));
    if (!uniqIds.length) return [];
    const rows = await this.prisma.question.findMany({
      where: { id: { in: uniqIds } },
      select: { questionBankId: true },
    });
    // questionBankId 可空（存量题目允许无题库），null 直接丢弃交由调用方放行
    const bankIds = rows
      .map((r) => r.questionBankId)
      .filter((bankId): bankId is number => bankId != null);
    return Array.from(new Set(bankIds));
  }

  /**
   * 净化题目的富文本字段并同步 stemText 镜像
   *
   * 收敛在此处而非各调用点：add / update / 导入 / AI 生成都要过这一关，
   * 漏一条路径就等于开了 XSS 口子。stemText 必须与 stem 同步生成，
   * 否则搜索会打到未更新的旧文本。
   *
   * answer 不净化——它是判分比对基准，必须保持原始纯文本。
   * judge 的 options 也不净化（其 answer 直接存选项文本，见 question-option.util）。
   *
   * @param data 题目字段（可能只含部分字段，用于 update）
   * @returns 净化后的字段副本
   */
  private sanitizeRichFields<T extends Record<string, any>>(data: T): T {
    const next: Record<string, any> = { ...data };

    if (typeof next.stem === 'string') {
      next.stem = sanitizeRichText(next.stem);
      next.stemText = stripHtml(next.stem);
    }
    if (typeof next.analysis === 'string') {
      next.analysis = sanitizeRichText(next.analysis);
    }
    if (typeof next.scoringCriteria === 'string') {
      next.scoringCriteria = sanitizeRichText(next.scoringCriteria);
    }
    // options 存的是 JSON 字符串，需逐个选项的 value 净化后再序列化回去
    if (typeof next.options === 'string' && next.type !== 'judge') {
      next.options = sanitizeOptionsPayload(next.options, next.type);
    }

    return next as T;
  }

  /**
   * 新增题目（含知识点多对多关联）
   * @param data 题目字段 + knowledgePointIds
   * @returns 新建的题目
   */
  async add(data: any): Promise<any> {
    const { knowledgePointIds = [], ...rest } = this.sanitizeRichFields(data);
    const ids = Array.from(new Set<number>(knowledgePointIds));
    return this.prisma.question.create({
      data: {
        ...rest,
        knowledgePoints: { create: ids.map((knowledgePointId) => ({ knowledgePointId })) },
      },
    });
  }

  /**
   * 更新题目（先清空再重建知识点关联）
   * @param id 题目 ID
   * @param data 题目字段 + knowledgePointIds
   * @returns 更新后的题目
   */
  async update(id: number, data: any): Promise<any> {
    // 小题只能经材料题入口（saveComposite）整体维护。
    // 放开独立更新会绕过「材料题分值 = 小题之和」的重算，导致卷面总分与判分基数不一致。
    const existing = await this.prisma.question.findUnique({
      where: { id },
      select: { parentId: true },
    });
    if (existing?.parentId != null) {
      throw new BadRequestException('该题是材料题下的小题，请通过所属材料题编辑');
    }

    const { knowledgePointIds, ...rest } = this.sanitizeRichFields(data);
    return this.prisma.$transaction(async (tx) => {
      if (knowledgePointIds !== undefined) {
        const ids = Array.from(new Set<number>(knowledgePointIds));
        await tx.questionKnowledgePoint.deleteMany({ where: { questionId: id } });
        if (ids.length) {
          await tx.questionKnowledgePoint.createMany({
            data: ids.map((knowledgePointId) => ({ questionId: id, knowledgePointId })),
          });
        }
      }
      return tx.question.update({ where: { id }, data: rest });
    });
  }

  /**
   * 校验一批小题是否可以安全删除
   *
   * 小题被引用时删除会造成两类损失，必须提前拦住而不是让数据库报错或静默级联：
   * - PracticeAnswer 是 onDelete: Cascade → 静默删掉考生的练习作答历史；
   * - AnswerItem 无 onDelete（RESTRICT）→ 抛外键错误，表现为「保存材料题莫名失败」；
   * - PaperQuestion 无 onDelete（RESTRICT）→ 同上（小题理论上不该被直接挂卷，兜底校验）。
   *
   * @param ids 待删除的小题 ID
   * @param client 事务客户端（须与删除同一事务，否则校验与删除之间存在
   *   TOCTOU 窗口：期间考生提交作答会被级联静默删除）
   * @throws BadRequestException 命中引用时抛出可读中文提示
   */
  private async ensureSubQuestionsRemovable(
    ids: number[],
    client: Prisma.TransactionClient,
  ): Promise<void> {
    const [examUsed, practiceUsed, paperUsed] = await Promise.all([
      client.answerItem.findFirst({
        where: { questionId: { in: ids } },
        select: { questionId: true },
      }),
      client.practiceAnswer.findFirst({
        where: { questionId: { in: ids } },
        select: { questionId: true },
      }),
      client.paperQuestion.findFirst({
        where: { questionId: { in: ids } },
        select: { questionId: true },
      }),
    ]);

    if (examUsed) {
      throw new BadRequestException(
        '待删除的小题已有考试作答记录，不能删除。如需调整题目结构，请新建一道材料题',
      );
    }
    if (practiceUsed) {
      throw new BadRequestException(
        '待删除的小题已有练习作答记录，删除会一并清除考生的练习历史。如需调整题目结构，请新建一道材料题',
      );
    }
    if (paperUsed) {
      throw new BadRequestException('待删除的小题已被试卷引用，不能删除');
    }
  }

  /**
   * 重算并落库材料题分值（= 其小题建议分值之和）
   *
   * 材料题分值必须派生：若允许「材料题给总分、小题按比例分」，改总分时小题分会出现
   * 浮点余数，判分基数与卷面总分对不齐。
   *
   * 收敛成单一函数是有意的——小题的新增/删除/改分值三条路径都要调它，
   * 否则材料题分值会与小题之和不一致。
   *
   * @param tx 事务客户端（须与小题写入同一事务，避免中间态被读到）
   * @param parentId 材料题 ID
   */
  private async recalcCompositeScore(
    tx: Prisma.TransactionClient,
    parentId: number,
  ): Promise<void> {
    const children = await tx.question.findMany({
      where: { parentId },
      select: { suggestedScore: true },
    });
    const total = children.reduce((sum, c) => sum + c.suggestedScore, 0);
    // 保留 2 位小数，与分值字段的既有精度约定一致
    await tx.question.update({
      where: { id: parentId },
      data: { suggestedScore: Math.round(total * 100) / 100 },
    });
  }

  /**
   * 保存材料题及其小题（按 id 差分，不做删旧建新）
   *
   * **必须按 id 差分**，不能整体 deleteMany 再重建：
   * - PracticeAnswer.question 是 onDelete: Cascade，删小题会静默删掉考生的练习作答历史；
   * - AnswerItem.question 无 onDelete（默认 RESTRICT），材料题一旦被考试用过，
   *   删除会抛外键错误，表现为「编辑材料题莫名失败」。
   *
   * 故：保留项按 id 原地更新，新增项创建，移除项才删除——且移除前校验是否已有作答记录，
   * 有则拒绝并提示，把数据取舍交给使用者而不是静默丢弃。
   *
   * @param id 材料题 ID（新建时为 null）
   * @param data 材料题字段（stem 为共享材料）
   * @param children 小题列表，带 id 表示保留既有小题，无 id 表示新增；数组顺序即 sortNo
   * @returns 材料题 ID
   */
  async saveComposite(
    id: number | null,
    data: Record<string, any>,
    children: Array<Record<string, any>>,
  ): Promise<number> {
    if (children.length === 0) {
      throw new BadRequestException('材料题至少需要一个小题');
    }
    // 禁止嵌套：小题自身不能再是材料题
    const nested = children.findIndex((c) => c.type === 'composite');
    if (nested >= 0) {
      throw new BadRequestException(`第 ${nested + 1} 个小题不能再选「材料题」`);
    }

    // 小题 id 归属校验（防越权写入）
    //
    // children[].id 来自客户端，若只判「是正整数」就拿去 update，攻击者可以传入
    // 任意题目 id——那道题会被打上本材料题的 parentId，从题库列表消失并被改写内容。
    // 三类都必须挡住：别的材料题的小题、独立题、其他题库（无权限）的题目。
    // 故要求每个传入的 id 都必须已经是「本材料题的小题」。
    const submittedIds = children
      .map((c) => Number(c.id))
      .filter((cid) => Number.isInteger(cid) && cid > 0);
    if (submittedIds.length > 0) {
      if (id == null) {
        // 新建材料题时不存在既有小题，任何 id 都是伪造的
        throw new BadRequestException('新建材料题时不能指定小题 ID');
      }
      const owned = await this.prisma.question.findMany({
        where: { id: { in: submittedIds }, parentId: id },
        select: { id: true },
      });
      const ownedSet = new Set(owned.map((o) => o.id));
      const alien = submittedIds.find((cid) => !ownedSet.has(cid));
      if (alien !== undefined) {
        throw new BadRequestException('小题数据非法：包含不属于该材料题的题目');
      }
      // 重复 id 会让同一道小题被更新两次、后者覆盖前者且 sortNo 错乱
      if (new Set(submittedIds).size !== submittedIds.length) {
        throw new BadRequestException('小题数据非法：存在重复的小题 ID');
      }
    }

    const parentData: Record<string, any> = this.sanitizeRichFields({
      ...data,
      type: 'composite',
      // 材料题只承载材料，本身无选项无答案；分值由小题之和派生（下方重算）
      options: null,
      answer: '',
      scoringCriteria: null,
      parentId: null,
      sortNo: 0,
      suggestedScore: 0,
    });
    const { knowledgePointIds = [], ...parentRest } = parentData;
    const kpIds = Array.from(new Set<number>(knowledgePointIds));

    return this.prisma.$transaction(async (tx) => {
      let parentId: number;
      if (id == null) {
        const created = await tx.question.create({ data: parentRest as any });
        parentId = created.id;
      } else {
        parentId = id;
        await tx.question.update({ where: { id }, data: parentRest as any });
      }

      // 材料题知识点关联
      await tx.questionKnowledgePoint.deleteMany({ where: { questionId: parentId } });
      if (kpIds.length) {
        await tx.questionKnowledgePoint.createMany({
          data: kpIds.map((knowledgePointId) => ({ questionId: parentId, knowledgePointId })),
        });
      }

      // 删除被移除的小题。
      //
      // 可删性校验放在事务内：放在事务外会留下 TOCTOU 窗口——校验通过后、
      // 删除执行前若有考生刚好提交作答，PracticeAnswer 会被级联静默删掉。
      const keepIds = submittedIds;
      const removed = await tx.question.findMany({
        where: { parentId, ...(keepIds.length ? { id: { notIn: keepIds } } : {}) },
        select: { id: true },
      });
      if (removed.length > 0) {
        await this.ensureSubQuestionsRemovable(
          removed.map((r) => r.id),
          tx,
        );
        await tx.question.deleteMany({ where: { id: { in: removed.map((r) => r.id) } } });
      }

      // 小题按数组顺序写 sortNo，卷面与答题卡据此排序。
      // 带 id 的原地更新（保住其作答记录），无 id 的新建。
      for (let i = 0; i < children.length; i++) {
        const { knowledgePointIds: _kp, id: childId, ...childRest } = this.sanitizeRichFields(
          children[i],
        );
        const payload = {
          ...(childRest as any),
          parentId,
          sortNo: i + 1,
          // 小题继承材料题的题库与状态，避免出现「材料题正式、小题待审」的割裂
          questionBankId: parentRest.questionBankId ?? null,
          status: parentRest.status ?? 'formal',
        };
        const numericId = Number(childId);
        if (Number.isInteger(numericId) && numericId > 0) {
          await tx.question.update({ where: { id: numericId }, data: payload });
        } else {
          await tx.question.create({ data: payload });
        }
      }

      await this.recalcCompositeScore(tx, parentId);
      return parentId;
    });
  }

  /** include 关联知识点（经中间表）用于列表/详情带出 */
  private readonly knowledgePointInclude = {
    knowledgePoints: {
      include: { knowledgePoint: { select: { id: true, name: true } } },
    },
  } as const;

  /**
   * 把关联查询结果聚合为 knowledgePointIds / knowledgePointNames 两个便捷字段
   * @param row question.findMany/findUnique(include 知识点) 的单条结果
   */
  private mapKnowledge<
    T extends { knowledgePoints: { knowledgePoint: { id: number; name: string } }[] },
  >(row: T) {
    const { knowledgePoints, ...q } = row;
    return {
      ...q,
      knowledgePointIds: knowledgePoints.map((r) => r.knowledgePoint.id),
      knowledgePointNames: knowledgePoints.map((r) => r.knowledgePoint.name).join('、'),
    };
  }

  /**
   * 分页查询题目（带知识点 id 列表与名称）
   * keyword 模糊匹配题干；type/difficulty/knowledgePointId/status 精确筛选。
   * knowledgePointId 命中「含该知识点」的题目（多对多）。
   * @param filter 筛选条件
   * @param page 页码
   * @param pageSize 每页条数
   * @returns 列表（每条附 knowledgePointIds/knowledgePointNames）及分页信息
   */
  async pageWithKnowledge(
    filter: {
      keyword?: string;
      type?: string;
      difficulty?: string;
      knowledgePointId?: number;
      questionBankId?: number;
      status?: string;
    },
    page?: number,
    pageSize?: number,
  ) {
    const p = Math.max(page || 1, 1);
    const ps = Math.min(Math.max(pageSize || 10, 1), 100);
    const skip = (p - 1) * ps;

    // 题库列表只列根节点：小题从属于材料题、通过材料题的编辑界面维护，
    // 不作为独立条目出现在题目列表里（否则会被当成普通题勾进固定卷）
    const where: Prisma.QuestionWhereInput = { ...ROOT_ONLY };
    // 搜索打 stemText（题干纯文本镜像）而非 stem：stem 支持富文本后含 HTML 标签，
    // 搜 "p"、"img" 之类会命中所有带该标签的题。存量数据由迁移回填 stemText。
    if (filter.keyword) where.stemText = { contains: filter.keyword };
    if (filter.type) where.type = filter.type;
    if (filter.difficulty) where.difficulty = filter.difficulty;
    if (filter.knowledgePointId)
      where.knowledgePoints = { some: { knowledgePointId: filter.knowledgePointId } };
    if (filter.questionBankId) where.questionBankId = filter.questionBankId;
    if (filter.status) where.status = filter.status;

    const [rows, total] = await Promise.all([
      this.prisma.question.findMany({
        where,
        skip,
        take: ps,
        orderBy: { id: 'desc' },
        include: {
          ...this.knowledgePointInclude,
          // 材料题的小题数量：列表用它展示「共 N 小问」。
          // 只取计数不取实体，避免把全部小题内容也拉进列表响应。
          _count: { select: { children: true } },
        },
      }),
      this.prisma.question.count({ where }),
    ]);

    const list = rows.map((row) => {
      const { _count, ...rest } = row;
      return { ...this.mapKnowledge(rest), childrenCount: _count.children };
    });
    return { list, pagination: { page: p, pageSize: ps, total } };
  }

  /**
   * 按 id 查询题目详情（带知识点 id 列表与名称）
   * @param id 题目 ID
   * @returns 题目详情，不存在返回 null
   */
  async detailWithKnowledge(id: number) {
    const row = await this.prisma.question.findUnique({
      where: { id },
      include: {
        ...this.knowledgePointInclude,
        // 材料题需带出小题供编辑页回填；非材料题该数组为空，不影响原有形状
        children: { orderBy: { sortNo: 'asc' } },
      },
    });
    if (!row) return null;
    const { children, ...rest } = row;
    return { ...this.mapKnowledge(rest), children };
  }

  /**
   * 导出指定题库的全部题目（不分页，题型/难度转中文名称，知识点顿号拼接）
   * @param questionBankId 题库 ID
   * @param limit 最大导出条数（默认 10000）
   * @returns 扁平化题目记录数组（typeName/difficultyName/knowledgePointNames）
   */
  async exportList(questionBankId: number, limit = 10000) {
    const [rows, typeMaps, diffMaps] = await Promise.all([
      this.prisma.question.findMany({
        where: { questionBankId },
        take: limit,
        orderBy: { id: 'desc' },
        include: this.knowledgePointInclude,
      }),
      this.getDictMaps('question_type'),
      this.getDictMaps('difficulty'),
    ]);
    return rows.map((row) => {
      const q = this.mapKnowledge(row);
      // 富文本字段导出为纯文本：Excel 单元格里出现 <p>/<img> 标签既难看也没用。
      // 图片会在剥离后丢失，属预期——Excel 承载不了内嵌图。
      // 选项同理转成「A. 文本」的可读多行形式，而不是导出 JSON 原文。
      const optionLines = parseQuestionOptions(q.options ?? null, q.type)
        .map((o) => `${o.key}. ${stripHtml(o.value)}`)
        .join('\n');
      return {
        stem: q.stemText || stripHtml(q.stem),
        typeName: typeMaps.valueToName.get(q.type) ?? q.type,
        options: optionLines,
        answer: q.answer,
        analysis: stripHtml(q.analysis),
        difficultyName: diffMaps.valueToName.get(q.difficulty) ?? q.difficulty,
        suggestedScore: q.suggestedScore,
        knowledgePointNames: q.knowledgePointNames,
      };
    });
  }

  /**
   * 批量导入题目到指定题库（逐行校验，有错跳过）
   * 题型/难度按字典中文名称解析为 value；客观题（单选/多选/判断）必须填选项；
   * 填空题按题干空位数与答案行数一致校验；知识点按名称匹配（不存在则忽略该知识点）。
   * @param questionBankId 归属题库 ID
   * @param rows 按模板解析出的题目行数组
   * @returns 成功数、失败数与失败行明细
   */
  async importQuestions(
    questionBankId: number,
    rows: {
      stem?: string;
      typeName?: string;
      options?: string;
      answer?: string;
      analysis?: string;
      difficultyName?: string;
      suggestedScore?: string;
      knowledgePointNames?: string;
    }[],
  ): Promise<{ success: number; failed: number; errors: { row: number; reason: string }[] }> {
    // 预取字典映射与知识点名称→id 映射，避免逐行查库
    const [typeMaps, diffMaps, kps] = await Promise.all([
      this.getDictMaps('question_type'),
      this.getDictMaps('difficulty'),
      this.prisma.knowledgePoint.findMany({ select: { id: true, name: true } }),
    ]);
    const kpNameToId = new Map(kps.map((k) => [k.name.trim(), k.id]));

    const errors: { row: number; reason: string }[] = [];
    const valid: {
      stem: string;
      type: string;
      options: string | null;
      answer: string;
      analysis: string | null;
      difficulty: string;
      suggestedScore: number;
      knowledgePointIds: number[];
    }[] = [];

    for (let idx = 0; idx < rows.length; idx++) {
      const rowNo = idx + 1;
      const raw = rows[idx];
      const stem = (raw.stem ?? '').trim();
      const typeName = (raw.typeName ?? '').trim();
      const options = (raw.options ?? '').trim();
      const answer = (raw.answer ?? '').trim();
      const analysis = (raw.analysis ?? '').trim();
      const difficultyName = (raw.difficultyName ?? '').trim();
      const scoreStr = (raw.suggestedScore ?? '').trim();
      const kpNamesStr = (raw.knowledgePointNames ?? '').trim();

      if (!stem) {
        errors.push({ row: rowNo, reason: '题干不能为空' });
        continue;
      }
      if (stem.length > 2000) {
        errors.push({ row: rowNo, reason: '题干不超过 2000 字' });
        continue;
      }
      const type = typeMaps.nameToValue.get(typeName);
      if (!type) {
        errors.push({ row: rowNo, reason: `题型【${typeName || '空'}】无效或已停用` });
        continue;
      }
      // Excel 模板是「一行一题」的平表，表达不了材料题-小题的层级结构。
      // 明确报错而不是建出一道没有小题的空材料题（那样考生取卷时该题会凭空消失）。
      if (type === 'composite') {
        errors.push({
          row: rowNo,
          reason: '材料题不支持批量导入，请在题目管理中手动录入材料与小题',
        });
        continue;
      }
      const difficulty = diffMaps.nameToValue.get(difficultyName);
      if (!difficulty) {
        errors.push({ row: rowNo, reason: `难度【${difficultyName || '空'}】无效或已停用` });
        continue;
      }
      if (!answer) {
        errors.push({ row: rowNo, reason: '标准答案不能为空' });
        continue;
      }
      if (this.requiresOptions(type) && !options) {
        errors.push({ row: rowNo, reason: '该题型必须填写选项' });
        continue;
      }
      // 填空题校验：题干空位数与答案行数一致且每空非空
      if (type === 'blank') {
        const blankCount = this.countStemBlanks(stem);
        if (blankCount < 1) {
          errors.push({ row: rowNo, reason: '填空题题干需用连续下划线（如 ___）标出至少一个空' });
          continue;
        }
        const answers = answer.split('\n').map((s) => s.trim());
        if (answers.length !== blankCount) {
          errors.push({
            row: rowNo,
            reason: `填空题答案数量（${answers.length}）与空位数量（${blankCount}）不一致`,
          });
          continue;
        }
        if (answers.some((a) => !a)) {
          errors.push({ row: rowNo, reason: '填空题每个空的答案均不能为空' });
          continue;
        }
      }
      const score = Number(scoreStr);
      if (!scoreStr || Number.isNaN(score) || score <= 0) {
        errors.push({ row: rowNo, reason: '分值必须为大于 0 的数字' });
        continue;
      }
      // 小数位数按字符串判定，避免浮点误差（如 0.07*100 !== 7）导致合法值被误拒
      if (!/^\d+(\.\d{1,2})?$/.test(scoreStr)) {
        errors.push({ row: rowNo, reason: '分值最多保留 2 位小数' });
        continue;
      }
      // 知识点按名称匹配（顿号/逗号/分号分隔），不存在的名称忽略
      const kpIds: number[] = [];
      if (kpNamesStr) {
        for (const nm of kpNamesStr.split(/[、,，;；]/).map((s) => s.trim())) {
          if (!nm) continue;
          const kpId = kpNameToId.get(nm);
          if (kpId !== undefined) kpIds.push(kpId);
        }
      }

      valid.push({
        stem,
        type,
        options: this.requiresOptions(type) ? options : null,
        answer,
        analysis: analysis || null,
        difficulty,
        suggestedScore: score,
        knowledgePointIds: Array.from(new Set(kpIds)),
      });
    }

    // 合法行逐条入库（含知识点多对多关联），题库归属统一为 questionBankId，状态正式
    for (const q of valid) {
      const { knowledgePointIds, ...rest } = q;
      await this.prisma.question.create({
        data: {
          ...rest,
          questionBankId,
          status: QUESTION_STATUS.FORMAL,
          knowledgePoints: {
            create: knowledgePointIds.map((knowledgePointId) => ({ knowledgePointId })),
          },
        },
      });
    }
    return { success: valid.length, failed: errors.length, errors };
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
