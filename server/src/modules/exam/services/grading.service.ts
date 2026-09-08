import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma.service';
import { BaseService } from '@/common/crud';
import {
  CERT_TEMPLATE_SNAPSHOT_SELECT,
  buildCertTemplateSnapshot,
} from '../utils/cert-template-snapshot';
import { buildExamNo } from '../utils/exam-no';

/** 客观题题型集合（自动判分）；其余题型（qa/essay）为主观题 */
const OBJECTIVE_TYPES = new Set(['single', 'multiple', 'judge', 'blank']);

/** 阅卷任务列表筛选条件 */
export interface GradingListFilter {
  examName?: string;
  gradingStatus?: string;
  candidateKeyword?: string;
  /**
   * 按阅卷指派过滤：传入当前用户 ID 后，仅返回「指派给该用户」或「尚无任何阅卷人指派」的考试答卷。
   * 不传（超管）则不过滤，返回全部。
   */
  assignedTo?: number;
}

/** 考试维度阅卷列表筛选条件 */
export interface GradingExamListFilter {
  examName?: string;
  /**
   * 按整场阅卷进度筛选：
   * pending 尚有待阅卷/待复核的答卷 / completed 全部阅完 / published 已全部发布
   */
  progress?: string;
  /** 同 GradingListFilter.assignedTo，语义与过滤口径完全一致 */
  assignedTo?: number;
}

/** 人工评分项 */
export interface ReviewInput {
  answerItemId: number;
  scoreAfter: number;
  /** 评语选填，未填时写入空串（库里该列 NOT NULL） */
  reviewComment?: string;
}

/**
 * 阅卷服务
 * 承载阅卷任务分页、客观题自动判分（交卷即算，也支持补算）、主观题人工评分（写 append-only
 * 评分记录并回写最终分）、成绩发布/撤回与及格判定。主观题只做人工阅卷，不含 AI 阅卷。
 */
@Injectable()
export class GradingService extends BaseService {
  private readonly logger = new Logger(GradingService.name);

  /**
   * 独立发证（考试只配证书模板、不挂认证项目）的默认有效期月数。
   * 有效期月数本是认证项目的属性，模板上没有这个字段，
   * 因此这种场景只能给一个默认值；需要按项目定制有效期就该挂认证项目。
   */
  private static readonly DEFAULT_VALID_MONTHS = 36;

  constructor(protected prisma: PrismaService) {
    super(prisma, 'answerSheet');
  }

  /** 判断题型是否为客观题 */
  isObjective(type: string): boolean {
    return OBJECTIVE_TYPES.has(type);
  }

  /**
   * 构造「阅卷指派范围」的 Exam 过滤片段（答卷维度与考试维度列表共用，避免两处口径分叉）
   *
   * 用 !== undefined 而非真值判断：与 canGradeSheet 的门槛写法保持一致，
   * 真值判断会让 userId 为 0 时静默跳过整个过滤、放出全部答卷。
   *
   * @returns 需要过滤时返回带 OR 的片段，超管（不传）返回空对象
   */
  private assignedExamWhere(assignedTo?: number): Prisma.ExamWhereInput {
    if (assignedTo === undefined) return {};
    // 「指派给我」或「该考试尚未指派任何阅卷人」二者取一：
    // 后半个分支是必需的兜底——存量考试都没有指派记录，
    // 若只保留前半个分支，这些考试的答卷会对所有非超管静默消失、无人可阅
    return {
      OR: [
        { staff: { some: { role: 'grader', userId: assignedTo } } },
        { staff: { none: { role: 'grader' } } },
      ],
    };
  }

