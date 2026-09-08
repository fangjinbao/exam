import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import { ParticipantResolverService } from './participant-resolver.service';

/** 记录列表筛选条件 */
export interface PracticeRecordFilter {
  /** 人员姓名（模糊） */
  keyword?: string;
  /** 练习状态 not_started 未开始 / ongoing 练习中 / finished 已完成 */
  status?: string;
}

/** 按人聚合后的一行 */
export interface PracticeRecordUserItem {
  userType: string;
  userId: number;
  name: string;
  /** 所属公司（内部人员沿部门树上溯取最近公司节点；外部考生取所属单位） */
  companyName: string;
  /** 所属部门（外部考生无部门概念，恒为空串） */
  departmentName: string;
  /** 练习次数（该人在此练习下的记录条数） */
  attemptCount: number;
  /** 最近一次的题目数 / 已答数 / 答对数 */
  lastTotalCount: number;
  lastAnsweredCount: number;
  lastCorrectCount: number;
  /** 最近一次正确率（0-100 整数；无记录为 null） */
  lastAccuracy: number | null;
  /** 最近一次练习时间（取完成时间，未完成则取创建时间） */
  lastPracticeTime: Date | null;
  status: string;
}

/** 记录状态常量，与前端筛选项一一对应 */
const STATUS_NOT_STARTED = 'not_started';
const STATUS_ONGOING = 'ongoing';
const STATUS_FINISHED = 'finished';

/**
 * 练习记录查询服务（管理端只读）
 *
 * 列表按「人」聚合而非按记录平铺：一人多次练习收成一行，点开抽屉才看每次明细。
 * 聚合在内存里做而不下推到 SQL，原因是「未开始的人」要靠参与人员表左连接记录表才能得出，
 * 而姓名/所属又分散在 SysUser 与 ExternalCandidate 两张表，单条 SQL 无法既分页又按姓名筛。
 * 参与人员行本身很轻（3 个整型），记录行也只取聚合必需字段，实际数据量可控。
 */
