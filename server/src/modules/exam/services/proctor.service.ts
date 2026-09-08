import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma.service';
import { ParticipantResolverService } from './participant-resolver.service';
import { buildExamNo } from '../utils/exam-no';
import { countExpandedSlots } from '../utils/composite-expand';

/** 监考中心可见的考试状态：未发布的还没考生数据，已结束的只读留档 */
const PROCTOR_VISIBLE_STATUS = ['published', 'ongoing', 'finished'] as const;

/**
 * 考生监考状态
 * - not_started 未开考（无答卷或未取卷）
 * - ongoing 进行中（已取卷未交卷）
 * - submitted 已交卷
 */
export type ProctorCandidateStatus = 'not_started' | 'ongoing' | 'submitted';

/** 成绩展示状态：无成绩 / 待阅卷 / 已阅完未发布 / 已发布 */
export type ProctorScoreState = 'none' | 'pending' | 'graded' | 'published';

/**
 * 监考列表的一行：一份答卷一行，未取卷的考生也占一行（sheetId=null、attemptNo=0）
 *
 * 显式声明而非交由推断：两个分支（无答卷 / 有答卷）字面量类型不同，
 * 推断出的联合类型会让 sheetId 在 null 与 number 之间不兼容。
 */
export interface ProctorCandidateRow {
  /** 前端 row-key：一人多行时 candidateId 不再唯一 */
  rowKey: string;
  candidateId: number;
  sheetId: number | null;
  candidateType: string;
  candidateName: string;
  account: string | null;
  companyName: string;
  /** 第几次考试，从 1 开始；未取卷为 0 */
  attemptNo: number;
  /** 是否重考（第 2 次及以后） */
  isRetake: boolean;
  /** 本人已交卷次数 */
  attemptUsed: number;
  /** 总机会数 = retakeLimit + 1 */
  attemptLimit: number;
  status: ProctorCandidateStatus;
  switchCount: number;
  switchExceeded: boolean;
  startTime: Date | null;
  submitTime: Date | null;
  totalCount: number;
  answeredCount: number;
  gradingStatus: string | null;
  score: number | null;
  scoreState: ProctorScoreState;
}

/**
 * 监考中心服务
 *
 * 与阅卷中心（GradingService）并列：同样按 ExamStaff 的指派过滤考试，
 * 只是 role 取 proctor、维度是「考生的考试进行情况」而非「答卷的批阅情况」。
 *
 * 【历史】监考中心曾于 20260816010000_remove_proctor_center 整体下线，
 * 当时删掉的是监考安排表与逐条异常事件台账；本次重建复用现有的
 * ExamStaff(role=proctor) 指派与 AnswerSheet.switchCount，不恢复那两张表。
 */