  /**
   * 分页查询阅卷任务（一份答卷一条，带考试名称与客观/主观题量）
   */
  async pageList(filter: GradingListFilter, page?: number, pageSize?: number) {
    const p = Math.max(page || 1, 1);
    const ps = Math.min(Math.max(pageSize || 10, 1), 100);
    const skip = (p - 1) * ps;

    const where: Prisma.AnswerSheetWhereInput = {};
    if (filter.gradingStatus) where.gradingStatus = filter.gradingStatus;
    if (filter.candidateKeyword) where.candidateName = { contains: filter.candidateKeyword };

    // 考试名称与阅卷指派两个条件都作用在关联的 Exam 上，须合并进同一个 exam.is，
    // 否则后赋值的会覆盖前一个
    const examWhere: Prisma.ExamWhereInput = {};
    if (filter.examName) examWhere.name = { contains: filter.examName };
    Object.assign(examWhere, this.assignedExamWhere(filter.assignedTo));
    if (Object.keys(examWhere).length) where.exam = { is: examWhere };

    const [rows, total] = await Promise.all([
      this.prisma.answerSheet.findMany({
        where,
        skip,
        take: ps,
        orderBy: { id: 'desc' },
        // 用 select 而非 include：让 MySQL 只返回 GradingTaskVo 需要的列，
        // 字段对齐由查询本身保证，不必在下方再手工挑一遍字段。
        // 也不再取 _count：它从未被使用（objectiveCount / subjectiveCount
        // 由下方两条按 questionCategory 的 count 查询算出），白跑一条计数子查询。
        // ⚠️ 此处列集须与 GradingTaskVo 声明一一对应，新增的表列不会自动下发。
        select: {
          id: true,
          examId: true,
          candidateName: true,
          objectiveScore: true,
          subjectiveScore: true,
          totalScore: true,
          gradingStatus: true,
          scorePublished: true,
          passed: true,
          submitTime: true,
          exam: { select: { name: true } },
        },
      }),
      this.prisma.answerSheet.count({ where }),
    ]);

    const list = await Promise.all(
      rows.map(async ({ exam, ...sheet }) => {
        const [objectiveCount, subjectiveCount] = await Promise.all([
          this.prisma.answerItem.count({
            where: { answerSheetId: sheet.id, questionCategory: 'objective' },
          }),
          this.prisma.answerItem.count({
            where: { answerSheetId: sheet.id, questionCategory: 'subjective' },
          }),
        ]);
        // sheet 里已只剩上方 select 选定的列，可安全整行展开
        return { ...sheet, examName: exam?.name ?? '', objectiveCount, subjectiveCount };
      }),
    );
    return { list, pagination: { page: p, pageSize: ps, total } };
  }

  /**
   * 「尚有未评分主观题」的答题项条件
   *
   * 待阅口径统一以此为准，不用 gradingStatus：只有人工阅主观题这一件事需要阅卷员干，
   * 而 gradingStatus 会因交卷即置 pending 而把「没有主观题、无需人工干预」的卷也算成待阅
   * ——列表显示待阅 1 份、点进工作台却显示待阅 0 题，正是这个口径差造成的。
   */
  private static readonly UNGRADED_SUBJECTIVE = {
    some: { questionCategory: 'subjective', finalScore: null },
  } satisfies Prisma.AnswerItemListRelationFilter;

