import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma.service';
import { BaseService } from '@/common/crud';
import {
  buildRuleWhere,
  allocateByWeight,
  pickRandom,
  ROOT_ONLY,
  type RuleFilter,
} from '../utils/rule-where';
import { stripHtml } from '@/common/utils/rich-text.util';
import { PaperAccessService } from './paper-access.service';
import { OrgScopeService, type AdminPayload } from './org-scope.service';

/**
 * 卷面题型顺序（大题顺序）
 *
 * 与管理端题型字典 value 的顺序一致（admin/src/utils/paperStructure.ts 按同一序列
 * 分大题）。落库 sortNo 与两端渲染共用这一个口径，改这里要同步改字典顺序。
 * 不在表内的题型（如 composite 材料题）排末尾。
 */
const PAPER_TYPE_ORDER = ['single', 'multiple', 'judge', 'blank', 'qa', 'essay'];

/** 试卷列表筛选条件（keyword 模糊匹配名称，type/status/visibleScope 精确，onlyMine 仅看自己创建） */
export interface PaperListFilter {
  keyword?: string;
  type?: string;
  status?: string;
  visibleScope?: string;
  onlyMine?: boolean;
}

/** 试卷共享属性入参（新增/编辑时可选，缺省 self + manage，见 normalizeShare） */
export interface PaperShareInput {
  visibleScope?: string;
  shareLevel?: string;
}

/**
 * 固定试卷题目项入参
 *
 * 不含 sortNo：卷面顺序由服务端按题型统一重排（见 sortItemsByQuestionType），
 * 不接受调用方指定，否则两端顺序又会分叉。
 */
export interface FixedItemInput {
  questionId: number;
  score: number;
}

/**
 * 随机试卷的题库范围入参（题库 + 抽题权重）
 *
 * 权重按题库设定，每条抽题规则的数量都按这个比例拆分到各库，
 * 避免某个库题多就被抽光、其余库几乎不出题。
 */
export interface BankWeightInput {
  bankId: number;
  weight: number;
}

/** 随机试卷抽题规则入参 */
export interface RuleInput {
  questionType: string;
  difficulty: string;
  knowledgePointId: number;
  drawCount: number;
  scorePerQuestion: number;
}

/**
 * 试卷服务
 * 承载固定/随机试卷的组卷落库（事务内写主表 + 题库范围 + 题目项/抽题规则并计算总分与题量）、
 * 草稿态编辑、AI 组卷方案推荐、发布校验、随机卷可用题量校验，以及被考试引用时的删除保护。
 */
@Injectable()
export class PaperService extends BaseService {
  constructor(
    protected prisma: PrismaService,
    private readonly access: PaperAccessService,
    private readonly orgScope: OrgScopeService,
  ) {
    super(prisma, 'paper');
  }

  /**
   * 组装试卷列表筛选条件（含共享可见性过滤）
   * @param filter 列表筛选条件
   * @param admin 当前登录管理员；传入时叠加可见范围限制
   */
  private async buildListWhere(
    filter: PaperListFilter,
    admin?: AdminPayload,
  ): Promise<Prisma.PaperWhereInput> {
    const where: Prisma.PaperWhereInput = {};
    if (filter.keyword) where.name = { contains: filter.keyword };
    if (filter.type) where.type = filter.type;
    if (filter.status) where.status = filter.status;
    if (filter.visibleScope) where.visibleScope = filter.visibleScope;

    if (admin) {
      if (filter.onlyMine) {
        // 「仅看我创建的」本身即最小可见集，无需再叠加共享范围条件
        where.createBy = admin.userId;
      } else {
        const visible = await this.access.buildVisibleWhere(admin);
        if (visible.OR) where.OR = visible.OR;
      }
    }
    return where;
  }

  /**
   * 给试卷列表补齐创建人姓名与当前用户能力位
   * @param rows 试卷记录数组
   * @param admin 当前登录管理员
   */
  private async decorateList<
    T extends { createBy: number | null; visibleScope: string; shareLevel: string },
  >(rows: T[], admin?: AdminPayload) {
    const createByIds = [...new Set(rows.map((r) => r.createBy).filter((v): v is number => !!v))];
    // 所属单位由创建人的部门实时上溯，不存在试卷表上——与共享可见性判定同源，
    // 详见 OrgScopeService.getOrgNamesByUserIds
    const [users, orgMap] = await Promise.all([
      createByIds.length
        ? this.prisma.sysUser.findMany({
            where: { id: { in: createByIds } },
            select: { id: true, name: true, username: true },
          })
        : Promise.resolve<Array<{ id: number; name: string | null; username: string }>>([]),
      this.orgScope.getOrgNamesByUserIds(createByIds),
    ]);
    const nameMap = new Map(users.map((u) => [u.id, u.name || u.username || '']));

    return Promise.all(
      rows.map(async (r) => {
        const caps = admin
          ? await this.access.getCapabilitiesFromPaper(r, admin)
          : { canManage: true, canEditShare: true };
        return {
          ...r,
          createByName: r.createBy ? nameMap.get(r.createBy) || '' : '',
          createByOrgName: r.createBy ? orgMap.get(r.createBy) || '' : '',
          canManage: caps.canManage,
          canEditShare: caps.canEditShare,
        };
      }),
    );
  }

  /**
   * 分页查询试卷
   * keyword 模糊匹配名称；type/status/visibleScope 精确筛选；
   * 传入 admin 时按共享可见范围过滤，并下发创建人姓名与能力位。
   */
  async pageList(
    filter: PaperListFilter,
    page?: number,
    pageSize?: number,
    admin?: AdminPayload,
  ) {
    const p = Math.max(page || 1, 1);
    const ps = Math.min(Math.max(pageSize || 10, 1), 100);
    const skip = (p - 1) * ps;

    const where = await this.buildListWhere(filter, admin);

    const [rows, total] = await Promise.all([
      this.prisma.paper.findMany({ where, skip, take: ps, orderBy: { id: 'desc' } }),
      this.prisma.paper.count({ where }),
    ]);
    const list = await this.decorateList(rows, admin);
    return { list, pagination: { page: p, pageSize: ps, total } };
  }