@Injectable()
export class ProctorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly participantResolver: ParticipantResolverService,
  ) {}

  /**
   * 构造「监考指派范围」的 Exam 过滤片段
   *
   * 用 !== undefined 而非真值判断：与 GradingService.assignedExamWhere 保持一致，
   * 真值判断会让 userId 为 0 时静默跳过整个过滤、放出全部考试。
   *
   * 与阅卷中心的差别：不带「该考试未指派任何监考人则对所有人可见」的兜底。
   * 阅卷那个兜底是为存量考试留的（否则老考试无人可阅），而监考是实时动作
   * （强制交卷、清空重考都会改考生数据），放开给未指派的人风险不对称。
   *
   * @param assignedTo 当前登录人 userId；超管传 undefined 表示不过滤
   */
  private assignedExamWhere(assignedTo?: number): Prisma.ExamWhereInput {
    if (assignedTo === undefined) return {};
    return { staff: { some: { role: 'proctor', userId: assignedTo } } };
  }

  /**
   * 判断某场考试是否在当前登录人的监考范围内
   * 列表已按指派过滤，但按 examId 的接口仍需逐个校验，否则拿到 id 就能越权操作考生数据。
   *
   * @param examId 考试 ID
   * @param assignedTo 当前登录人 userId；超管传 undefined
   */
  async canProctorExam(examId: number, assignedTo?: number): Promise<boolean> {
    const row = await this.prisma.exam.findFirst({
      where: { id: examId, ...this.assignedExamWhere(assignedTo) },
      select: { id: true },
    });
    return !!row;
  }

  /**
   * 取该场考试的及格分（强制交卷时纯客观卷要即时判定是否及格）
   * @param examId 考试 ID
   * @returns 及格分；考试不存在返回 null
   */
  async getPassScore(examId: number): Promise<number | null> {
    const row = await this.prisma.exam.findUnique({
      where: { id: examId },
      select: { passScore: true },
    });
    return row?.passScore ?? null;
  }

  /**
   * 按时间推算考试真实状态
   *
   * 与 ExamService.computeStatus 同一口径。这里只读不回写：
   * 监考列表是高频轮询入口，逐行回写会把只读查询变成写事务。
   * 状态回写由考试管理、详情等接口承担，此处读到的差异只影响本次展示。
   */
  private computeStatus(row: { status: string; startTime: Date; endTime: Date }, now: Date): string {
    if (row.status === 'unpublished') return 'unpublished';
    if (now >= row.endTime) return 'finished';
    if (now >= row.startTime) return 'ongoing';
    return 'published';
  }

  /**
   * 监考考试分页列表
   *
   * 状态过滤在内存里做而不是落到 where：库里的 status 是惰性回写的，
   * 可能滞后于真实时间（一场刚到点开考的考试库里仍是 published）。
   * 按库值过滤会让它出现在错误的筛选结果里，故先取出再按 computeStatus 判定。
   *
   * @param filter name 考试名称模糊；status 按真实状态过滤
   * @param assignedTo 当前登录人 userId；超管传 undefined
   */
  async pageList(
    filter: { name?: string; status?: string },
    page: number,
    pageSize: number,
    assignedTo?: number,
  ) {
    const now = new Date();
    const where: Prisma.ExamWhereInput = {
      // 未发布的考试没有考生数据可监考，从源头排除
      status: { in: [...PROCTOR_VISIBLE_STATUS] },
      ...this.assignedExamWhere(assignedTo),
    };
    if (filter.name) where.name = { contains: filter.name };

    /*
      状态筛选下推为时间条件。

      不能直接按 status 列筛：它是惰性回写的，一场刚到点开考的考试库里可能仍是 published，
      按库值筛会让它落进错误的结果集。但排除掉 unpublished 之后，真实状态完全由
      startTime/endTime 与当前时刻派生（见 computeStatus），而时间列是不可变的真源，
      故可安全地翻译成时间条件交给数据库先过滤——本接口是高频轮询入口，
      让它每次都把全部考试连同 candidates 计数取回，成本会随考试总量线性增长。
      下面仍按 computeStatus 复算一遍状态用于展示，两者口径一致。
    */
    if (filter.status === 'finished') where.endTime = { lte: now };
    else if (filter.status === 'ongoing') {
      where.startTime = { lte: now };
      where.endTime = { gt: now };
    } else if (filter.status === 'published') where.startTime = { gt: now };

    const rows = await this.prisma.exam.findMany({
      where,
      select: {
        id: true,
        name: true,
        status: true,
        startTime: true,
        endTime: true,
        duration: true,
        createTime: true,
        _count: { select: { candidates: true } },
      },
      /*
        补 id 作次级排序键：同一批次的考试 startTime 常常完全相同，
        单键排序下 MySQL 不保证并列行的顺序稳定，而翻页是两次独立请求——
        同一场考试可能在第 1、2 页各出现一次，或整个漏掉。
      */
      orderBy: [{ startTime: 'desc' }, { id: 'desc' }],
    });

    /*
      再按 computeStatus 复算一遍并过滤。

      上面的时间条件已把绝大部分行挡在数据库侧，这里是兜底：
      两处口径若有偏差（例如日后 computeStatus 改了边界的取等方式），
      以 computeStatus 为准，避免返回状态与筛选条件不符的行。
    */
    const withStatus = rows
      .map((r) => ({ ...r, realStatus: this.computeStatus(r, now) }))
      .filter((r) => !filter.status || r.realStatus === filter.status);

    const total = withStatus.length;
    const start = (page - 1) * pageSize;
    const pageRows = withStatus.slice(start, start + pageSize);

    // 交卷份数与超次数份数只为当页考试统计，避免为整个列表跑聚合
    const examIds = pageRows.map((r) => r.id);
    const stats = examIds.length
      ? await this.collectExamStats(examIds)
      : new Map<number, { submittedCount: number; ongoingCount: number }>();

    return {
      list: pageRows.map((r) => {
        const s = stats.get(r.id);
        return {
          id: r.id,
          name: r.name,
          // 编号是派生值（无库字段），与阅卷中心共用同一函数，避免两处算法分叉
          examNo: buildExamNo(r.id, r.createTime),
          status: r.realStatus,
          startTime: r.startTime,
          endTime: r.endTime,
          duration: r.duration,
          candidateCount: r._count.candidates,
          submittedCount: s?.submittedCount ?? 0,
          ongoingCount: s?.ongoingCount ?? 0,
        };
      }),
      pagination: { page, pageSize, total },
    };
  }

  /**
   * 某场考试的考生监考名单
   *
   * 以 ExamCandidate 为基准左连 AnswerSheet，而不是直接查答卷：
   * 还没取卷的考生没有答卷行，只查答卷会让「谁还没开考」这个最关键的监考信息消失。
   *
   * @param examId 考试 ID
   * @returns 考生行数组 + 该场考试的判定上下文（允许切屏次数、真实状态）
   */
  async listCandidates(examId: number) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      select: {
        id: true,
        name: true,
        status: true,
        startTime: true,
        endTime: true,
        duration: true,
        createTime: true,
        paperId: true,
        // screenSwitchDetect 必须一起取：关掉检测后考生端不再累加也不判超次，
        // 监考侧若只看 allowSwitchTimes，会把历史脏数据标成异常
        // retakeLimit 用于「已考 M/N 次」的分母，与考生端 app-exam 同口径：N = retakeLimit + 1
        setting: {
          select: { allowSwitchTimes: true, screenSwitchDetect: true, retakeLimit: true },
        },
      },
    });
    if (!exam) return null;

    /*
      卷面作答位总数从试卷算，不能用答卷的 AnswerItem 计数。

      AnswerItem 不是取卷时铺满的：answerSheet.create 不建任何 item，
      item 只在考生逐题作答时写入，剩余空题要等交卷时 fillMissingAnswerItems 才补齐。
      若拿 _count.answerItems 当分母，进行中的考生答了 3 题就显示 3/3，
      看起来像已答完——而这一列正是监考判断「谁卡住了、谁快交卷了」的依据。

      countExpandedSlots 与交卷时的展开口径同源：材料题本身不可作答，
      作答位由其小题产生，故含材料题的卷子必须展开后再计数。
      全场共用一份试卷，这个分母只需算一次。
    */
    const paperTotal = await this.countPaperSlots(exam.paperId);

    const [candidates, sheets] = await Promise.all([
      this.prisma.examCandidate.findMany({
        where: { examId },
        select: {
          id: true,
          candidateType: true,
          internalUserId: true,
          externalCandidateId: true,
        },
        orderBy: { id: 'asc' },
      }),
      this.prisma.answerSheet.findMany({
        where: { examId },
        select: {
          id: true,
          candidateType: true,
          internalUserId: true,
          externalCandidateId: true,
          startTime: true,
          submitTime: true,
          switchCount: true,
          gradingStatus: true,
          // 出分用：totalScore 只在发布后有值，未发布时用客观+主观现算
          objectiveScore: true,
          subjectiveScore: true,
          totalScore: true,
          scorePublished: true,
        },
      }),
    ]);

    /*
      键带类型前缀：内部考生 id 与外部考生 id 各自自增，
      internal 的 1 与 external 的 1 不是同一个人，只按数字比会串号。
      与 exam.service 的 listCandidatesWithEntry 同一考虑。
    */
    const keyOf = (t: string, iu: number | null, ec: number | null) => {
      const id = t === 'internal' ? iu : ec;
      return id == null ? null : `${t}:${id}`;
    };

    /*
      同一考生可能有多份答卷（允许重考时每次交卷产生一份新的）。
      监考关心的是「当前这一场答题」，故未交卷的优先。

      两份都未交卷时取 id 最小的，必须与考生端一致：
      ensureSheet 与 reportSwitchAlarm 都用 orderBy id asc 取最早的一份，
      并以此实现并发取卷的收敛。若这里取最大的，考生双标签页/弱网重试产生两份未交答卷时，
      考生实际在最早那份上答题、切屏也累加在它上面，监考页显示的却是另一份
      （切屏 0、进度 0），据此点强制交卷或清空重考会作用在考生没在用的那份上。

      两份都已交卷时取 id 最大的——「最近一次」，与重考语义相符。
    */
    const sheetByKey = new Map<string, (typeof sheets)[number]>();
    for (const s of sheets) {
      const k = keyOf(s.candidateType, s.internalUserId, s.externalCandidateId);
      if (!k) continue;
      const prev = sheetByKey.get(k);
      if (!prev) {
        sheetByKey.set(k, s);
        continue;
      }
      const prevOpen = !prev.submitTime;
      const curOpen = !s.submitTime;
      if (curOpen && !prevOpen) sheetByKey.set(k, s);
      else if (curOpen && prevOpen && s.id < prev.id) sheetByKey.set(k, s);
      else if (!curOpen && !prevOpen && s.id > prev.id) sheetByKey.set(k, s);
    }

    /*
      按考生分组、按取卷顺序排列的全部答卷——列表的行来源。

      允许重考的考试里一人可有多份答卷，监考需要逐次查看：每次的开考/交卷时间、
      切屏次数、成绩各不相同，聚合成一行会把除最后一次以外的信息全部丢掉。
      故这里不再按人收敛成一份，而是保留全部答卷，第 N 份即第 N 次考试。

      排序用 id 升序而非 startTime：已取卷未开始作答的答卷 startTime 为 null，
      按时间排会把这些甩到一端，次序与实际取卷顺序不符。id 自增，与取卷先后严格一致。
    */
    const sheetsByKey = new Map<string, (typeof sheets)[number][]>();
    for (const s of sheets) {
      const k = keyOf(s.candidateType, s.internalUserId, s.externalCandidateId);
      if (!k) continue;
      const arr = sheetsByKey.get(k);
      if (arr) arr.push(s);
      else sheetsByKey.set(k, [s]);
    }
    for (const arr of sheetsByKey.values()) arr.sort((a, b) => a.id - b.id);

    /*
      待阅卷判定沿用阅卷中心的口径：看「是否还有未评分的主观题项」，
      不看 gradingStatus——后者在交卷时一律置 pending，会把「整卷全客观题、
      无需人工阅」的答卷也标成待阅（见 grading.service.ts 的 UNGRADED_SUBJECTIVE 注释）。
      一条 groupBy 算完整场，不按人发查询。
    */
    // 两项统计都要覆盖全部答卷：每一份都会独立成行，各自显示进度与成绩
    const scoreSheetIds = sheets.filter((s) => s.submitTime).map((s) => s.id);
    const [answeredCounts, pendingSubjectiveRows] = await Promise.all([
      this.collectAnsweredCounts(sheets.map((s) => s.id)),
      scoreSheetIds.length
        ? this.prisma.answerItem.groupBy({
            by: ['answerSheetId'],
            where: {
              answerSheetId: { in: scoreSheetIds },
              questionCategory: 'subjective',
              finalScore: null,
            },
            _count: { _all: true },
          })
        : Promise.resolve<{ answerSheetId: number; _count: { _all: number } }[]>([]),
    ]);
    const pendingSubjectiveMap = new Map<number, number>(
      pendingSubjectiveRows.map((r) => [r.answerSheetId, r._count._all] as const),
    );

    const refs = candidates.map((c) => ({
      type: c.candidateType as 'internal' | 'external',
      internalUserId: c.internalUserId,
      externalCandidateId: c.externalCandidateId,
    }));
    const profiles = await this.participantResolver.resolveProfiles(refs);

    const allowSwitchTimes = exam.setting?.allowSwitchTimes ?? 0;
    /*
      防切屏检测总开关。

      考生端在判定超次数之前先看这个开关：关闭时不累加、exceeded 恒为 false。
      监考侧必须同样先过这道门，否则「先开着检测跑了一段、后来关掉」的考试里，
      已累计的 switchCount 会被标成异常——考生端认为没超、监考页显示超次，两边对不上。
    */
    const switchDetectOn = exam.setting?.screenSwitchDetect ?? false;
    // 总机会数 = 重考次数上限 + 1（首考）。retakeLimit=0 即只有一次机会。
    const attemptLimit = (exam.setting?.retakeLimit ?? 0) + 1;
    /*
      一份答卷一行。允许重考的考试里，同一考生有几次考试就有几行。

      未取卷的考生没有答卷，仍要占一行（attemptNo=0、sheetId=null），
      否则「应到未到」的人从列表里消失——那恰是监考最需要盯的一类。
    */
    const list = candidates.flatMap<ProctorCandidateRow>((c) => {
      const key = keyOf(c.candidateType, c.internalUserId, c.externalCandidateId);
      const p = key ? profiles.get(key) : undefined;
      const own = key ? (sheetsByKey.get(key) ?? []) : [];
      // 已交卷份数：本人全部答卷里 submitTime 非空的数量，与考生端 submittedCount 同口径
      const usedCount = own.filter((s) => s.submitTime).length;

      const identity = {
        candidateId: c.id,
        candidateType: c.candidateType,
        candidateName: p?.name ?? '',
        account: p?.account ?? null,
        companyName: p?.companyName ?? '',
        attemptLimit,
        attemptUsed: usedCount,
      };

      if (!own.length) {
        return [
          {
            ...identity,
            rowKey: `c${c.id}`,
            sheetId: null,
            attemptNo: 0,
            isRetake: false,
            status: 'not_started' as ProctorCandidateStatus,
            switchCount: 0,
            switchExceeded: false,
            startTime: null,
            submitTime: null,
            // 未取卷给 0，前端据此显示「-」而不是「0/50」：他还没进考场，谈进度无意义
            totalCount: 0,
            answeredCount: 0,
            gradingStatus: null,
            score: null as number | null,
            scoreState: 'none' as const,
          },
        ];
      }

      return own.map((sheet, idx) => {
        const status: ProctorCandidateStatus = sheet.submitTime
          ? 'submitted'
          : sheet.startTime
            ? 'ongoing'
            : 'not_started';
        return {
          ...identity,
          // 行键带 sheetId：一人多行时 candidateId 不再唯一，前端 row-key 需要它
          rowKey: `s${sheet.id}`,
          sheetId: sheet.id,
          attemptNo: idx + 1,
          // 第 2 次及以后为重考。首考不打标，避免每行都挂标签
          isRetake: idx > 0,
          status,
          switchCount: sheet.switchCount,
          /*
            是否已超出允许切屏次数。三个条件缺一不可，与 app-exam 侧判定口径一致：
            检测开关打开、allowSwitchTimes 大于 0（为 0 表示不限、仅记录不强制交卷）、
            且已切次数严格大于允许次数。此处不能写成 switchCount > 0。
          */
          switchExceeded:
            switchDetectOn && allowSwitchTimes > 0 && sheet.switchCount > allowSwitchTimes,
          startTime: sheet.startTime,
          submitTime: sheet.submitTime,
          totalCount: paperTotal,
          answeredCount: answeredCounts.get(sheet.id) ?? 0,
          gradingStatus: sheet.gradingStatus,
          // 成绩按本行这一份算，不再取「最近一次」：每次考试各自出分
          ...this.buildScore(sheet, pendingSubjectiveMap.get(sheet.id) ?? 0),
        };
      });
    });

    /*
      概览条按「人」统计，不能由前端数行数得到。

      列表已是一行一次考试，重考的人占多行，数行只会得到答卷数。
      每人取一份代表状态，沿用 sheetByKey 的选取规则（未交卷优先、
      并发取卷时取最早那份），与考生端实际在用的那份一致。
      切屏超次同样按人计：一人多次超次只算一个人异常。
    */
    const stats = { total: candidates.length, notStarted: 0, ongoing: 0, submitted: 0, exceeded: 0 };
    for (const c of candidates) {
      const key = keyOf(c.candidateType, c.internalUserId, c.externalCandidateId);
      const cur = key ? sheetByKey.get(key) : undefined;
      if (!cur) stats.notStarted += 1;
      else if (cur.submitTime) stats.submitted += 1;
      else if (cur.startTime) stats.ongoing += 1;
      else stats.notStarted += 1;
      const own = key ? (sheetsByKey.get(key) ?? []) : [];
      const anyExceeded =
        switchDetectOn &&
        allowSwitchTimes > 0 &&
        own.some((s) => s.switchCount > allowSwitchTimes);
      if (anyExceeded) stats.exceeded += 1;
    }

    const now = new Date();
    return {
      exam: {
        id: exam.id,
        name: exam.name,
        examNo: buildExamNo(exam.id, exam.createTime),
        status: this.computeStatus(exam, now),
        startTime: exam.startTime,
        endTime: exam.endTime,
        duration: exam.duration,
        allowSwitchTimes,
        // 下发给前端：关闭检测时切屏列的数字只是历史残留，UI 需据此改写说明
        screenSwitchDetect: switchDetectOn,
        // 允许重考时前端才显示「第 N 次」「重考」标记，单次考试不加噪音
        retakeLimit: exam.setting?.retakeLimit ?? 0,
      },
      stats,
      list,
    };
  }

  /**
   * 计算某一次考试的成绩与其展示状态
   *
   * 成绩有四种状态，前端据 scoreState 直接渲染，不再自己拼判断：
   * - none：这一次未交卷，尚无成绩
   * - pending：还有未评分的主观题，显示「待阅卷」
   * - graded：已阅完但成绩未发布，显示分数（监考是内部角色，可见未发布分）
   * - published：成绩已发布，显示分数
   *
   * 分数取值：totalScore 只在发布时写入，未发布时用 objectiveScore + subjectiveScore 现算；
   * 两者都为 null（客观题也没判）时给 null，前端显示「-」。
   *
   * @param sheet 本行对应的答卷
   * @param pendingSubjectiveCount 该答卷未评分的主观题数
   */
  private buildScore(
    sheet: {
      submitTime: Date | null;
      objectiveScore: number | null;
      subjectiveScore: number | null;
      totalScore: number | null;
      scorePublished: boolean;
    },
    pendingSubjectiveCount: number,
  ) {
    // 未交卷这一次还没有成绩可谈——包括正在作答和已取卷未答的
    if (!sheet.submitTime) {
      return { score: null as number | null, scoreState: 'none' as const };
    }
    if (pendingSubjectiveCount > 0) {
      return { score: null as number | null, scoreState: 'pending' as const };
    }
    const scoreSheet = sheet;
    // 发布后以 totalScore 为准（发布时已按业务规则算定）；未发布时现算，避免显示「-」
    const computed =
      scoreSheet.totalScore ??
      (scoreSheet.objectiveScore == null && scoreSheet.subjectiveScore == null
        ? null
        : (scoreSheet.objectiveScore ?? 0) + (scoreSheet.subjectiveScore ?? 0));
    return {
      score: computed,
      scoreState: scoreSheet.scorePublished ? ('published' as const) : ('graded' as const),
    };
  }

  /**
   * 该试卷的作答位总数（材料题按小题展开）
   *
   * 复用 countExpandedSlots 而非自己遍历：它与考生端 fillMissingAnswerItems
   * 的展开规则同源，自己写一份会在「材料题小题如何计数」上与答卷实际条数分叉，
   * 表现为已答数可能超过总数。
   *
   * @param paperId 试卷 ID
   */
  private async countPaperSlots(paperId: number): Promise<number> {
    const rows = await this.prisma.paperQuestion.findMany({
      where: { paperId },
      select: { questionId: true },
      orderBy: { sortNo: 'asc' },
    });
    if (!rows.length) return 0;
    return countExpandedSlots(
      this.prisma,
      rows.map((r) => r.questionId),
    );
  }

  /**
   * 批量统计各份答卷的已答题数
   *
   * 已答判定为 candidateAnswer 非空且非空串：客观题未选时该列是 null，
   * 但部分题型（填空）在前端清空后会回传空串，只判 null 会把它算成已答。
   *
   * @param sheetIds 答卷 ID 列表
   * @returns sheetId → 已答题数
   */
  private async collectAnsweredCounts(sheetIds: number[]): Promise<Map<number, number>> {
    const map = new Map<number, number>();
    if (!sheetIds.length) return map;
    const rows = await this.prisma.answerItem.groupBy({
      by: ['answerSheetId'],
      where: {
        answerSheetId: { in: sheetIds },
        candidateAnswer: { not: null },
        NOT: { candidateAnswer: '' },
      },
      _count: { _all: true },
    });
    for (const r of rows) map.set(r.answerSheetId, r._count._all);
    return map;
  }

  /**
   * 批量统计各场考试的「已交卷」与「进行中」份数
   * @param examIds 考试 ID 列表
   * @returns examId → 两项计数
   */
  private async collectExamStats(examIds: number[]) {
    const sheets = await this.prisma.answerSheet.findMany({
      where: { examId: { in: examIds } },
      select: { examId: true, startTime: true, submitTime: true },
    });
    const map = new Map<number, { submittedCount: number; ongoingCount: number }>();
    for (const id of examIds) map.set(id, { submittedCount: 0, ongoingCount: 0 });
    for (const s of sheets) {
      const acc = map.get(s.examId);
      if (!acc) continue;
      if (s.submitTime) acc.submittedCount += 1;
      else if (s.startTime) acc.ongoingCount += 1;
    }
    return map;
  }
}