  /**
   * 分页查询「考试维度」的阅卷列表（一场考试一条，带待阅卷/已阅完/已发布份数）
   *
   * 阅卷入口以考试为单位：一场几十人的考试在答卷维度会铺成几十行，
   * 看不出整场进度，也无法按场次批量发布，故单独提供这一层。
   *
   * 只返回「已有答卷」的考试——没人交卷的考试没有可阅内容，列出来只是噪音。
   *
   * @param filter 考试名称模糊 / 整场进度 / 阅卷指派范围
   */
  async examPageList(filter: GradingExamListFilter, page?: number, pageSize?: number) {
    const p = Math.max(page || 1, 1);
    const ps = Math.min(Math.max(pageSize || 10, 1), 100);
    const skip = (p - 1) * ps;

    // 进度筛选表达为「对答卷集合的存在性条件」而非先聚合再过滤，
    // 这样分页 total 仍由数据库算，翻页不会错位。
    // 初值 some: {} 用于排除「一份答卷都没有」的考试；下面各分支只追加 every，不覆盖它。
    const sheetFilter: Prisma.AnswerSheetListRelationFilter = { some: {} };
    if (filter.progress === 'pending') {
      sheetFilter.some = { answerItems: GradingService.UNGRADED_SUBJECTIVE };
    } else if (filter.progress === 'completed') {
      sheetFilter.every = { answerItems: { none: GradingService.UNGRADED_SUBJECTIVE.some } };
    } else if (filter.progress === 'published') {
      sheetFilter.every = { scorePublished: true };
    }

    const where: Prisma.ExamWhereInput = {
      answerSheets: sheetFilter,
      ...this.assignedExamWhere(filter.assignedTo),
    };
    if (filter.examName) where.name = { contains: filter.examName };

    const [exams, total] = await Promise.all([
      this.prisma.exam.findMany({
        where,
        skip,
        take: ps,
        // 按开始时间倒序：最近的考试通常最需要阅
        orderBy: [{ startTime: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          name: true,
          status: true,
          startTime: true,
          endTime: true,
          passScore: true,
          createTime: true,
          certProjectId: true,
          paper: { select: { name: true } },
        },
      }),
      this.prisma.exam.count({ where }),
    ]);

    const list = await this.attachExamGradingCounts(exams);
    return { list, pagination: { page: p, pageSize: ps, total } };
  }

  /**
   * 为考试行补充答卷计数（应考人数 / 总份数 / 待阅份数 / 已发布份数）与编号、来源
   *
   * 用聚合查询一次算完整页，不按行发查询——否则每页 N 条就是 4N 条计数查询。
   * 待阅份数按「该卷尚有未评分主观题」统计（见 UNGRADED_SUBJECTIVE 注释），
   * 与工作台左上角的待阅人数同源。
   */
  private async attachExamGradingCounts(
    exams: Array<{
      id: number;
      name: string;
      status: string;
      startTime: Date;
      endTime: Date;
      passScore: number;
      createTime: Date;
      certProjectId: number | null;
      paper: { name: string } | null;
    }>,
  ) {
    const examIds = exams.map((e) => e.id);
    if (!examIds.length) return [];

    const [byTotal, byPublished, byPending, byCandidate, certProjects] = await Promise.all([
      this.prisma.answerSheet.groupBy({
        by: ['examId'],
        where: { examId: { in: examIds } },
        _count: { _all: true },
      }),
      this.prisma.answerSheet.groupBy({
        by: ['examId'],
        where: { examId: { in: examIds }, scorePublished: true },
        _count: { _all: true },
      }),
      // 待阅：该卷至少有一道主观题还没给最终分。用 groupBy 而非按行 count，
      // 关联条件下推到 SQL，仍是每页一条查询。
      this.prisma.answerSheet.groupBy({
        by: ['examId'],
        where: {
          examId: { in: examIds },
          answerItems: GradingService.UNGRADED_SUBJECTIVE,
        },
        _count: { _all: true },
      }),
      // 应考人数：考生分配表计数（与交卷份数区分，未交卷的人也算应考）
      this.prisma.examCandidate.groupBy({
        by: ['examId'],
        where: { examId: { in: examIds } },
        _count: { _all: true },
      }),
      // 来源取认证项目名。certProjectId 是裸 Int 列、无正向关联（与 exam.service
      // resolveCertNames 同因），故按本页去重后的 id 批量查一次，不逐行查。
      this.resolveCertProjectNames(exams),
    ]);

    const totalMap = new Map(byTotal.map((r) => [r.examId, r._count._all]));
    const publishedMap = new Map(byPublished.map((r) => [r.examId, r._count._all]));
    const pendingMap = new Map(byPending.map((r) => [r.examId, r._count._all]));
    const candidateMap = new Map(byCandidate.map((r) => [r.examId, r._count._all]));

    return exams.map(({ paper, createTime, certProjectId, ...exam }) => ({
      ...exam,
      examNo: buildExamNo(exam.id, createTime),
      paperName: paper?.name ?? '',
      // 没挂认证项目时回落试卷名，保证「来源」列不空着
      sourceName: (certProjectId ? certProjects.get(certProjectId) : null) ?? paper?.name ?? '',
      candidateCount: candidateMap.get(exam.id) ?? 0,
      sheetCount: totalMap.get(exam.id) ?? 0,
      pendingCount: pendingMap.get(exam.id) ?? 0,
      publishedCount: publishedMap.get(exam.id) ?? 0,
    }));
  }

  /**
   * 批量解析本页涉及的认证项目名
   * @returns projectId → name；无认证项目时返回空 Map
   */
  private async resolveCertProjectNames(
    exams: Array<{ certProjectId: number | null }>,
  ): Promise<Map<number, string>> {
    const ids = [...new Set(exams.map((e) => e.certProjectId).filter((id): id is number => !!id))];
    if (!ids.length) return new Map();
    const rows = await this.prisma.certProject.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  /**
   * 校验某份答卷是否在当前用户的阅卷指派范围内
   *
   * 判定条件与 pageList 的 assignedTo 过滤严格同源（指派给本人 或 该考试尚无阅卷人指派）：
   * 只在列表过滤而详情/操作接口不校验，等于拿到 sheetId 就能绕过列表越权读改分，
   * 故所有按 sheetId 的接口都必须走这里。
   *
   * @param assignedTo 当前用户 ID；传 undefined 表示超管，不受指派约束
   * @returns 答卷存在且在范围内为 true；答卷不存在或不在范围内均为 false
   */
  async canGradeSheet(sheetId: number, assignedTo?: number): Promise<boolean> {
    if (assignedTo === undefined) return true;
    const found = await this.prisma.answerSheet.findFirst({
      where: {
        id: sheetId,
        // 与列表过滤共用同一份指派条件，避免「列表能看到但详情打不开」这类口径分叉
        exam: { is: this.assignedExamWhere(assignedTo) },
      },
      select: { id: true },
    });
    return found !== null;
  }

  /**
   * 校验某场考试是否在当前用户的阅卷指派范围内
   *
   * 考试维度的接口（考生名单、整场发布/撤回）按 examId 取数，
   * 不能复用 canGradeSheet，否则拿到 examId 就能越权批量发布别人负责的考试。
   */
  async canGradeExam(examId: number, assignedTo?: number): Promise<boolean> {
    if (assignedTo === undefined) return true;
    const found = await this.prisma.exam.findFirst({
      where: { id: examId, ...this.assignedExamWhere(assignedTo) },
      select: { id: true },
    });
    return found !== null;
  }

  /**
   * 查询某场考试的答卷名单（阅卷工作台左侧切换用）
   *
   * 一场考试的人数有限（受考生分配约束），故不分页，一次给全，
   * 前端切换考生时不必再翻页。按考生姓名排序，便于按名字找人。
   *
   * @returns 每人一条，带阅卷状态、得分、所属组织与待阅主观题数
   */
  async getExamCandidates(examId: number) {
    const sheets = await this.prisma.answerSheet.findMany({
      where: { examId },
      orderBy: [{ candidateName: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        candidateName: true,
        candidateType: true,
        internalUserId: true,
        externalCandidateId: true,
        objectiveScore: true,
        subjectiveScore: true,
        totalScore: true,
        gradingStatus: true,
        scorePublished: true,
        passed: true,
        submitTime: true,
      },
    });
    if (!sheets.length) return [];

    // 待阅主观题数：一条 groupBy 算完整场，不按人发查询
    const pending = await this.prisma.answerItem.groupBy({
      by: ['answerSheetId'],
      where: {
        answerSheetId: { in: sheets.map((s) => s.id) },
        questionCategory: 'subjective',
        finalScore: null,
      },
      _count: { _all: true },
    });
    const pendingMap = new Map(pending.map((r) => [r.answerSheetId, r._count._all]));
    const orgMap = await this.resolveCandidateOrgs(sheets);

    return sheets.map(({ internalUserId, externalCandidateId, ...s }) => ({
      ...s,
      orgName: orgMap.get(s.id) ?? '',
      pendingSubjectiveCount: pendingMap.get(s.id) ?? 0,
    }));
  }

  /**
   * 批量解析考生所属组织名（内部取部门名，外部取所属单位名）
   *
   * 两类考生分别按 id 批量查一次，不逐人查；缺失（用户/单位已删）时留空串，
   * 前端显示「-」，不因组织数据缺失而挡住阅卷。
   *
   * @returns answerSheetId → 组织名
   */
  private async resolveCandidateOrgs(
    sheets: Array<{ id: number; internalUserId: number | null; externalCandidateId: number | null }>,
  ): Promise<Map<number, string>> {
    const userIds = [...new Set(sheets.map((s) => s.internalUserId).filter((v): v is number => !!v))];
    const extIds = [
      ...new Set(sheets.map((s) => s.externalCandidateId).filter((v): v is number => !!v)),
    ];
    // id 集合为空时不下发查询（where id in [] 虽也返回空，但白跑一次往返）
    const [users, externals] = await Promise.all([
      userIds.length
        ? this.prisma.sysUser.findMany({
            where: { id: { in: userIds } },
            select: { id: true, department: { select: { name: true } } },
          })
        : Promise.resolve([]),
      extIds.length
        ? this.prisma.externalCandidate.findMany({
            where: { id: { in: extIds } },
            select: { id: true, org: { select: { name: true } } },
          })
        : Promise.resolve([]),
    ]);
    const userOrg = new Map<number, string>(
      users.map((u): [number, string] => [u.id, u.department?.name ?? '']),
    );
    const extOrg = new Map<number, string>(
      externals.map((e): [number, string] => [e.id, e.org?.name ?? '']),
    );

    const result = new Map<number, string>();
    for (const s of sheets) {
      const name = s.internalUserId
        ? userOrg.get(s.internalUserId)
        : s.externalCandidateId
          ? extOrg.get(s.externalCandidateId)
          : '';
      result.set(s.id, name ?? '');
    }
    return result;
  }

  /** 查询答卷（含考试及格线），不存在返回 null */
  async getSheet(sheetId: number) {
    return this.prisma.answerSheet.findUnique({
      where: { id: sheetId },
      include: { exam: { select: { passScore: true } } },
    });
  }

  /** 查询评分记录（时间倒序） */
  async getReviewRecords(sheetId: number) {
    return this.prisma.reviewRecord.findMany({
      where: { answerSheetId: sheetId },
      orderBy: { reviewTime: 'desc' },
    });
  }

  /**
   * 客观题自动判分（比对考生答案与标准答案）
   * - 单选/判断：去空格后严格相等得满分
   * - 多选：答案元素集合完全一致（全对）得满分，漏选/错选 0 分
   * - 填空：按行逐空比对（去空格），全部正确得满分
   * 判分结果写回各 AnswerItem 并汇总 objectiveScore。可重复调用（幂等重算）。
   * @returns 客观题总得分
   */
  async autoGradeObjective(sheetId: number): Promise<number> {
    const items = await this.prisma.answerItem.findMany({
      where: { answerSheetId: sheetId, questionCategory: 'objective' },
      include: { question: { select: { type: true } } },
    });
    let total = 0;
    for (const it of items) {
      const correct = this.judgeObjective(it.candidateAnswer, it.standardAnswer, it.question?.type);
      const score = correct ? it.fullScore : 0;
      total = this.round1(total + score);
      await this.prisma.answerItem.update({
        where: { id: it.id },
        data: { isCorrect: correct, score },
      });
    }
    await this.prisma.answerSheet.update({
      where: { id: sheetId },
      data: { objectiveScore: total },
    });
    return total;
  }

  /**
   * 判断单个客观题是否正确（按题型区分比对策略，均忽略首尾空格与大小写）
   * - multiple 多选：选项集合全等（无序，漏选/错选即错）
   * - blank 填空：按空位顺序逐空全等（有序，仅按换行拆分，不拆逗号避免误判）
   * - single/judge 及其他：整体严格相等
   * @param type 题型（字典 question_type 的 value）
   */
  private judgeObjective(candidate: string | null, standard: string | null, type?: string): boolean {
    const norm = (s: string) => s.trim().toLowerCase();
    const cand = (candidate ?? '').trim();
    const std = (standard ?? '').trim();
    if (!std) return false;

    if (type === 'multiple') {
      // 多选：无序集合比对（选项分隔符 , ; 、 ， ； 或换行）
      const toSet = (s: string) =>
        s
          .split(/[,;\n、，；]/)
          .map((x) => norm(x))
          .filter((x) => x.length > 0)
          .sort();
      const candArr = toSet(cand);
      const stdArr = toSet(std);
      if (candArr.length !== stdArr.length) return false;
      return candArr.every((v, i) => v === stdArr[i]);
    }

    if (type === 'blank') {
      // 填空：有序逐空比对（仅按换行拆分，保留每空原文顺序，不排序、不按逗号拆）
      const toSeq = (s: string) => s.split('\n').map((x) => norm(x));
      const candSeq = toSeq(cand);
      const stdSeq = toSeq(std);
      if (candSeq.length !== stdSeq.length) return false;
      return candSeq.every((v, i) => v === stdSeq[i]);
    }

    // single / judge / 其他：整体严格相等
    return norm(cand) === norm(std);
  }

  /** 重算主观题总分（取各题 finalScore，未定的按 0 计），写回答卷 */
  private async recalcSubjective(sheetId: number): Promise<number> {
    const items = await this.prisma.answerItem.findMany({
      where: { answerSheetId: sheetId, questionCategory: 'subjective' },
      select: { finalScore: true },
    });
    const total = this.round1(items.reduce((sum, it) => sum + (it.finalScore ?? 0), 0));
    await this.prisma.answerSheet.update({
      where: { id: sheetId },
      data: { subjectiveScore: total },
    });
    return total;
  }

  /** 是否存在未完成阅卷的主观题（finalScore 为空 = 未确定） */
  async hasUngradedSubjective(sheetId: number): Promise<boolean> {
    const cnt = await this.prisma.answerItem.count({
      where: { answerSheetId: sheetId, questionCategory: 'subjective', finalScore: null },
    });
    return cnt > 0;
  }

  /**
   * 提交人工评分（事务：逐题写 append-only 评分记录 + 回写 finalScore/score，重算主观题总分）
   * 全部主观题评完后答卷状态置为 completed。
   * @throws 答题项不属于该答卷或超出满分时抛出中文错误
   */
  async submitReview(
    sheetId: number,
    items: ReviewInput[],
    reviewer: { id: number; name: string },
  ): Promise<void> {
    const itemIds = items.map((i) => i.answerItemId);
    // 入参去重校验：同一答题项不允许在一次提交里出现多次（否则产生重复留痕、后者覆盖前者）
    if (itemIds.length !== new Set(itemIds).size) {
      throw new Error('存在重复的评分题目，请检查后重试');
    }
    const dbItems = await this.prisma.answerItem.findMany({
      where: { id: { in: itemIds }, answerSheetId: sheetId, questionCategory: 'subjective' },
    });
    const dbMap = new Map(dbItems.map((d) => [d.id, d]));
    if (dbItems.length !== itemIds.length) {
      throw new Error('存在无效的评分题目，请刷新后重试');
    }
    for (const input of items) {
      const db = dbMap.get(input.answerItemId)!;
      if (input.scoreAfter > db.fullScore) {
        throw new Error(`第 ${db.questionNo} 题分数不能超过满分 ${db.fullScore}`);
      }
    }

    // 在内存中预算复核后各主观题的最终分与主观题总分、是否全部完成，
    // 与写入操作一并放进同一事务，保证「逐题分 / 主观题总分 / 状态」三者原子一致。
    const allSubjective = await this.prisma.answerItem.findMany({
      where: { answerSheetId: sheetId, questionCategory: 'subjective' },
      select: { id: true, finalScore: true },
    });
    const afterMap = new Map(items.map((i) => [i.answerItemId, i.scoreAfter]));
    let subjectiveTotal = 0;
    let allGraded = true;
    for (const s of allSubjective) {
      const finalAfter = afterMap.has(s.id) ? afterMap.get(s.id)! : s.finalScore;
      if (finalAfter === null || finalAfter === undefined) allGraded = false;
      subjectiveTotal = this.round1(subjectiveTotal + (finalAfter ?? 0));
    }

    const ops: Prisma.PrismaPromise<any>[] = [];
    for (const input of items) {
      const db = dbMap.get(input.answerItemId)!;
      // 改分前的分数：AI 阅卷移除后 aiScore 已无写入方，但历史行可能有值，留作兜底
      const scoreBefore = db.finalScore ?? db.aiScore ?? null;
      ops.push(
        this.prisma.reviewRecord.create({
          data: {
            answerSheetId: sheetId,
            answerItemId: input.answerItemId,
            reviewerId: reviewer.id,
            reviewerName: reviewer.name,
            scoreBefore,
            scoreAfter: input.scoreAfter,
            reviewComment: input.reviewComment ?? '',
          },
        }),
        this.prisma.answerItem.update({
          where: { id: input.answerItemId },
          // 只写人工分：aiGradeFailed 列在 AI 阅卷移除后已无写入方，保持默认 false 不再触碰
          data: { finalScore: input.scoreAfter, score: input.scoreAfter },
        }),
      );
    }
    // 主观题总分回写 + 全部完成时推进状态，纳入同一事务
    ops.push(
      this.prisma.answerSheet.update({
        where: { id: sheetId },
        data: {
          subjectiveScore: subjectiveTotal,
          ...(allGraded ? { gradingStatus: 'completed' } : {}),
        },
      }),
    );
    await this.prisma.$transaction(ops);
  }

  /**
   * 成绩发布：汇总总分与及格判定，标记已发布（供考生查询）
   * @throws 存在未完成主观题时抛出中文错误
   */
  async publishScore(sheetId: number): Promise<void> {
    const sheet = await this.getSheet(sheetId);
    if (!sheet) throw new Error('答卷不存在');
    if (sheet.scorePublished) throw new Error('成绩已发布，无需重复发布');
    if (await this.hasUngradedSubjective(sheetId)) {
      throw new Error('存在未完成阅卷的主观题，无法发布成绩');
    }
    // 客观题若从未判分（objectiveScore 为 null），发布前补算，避免按 0 计入导致总分/及格判定错误
    const objective =
      sheet.objectiveScore ?? (await this.autoGradeObjective(sheetId));
    const subjective = await this.recalcSubjective(sheetId);
    const total = this.round1(objective + subjective);
    const passed = total >= sheet.exam.passScore;
    await this.prisma.answerSheet.update({
      where: { id: sheetId },
      data: {
        totalScore: total,
        passed,
        scorePublished: true,
        gradingStatus: 'completed',
      },
    });

    if (passed) {
      await this.tryIssueCertificate(sheetId);
    }
  }

  /**
   * 及格后发证，失败只记日志
   *
   * 发证失败不回滚成绩：成绩已经算对了，因发证配置有问题把阅卷结果一起吞掉更糟。
   *
   * 抽成 public 是因为有两条发布成绩的路径都要发证，错误处理策略必须一致：
   * 一是本类的 publishScore（含主观题的卷由管理端阅卷后发布），
   * 二是 AppExamService.submitExam（纯客观题卷交卷即时出分并发布）。
   * 后者此前漏了发证——纯客观题的考试即便开了自动发证也永远拿不到证书。
   *
   * 调用方须自行确认该答卷已及格且成绩已发布，本方法不重复判定。
   *
   * @param sheetId 答卷 ID
   */
  async tryIssueCertificate(sheetId: number): Promise<void> {
    try {
      await this.issueCertificate(sheetId);
    } catch (e) {
      this.logger.error(
        `答卷 ${sheetId} 成绩已发布但自动发证失败：${e instanceof Error ? e.message : e}`,
      );
    }
  }

  /**
   * 通过后自动发证
   *
   * 触发条件：考试开了 autoIssueCert 且指定了证书模板（certTemplateId）。
   * 有效期统一取 DEFAULT_VALID_MONTHS。
   *
   * 模板不再从鉴定项目上取：项目已按业务要求去掉「关联考试/证书模板/有效期」
   * 三个字段，只保留工种、级别、时间与名额。项目仍会记到证书的 projectId 上
   * （表示这张证书属于哪个鉴定项目），但模板只认考试上直配的那个。
   *
   * 幂等靠 Certificate.answerSheetId 的唯一约束兜底——并发或重复发布时
   * 后一条 create 会撞 P2002，此处按「已发过」处理而不是抛错。
   *
   * @param sheetId 答卷 ID
   */
  private async issueCertificate(sheetId: number): Promise<void> {
    const sheet = await this.prisma.answerSheet.findUnique({
      where: { id: sheetId },
      select: {
        id: true,
        candidateType: true,
        internalUserId: true,
        externalCandidateId: true,
        candidateName: true,
        tenantId: true,
        exam: {
          select: {
            autoIssueCert: true,
            certProjectId: true,
            certTemplateId: true,
          },
        },
      },
    });
    if (!sheet?.exam?.autoIssueCert) return;

    const validMonths = GradingService.DEFAULT_VALID_MONTHS;

    // 项目只用于标记证书归属，仍要确认它还在（已删的项目不写进外键）
    let projectId: number | null = null;
    if (sheet.exam.certProjectId) {
      const project = await this.prisma.certProject.findUnique({
        where: { id: sheet.exam.certProjectId },
        select: { id: true },
      });
      projectId = project?.id ?? null;
    }

    const templateId = sheet.exam.certTemplateId;
    if (!templateId) {
      throw new Error('考试开启了自动发证但未配置证书模板');
    }

    const template = await this.prisma.certificateTemplate.findUnique({
      where: { id: templateId },
      select: { id: true, numberRule: true, ...CERT_TEMPLATE_SNAPSHOT_SELECT },
    });
    if (!template) throw new Error(`证书模板 ${templateId} 不存在`);

    // 已发过就不再发（正常路径的幂等；并发路径由唯一约束兜）
    const existing = await this.prisma.certificate.findUnique({
      where: { answerSheetId: sheetId },
      select: { id: true },
    });
    if (existing) return;

    const issueDate = new Date();
    const expireDate = new Date(issueDate);
    expireDate.setMonth(expireDate.getMonth() + validMonths);

    try {
      await this.prisma.certificate.create({
        data: {
          certNo: await this.generateCertNo(issueDate),
          projectId,
          templateId,
          candidateType: sheet.candidateType,
          internalUserId: sheet.internalUserId,
          externalCandidateId: sheet.externalCandidateId,
          // 姓名取答卷快照，不联表查账号：改名不应改写已发证书
          candidateName: sheet.candidateName,
          // 同理定格模板：模板日后改版不应改写已发出的证书
          templateSnapshot: buildCertTemplateSnapshot(template),
          answerSheetId: sheet.id,
          issueDate,
          expireDate,
          tenantId: sheet.tenantId,
        },
      });
    } catch (e: any) {
      // P2002 = 唯一约束冲突：并发下另一条已发成功，或流水号撞号，均视为已发出
      if (e?.code === 'P2002') return;
      throw e;
    }
  }

  /**
   * 生成证书编号：年份 + 6 位流水号（当年已发数 +1）
   *
   * 模板的 numberRule 目前是自由文本（库里有「年份+6位流水号」也有随手写的值），
   * 无法当规则解析，因此统一按这一种格式生成，避免按文本猜规则产出乱编号。
   * 并发下可能撞号，由 certNo 唯一约束拦住，调用方按已发处理。
   *
   * @param now 发证时间
   */
  private async generateCertNo(now: Date): Promise<string> {
    const year = now.getFullYear();
    const count = await this.prisma.certificate.count({
      where: {
        issueDate: {
          gte: new Date(year, 0, 1),
          lt: new Date(year + 1, 0, 1),
        },
      },
    });
    return `${year}${String(count + 1).padStart(6, '0')}`;
  }

  /**
   * 成绩撤回：清除发布标记与总分/及格（考生不可查）
   *
   * 撤回的是「发布」这一步，不是评分结果——各题 finalScore 与主观题总分都保留，
   * 重新发布无需再阅一遍。
   *
   * 刻意不写 gradingStatus：全仓三处写 scorePublished=true 的地方都在同一条 update
   * 里同步写 gradingStatus='completed'（本方法上方的 publishScore、app-exam.service
   * 的 submitExam 纯客观题即时发布分支、seed.service 的种子数据），不存在
   * scorePublished=true 而 gradingStatus≠completed 的写入路径，
   * 故此处写 completed 在所有可达路径上都是空操作；
   * 而一旦有其他路径（批量脚本、迁移补丁、人工改库）把未评完的卷子置为已发布，
   * 硬写 completed 会把「实际尚有未评题」这个真实状态覆盖掉，
   * 该卷从此在待阅视图里消失、漏批的主观题再也找不回来。不写则真实状态得以保留。
   * @throws 未发布时抛出中文错误
   */
  async withdrawScore(sheetId: number): Promise<void> {
    const sheet = await this.getSheet(sheetId);
    if (!sheet) throw new Error('答卷不存在');
    if (!sheet.scorePublished) throw new Error('成绩尚未发布，无需撤回');
    await this.prisma.answerSheet.update({
      where: { id: sheetId },
      data: {
        scorePublished: false,
        totalScore: null,
        passed: null,
      },
    });
  }

  /**
   * 整场发布成绩（逐份复用单份 publishScore，跳过不满足条件的）
   *
   * 不做成「一份失败整场回滚」：主观题没阅完是常态而非异常，
   * 若整场回滚，只要有一个人没阅完就谁也发不了，与「先放出已阅完的」这一实际需求相悖。
   * 因此改为逐份尝试、如实回报跳过份数与原因，由前端提示用户。
   *
   * 已发布的答卷计入 skipped 而不报错——整场重复点发布是常见操作，不该当成错误。
   *
   * @returns published 成功份数 / skipped 跳过份数 / reasons 跳过原因去重后的文案
   */
  async publishExamScores(examId: number): Promise<{
    published: number;
    skipped: number;
    reasons: string[];
  }> {
    const sheets = await this.prisma.answerSheet.findMany({
      where: { examId, scorePublished: false },
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    let published = 0;
    const reasonSet = new Set<string>();
    // 串行而非并发：publishScore 内部有「补算客观题 + 重算主观题 + 回写」的多步写入，
    // 并发跑会互相争抢同一考试的证书发放等副作用，逐份跑更可控
    for (const { id } of sheets) {
      try {
        await this.publishScore(id);
        published += 1;
      } catch (e) {
        reasonSet.add(e instanceof Error ? e.message : '发布失败');
      }
    }
    return { published, skipped: sheets.length - published, reasons: [...reasonSet] };
  }

  /**
   * 整场撤回成绩（逐份复用单份 withdrawScore）
   * 未发布的答卷本就无需撤回，不计入失败。
   *
   * @returns withdrawn 成功份数 / skipped 跳过份数 / reasons 跳过原因去重后的文案
   */
  async withdrawExamScores(examId: number): Promise<{
    withdrawn: number;
    skipped: number;
    reasons: string[];
  }> {
    const sheets = await this.prisma.answerSheet.findMany({
      where: { examId, scorePublished: true },
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    let withdrawn = 0;
    const reasonSet = new Set<string>();
    for (const { id } of sheets) {
      try {
        await this.withdrawScore(id);
        withdrawn += 1;
      } catch (e) {
        reasonSet.add(e instanceof Error ? e.message : '撤回失败');
      }
    }
    return { withdrawn, skipped: sheets.length - withdrawn, reasons: [...reasonSet] };
  }

  /** 保留 1 位小数 */
  private round1(n: number): number {
    return Math.round(n * 10) / 10;
  }
}