@Injectable()
export class PracticeRecordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: ParticipantResolverService,
  ) {}

  /** 人员唯一键，与 ParticipantResolverService.key 同构 */
  private keyOf(userType: string, userId: number): string {
    return `${userType}:${userId}`;
  }

  /**
   * 按人聚合的记录分页
   * @param practiceId 练习 ID
   * @param filter 姓名模糊 + 状态筛选
   * @param page 页码，从 1 开始
   * @param pageSize 每页条数（1-100）
   * @returns 列表与分页信息
   */
  async pageByPractice(
    practiceId: number,
    filter: PracticeRecordFilter,
    page?: number,
    pageSize?: number,
  ) {
    const p = Math.max(page || 1, 1);
    const ps = Math.min(Math.max(pageSize || 10, 1), 100);

    const practice = await this.prisma.practice.findUnique({
      where: { id: practiceId },
      select: { participantScope: true },
    });
    if (!practice) return { list: [], pagination: { page: p, pageSize: ps, total: 0 } };

    const records = await this.prisma.practiceRecord.findMany({
      where: { practiceId },
      select: {
        userType: true,
        internalUserId: true,
        externalCandidateId: true,
        totalCount: true,
        answeredCount: true,
        correctCount: true,
        finished: true,
        finishTime: true,
        createTime: true,
      },
      orderBy: { createTime: 'desc' },
    });

    // 记录按人分组。orderBy 已保证组内首条即最近一次，无需再排
    const grouped = new Map<string, typeof records>();
    for (const r of records) {
      const uid = r.userType === 'internal' ? r.internalUserId : r.externalCandidateId;
      if (!uid) continue; // 脏数据：类型与 ID 不匹配，跳过而非算进某个人头上
      const k = this.keyOf(r.userType, uid);
      const arr = grouped.get(k);
      if (arr) arr.push(r);
      else grouped.set(k, [r]);
    }

    const universe = await this.buildUniverse(
      practiceId,
      practice.participantScope,
      [...grouped.keys()],
    );
    const profiles = await this.resolver.resolveProfiles(universe);

    let list: PracticeRecordUserItem[] = universe.map((ref) => {
      const uid = (ref.type === 'internal' ? ref.internalUserId : ref.externalCandidateId) as number;
      const k = this.keyOf(ref.type, uid);
      const mine = grouped.get(k) ?? [];
      const profile = profiles.get(k);
      return this.toItem(
        ref.type,
        uid,
        profile?.name ?? '',
        profile?.companyName ?? '',
        profile?.departmentName ?? '',
        mine,
      );
    });

    if (filter.keyword) {
      const kw = filter.keyword.trim();
      if (kw) list = list.filter((i) => i.name.includes(kw));
    }
    if (filter.status) list = list.filter((i) => i.status === filter.status);

    // 练过的人排前面、最近练的更靠前；未开始的沉到末尾，便于一眼看出还有谁没练
    list.sort((a, b) => {
      const ta = a.lastPracticeTime ? a.lastPracticeTime.getTime() : -1;
      const tb = b.lastPracticeTime ? b.lastPracticeTime.getTime() : -1;
      return tb - ta;
    });

    const start = (p - 1) * ps;
    return {
      list: list.slice(start, start + ps),
      pagination: { page: p, pageSize: ps, total: list.length },
    };
  }

  /**
   * 确定「应出现在列表里的人」
   * 指定人员：以参与人员表为准，没练过的也要列出来标未开始。
   * 全员参与：不落参与人员记录，无法枚举应练人员，只能以练过的人为准。
   * @param practiceId 练习 ID
   * @param scope 参与范围 all / specified
   * @param recordedKeys 已有记录的人员键，全员参与时据此还原人员列表
   */
  private async buildUniverse(practiceId: number, scope: string, recordedKeys: string[]) {
    if (scope === 'all') {
      return recordedKeys.map((k) => {
        const [type, rawId] = k.split(':');
        const id = Number(rawId);
        return {
          type,
          internalUserId: type === 'internal' ? id : null,
          externalCandidateId: type === 'external' ? id : null,
        };
      });
    }

    const participants = await this.prisma.practiceParticipant.findMany({
      where: { practiceId },
      select: { participantType: true, internalUserId: true, externalCandidateId: true },
      orderBy: { id: 'asc' },
    });
    return participants
      .map((x) => ({
        type: x.participantType,
        internalUserId: x.internalUserId,
        externalCandidateId: x.externalCandidateId,
      }))
      .filter((x) => (x.type === 'internal' ? !!x.internalUserId : !!x.externalCandidateId));
  }

  /**
   * 把某人的记录集折成一行
   * @param userType 人员类型
   * @param userId 人员业务 ID
   * @param name 姓名
   * @param companyName 所属公司
   * @param departmentName 所属部门
   * @param mine 该人的记录，按创建时间倒序（首条为最近一次）
   */
  private toItem(
    userType: string,
    userId: number,
    name: string,
    companyName: string,
    departmentName: string,
    mine: Array<{
      totalCount: number;
      answeredCount: number;
      correctCount: number;
      finished: boolean;
      finishTime: Date | null;
      createTime: Date;
    }>,
  ): PracticeRecordUserItem {
    const latest = mine[0];
    if (!latest) {
      return {
        userType,
        userId,
        name,
        companyName,
        departmentName,
        attemptCount: 0,
        lastTotalCount: 0,
        lastAnsweredCount: 0,
        lastCorrectCount: 0,
        lastAccuracy: null,
        lastPracticeTime: null,
        status: STATUS_NOT_STARTED,
      };
    }

    // 正确率以「已答题数」为分母而非总题数：中途退出时按总题数算会把未答的记成答错
    const accuracy =
      latest.answeredCount > 0
        ? Math.round((latest.correctCount / latest.answeredCount) * 100)
        : null;

    return {
      userType,
      userId,
      name,
      companyName,
      departmentName,
      attemptCount: mine.length,
      lastTotalCount: latest.totalCount,
      lastAnsweredCount: latest.answeredCount,
      lastCorrectCount: latest.correctCount,
      lastAccuracy: accuracy,
      lastPracticeTime: latest.finishTime ?? latest.createTime,
      status: latest.finished ? STATUS_FINISHED : STATUS_ONGOING,
    };
  }

  /**
   * 某人在此练习下的每次记录（抽屉第一级）
   * @param practiceId 练习 ID
   * @param userType internal / external
   * @param userId 人员业务 ID
   * @returns 按时间倒序的记录列表，最近一次在前
   */
  async listUserRecords(practiceId: number, userType: string, userId: number) {
    const userWhere =
      userType === 'internal' ? { internalUserId: userId } : { externalCandidateId: userId };

    const rows = await this.prisma.practiceRecord.findMany({
      where: { practiceId, userType, ...userWhere },
      select: {
        id: true,
        totalCount: true,
        answeredCount: true,
        correctCount: true,
        finished: true,
        finishTime: true,
        createTime: true,
      },
      orderBy: { createTime: 'desc' },
    });

    return rows.map((r) => ({
      ...r,
      accuracy:
        r.answeredCount > 0 ? Math.round((r.correctCount / r.answeredCount) * 100) : null,
      status: r.finished ? STATUS_FINISHED : STATUS_ONGOING,
    }));
  }

  /**
   * 单次记录的逐题明细（抽屉第二级）
   * 题干取自题目表，标准答案用记录里的快照——题目后续被改过时快照才是当时的判分依据。
   * @param recordId 记录 ID
   * @returns 记录概要 + 逐题作答；记录不存在返回 null
   */
  async getRecordDetail(recordId: number) {
    const record = await this.prisma.practiceRecord.findUnique({
      where: { id: recordId },
      select: {
        id: true,
        practiceId: true,
        sourceName: true,
        userType: true,
        internalUserId: true,
        externalCandidateId: true,
        totalCount: true,
        answeredCount: true,
        correctCount: true,
        finished: true,
        finishTime: true,
        createTime: true,
        answers: {
          orderBy: { questionNo: 'asc' },
          select: {
            id: true,
            questionNo: true,
            candidateAnswer: true,
            standardAnswer: true,
            isCorrect: true,
            // options/analysis 供卷面式回看：只给答案字母（作答 A、标准答案 B）
            // 判卷人看不出错在哪，必须连选项正文一起下发
            question: {
              select: { id: true, type: true, stem: true, options: true, analysis: true },
            },
          },
        },
      },
    });
    if (!record) return null;

    const uid =
      record.userType === 'internal' ? record.internalUserId : record.externalCandidateId;
    const profiles = uid
      ? await this.resolver.resolveProfiles([
          {
            type: record.userType,
            internalUserId: record.internalUserId,
            externalCandidateId: record.externalCandidateId,
          },
        ])
      : new Map();
    const profile = uid ? profiles.get(this.keyOf(record.userType, uid)) : undefined;

    const { answers, ...rest } = record;
    return {
      ...rest,
      userId: uid ?? 0,
      name: profile?.name ?? '',
      companyName: profile?.companyName ?? '',
      departmentName: profile?.departmentName ?? '',
      accuracy:
        record.answeredCount > 0
          ? Math.round((record.correctCount / record.answeredCount) * 100)
          : null,
      status: record.finished ? STATUS_FINISHED : STATUS_ONGOING,
      // question 是必填关系且为级联删除（题目删除时答案行一并删除），存活的行必有题目
      answers: answers.map((a) => ({
        id: a.id,
        questionNo: a.questionNo,
        questionId: a.question.id,
        questionType: a.question.type,
        stem: a.question.stem,
        options: a.question.options,
        analysis: a.question.analysis,
        candidateAnswer: a.candidateAnswer,
        standardAnswer: a.standardAnswer,
        isCorrect: a.isCorrect,
      })),
    };
  }
}

