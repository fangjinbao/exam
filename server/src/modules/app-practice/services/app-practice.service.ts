import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import { AiModelService } from '@/modules/system/services/ai-model.service';
import { computePracticeStatus } from '@/modules/exam/utils/practice-status';
import { buildRuleWhere, ROOT_ONLY } from '@/modules/exam/utils/rule-where';
import { expandCompositeSlots } from '@/modules/exam/utils/composite-expand';
import { parseQuestionOptions } from '@/common/utils/question-option.util';
import {
  judgeObjective,
  isObjectiveType,
  countStemBlanks,
} from '@/common/utils/objective-judge.util';

/**
 * 考生端练习服务
 *
 * 覆盖两条来源不同的练习路径：
 * - 岗位练兵：管理员在后台建好、指定参与人，考生只能进入分配给自己的练习，
 *   题目范围与抽题方式由 Practice 配置决定，交互细节由 PracticeSetting 决定；
 * - 自主练习：考生自选题库或知识点即时取题，无 Practice 记录。
 *
 * 与考试的根本差异：练习无阅卷流程、无成绩发布、逐题即时判分即时反馈，
 * 故不复用 AnswerSheet 而落在 PracticeRecord / PracticeAnswer。
 *
 * 身份一律取自 token，不接受前端传入用户 id。
 */