  /**
   * 按筛选条件导出试卷清单（不分页）
   * 筛选条件与 pageList 一致，返回全部匹配的试卷记录供前端生成表格文件。
   * @param filter 与列表一致的筛选条件
   * @param limit 最大导出条数（默认 10000，防止全表拉取）
   * @returns 试卷记录数组
   */
  async exportList(filter: PaperListFilter, limit = 10000, admin?: AdminPayload) {
    const where = await this.buildListWhere(filter, admin);
    const rows = await this.prisma.paper.findMany({
      where,
      take: limit,
      orderBy: { id: 'desc' },
    });
    return this.decorateList(rows, admin);
  }

  /**
   * 校验试卷名称是否已存在
   * @param name 试卷名称
   * @param excludeId 编辑时排除自身
   */
  async isNameExists(name: string, excludeId?: number): Promise<boolean> {
    const existing = await this.prisma.paper.findFirst({
      where: { name, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    return !!existing;
  }

  /**
   * 查询试卷详情
   *
   * 含题库范围；已有实体题目的卷子（固定卷、已生成的随机卷）附题目项，
   * 随机卷另附抽题规则与可用题量。
   * @param id 试卷 ID
   * @returns 详情结构；不存在返回 null
   */
  async getDetail(id: number, admin?: AdminPayload) {
    const paper = await this.prisma.paper.findUnique({
      where: { id },
      include: {
        paperBanks: { include: { bank: { select: { id: true, name: true } } } },
      },
    });
    if (!paper) return null;

    const bankIds = paper.paperBanks.map((pb) => pb.bankId);
    const bankNames = paper.paperBanks.map((pb) => pb.bank.name);
    // 与 bankIds 同序的抽题权重，供随机卷编辑页回填
    const bankWeights = paper.paperBanks.map((pb) => pb.weight);

    let questions: any[] = [];
    let rules: any[] = [];

    /*
      questions 与 rules 不再互斥。

      随机卷生成后题目已固化在 PaperQuestion 里，与固定卷同构，预览/导出都该
      看到真实题目；但抽题规则同时还要留着，编辑页要用它回填、重新生成要按它重抽。
      两者只取其一的话，要么预览退回显示规则，要么编辑页的规则被清空。
      pending 态随机卷没有题目，questions 自然为空，前端据此拦住预览。
    */
    const hasEntityQuestions =
      paper.type === 'fixed' ||
      (await this.prisma.paperQuestion.count({ where: { paperId: id } })) > 0;

    if (hasEntityQuestions) {
      const rows = await this.prisma.paperQuestion.findMany({
        where: { paperId: id },
        orderBy: [{ sortNo: 'asc' }, { id: 'asc' }],
        include: {
          question: {
            select: {
              id: true,
              stem: true,
              // 题干纯文本镜像：编辑页表格与结构预览按纯文本展示，避免显出 HTML 标签
              stemText: true,
              type: true,
              options: true,
              answer: true,
              analysis: true,
              difficulty: true,
              // 材料题的小题：卷面预览要把小题逐条排在材料之后，否则预览出来的
              // 材料题只有一段材料、没有题目。sortNo 升序即卷面顺序。
              children: {
                select: {
                  id: true,
                  stem: true,
                  stemText: true,
                  type: true,
                  options: true,
                  answer: true,
                  analysis: true,
                  // 小题各自有难度（保存时未填则继承材料题），导出明细按小题真实难度标注
                  difficulty: true,
                  suggestedScore: true,
                },
                orderBy: { sortNo: 'asc' },
              },
            },
          },
        },
      });
      questions = rows.map((r) => ({
        id: r.id,
        questionId: r.questionId,
        stem: r.question.stem,
        stemText: r.question.stemText,
        childrenCount: r.question.children.length,
        // 小题列表：仅材料题非空。分值取小题自己的建议分，
        // 与取卷展开（expandCompositeSlots）一致，卷面预览的分值才对得上实际判分
        children: r.question.children.map((c) => ({
          id: c.id,
          stem: c.stem,
          stemText: c.stemText,
          questionType: c.type,
          options: c.options,
          answer: c.answer,
          analysis: c.analysis,
          difficulty: c.difficulty,
          score: c.suggestedScore,
        })),
        questionType: r.question.type,
        options: r.question.options,
        answer: r.question.answer,
        analysis: r.question.analysis,
        difficulty: r.question.difficulty,
        score: r.score,
        sortNo: r.sortNo,
      }));
    }

    // 随机卷始终附带抽题规则：已生成的卷子编辑页仍要回填规则、重新生成要按规则重抽
    if (paper.type === 'random') {
      const rows = await this.prisma.paperRule.findMany({
        where: { paperId: id },
        orderBy: { id: 'asc' },
      });
      const kpIds = [...new Set(rows.map((r) => r.knowledgePointId))];
      const kps = await this.prisma.knowledgePoint.findMany({
        where: { id: { in: kpIds } },
        select: { id: true, name: true },
      });
      const kpNameMap = new Map(kps.map((k) => [k.id, k.name]));
      rules = await Promise.all(
        rows.map(async (r) => ({
          id: r.id,
          questionType: r.questionType,
          difficulty: r.difficulty,
          knowledgePointId: r.knowledgePointId,
          knowledgePointName: kpNameMap.get(r.knowledgePointId) ?? '',
          drawCount: r.drawCount,
          scorePerQuestion: r.scorePerQuestion,
          availableCount: await this.countAvailable(bankIds, r),
        })),
      );
    }

    // 创建人姓名、所属单位与能力位：编辑页据此决定共享设置区是否可改
    const [creator, orgMap] = await Promise.all([
      paper.createBy
        ? this.prisma.sysUser.findUnique({
            where: { id: paper.createBy },
            select: { name: true, username: true },
          })
        : Promise.resolve(null),
      this.orgScope.getOrgNamesByUserIds(paper.createBy ? [paper.createBy] : []),
    ]);
    const caps = admin
      ? await this.access.getCapabilitiesFromPaper(paper, admin)
      : { canManage: true, canEditShare: true };

    return {
      ...paper,
      bankIds,
      bankNames,
      bankWeights,
      questions,
      rules,
      createByName: creator?.name || creator?.username || '',
      createByOrgName: paper.createBy ? orgMap.get(paper.createBy) || '' : '',
      canManage: caps.canManage,
      canEditShare: caps.canEditShare,
    };
  }

  /** 统计某抽题规则组合在题库范围内可用（正式状态）题目数量 */
  private async countAvailable(bankIds: number[], rule: Pick<RuleInput, 'questionType' | 'difficulty' | 'knowledgePointId'>): Promise<number> {
    if (!bankIds.length) return 0;
    return this.prisma.question.count({ where: buildRuleWhere(bankIds, rule) });
  }

  /**
   * 统计每条抽题规则的可用题量，并给出「整卷去重后」能凑出的最大题数。
   *
   * 逐条统计会把交集题目重复计数（同一道题同时满足两条规则时两边各算一次），
   * 因此额外返回 maxDistinct：命中任一规则的题目去重后的总数。
   * 供编辑页展示与限制输入上限用；完整可行性校验见 findRuleShortage。
   */
  async getRuleAvailability(
    bankIds: number[],
    rules: RuleFilter[],
  ): Promise<{ counts: number[]; maxDistinct: number }> {
    if (!bankIds.length || !rules.length) {
      return { counts: rules.map(() => 0), maxDistinct: 0 };
    }
    const counts = await Promise.all(rules.map((r) => this.countAvailable(bankIds, r)));
    const maxDistinct = await this.prisma.question.count({
      where: { OR: rules.map((r) => buildRuleWhere(bankIds, r)) },
    });
    return { counts, maxDistinct };
  }

  /**
   * 校验一组抽题规则能否在题库范围内凑齐（同一道题不重复进卷）。
   *
   * 三层递进：
   * 1. 逐条：drawCount <= 该规则自身可用量；
   * 2. 全集：sum(drawCount) <= 命中任一规则的去重题量；
   * 3. 同题型两两：任意两条同题型规则的 drawCount 之和 <= 二者并集题量。
   *
   * 第 3 层是因为第 2 层只是必要条件——若 A、B 命中同一批 5 道题各要 3 道，
   * 而另一条不相交的规则带来大量富余，全集聚合会把这个冲突掩盖掉。
   * buildRuleWhere 对 questionType 是精确匹配，不同题型的规则不可能相交，
   * 故只需在同题型内两两检查，代价 O(k²) 且 k 通常是个位数。
   *
   * 已知局限：三条及以上规则「两两都不冲突但合起来冲突」的情形仍会漏判，
   * 严格判定需要二分图匹配/最大流，代价与收益不成比例，暂不实现。
   *
   * @returns 中文错误信息；null 表示通过
   */
  async findRuleShortage(
    bankIds: number[],
    rules: Array<RuleFilter & { drawCount: number }>,
    /** 规则定位文案，默认「第 N 条抽题规则」 */
    label: (rule: RuleFilter & { drawCount: number }, index: number) => string = (_r, i) =>
      `第 ${i + 1} 条抽题规则`,
  ): Promise<string | null> {
    if (!rules.length) return null;

    // 材料题不能进随机抽题规则：规则的 scorePerQuestion 是「该规则每题固定分」，
    // 而材料题分值等于其小题之和、每道材料题都不同，这个字段表达不了，
    // 会导致预估总分与实际判分基数不一致。材料题请用固定卷手选。
    const composite = rules.findIndex((r) => r.questionType === 'composite');
    if (composite >= 0) {
      return `${label(rules[composite], composite)}不支持「材料题」——材料题各自分值不同，无法按每题固定分抽取，请改用固定试卷手动选题`;
    }

    const { counts, maxDistinct } = await this.getRuleAvailability(bankIds, rules);

    const short = rules.findIndex((r, i) => r.drawCount > counts[i]);
    if (short >= 0) {
      return `${label(rules[short], short)}可用题目不足（可用 ${counts[short]}，需 ${rules[short].drawCount}），请调整抽取数量或补充题目`;
    }

    const totalDraw = rules.reduce((s, r) => s + r.drawCount, 0);
    if (totalDraw > maxDistinct) {
      return `抽题规则存在条件重叠，去重后可用题目不足（可用 ${maxDistinct}，共需 ${totalDraw}），请调整抽取数量或补充题目`;
    }

    // 同题型规则两两并集校验
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < rules.length; i++) {
      for (let j = i + 1; j < rules.length; j++) {
        if (rules[i].questionType === rules[j].questionType) pairs.push([i, j]);
      }
    }
    if (!pairs.length) return null;
    const unions = await Promise.all(
      pairs.map(([i, j]) =>
        this.prisma.question.count({
          where: { OR: [buildRuleWhere(bankIds, rules[i]), buildRuleWhere(bankIds, rules[j])] },
        }),
      ),
    );
    for (let k = 0; k < pairs.length; k++) {
      const [i, j] = pairs[k];
      const need = rules[i].drawCount + rules[j].drawCount;
      if (need > unions[k]) {
        return `${label(rules[i], i)}与${label(rules[j], j)}命中的题目高度重叠（合并后可用 ${unions[k]}，共需 ${need}），请调整抽取数量或补充题目`;
      }
    }
    return null;
  }

  /**
   * 把材料题的分值归一为「其小题分值之和」
   *
   * 考试下发时材料题本身不占作答位（score=0），各小题带自己的 suggestedScore，
   * 判分按小题累计。若卷里给材料题存了别的分值，Paper.totalScore 就会与考生
   * 实际可得的满分不一致（卷面写 10 分、实际能拿 20 分）。
   *
   * 前端已把该分值做成只读，此处再兜一层：接口可被直接调用，
   * 且存量卷可能已存了不一致的值，编辑保存时顺带纠正。
   *
   * @param items 组卷题目项（questionId + score）
   * @returns 同长度的新数组，材料题项的 score 被替换为小题之和
   */
  private async normalizeCompositeScores<T extends { questionId: number; score: number }>(
    items: T[],
  ): Promise<T[]> {
    if (!items.length) return items;
    const composites = await this.prisma.question.findMany({
      where: { id: { in: items.map((it) => it.questionId) }, type: 'composite' },
      select: { id: true, children: { select: { suggestedScore: true } } },
    });
    if (!composites.length) return items;
    const sumById = new Map(
      composites.map((c) => [
        c.id,
        this.round2(c.children.reduce((sum, ch) => sum + ch.suggestedScore, 0)),
      ]),
    );
    return items.map((it) => {
      const sum = sumById.get(it.questionId);
      return sum === undefined ? it : { ...it, score: sum };
    });
  }

  /**
   * 按题型把题目重排为卷面顺序，供落库 sortNo 使用
   *
   * 管理端「试卷预览」「组卷结构预览」都用 groupByType 按题型分大题渲染
   * （一、单选题 二、多选题…），而考生端如实按 sortNo 下发。若落库顺序不按
   * 题型归拢，同一份卷在两端就是两个顺序 —— 老师照预览讲第 1 题是单选，
   * 考生手机上第 1 题却是判断题。这里在写库前统一成题型顺序，让预览、
   * 导出、考生端三处对齐。
   *
   * 同题型内保持传入的相对顺序（稳定排序），即老师在组卷页拖动的次序。
   * composite（材料题）不在题型字典里，排末尾，与前端未知题型排末尾一致。
   *
   * @param items 组卷题目项（顺序为老师在组卷页排定的次序）
   * @returns 按题型归拢后的新数组，不改动入参
   */
  private async sortItemsByQuestionType<T extends { questionId: number }>(
    items: T[],
  ): Promise<T[]> {
    if (items.length < 2) return items;
    const rows = await this.prisma.question.findMany({
      where: { id: { in: items.map((it) => it.questionId) } },
      select: { id: true, type: true },
    });
    const typeById = new Map(rows.map((r) => [r.id, r.type]));
    /*
      未知题型（含 composite）落到 TYPE_ORDER.length，排在所有已知题型之后。
      同权重项靠 Array.prototype.sort 的稳定性保留原相对次序 —— ES2019 起
      由规范保证，Node 18+ 可依赖。
    */
    const weight = (it: T) => {
      const idx = PAPER_TYPE_ORDER.indexOf(typeById.get(it.questionId) ?? '');
      return idx === -1 ? PAPER_TYPE_ORDER.length : idx;
    };
    return [...items].sort((a, b) => weight(a) - weight(b));
  }

  /**
   * 校验题库 ID 列表是否都存在（组卷题库范围合法性）
   * @returns 非法（不存在）的 ID 列表，空数组表示全部合法
   */
  async findInvalidBankIds(bankIds: number[]): Promise<number[]> {
    const found = await this.prisma.questionBank.findMany({
      where: { id: { in: bankIds } },
      select: { id: true },
    });
    const foundSet = new Set(found.map((b) => b.id));
    return bankIds.filter((id) => !foundSet.has(id));
  }

  /**
   * 校验知识点 ID 列表是否都存在（随机卷抽题规则合法性）
   * @returns 非法（不存在）的知识点 ID 列表，空数组表示全部合法
   */
  async findInvalidKnowledgePointIds(kpIds: number[]): Promise<number[]> {
    if (!kpIds.length) return [];
    const found = await this.prisma.knowledgePoint.findMany({
      where: { id: { in: kpIds } },
      select: { id: true },
    });
    const foundSet = new Set(found.map((k) => k.id));
    return kpIds.filter((id) => !foundSet.has(id));
  }

  /**
   * 校验题目是否都属于所选题库范围且为正式状态
   *
   * 并入 ROOT_ONLY：小题不能作为独立题目进卷。这里是绕过组卷界面的最后一道关口——
   * 界面只列根节点，但接口可被直接调用塞进小题 id，届时该小题会脱离材料单独出现。
   * 材料题本身（type=composite）是合法的进卷单位，取卷时再展开为其小题的作答位。
   *
   * @returns 非法的题目 ID 列表，空数组表示全部合法
   */
  async findInvalidQuestionIds(bankIds: number[], questionIds: number[]): Promise<number[]> {
    const found = await this.prisma.question.findMany({
      where: {
        id: { in: questionIds },
        questionBankId: { in: bankIds },
        status: 'formal',
        ...ROOT_ONLY,
      },
      select: { id: true },
    });
    const foundSet = new Set(found.map((q) => q.id));
    return questionIds.filter((id) => !foundSet.has(id));
  }

  /**
   * 新增固定试卷（事务：主表 + 题库范围 + 题目项；总分=Σ分值，题量=题数）
   * @returns 新建试卷
   */
  async createFixed(
    input: {
      name: string;
      suggestDuration: number;
      bankIds: number[];
      items: FixedItemInput[];
      knowledgeDistribution?: string;
    } & PaperShareInput,
    admin?: AdminPayload,
  ) {
    // 材料题分值取小题之和，保证卷面总分与考生实际可得满分一致
    const scored = await this.normalizeCompositeScores(input.items);
    // 落库前按题型归拢，使 sortNo 即卷面顺序（预览/导出/考生端同一顺序）
    const items = await this.sortItemsByQuestionType(scored);
    const totalScore = this.round2(items.reduce((sum, it) => sum + it.score, 0));
    const bankIds = [...new Set(input.bankIds)];
    return this.prisma.paper.create({
      data: {
        name: input.name,
        type: 'fixed',
        status: 'draft',
        totalScore,
        questionCount: items.length,
        suggestDuration: input.suggestDuration,
        knowledgeDistribution: input.knowledgeDistribution ?? null,
        createBy: admin?.userId ?? null,
        ...this.normalizeShare(input),
        paperBanks: { create: bankIds.map((bankId) => ({ bankId })) },
        paperQuestions: {
          // sortNo 一律按重排后的下标重编号：入参里的 sortNo 是重排前的旧序号，
          // 沿用它会把 sortItemsByQuestionType 的结果又打回去
          create: items.map((it, idx) => ({
            questionId: it.questionId,
            score: it.score,
            sortNo: idx + 1,
          })),
        },
      },
    });
  }

  /**
   * 新增随机试卷（事务：主表 + 题库范围 + 抽题规则；总分=Σ(抽取数量×每题分值)，题量=Σ抽取数量）
   * @returns 新建试卷
   */
  /**
   * 校验抽题规则不含材料题
   *
   * 材料题本身不可作答，取卷时须展开成其小题；而随机卷的作答位在首次取卷时
   * 就固化为 AnswerItem，材料题不产生作答项、于是无法随卷下发，考生会看到
   * 一批没有材料的孤立小题。管理端下拉已过滤 composite，但那是客户端护栏，
   * 直调接口仍能绕过，故在此按边界校验兜住。
   *
   * @param rules 抽题规则列表
   */
  private assertRulesHaveNoComposite(rules: RuleInput[]) {
    if (rules.some((r) => r.questionType === 'composite')) {
      throw new BadRequestException('抽题规则不支持材料题，请改用固定组卷');
    }
  }

  async createRandom(
    input: {
      name: string;
      suggestDuration: number;
      banks: BankWeightInput[];
      rules: RuleInput[];
    } & PaperShareInput,
    admin?: AdminPayload,
  ) {
    this.assertRulesHaveNoComposite(input.rules);
    const banks = this.normalizeBankWeights(input.banks);
    // 缺口不阻断保存，随结果带回给调用方提示用户
    const quotaWarnings = await this.collectBankQuotaWarnings(banks, input.rules);
    const totalScore = this.round2(
      input.rules.reduce((sum, r) => sum + r.drawCount * r.scorePerQuestion, 0),
    );
    const questionCount = input.rules.reduce((sum, r) => sum + r.drawCount, 0);
    const paper = await this.prisma.paper.create({
      data: {
        name: input.name,
        type: 'random',
        // 随机卷先落待生成态：规则已配好，但题目要等用户点「生成试卷」才抽取固化
        status: 'pending',
        totalScore,
        questionCount,
        suggestDuration: input.suggestDuration,
        createBy: admin?.userId ?? null,
        ...this.normalizeShare(input),
        paperBanks: { create: banks },
        paperRules: { create: input.rules.map((r) => ({ ...r })) },
      },
    });
    return { paper, quotaWarnings };
  }

  /**
   * 去重题库并校验权重合计为 1。
   *
   * 合计不为 1 时直接报错而不做归一化：用户填的 0.3/0.3 很可能是漏填了第三个库，
   * 静默归一成 0.5/0.5 会让他以为配置生效了，实际比例与预期不同。
   */
  private normalizeBankWeights(banks: BankWeightInput[]) {
    const merged = new Map<number, number>();
    for (const b of banks) {
      /*
        同一题库重复出现时权重相加，避免去重时丢掉一份权重。

        这里按 4 位小数取整而非 round2：DTO 允许 4 位小数，
        用 round2 会把三库均分的 0.3333/0.3333/0.3334 压成 0.33 三份，
        合计变 0.99，合法输入反被判成「合计须为 1」而存不进去。
      */
      merged.set(b.bankId, this.round4((merged.get(b.bankId) ?? 0) + b.weight));
    }
    const list = [...merged].map(([bankId, weight]) => ({ bankId, weight }));
    const sum = list.reduce((s, b) => s + b.weight, 0);
    // 浮点累加有误差，1e-6 内视为相等
    if (Math.abs(sum - 1) > 1e-6) {
      throw new BadRequestException(
        `题库权重合计须为 1，当前为 ${sum.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`,
      );
    }
    if (list.some((b) => b.weight <= 0)) {
      throw new BadRequestException('题库权重必须大于 0，不参与抽题的题库请直接移除');
    }
    return list;
  }

  /**
   * 检查按权重拆分后各库题量是否撑得住配额，返回缺口提示。
   *
   * 只返回提示、不抛异常：抽题时缺口会从其他题库补足（产品选定的行为），
   * 题量不够并不妨碍组卷，拦住保存等于让这类配置永远存不进去。
   * 但补足会让实际比例偏离设定权重，所以必须把缺口如实告知——
   * 不说明的话用户不会知道自己设的 0.5/0.5 实际跑出来是 0.2/0.8。
   *
   * @returns 缺口描述列表；无缺口时为空数组
   */
  private async collectBankQuotaWarnings(
    banks: Array<{ bankId: number; weight: number }>,
    rules: RuleInput[],
  ): Promise<string[]> {
    // 规则 × 题库逐个 await 会产生数十次串行往返，这里一次并发查完
    const probes = rules.flatMap((rule) =>
      allocateByWeight(banks, rule.drawCount)
        .filter(({ quota }) => quota > 0)
        .map(({ bankId, quota }) => ({ bankId, quota, rule })),
    );
    if (probes.length === 0) return [];

    const counts = await Promise.all(
      probes.map((p) => this.prisma.question.count({ where: buildRuleWhere([p.bankId], p.rule) })),
    );

    const shortages = probes
      .map((p, i) => ({ ...p, available: counts[i] }))
      .filter((p) => p.available < p.quota);
    if (shortages.length === 0) return [];

    // 题库名一次查全后建表，避免每条缺口各查一次（同一库往往缺多条规则）
    const names = new Map(
      (
        await this.prisma.questionBank.findMany({
          where: { id: { in: [...new Set(shortages.map((s) => s.bankId))] } },
          select: { id: true, name: true },
        })
      ).map((b) => [b.id, b.name]),
    );

    return shortages.map(
      (s) =>
        `「${names.get(s.bankId) ?? s.bankId}」${s.rule.questionType} 按权重需抽 ${s.quota} 题，实际可用 ${s.available} 题`,
    );
  }

  /**
   * 编辑固定试卷（事务：清空旧题库范围/题目项后重建并重算总分题量）
   * 调用方须先校验试卷存在且为草稿态。
   */
  async updateFixed(
    id: number,
    input: {
      name: string;
      suggestDuration: number;
      bankIds: number[];
      items: FixedItemInput[];
      knowledgeDistribution?: string;
    } & PaperShareInput,
    shareEditable = false,
  ) {
    /*
      先取出现有的题库权重。

      本方法会重建 paperBanks，而 weight 有默认值 0——随机卷生成后来调整题目时
      若不保留权重，它配好的抽题比例会被悄悄清零，等到下次改规则重新生成才暴露。
      故按 bankId 把旧权重带回去，仍在范围内的库保持原值。
    */
    const prevWeights = new Map(
      (
        await this.prisma.paperBank.findMany({
          where: { paperId: id },
          select: { bankId: true, weight: true },
        })
      ).map((b) => [b.bankId, b.weight]),
    );

    // 同 createFixed：材料题分值归一为小题之和，编辑保存时顺带纠正存量不一致
    const scored = await this.normalizeCompositeScores(input.items);
    // 同 createFixed：按题型归拢后落库，存量卷重新保存一次即被纠正
    const items = await this.sortItemsByQuestionType(scored);
    const totalScore = this.round2(items.reduce((sum, it) => sum + it.score, 0));
    const bankIds = [...new Set(input.bankIds)];
    await this.prisma.$transaction([
      this.prisma.paperBank.deleteMany({ where: { paperId: id } }),
      this.prisma.paperQuestion.deleteMany({ where: { paperId: id } }),
      this.prisma.paper.update({
        where: { id },
        data: {
          name: input.name,
          suggestDuration: input.suggestDuration,
          knowledgeDistribution: input.knowledgeDistribution ?? null,
          totalScore,
          questionCount: items.length,
          // 无权改共享设置时整段不下发，避免越权用户借编辑接口顺带改掉共享属性
          ...(shareEditable ? this.shareUpdatePatch(input) : {}),
          // 带回旧权重：随机卷调整题目时不能把它配好的抽题比例清零
          paperBanks: {
            create: bankIds.map((bankId) => ({
              bankId,
              weight: prevWeights.get(bankId) ?? 0,
            })),
          },
          paperQuestions: {
            // 同 createFixed：按重排后的下标重编号，不沿用入参的旧 sortNo
            create: items.map((it, idx) => ({
              questionId: it.questionId,
              score: it.score,
              sortNo: idx + 1,
            })),
          },
        },
      }),
    ]);
  }

  /**
   * 编辑随机试卷（事务：清空旧题库范围/抽题规则后重建并重算总分题量）
   * 调用方须先校验试卷存在且为草稿态。
   */
  async updateRandom(
    id: number,
    input: {
      name: string;
      suggestDuration: number;
      banks: BankWeightInput[];
      rules: RuleInput[];
    } & PaperShareInput,
    shareEditable = false,
  ) {
    this.assertRulesHaveNoComposite(input.rules);
    const banks = this.normalizeBankWeights(input.banks);
    // 同 createRandom：缺口不阻断保存，随结果带回提示
    const quotaWarnings = await this.collectBankQuotaWarnings(banks, input.rules);
    /*
      改过规则的卷必须退回待生成态。

      totalScore/questionCount 是按规则算的，而已生成的题目留在 PaperQuestion 里；
      只改规则不清题目，两者就对不上——总分显示的是新规则算出的值，
      卷面却还是旧题目。故这里连带清掉题目并把状态退回 pending，
      由用户再点一次「生成试卷」。清掉的题目含手工调整过的部分，前端须先确认。
    */
    const hadQuestions = await this.prisma.paperQuestion.count({ where: { paperId: id } });
    const totalScore = this.round2(
      input.rules.reduce((sum, r) => sum + r.drawCount * r.scorePerQuestion, 0),
    );
    const questionCount = input.rules.reduce((sum, r) => sum + r.drawCount, 0);
    await this.prisma.$transaction([
      this.prisma.paperBank.deleteMany({ where: { paperId: id } }),
      this.prisma.paperRule.deleteMany({ where: { paperId: id } }),
      // 规则已变，旧题目不再对应，一并清掉等待重新生成
      this.prisma.paperQuestion.deleteMany({ where: { paperId: id } }),
      this.prisma.paper.update({
        where: { id },
        data: {
          name: input.name,
          suggestDuration: input.suggestDuration,
          totalScore,
          questionCount,
          // 退回待生成：规则变了就得重抽，否则卷面与总分不一致
          status: 'pending',
          // 同 updateFixed：无权时不下发共享字段
          ...(shareEditable ? this.shareUpdatePatch(input) : {}),
          paperBanks: { create: banks },
          paperRules: { create: input.rules.map((r) => ({ ...r })) },
        },
      }),
    ]);
    return { quotaWarnings, clearedQuestions: hadQuestions };
  }

  /**
   * 按抽题规则生成随机卷的实体题目（快速组卷）。
   *
   * 随机卷的定位是「快速组卷」而非「考试时才抽」：这里按规则与题库权重抽一次，
   * 结果写入 PaperQuestion 固化下来，此后这张卷与固定卷行为一致
   * ——同一考生每次看到的题目相同，可手工调整，发布后锁死。
   *
   * 允许重复调用（重新生成）：会先清空已有题目项，包括手工调整过的部分，
   * 故调用方须先向用户确认。
   *
   * @param id 试卷 ID（调用方须先校验存在、为随机卷、且未发布）
   * @returns 生成的题目数量与各库实际抽取分布
   * @throws 题量不足时抛出中文错误
   */
  async generateRandom(id: number) {
    const [banks, rules] = await Promise.all([
      this.prisma.paperBank.findMany({
        where: { paperId: id },
        select: { bankId: true, weight: true },
      }),
      this.prisma.paperRule.findMany({
        where: { paperId: id },
        select: {
          questionType: true,
          difficulty: true,
          knowledgePointId: true,
          drawCount: true,
          scorePerQuestion: true,
        },
      }),
    ]);
    if (banks.length === 0) throw new Error('试卷未配置题库范围，无法生成');
    if (rules.length === 0) throw new Error('试卷未配置抽题规则，无法生成');

    const allBankIds = banks.map((b) => b.bankId);
    /** 跨规则去重：条件相交的两条规则不能抽到同一道题 */
    const usedIds = new Set<number>();
    /** 抽中题目，按抽中顺序；分值随各自命中的规则 */
    const picked: Array<{ questionId: number; score: number }> = [];
    /** 各题库实际抽到的题数，用于回报实际分布 */
    const perBank = new Map<number, number>();

    for (const rule of rules) {
      // 候选池只取 id 与库号：卷面只用得上其中 drawCount 道，题面不必读进内存
      const pool = await this.prisma.question.findMany({
        where: buildRuleWhere(allBankIds, rule),
        select: { id: true, questionBankId: true },
      });
      const fresh = pool.filter(
        (q): q is { id: number; questionBankId: number } =>
          !usedIds.has(q.id) && q.questionBankId !== null,
      );
      const byBank = new Map<number, typeof fresh>();
      for (const q of fresh) {
        const list = byBank.get(q.questionBankId);
        if (list) list.push(q);
        else byBank.set(q.questionBankId, [q]);
      }

      const before = picked.length;
      let shortfall = 0;
      // 按权重把该规则的抽取数量拆到各库（最大余数法，合计严格等于 drawCount）
      for (const { bankId, quota } of allocateByWeight(banks, rule.drawCount)) {
        if (quota <= 0) continue;
        const bankPool = byBank.get(bankId) ?? [];
        const take = Math.min(quota, bankPool.length);
        for (const q of pickRandom(bankPool, take)) {
          usedIds.add(q.id);
          picked.push({ questionId: q.id, score: rule.scorePerQuestion });
          perBank.set(bankId, (perBank.get(bankId) ?? 0) + 1);
        }
        shortfall += quota - take;
      }

      // 某库不足时从其余库补足（产品选定行为）：实际比例会偏离设定权重
      if (shortfall > 0) {
        const rest = fresh.filter((q) => !usedIds.has(q.id));
        for (const q of pickRandom(rest, Math.min(shortfall, rest.length))) {
          usedIds.add(q.id);
          picked.push({ questionId: q.id, score: rule.scorePerQuestion });
          perBank.set(q.questionBankId, (perBank.get(q.questionBankId) ?? 0) + 1);
        }
      }

      // 题量不足即报错，不少抽：Paper.totalScore 按规则静态算好，
      // 少抽会让实际满分低于总分而及格线不变，判定失真
      if (picked.length - before < rule.drawCount) {
        throw new Error(
          `抽题配置【${rule.questionType}/${rule.difficulty || '不限难度'}】题量不足，` +
            `需 ${rule.drawCount} 题、实际仅 ${picked.length - before} 题，请补充题目或调整配置`,
        );
      }
    }

    // 按题型归拢卷面顺序，与固定卷保持一致的呈现
    const sorted = await this.sortItemsByQuestionType(picked);
    const totalScore = this.round2(sorted.reduce((s, it) => s + it.score, 0));

    await this.prisma.$transaction([
      // 重新生成时清掉旧题目项（含手工调整过的），调用方已向用户确认
      this.prisma.paperQuestion.deleteMany({ where: { paperId: id } }),
      this.prisma.paper.update({
        where: { id },
        data: {
          // 生成完成即转草稿：此后可手工增删改题目，再发布
          status: 'draft',
          totalScore,
          questionCount: sorted.length,
          paperQuestions: {
            create: sorted.map((it, idx) => ({
              questionId: it.questionId,
              score: it.score,
              sortNo: idx + 1,
            })),
          },
        },
      }),
    ]);

    return {
      questionCount: sorted.length,
      totalScore,
      perBank: [...perBank].map(([bankId, count]) => ({ bankId, count })),
    };
  }

  /**
   * AI 组卷方案推荐（在题库范围内按目标总分挑选正式题目，平均分配分值）
   * 无独立 AI 依赖时使用启发式策略：优先覆盖不同知识点，逐题累加至接近目标总分。
   * 仅返回推荐方案，不落库。
   * @returns { items, totalScore, message } 或 null（题库无可用题目）
   */
  async aiCompose(input: {
    bankIds: number[];
    totalScore: number;
    knowledgeDistribution?: string;
  }) {
    const bankIds = [...new Set(input.bankIds)];
    // 候选池并入 ROOT_ONLY：小题不能被单独推荐进卷（本处不走 buildRuleWhere）
    const candidates = await this.prisma.question.findMany({
      where: { questionBankId: { in: bankIds }, status: 'formal', ...ROOT_ONLY },
      select: {
        id: true,
        stem: true,
        // stemText 用于展示：stem 支持富文本后直接回传会把标签显示给管理员
        stemText: true,
        type: true,
        difficulty: true,
        suggestedScore: true,
      },
      orderBy: { id: 'asc' },
    });
    if (!candidates.length) return null;

    // 启发式：按题目建议分值累加，逼近目标总分；至少选 1 题
    const items: Array<{ questionId: number; stem: string; questionType: string; difficulty: string; score: number }> = [];
    let acc = 0;
    for (const q of candidates) {
      const score = this.round2(q.suggestedScore > 0 ? q.suggestedScore : 5);
      if (items.length > 0 && acc + score > input.totalScore) break;
      items.push({
        questionId: q.id,
        stem: q.stemText || stripHtml(q.stem),
        questionType: q.type,
        difficulty: q.difficulty,
        score,
      });
      acc = this.round2(acc + score);
      if (acc >= input.totalScore) break;
    }
    return { items, totalScore: acc, count: items.length };
  }

  /**
   * 发布试卷（草稿→已发布）
   * 发布前校验：固定卷至少 1 题；随机卷至少 1 条规则且每条可用题量 ≥ 抽取数量。
   * @throws 业务校验失败时抛出中文错误
   */
  async publish(id: number): Promise<void> {
    const paper = await this.prisma.paper.findUnique({
      where: { id },
      include: { paperBanks: { select: { bankId: true } } },
    });
    if (!paper) throw new Error('试卷不存在');
    if (paper.status === 'published') throw new Error('试卷已发布，无需重复发布');
    // 随机卷未生成题目时不能发布：它此刻还只是一组抽题规则，没有卷面
    if (paper.status === 'pending') {
      throw new Error('随机试卷尚未生成题目，请先点击「生成试卷」');
    }

    /*
      两种卷现在都按实体题目校验。

      随机卷生成后题目已固化在 PaperQuestion 里，与固定卷同构，
      不再需要校验抽题规则的可行性——规则只作为生成时的配置留档。
    */
    const cnt = await this.prisma.paperQuestion.count({ where: { paperId: id } });
    if (cnt === 0) {
      throw new Error(
        paper.type === 'fixed'
          ? '固定试卷至少需要一道题目才能发布'
          : '随机试卷没有题目，请重新生成试卷',
      );
    }
    await this.prisma.paper.update({ where: { id }, data: { status: 'published' } });
  }

  /**
   * 删除前的关联校验：试卷被考试引用时不可删除
   * @throws 命中引用时抛出中文错误
   */
  async ensureDeletable(id: number): Promise<void> {
    const exam = await this.prisma.exam.findFirst({ where: { paperId: id }, select: { id: true } });
    if (exam) throw new Error('该试卷已被考试引用，无法删除');
  }

  /**
   * 归一化共享属性：缺省 self + manage；「仅自己」时级别无意义，统一存 manage
   *
   * 缺省取 self 而非 all：创建表单已不再下发共享字段，若兜成 all，则从落库那一刻起
   * 组织内任何人都能读到题干与正确答案、并能编辑/发布/删除（见 org-scope 的 canRead），
   * 草稿卷也会进别人的列表，直到创建者手动去列表页收窄——等于开了一个答案暴露窗口。
   * 故默认最小可见，需要共享时由创建人在列表页「共享」入口显式放开。
   * @param input 含共享字段的入参
   */
  private normalizeShare(input: PaperShareInput): { visibleScope: string; shareLevel: string } {
    const visibleScope = input.visibleScope || 'self';
    const shareLevel = visibleScope === 'self' ? 'manage' : input.shareLevel || 'manage';
    return { visibleScope, shareLevel };
  }

  /**
   * 编辑场景的共享属性补丁：只下发入参真正带了的字段，缺省字段一律不进 update
   *
   * 共享设置已收敛到列表页「共享」入口单独维护，编辑试卷表单不再下发这两个字段；
   * 若直接走 normalizeShare，缺省字段会被兜底值写回，静默冲掉列表页配好的设置——
   * 两个都缺省时冲成 self/manage，只缺 shareLevel 时把 view 冲成 manage（权限升级）。
   *
   * 三种返回形态：
   * - 两字段都没传 → {}，共享两列都不动
   * - 只传 visibleScope 且非 self → 只含 visibleScope，级别沿用库里原值
   * - 传了 shareLevel，或 visibleScope 为 self → 两字段都写（self 恒配 manage）
   * @param input 含共享字段的入参
   */
  private shareUpdatePatch(
    input: PaperShareInput,
  ): Partial<{ visibleScope: string; shareLevel: string }> {
    // 用 == null 同时覆盖 undefined 与 null：DTO 里 visibleScope 的 @ValidateIf 条件是
    // 「两字段任一非 null 才校验」，所以两个都传 null 时整段校验被跳过，null 能原样到达这里。
    // 若只判 undefined，normalizeShare 里的 `input.visibleScope || 'self'` 会把 null
    // 兜成 self/manage，静默冲掉列表页配好的范围。
    // （空串走不到这里：'' 不等于 null，@ValidateIf 条件成立，@IsIn 会先拦下返回 400）
    if (input.visibleScope == null && input.shareLevel == null) return {};
    const normalized = this.normalizeShare(input);
    // 只给了 visibleScope（DTO 允许这种偏参：@IsOptional 的 shareLevel 缺省即放行）时，
    // 不能连 shareLevel 一起写——normalizeShare 会把它兜成 manage，
    // 等于把库里已有的 view 静默提升成「范围内成员可编辑/发布/删除」，是权限升级。
    // 故此时只下发 visibleScope，级别沿用库里原值。
    // 例外：self 下级别无意义且不变量要求恒为 manage，必须一并写回。
    if (input.shareLevel == null && normalized.visibleScope !== 'self') {
      return { visibleScope: normalized.visibleScope };
    }
    return normalized;
  }

  /**
   * 单独更新试卷共享设置
   * 不受草稿态限制（已发布试卷也需要能调整共享范围），调用方须先断言 canEditShare。
   * @param id 试卷 ID
   * @param input 共享属性
   */
  async updateShare(id: number, input: PaperShareInput): Promise<void> {
    await this.prisma.paper.update({ where: { id }, data: this.normalizeShare(input) });
  }

  /** 保留 2 位小数（避免浮点累加误差） */
  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  /**
   * 保留 4 位小数（题库权重用）
   *
   * 权重的 DTO 允许 4 位小数，多库均分时 0.3333 这类值必须原样保留；
   * 套 round2 会把它压成 0.33，合计凑不到 1，合法配置反而存不进去。
   */
  private round4(n: number): number {
    return Math.round(n * 10000) / 10000;
  }
}