@Injectable()
export class AppPracticeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiModelService: AiModelService,
  ) {}

  /**
   * AI 答疑：就某道题向当前启用的模型提问
   *
   * 带上题干与解析作为上下文，让回答贴着这道题讲而不是泛泛而谈；但绝不把
   * 标准答案塞进提示词——考生可能正在作答中，直接说出答案就失去练习意义。
   * AI 不可用时抛出可读原因，前端据此提示并保留用户输入。
   *
   * @param questionId 关联题目 id（可空，为空时按通用问答处理）
   * @param question 考生的问题
   */
  async aiAsk(questionId: number | undefined, question: string) {
    let context = '';
    if (questionId) {
      const q = await this.prisma.question.findUnique({
        where: { id: questionId },
        select: { stem: true, analysis: true },
      });
      if (q) {
        context = `\n\n【题目】${q.stem}`;
        if (q.analysis) context += `\n【解析】${q.analysis}`;
      }
    }

    const systemPrompt =
      '你是考试练习平台的答疑助手。请用简洁中文讲清知识点与解题思路，' +
      '帮助学员理解而不是直接给出选项答案。若学员明确索要答案，' +
      '引导其先自行作答，作答后系统会展示对错。';

    const res = await this.aiModelService.chat(`${question}${context}`, systemPrompt);
    if (!res.ok) throw new BadRequestException(res.message || 'AI 答疑暂不可用');
    return { answer: res.data!.answer };
  }

  /**
   * 构造「当前练习人」的库查询条件
   *
   * 内外部考生存在不同字段，且 MySQL 唯一索引不约束 NULL，
   * 必须按类型二选一，不能简单 where 两个字段都带上。
   *
   * @param userId 当前登录用户 id
   * @param userType 用户类型：internal 内部 / external 外部
   */
  private buildUserWhere(userId: number, userType: string) {
    return userType === 'external'
      ? { userType: 'external', externalCandidateId: userId }
      : { userType: 'internal', internalUserId: userId };
  }

  /**
   * 我的岗位练兵列表
   *
   * 可见范围：participantScope=all 的全员练习，或 participants 里点名了我的练习；
   * 未发布的一律不可见。状态按当前时间惰性判定（复用考试侧同款 computePracticeStatus），
   * 但与考试不同——练习时间可为空表示不限时，发布即进行中。
   *
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   */
  async getPracticeList(userId: number, userType: string) {
    const isExternal = userType === 'external';
    const rows = await this.prisma.practice.findMany({
      where: {
        status: { not: 'unpublished' },
        OR: [
          { participantScope: 'all' },
          {
            participants: {
              some: isExternal
                ? { participantType: 'external', externalCandidateId: userId }
                : { participantType: 'internal', internalUserId: userId },
            },
          },
        ],
      },
      include: {
        banks: { include: { bank: { select: { name: true } } } },
        rules: { select: { drawCount: true } },
        setting: true,
        records: { where: this.buildUserWhere(userId, userType) },
      },
      orderBy: { createTime: 'desc' },
    });

    const now = new Date();
    return Promise.all(
      rows.map(async (row) => {
        const status = computePracticeStatus(row, now);
        // 我的最新一次练习记录（断点续练与 allowRepeat 判定都看它）
        const mine = row.records.sort(
          (a, b) => b.createTime.getTime() - a.createTime.getTime(),
        )[0];

        const totalCount =
          row.drawMode === 'random'
            ? row.rules.reduce((sum, r) => sum + r.drawCount, 0)
            : await this.countSequentialTotal(row.banks.map((b) => b.bankId));

        // 不允许反复练习时，练完即不可再进入
        const repeatBlocked = row.setting?.allowRepeat === false && mine?.finished === true;
        const finishedBlocked = status === 'finished';
        // 已发布但未到 startTime。必须在这里拦住：assertPracticeAccessible 对非
        // ongoing 一律抛「练习尚未开始」，若此处放行，列表会显示成可练，
        // 用户点进去才收到报错 toast 并停在空列表页
        const notStartedBlocked = status === 'published';

        return {
          id: row.id,
          name: row.name,
          description: row.description ?? undefined,
          bankNames: row.banks.map((b) => b.bank.name).join(' / '),
          totalCount,
          startTime: row.startTime?.toISOString(),
          endTime: row.endTime?.toISOString(),
          status,
          answeredCount: mine?.answeredCount ?? 0,
          finished: mine?.finished ?? false,
          // 取 updateTime 而非 createTime：createTime 是这条记录开练的时刻，
          // 断点续练时用户可能隔几天回来接着练，此时「上次练习」应是最近一次
          // 作答，updateTime 才是。mine 已在 include 里取出，不额外查库。
          //
          // 这里依赖一条不变式：PracticeRecord 只被用户作答（submitAnswer）与
          // 用户结束练习（finishPractice）更新。updateTime 是 @updatedAt，
          // 任何字段变更都会刷新它——新增 practiceRecord.update 调用前请先确认
          // 不是后台批量操作（租户迁移、数据修复等），否则这里会显示成
          // 「用户刚练过」而实际没练。逐题明细 PracticeAnswer 无作答时间字段
          // （其 createTime 是建占位行的时刻），无法作为更严格的替代数据源。
          lastPracticeTime: mine?.updateTime.toISOString(),
          canPractice: !finishedBlocked && !repeatBlocked && !notStartedBlocked,
          blockReason: finishedBlocked
            ? '练习已结束'
            : notStartedBlocked
              ? '练习尚未开始'
              : repeatBlocked
                ? '本练习不允许反复练习'
                : undefined,
        };
      }),
    );
  }

  /**
   * 统计全库顺序练的题目总数
   * @param bankIds 练习关联的题库 id 列表
   */
  private async countSequentialTotal(bankIds: number[]): Promise<number> {
    if (bankIds.length === 0) return 0;
    // ROOT_ONLY 与 drawSequential、管理端 fillQuestionCounts 同口径：
    // 都只数根节点。少了它，材料题会按「母题 + 各小题」重复计数，
    // 同一个练习在管理端与学员端会显示不同的题目数。
    return this.prisma.question.count({
      where: { questionBankId: { in: bankIds }, status: 'formal', ...ROOT_ONLY },
    });
  }

  /**
   * 校验我是否有权进入这场岗位练兵，并返回练习配置
   *
   * 三道关卡缺一不可：练习存在、我在参与范围内、当前状态允许练习。
   * 越权拦截必须在服务端做——前端列表已过滤，但接口可被直接调用。
   *
   * @param practiceId 练习 id
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   */
  private async assertPracticeAccessible(
    practiceId: number,
    userId: number,
    userType: string,
  ) {
    const isExternal = userType === 'external';
    const practice = await this.prisma.practice.findFirst({
      where: {
        id: practiceId,
        status: { not: 'unpublished' },
        OR: [
          { participantScope: 'all' },
          {
            participants: {
              some: isExternal
                ? { participantType: 'external', externalCandidateId: userId }
                : { participantType: 'internal', internalUserId: userId },
            },
          },
        ],
      },
      include: {
        banks: true,
        rules: true,
        setting: true,
      },
    });
    if (!practice) throw new NotFoundException('练习不存在或未分配给你');

    const status = computePracticeStatus(practice, new Date());
    if (status === 'finished') throw new BadRequestException('练习已结束');
    if (status !== 'ongoing') throw new BadRequestException('练习尚未开始');

    return practice;
  }

  /**
   * 按练习配置抽取题目 id 列表
   *
   * - sequential 全库顺序练：忽略抽题规则，按题库内既有顺序取全部正式题；
   * - random 按规则抽题：逐条规则随机抽取，多条规则共享同一已抽集合以免同题重复
   *   （与 buildRuleWhere 注释中的约定一致）。
   *
   * @param practice 含 banks / rules / drawMode 的练习记录
   */
  private async drawQuestionIds(practice: {
    drawMode: string;
    banks: { bankId: number }[];
    rules: { questionType: string; difficulty: string; knowledgePointId: number; drawCount: number }[];
  }): Promise<number[]> {
    const bankIds = practice.banks.map((b) => b.bankId);
    if (bankIds.length === 0) return [];

    if (practice.drawMode === 'sequential') {
      /*
        ROOT_ONLY 不可省：这是「从题池挑新题」的查询。

        小题继承母题的题库与状态，不加过滤时母题与其小题会一起进 drawIds，
        随后 expandCompositeSlots 把母题展开成小题，drawIds 里那几个小题
        自己又各占一个 slot——每个小题被练两遍。
        PracticeAnswer 的唯一键是 [recordId, questionNo]，不会报错，只会静默重复。

        与 buildRuleWhere（random 分支）和管理端的题目数统计保持同一口径。
      */
      const rows = await this.prisma.question.findMany({
        where: { questionBankId: { in: bankIds }, status: 'formal', ...ROOT_ONLY },
        select: { id: true },
        orderBy: { id: 'asc' },
      });
      return rows.map((r) => r.id);
    }

    // random：逐条规则抽题，已抽中的排除，避免同一题进同一份练习两次
    const picked: number[] = [];
    for (const rule of practice.rules) {
      const where = buildRuleWhere(bankIds, rule);
      const candidates = await this.prisma.question.findMany({
        where: { ...where, id: { notIn: picked.length > 0 ? picked : undefined } },
        select: { id: true },
      });
      // 洗牌后取前 drawCount 条；题量不足时取尽有的，不报错阻断练习
      const shuffled = candidates.map((c) => c.id).sort(() => Math.random() - 0.5);
      picked.push(...shuffled.slice(0, rule.drawCount));
    }
    return picked;
  }

  /**
   * 取得或创建练习记录（支撑断点续练）
   *
   * 未练完的记录直接复用，题目与题序都从 PracticeAnswer 还原，保证刷新或
   * 退出重进后接着上次的题继续，且已答过的题不会被重新抽题打乱。
   * 已练完的记录不复用——允许反复练习时应开启新一轮。
   *
   * @param practiceId 岗位练兵 id，自主练习传 null
   * @param sourceType 来源类型：assigned / self / wrong
   * @param sourceName 来源名称快照
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   * @param drawIds 本轮应练的题目 id 列表（复用既有记录时忽略）
   */
  private async getOrCreateRecord(
    practiceId: number | null,
    sourceType: string,
    sourceName: string,
    userId: number,
    userType: string,
    drawIds: number[],
    // 自主练习的范围标识；岗位练兵与错题重练传 undefined
    selfScope?: { bankId: number | null; knowledgePointId: number | null },
  ) {
    const userWhere = this.buildUserWhere(userId, userType);

    /*
      未练完的记录优先复用（断点续练）。

      自主练习必须把题库/知识点纳入匹配条件：它的 practiceId 恒为 null、
      sourceType 恒为 'self'，只按这两列找会把「任意一场未完成的自主练习」认成本次的，
      表现为 A 题库练一半退出、进 B 题库时接着练到 A 的题。
      岗位练兵有 practiceId 天然区分，不受影响。
    */
    const scopeWhere =
      sourceType === 'self'
        ? { selfBankId: selfScope?.bankId ?? null, selfKnowledgePointId: selfScope?.knowledgePointId ?? null }
        : {};
    const existing = await this.prisma.practiceRecord.findFirst({
      where: { practiceId, sourceType, finished: false, ...scopeWhere, ...userWhere },
      include: { answers: { orderBy: { questionNo: 'asc' } } },
      orderBy: { createTime: 'desc' },
    });
    if (existing && existing.answers.length > 0) return existing;

    if (drawIds.length === 0) throw new BadRequestException('练习范围内没有可练的题目');

    // 新建记录并一次性铺好全部题序占位，题序即 PracticeAnswer.questionNo
    //
    // drawIds 是根节点 id，可能含 composite 材料题。材料题本身不可作答（无答案无选项），
    // 直接建记录会得到一条判不了分的空记录、且其小题完全不出现在练习里，
    // 故先展开为实际作答位：材料题 → 其小题按 sortNo 依次占位。
    // totalCount 取展开后的数量，否则进度条分母与实际题数不符。
    const slots = await expandCompositeSlots(this.prisma, drawIds);
    if (slots.length === 0) throw new BadRequestException('练习范围内没有可练的题目');

    const created = await this.prisma.practiceRecord.create({
      data: {
        practiceId,
        sourceType,
        sourceName,
        // 与复用条件同源：写入时和查询时用同一组范围标识，否则新建的记录下次找不回来
        selfBankId: selfScope?.bankId ?? null,
        selfKnowledgePointId: selfScope?.knowledgePointId ?? null,
        ...userWhere,
        totalCount: slots.length,
        answers: {
          create: slots.map((slot, idx) => ({
            questionId: slot.questionId,
            questionNo: idx + 1,
            // 标准答案取题时即冗余留存，题库日后被改不影响本次复盘
            standardAnswer: slot.answer || null,
          })),
        },
      },
      include: { answers: { orderBy: { questionNo: 'asc' } } },
    });
    return created;
  }

  /**
   * 取练习题（岗位练兵 / 自主练习 / 错题重练三条路径的统一入口）
   *
   * 下发内容受 PracticeSetting 控制：关闭展示答案时 answer 置空串、关闭展示解析时
   * 不下发 analysis——不能依赖前端隐藏，否则考生在网络面板里就能看到答案。
   * 自主练习与错题重练无 Practice 配置，按「即时反馈全开」处理。
   *
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   * @param query 取题参数：practiceId 或 bankId/knowledgePointId，mode=wrong 为错题重练
   */
  async getQuestions(
    userId: number,
    userType: string,
    query: { practiceId?: number; bankId?: number; knowledgePointId?: number; mode?: string },
  ) {
    const { practiceId, bankId, knowledgePointId, mode } = query;

    let sourceType = 'self';
    let sourceName = '自主练习';
    let drawIds: number[] = [];
    // 仅自主练习有值：随记录落库，供断点续练按题库区分、提交时反查展示开关
    let selfScope: { bankId: number | null; knowledgePointId: number | null } | undefined;
    let setting = {
      showResultPerQuestion: true,
      showAnswer: true,
      showAnalysis: true,
    };

    if (practiceId) {
      const practice = await this.assertPracticeAccessible(practiceId, userId, userType);
      // 不允许反复练习且已练完的，直接拦在取题前
      if (practice.setting?.allowRepeat === false) {
        const done = await this.prisma.practiceRecord.findFirst({
          where: { practiceId, finished: true, ...this.buildUserWhere(userId, userType) },
          select: { id: true },
        });
        if (done) throw new BadRequestException('本练习不允许反复练习');
      }
      sourceType = 'assigned';
      sourceName = practice.name;
      drawIds = await this.drawQuestionIds(practice);
      if (practice.setting) {
        // 展示答案/解析仅在开启单题对错时有意义，关闭时强制置 false（与管理端存库口径一致）
        const perQuestion = practice.setting.showResultPerQuestion;
        setting = {
          showResultPerQuestion: perQuestion,
          showAnswer: perQuestion && practice.setting.showAnswer,
          showAnalysis: perQuestion && practice.setting.showAnalysis,
        };
      }
    } else if (mode === 'wrong') {
      sourceType = 'wrong';
      sourceName = '错题重练';
      drawIds = await this.getWrongQuestionIds(userId, userType);
      if (drawIds.length === 0) throw new BadRequestException('错题本为空，先去练习或考试吧');
    } else {
      const scope = await this.resolveSelfScope(userId, userType, bankId, knowledgePointId);
      sourceName = scope.name;
      drawIds = scope.questionIds;
      // 自主练习的展示开关取自 SelfPracticeConfig，与岗位练兵各自独立
      setting = scope.setting;
      selfScope = scope.scope;
    }

    const record = await this.getOrCreateRecord(
      practiceId ?? null,
      sourceType,
      sourceName,
      userId,
      userType,
      drawIds,
      selfScope,
    );

    return this.buildQuestionsPayload(record, sourceName, setting);
  }

  /**
   * 解析自主练习的范围并取题
   *
   * 知识点优先于题库：两者都传时按知识点收窄。只取正式题（status=formal），
   * 草稿题不应出现在练习里。
   *
   * @param bankId 题库 id
   * @param knowledgePointId 知识点 id
   */
  private async resolveSelfScope(
    userId: number,
    userType: string,
    bankId?: number,
    knowledgePointId?: number,
  ) {
    if (!bankId) throw new BadRequestException('请选择练习题库');

    const isExternal = userType === 'external';
    // 授权校验必须在服务端做：选项接口已过滤，但取题接口可被直接调用
    const config = await this.prisma.selfPracticeConfig.findFirst({
      where: {
        bankId,
        isOpen: true,
        OR: [
          { openScope: 'all' },
          {
            openScope: 'specified',
            users: {
              some: isExternal
                ? { userType: 'external', externalCandidateId: userId }
                : { userType: 'internal', internalUserId: userId },
            },
          },
        ],
      },
      include: {
        bank: { select: { name: true } },
        knowledgePoints: { select: { knowledgePointId: true } },
      },
    });
    if (!config) throw new NotFoundException('该题库未开放自主练习');

    /*
      不允许反复练习时，本题库已练完过就不再放行。

      按 selfBankId 匹配而非 sourceName：后者是题库名的快照，
      管理员把题库改个名，旧记录的快照就对不上，allowRepeat 静默失效。
      selfBankId 是存量记录可能为 null 的新列，见下方兼容说明。
    */
    if (!config.allowRepeat) {
      const done = await this.prisma.practiceRecord.findFirst({
        where: {
          practiceId: null,
          sourceType: 'self',
          finished: true,
          // 存量记录没有 selfBankId，回落到名称快照，避免升级后旧记录一律不算「已练完」
          OR: [{ selfBankId: bankId }, { selfBankId: null, sourceName: config.bank.name }],
          ...this.buildUserWhere(userId, userType),
        },
        select: { id: true },
      });
      if (done) throw new BadRequestException('该题库不允许反复练习');
    }

    const allowedKpIds = config.knowledgePoints.map((k) => k.knowledgePointId);
    // 指定了知识点时校验它在开放范围内，避免越过范围练到不该练的题
    if (knowledgePointId && allowedKpIds.length > 0 && !allowedKpIds.includes(knowledgePointId)) {
      throw new BadRequestException('该知识点不在开放范围内');
    }

    const kpFilter = knowledgePointId
      ? { some: { knowledgePointId } }
      : allowedKpIds.length > 0
        ? { some: { knowledgePointId: { in: allowedKpIds } } }
        : undefined;

    const rows = await this.prisma.question.findMany({
      where: {
        questionBankId: bankId,
        status: 'formal',
        // 与岗位练兵的顺序练同一口径：这是「从题池挑新题」，
        // 不加 ROOT_ONLY 时母题与其小题会一起进来，展开后每个小题被练两遍
        ...ROOT_ONLY,
        ...(kpFilter ? { knowledgePoints: kpFilter } : {}),
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    if (rows.length === 0) throw new BadRequestException('该范围下暂无可练题目');

    let ids = rows.map((r) => r.id);
    // maxQuestionsPerRound=0 表示不限；超出上限时随机取，避免每轮都练同样的前 N 题
    if (config.maxQuestionsPerRound > 0 && ids.length > config.maxQuestionsPerRound) {
      ids = [...ids].sort(() => Math.random() - 0.5).slice(0, config.maxQuestionsPerRound);
    }

    let name = config.bank.name;
    if (knowledgePointId) {
      const kp = await this.prisma.knowledgePoint.findUnique({
        where: { id: knowledgePointId },
        select: { name: true },
      });
      if (kp) name = kp.name;
    }

    // 自主练习有独立于岗位练兵的一套展示开关，同样遵循「关闭单题对错则答案解析强制隐藏」
    const perQuestion = config.showResultPerQuestion;
    return {
      name,
      questionIds: ids,
      // 范围标识随记录落库，供断点续练按题库区分、以及提交时反查展示开关
      scope: { bankId, knowledgePointId: knowledgePointId ?? null },
      setting: {
        showResultPerQuestion: perQuestion,
        showAnswer: perQuestion && config.showAnswer,
        showAnalysis: perQuestion && config.showAnalysis,
      },
    };
  }

  /**
   * 我的错题题目 id 列表
   *
   * 两个来源合并去重：历次考试中判错的题（AnswerItem.isCorrect=false）与
   * 练习中答错的题（PracticeAnswer.isCorrect=false）。与首页 wrongCount
   * 的统计口径保持一致，避免首页显示有错题、进错题本却是空的。
   *
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   */
  private async getWrongQuestionIds(userId: number, userType: string): Promise<number[]> {
    const isExternal = userType === 'external';
    const sheetWhere = isExternal
      ? { candidateType: 'external', externalCandidateId: userId }
      : { candidateType: 'internal', internalUserId: userId };

    const [fromExam, fromPractice] = await Promise.all([
      this.prisma.answerItem.findMany({
        where: { isCorrect: false, answerSheet: sheetWhere },
        select: { questionId: true },
      }),
      this.prisma.practiceAnswer.findMany({
        where: { isCorrect: false, record: this.buildUserWhere(userId, userType) },
        select: { questionId: true },
      }),
    ]);

    const ids = new Set<number>();
    for (const r of fromExam) ids.add(r.questionId);
    for (const r of fromPractice) ids.add(r.questionId);

    // 题目可能已被删除或转为草稿，取题前过滤，否则练习里会出现空白题
    if (ids.size === 0) return [];
    // 注意：这里**不能**加 ROOT_ONLY（parentId: null）。
    // 上面的 id 来自 AnswerItem / PracticeAnswer，材料题不产生作答记录、
    // 只有其小题产生，所以这批 id 里本就包含小题 id。
    // 加了过滤会把所有材料题小题的错题记录丢掉，错题本对材料题彻底失效。
    const alive = await this.prisma.question.findMany({
      where: { id: { in: [...ids] }, status: 'formal' },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    return alive.map((r) => r.id);
  }

  /**
   * 组装取题响应
   *
   * 题干与选项按 questionNo 顺序下发，已答过的题回填 userAnswer 供前端展示。
   * resumeNo 取第一道未作答题的题序，前端据此直接跳到断点位置。
   *
   * @param record 含 answers 的练习记录
   * @param sourceName 练习名称
   * @param setting 练习设置（决定答案与解析是否下发）
   */
  private async buildQuestionsPayload(
    record: {
      id: number;
      answers: {
        questionId: number;
        questionNo: number;
        candidateAnswer: string | null;
        standardAnswer: string | null;
      }[];
    },
    sourceName: string,
    setting: {
      showResultPerQuestion: boolean;
      showAnswer: boolean;
      showAnalysis: boolean;
    },
  ) {
    const questionIds = record.answers.map((a) => a.questionId);
    const questions = await this.prisma.question.findMany({
      where: { id: { in: questionIds } },
      // parentId 供考生端按材料题分组渲染（材料在上、小题依次在下）
      select: {
        id: true,
        type: true,
        stem: true,
        options: true,
        analysis: true,
        parentId: true,
      },
    });
    const qMap = new Map(questions.map((q) => [q.id, q]));

    // 练习记录只为小题建行（材料题不产生作答位），故材料不在上面的查询结果里。
    // 不补出来的话，小题会脱离材料单独出现，考生无从作答。
    const parentIds = [...new Set(questions.map((q) => q.parentId).filter((pid): pid is number => pid != null))];
    const parents = parentIds.length
      ? await this.prisma.question.findMany({
          where: { id: { in: parentIds } },
          select: { id: true, type: true, stem: true, analysis: true },
        })
      : [];
    const parentMap = new Map(parents.map((p) => [p.id, p]));

    const typeNames = await this.prisma.dictInfo.findMany({
      where: { type: { key: 'question_type' } },
      select: { value: true, name: true },
    });
    const typeTextMap = new Map(typeNames.map((t) => [t.value, t.name]));

    // 已插入过材料的材料题，避免同一材料题的多个小题重复插入材料
    const emittedParents = new Set<number>();
    const list: Array<Record<string, any>> = [];

    for (const a of record.answers) {
      const q = qMap.get(a.questionId);
      // 题目被删除时跳过，不让整份练习取卷失败
      if (!q) continue;

      // 小题前先插入其材料（同组只插一次），供前端分组渲染
      if (q.parentId != null && !emittedParents.has(q.parentId)) {
        const parent = parentMap.get(q.parentId);
        if (parent) {
          list.push({
            id: parent.id,
            // 材料项不占题序，沿用其首个小题的题序便于前端定位
            questionNo: a.questionNo,
            type: parent.type,
            typeText: typeTextMap.get(parent.type) ?? parent.type,
            content: parent.stem,
            options: [],
            answer: '',
            analysis: setting.showAnalysis ? (parent.analysis ?? undefined) : undefined,
            userAnswer: '',
            parentId: null,
            // 材料项自身不作答，恒为 0
            blankCount: 0,
          });
        }
        emittedParents.add(q.parentId);
      }

      list.push({
        id: q.id,
        questionNo: a.questionNo,
        type: q.type,
        typeText: typeTextMap.get(q.type) ?? q.type,
        content: q.stem,
        options: parseQuestionOptions(q.options, q.type),
        // 关闭展示答案时置空串，绝不下发真实答案
        answer: setting.showAnswer ? (a.standardAnswer ?? '') : '',
        analysis: setting.showAnalysis ? (q.analysis ?? undefined) : undefined,
        userAnswer: a.candidateAnswer ?? '',
        parentId: q.parentId,
        // 填空题空位数，考生端据此渲染对应数量的输入框；与判分切分同源
        blankCount: q.type === 'blank' ? countStemBlanks(q.stem) : 0,
      });
    }

    const firstUnanswered = record.answers.find(
      (a) => a.candidateAnswer === null || a.candidateAnswer === '',
    );

    return {
      recordId: record.id,
      name: sourceName,
      questions: list,
      setting,
      resumeNo: firstUnanswered?.questionNo ?? 1,
    };
  }

  /**
   * 提交单题作答并即时判分
   *
   * 判分复用与考试同一个 judgeObjective，保证同一道题在练习和考试里结论一致。
   * 主观题（qa/essay）练习不判分，isCorrect 留 null 只记录作答。
   * 幂等：同题重复提交按最后一次作答覆盖，计数按「该题此前是否已答」增量维护，
   * 不做全表重算——否则每答一题都要扫全部明细。
   *
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   * @param dto 作答参数
   */
  async submitAnswer(
    userId: number,
    userType: string,
    dto: { recordId: number; questionNo: number; answer: string },
  ) {
    const record = await this.prisma.practiceRecord.findFirst({
      where: { id: dto.recordId, ...this.buildUserWhere(userId, userType) },
      select: {
        id: true,
        practiceId: true,
        answeredCount: true,
        correctCount: true,
        // 判断是否回传对错要用到：自主练习的开关在 SelfPracticeConfig，按 selfBankId 反查
        sourceType: true,
        selfBankId: true,
      },
    });
    if (!record) throw new NotFoundException('练习记录不存在');

    const item = await this.prisma.practiceAnswer.findFirst({
      where: { recordId: dto.recordId, questionNo: dto.questionNo },
      include: { question: { select: { type: true } } },
    });
    if (!item) throw new NotFoundException('题目不存在');

    const objective = isObjectiveType(item.question.type);
    const isCorrect = objective
      ? judgeObjective(dto.answer, item.standardAnswer, item.question.type)
      : null;

    // 该题此前是否已答，决定 answeredCount 是否 +1（重复提交不重复计数）
    const wasAnswered = item.candidateAnswer !== null && item.candidateAnswer !== '';
    const wasCorrect = item.isCorrect === true;

    const [, updated] = await this.prisma.$transaction([
      this.prisma.practiceAnswer.update({
        where: { id: item.id },
        data: { candidateAnswer: dto.answer, isCorrect },
      }),
      this.prisma.practiceRecord.update({
        where: { id: record.id },
        data: {
          answeredCount: wasAnswered ? undefined : { increment: 1 },
          // 对错翻转时同步增减，避免改答案后正确数虚高
          correctCount:
            isCorrect === true && !wasCorrect
              ? { increment: 1 }
              : isCorrect !== true && wasCorrect
                ? { decrement: 1 }
                : undefined,
        },
        select: { answeredCount: true, correctCount: true },
      }),
    ]);

    // 练习设置关闭单题对错时不回传结论，前端也就无从展示
    const showResult = await this.shouldShowResult(record.practiceId, record.sourceType, record.selfBankId);

    return {
      isCorrect: showResult ? isCorrect : null,
      answeredCount: updated.answeredCount,
      correctCount: updated.correctCount,
    };
  }

  /**
   * 该练习是否允许单题作答后展示对错
   *
   * 三条路径各自取配置：岗位练兵取 PracticeSetting、自主练习取 SelfPracticeConfig、
   * 错题重练无配置按全开处理。
   *
   * @param practiceId 岗位练兵 id，自主练习与错题重练为 null
   * @param sourceType 记录来源类型
   * @param selfBankId 自主练习的题库 id（存量记录可能为空）
   *
   * @param practiceId 岗位练兵 id，自主练习为 null
   */
  private async shouldShowResult(
    practiceId: number | null,
    sourceType?: string,
    selfBankId?: number | null,
  ): Promise<boolean> {
    if (practiceId) {
      const setting = await this.prisma.practiceSetting.findUnique({
        where: { practiceId },
        select: { showResultPerQuestion: true },
      });
      return setting?.showResultPerQuestion ?? true;
    }

    /*
      自主练习的开关在 SelfPracticeConfig（以 bankId 为主键）。

      原先这里是 `if (!practiceId) return true`，等于自主练习一律回传对错：
      取题路径已按配置正确隐藏了答案与解析，提交接口却照旧回传真实 isCorrect，
      于是关掉「单题展示对错」后对错依然照常显示，开关形同虚设。

      存量记录没有 selfBankId，无从反查配置，只能按放行处理——
      与升级前的行为一致，不会因为补了这段而让旧记录突然看不到对错。
    */
    if (sourceType === 'self' && selfBankId) {
      const config = await this.prisma.selfPracticeConfig.findUnique({
        where: { bankId: selfBankId },
        select: { showResultPerQuestion: true },
      });
      return config?.showResultPerQuestion ?? true;
    }

    // 错题重练无配置，按即时反馈全开处理
    return true;
  }

  /**
   * 结束整份练习并返回统计
   *
   * 幂等：已结束的记录重复调用直接返回既有统计，不覆盖 finishTime。
   * 正确率按「答对数 / 题目总数」算，未作答的题计入分母——跳过不答不应抬高正确率。
   *
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   * @param recordId 练习记录 id
   */
  async finishPractice(userId: number, userType: string, recordId: number) {
    const record = await this.prisma.practiceRecord.findFirst({
      where: { id: recordId, ...this.buildUserWhere(userId, userType) },
      select: {
        id: true,
        totalCount: true,
        correctCount: true,
        finished: true,
      },
    });
    if (!record) throw new NotFoundException('练习记录不存在');

    if (!record.finished) {
      await this.prisma.practiceRecord.update({
        where: { id: record.id },
        data: { finished: true, finishTime: new Date() },
      });
    }

    const accuracy =
      record.totalCount > 0
        ? Math.round((record.correctCount / record.totalCount) * 1000) / 10
        : 0;

    return {
      recordId: record.id,
      totalCount: record.totalCount,
      correctCount: record.correctCount,
      accuracy,
    };
  }

  /**
   * 我的练习概览（首屏四格数据条）
   *
   * 只统计我自己的练习记录。三项口径：
   * - 正确率按累计答对 / 累计已答计算，而非各次记录正确率的平均值——后者会让
   *   1 题的记录与 20 题的记录等权；
   * - 分母用 answeredCount 而非 totalCount，与相邻的「已练题数」共享同一基数，
   *   否则同一条数据条里两格自相矛盾。注意这与 finishPractice 的单次正确率
   *   不同口径：那里分母是 totalCount（跳过不答按错算），因为单次练习是给定
   *   题量的一份答卷，未答是弃答；此处是累计掌握度，只对答过的题负责。
   *   同一条记录在结果页与本概览可能显示不同百分比，属预期；
   * - 进行中要求 answeredCount > 0，未开练的空记录不计入。
   *
   * 题库数不在此返回：页面同时调 /practice/options 已拿到题库列表，
   * 再在这里跑一遍 getOptions 会把它的逐库 count 白打一倍。
   *
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   */
  async getPracticeStats(userId: number, userType: string) {
    const mine = this.buildUserWhere(userId, userType);

    const [agg, ongoingCount] = await Promise.all([
      // 正确率按「累计答对 / 累计已答」算，不是各次记录正确率求平均——
      // 后者会让一道题的记录和二十道题的记录等权，10 题全对不该抵掉 100 题半对
      this.prisma.practiceRecord.aggregate({
        where: mine,
        _sum: { answeredCount: true, correctCount: true },
      }),
      // 已开练但未练完才算进行中；answeredCount=0 的空记录不算，
      // 与列表页「进行中」标签的判定口径保持一致
      this.prisma.practiceRecord.count({
        where: { ...mine, finished: false, answeredCount: { gt: 0 } },
      }),
    ]);

    const answeredCount = agg._sum.answeredCount ?? 0;
    const correctCount = agg._sum.correctCount ?? 0;

    return {
      answeredCount,
      // 无作答时不能是 NaN，展示层直接当数字用
      accuracy: answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0,
      ongoingCount,
    };
  }

  /**
   * 自主练习的范围选项
   *
   * 可练范围完全由管理端的 SelfPracticeConfig 决定，不是「有题就能练」：
   * - isOpen=false 的题库不开放；
   * - openScope=specified 时还须在 SelfPracticeUser 里点名了我；
   * - 配置了 knowledgePoints 时题目限定在这些考核点内，为空表示题库内不限。
   *
   * 以题库为唯一维度返回，与管理端「自主练习」的配置主体一致：考核点在管理端
   * 是题库设置内的范围限定项，不是并列的练习入口，故不单独放出考核点列表；
   * 取题时 resolveSelfScope 仍按 allowedKpIds 过滤，范围限定不会因此失效。
   *
   * questionCount 为「本轮实际会练到的题数」而非题库总题数：先按考核点范围过滤，
   * 再受 maxQuestionsPerRound 截断，否则考生看到的数与实际作答数不符。
   *
   * canPractice/blockReason 与岗位练兵列表同款：allowRepeat=false 且已练完的题库
   * 仍放出但置灰，避免考生点进去才被 resolveSelfScope 拦下报错。
   *
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   */
  async getOptions(userId: number, userType: string) {
    const isExternal = userType === 'external';
    const configs = await this.prisma.selfPracticeConfig.findMany({
      where: {
        isOpen: true,
        OR: [
          { openScope: 'all' },
          {
            openScope: 'specified',
            users: {
              some: isExternal
                ? { userType: 'external', externalCandidateId: userId }
                : { userType: 'internal', internalUserId: userId },
            },
          },
        ],
      },
      include: {
        bank: { select: { id: true, name: true } },
        // 只要 id 用于过滤题目，不需要考核点名称（不再单独放出考核点入口）
        knowledgePoints: { select: { knowledgePointId: true } },
      },
      orderBy: { bankId: 'asc' },
    });

    // 每库一次 count，与 resolveSelfScope 的取题条件保持同一套过滤
    const counted = await Promise.all(
      configs.map(async (c) => {
        const allowedKpIds = c.knowledgePoints.map((k) => k.knowledgePointId);
        const [total, doneRecord] = await Promise.all([
          this.prisma.question.count({
            where: {
              questionBankId: c.bankId,
              status: 'formal',
              ...(allowedKpIds.length > 0
                ? { knowledgePoints: { some: { knowledgePointId: { in: allowedKpIds } } } }
                : {}),
            },
          }),
          // 不允许反复练习时要先判是否已练完，条件与 resolveSelfScope 的同名闸门一致，
          // 否则列表放出的题库点进去才报错。allowRepeat=true 时不必查。
          c.allowRepeat
            ? Promise.resolve(null)
            : this.prisma.practiceRecord.findFirst({
                where: {
                  practiceId: null,
                  sourceType: 'self',
                  finished: true,
                  // 与 resolveSelfScope 逐字一致：按 selfBankId 认题库，
                  // 存量记录（selfBankId 为空）回落到名称快照。
                  // 两处若不同步，列表说「已练完」而取题接口放行，或者反过来
                  OR: [{ selfBankId: c.bank.id }, { selfBankId: null, sourceName: c.bank.name }],
                  ...this.buildUserWhere(userId, userType),
                },
                select: { id: true },
              }),
        ]);
        // 超上限时实际只练 maxQuestionsPerRound 题，展示数须一致
        const questionCount =
          c.maxQuestionsPerRound > 0 ? Math.min(total, c.maxQuestionsPerRound) : total;
        return {
          id: c.bank.id,
          name: c.bank.name,
          questionCount,
          // 已练完且不允许重练：仍放出但置灰，直接隐去会让考生以为题库丢了
          canPractice: !doneRecord,
          blockReason: doneRecord ? '已练完，该题库不允许反复练习' : '',
        };
      }),
    );

    // 范围内无正式题的题库不放出，避免考生选完才发现没题可练
    return { banks: counted.filter((b) => b.questionCount > 0) };
  }

  /**
   * 错题本列表
   *
   * 按题目聚合答错次数，来源取最近一次答错的考试或练习名称。
   *
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   */
  async getWrongList(userId: number, userType: string) {
    const isExternal = userType === 'external';
    const sheetWhere = isExternal
      ? { candidateType: 'external', externalCandidateId: userId }
      : { candidateType: 'internal', internalUserId: userId };

    const [fromExam, fromPractice, typeNames] = await Promise.all([
      this.prisma.answerItem.findMany({
        where: { isCorrect: false, answerSheet: sheetWhere },
        select: {
          questionId: true,
          candidateAnswer: true,
          question: { select: { type: true, stem: true, status: true } },
          answerSheet: {
            select: { submitTime: true, createTime: true, exam: { select: { name: true } } },
          },
        },
      }),
      this.prisma.practiceAnswer.findMany({
        where: { isCorrect: false, record: this.buildUserWhere(userId, userType) },
        select: {
          questionId: true,
          candidateAnswer: true,
          createTime: true,
          question: { select: { type: true, stem: true, status: true } },
          record: { select: { sourceName: true } },
        },
      }),
      this.prisma.dictInfo.findMany({
        where: { type: { key: 'question_type' } },
        select: { value: true, name: true },
      }),
    ]);

    const typeTextMap = new Map(typeNames.map((t) => [t.value, t.name]));
    type WrongItem = {
      id: number;
      questionId: number;
      typeText: string;
      content: string;
      source: string;
      sourceName: string;
      userAnswer: string;
      wrongTime: string;
      wrongCount: number;
    };
    const merged = new Map<number, WrongItem & { _at: Date }>();

    const add = (
      questionId: number,
      q: { type: string; stem: string; status: string },
      source: string,
      sourceName: string,
      userAnswer: string | null,
      at: Date,
    ) => {
      // 已删除或退回草稿的题不进错题本，点进去也没题可练
      if (q.status !== 'formal') return;
      const hit = merged.get(questionId);
      if (hit) {
        hit.wrongCount += 1;
        // 来源与作答取最近一次答错的，便于复盘时看到最新一次错在哪
        if (at > hit._at) {
          hit._at = at;
          hit.source = source;
          hit.sourceName = sourceName;
          hit.userAnswer = userAnswer ?? '';
          hit.wrongTime = at.toISOString();
        }
        return;
      }
      merged.set(questionId, {
        id: questionId,
        questionId,
        typeText: typeTextMap.get(q.type) ?? q.type,
        content: q.stem,
        source,
        sourceName,
        userAnswer: userAnswer ?? '',
        wrongTime: at.toISOString(),
        wrongCount: 1,
        _at: at,
      });
    };

    for (const r of fromExam) {
      // 未交卷的答卷用创建时间兜底，避免 submitTime 为空导致排序落到 1970
      const at = r.answerSheet.submitTime ?? r.answerSheet.createTime;
      add(r.questionId, r.question, 'exam', r.answerSheet.exam?.name ?? '考试', r.candidateAnswer, at);
    }
    for (const r of fromPractice) {
      add(r.questionId, r.question, 'practice', r.record.sourceName, r.candidateAnswer, r.createTime);
    }

    return [...merged.values()]
      // 最近答错的排前面，同频次时更贴近当下的复习需求
      .sort((a, b) => b._at.getTime() - a._at.getTime())
      .map(({ _at, ...rest }) => rest);
  }


  /**
   * 收藏 / 取消收藏题目（同一入口按当前状态翻转）
   *
   * 内外部用户各走自己的唯一约束（MySQL 唯一索引允许多个 NULL，两条互不干扰），
   * 因此这里按 userType 分支拼 where，不能只用 userId。
   *
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   * @param questionId 题目 ID
   * @returns 翻转后的收藏态
   * @throws NotFoundException 题目不存在或已下架
   */
  async toggleFavorite(userId: number, userType: string, questionId: number) {
    // 题目不存在时不该留下悬空收藏，先校验（只允许收藏正式题）
    const question = await this.prisma.question.findFirst({
      where: { id: questionId, status: 'formal' },
      select: { id: true },
    });
    if (!question) throw new NotFoundException('题目不存在');

    const isExternal = userType === 'external';
    const where = isExternal
      ? {
          uniq_favorite_external: {
            userType: 'external',
            externalCandidateId: userId,
            questionId,
          },
        }
      : {
          uniq_favorite_internal: {
            userType: 'internal',
            internalUserId: userId,
            questionId,
          },
        };

    const existing = await this.prisma.questionFavorite.findUnique({
      where: where as any,
      select: { id: true },
    });

    if (existing) {
      await this.prisma.questionFavorite.delete({ where: { id: existing.id } });
      return { favorited: false };
    }

    await this.prisma.questionFavorite.create({
      data: {
        userType: isExternal ? 'external' : 'internal',
        internalUserId: isExternal ? null : userId,
        externalCandidateId: isExternal ? userId : null,
        questionId,
      },
    });
    return { favorited: true };
  }

  /**
   * 批量查询指定题目的收藏态
   *
   * 只查本卷这批题，不拉全量收藏——练习页每次进来都要用，全量会随收藏数增长而变慢。
   *
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   * @param questionIds 题目 ID，逗号分隔
   * @returns 其中已收藏的题目 ID
   */
  async getFavoriteIds(userId: number, userType: string, questionIds: string) {
    const ids = questionIds
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (!ids.length) return [];

    const rows = await this.prisma.questionFavorite.findMany({
      where: { ...this.buildFavoriteWhere(userId, userType), questionId: { in: ids } },
      select: { questionId: true },
    });
    return rows.map((r) => r.questionId);
  }

  /**
   * 我的收藏列表
   *
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   * @returns 收藏的题目列表，最近收藏的排前面
   */
  async getFavoriteList(userId: number, userType: string) {
    const [rows, typeNames] = await Promise.all([
      this.prisma.questionFavorite.findMany({
        where: this.buildFavoriteWhere(userId, userType),
        select: {
          questionId: true,
          createTime: true,
          question: { select: { type: true, stem: true, status: true } },
        },
        orderBy: { createTime: 'desc' },
      }),
      this.prisma.dictInfo.findMany({
        where: { type: { key: 'question_type' } },
        select: { value: true, name: true },
      }),
    ]);

    const typeTextMap = new Map(typeNames.map((t) => [t.value, t.name]));

    return rows
      // 题目退出正式库后收藏记录还在，列表里不再展示
      .filter((r) => r.question && r.question.status === 'formal')
      .map((r) => ({
        id: r.questionId,
        questionId: r.questionId,
        typeText: typeTextMap.get(r.question.type) ?? r.question.type,
        content: r.question.stem,
        favoriteTime: r.createTime as unknown as string,
      }));
  }

  /** 收藏表的用户过滤条件（内外部各存一列） */
  private buildFavoriteWhere(userId: number, userType: string) {
    return userType === 'external'
      ? { userType: 'external', externalCandidateId: userId }
      : { userType: 'internal', internalUserId: userId };
  }
}
