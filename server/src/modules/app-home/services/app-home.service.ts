import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import { AppUserType } from '@/modules/app-auth/dto/app-auth.dto';
import { AppOverviewVo, AppUpcomingExamVo } from '../vo/app-home.vo';

/** 首页待考提醒最多返回的条数：卡片内只展示前几条，「查看全部」跳列表页 */
const UPCOMING_LIMIT = 5;

/**
 * 待考范围：未发布的考生不可见，已结束的不属于待考
 *
 * 不加 as const：Prisma 的 status.in 要求可变 string[]，
 * readonly 元组不可赋值给它，会连带破坏 groupBy 的 _count 类型推断。
 */
const UPCOMING_EXAM_STATUS = ['published', 'ongoing'];

/**
 * 考生端首页服务
 *
 * 提供首页两块数据：四项统计概览、待考提醒列表。
 *
 * 两类考生（internal/external）在业务表里用不同的外键列区分
 * （internalUserId / externalCandidateId），且各自 id 独立自增，
 * 因此所有查询都必须带上 candidateType，不能只用 userId。
 */
@Injectable()
export class AppHomeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 构造「限定为当前考生」的查询条件
   *
   * 两类考生 id 各自自增（internal 的 1 与 external 的 1 是不同的人），
   * 只按 id 过滤会串号，必须同时限定 candidateType 与对应的外键列。
   *
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   */
  private candidateWhere(userId: number, userType: AppUserType) {
    return userType === 'internal'
      ? { candidateType: 'internal', internalUserId: userId }
      : { candidateType: 'external', externalCandidateId: userId };
  }

  /**
   * 首页数据概览
   *
   * - examCount：已提交的答卷数（submitTime 非空才算考过，未交卷的不计）
   * - certificateCount：已签发给该考生的证书数
   * - wrongCount：判错的题目数，考试与练习两处合并去重（与错题本口径一致，
   *   否则首页显示有错题、进错题本却对不上）
   * - practiceCount：已练过的题目数（PracticeAnswer 中已作答的条目）
   *
   * 各项相互独立，并行发出减少往返。
   *
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   */
  async getOverview(userId: number, userType: AppUserType): Promise<AppOverviewVo> {
    const where = this.candidateWhere(userId, userType);

    // 练习侧按 userType 取字段，与考试侧的 candidateType 不同名
    const practiceWhere =
      userType === 'internal'
        ? { userType: 'internal', internalUserId: userId }
        : { userType: 'external', externalCandidateId: userId };

    const [examCount, certificateCount, examWrong, practiceCount, practiceWrong] =
      await this.prisma.$transaction([
        this.prisma.answerSheet.count({
          where: { ...where, submitTime: { not: null } },
        }),
        this.prisma.certificate.count({ where }),
        this.prisma.answerItem.findMany({
          where: { isCorrect: false, answerSheet: { ...where, submitTime: { not: null } } },
          select: { questionId: true },
        }),
        this.prisma.practiceAnswer.count({
          where: { record: practiceWhere, candidateAnswer: { not: null } },
        }),
        this.prisma.practiceAnswer.findMany({
          where: { isCorrect: false, record: practiceWhere },
          select: { questionId: true },
        }),
      ]);

    // 同一道题在考试与练习都答错时只算一次，与错题本列表的去重口径保持一致
    const wrongIds = new Set<number>();
    for (const r of examWrong) wrongIds.add(r.questionId);
    for (const r of practiceWrong) wrongIds.add(r.questionId);

    return {
      examCount,
      practiceCount,
      certificateCount,
      wrongCount: wrongIds.size,
    };
  }

  /**
   * 待考提醒列表
   *
   * 只返回「考生还需要行动」的考试，三重过滤：
   * 1. 未发布的考生不可见；
   * 2. 已结束的不属于待考（用 endTime 兜底，因库里 status 可能滞后）；
   * 3. 本人作答机会已用尽的不属于待考——不允许重考且已交卷、或重考次数用尽。
   *    这类考试仍可在「考试列表」页查看并进交卷详情，信息不丢失。
   *
   * 交过一次但仍有重考机会的保留，并带出 attemptCount 供前端标注「已考 N 次」，
   * 否则考生分不清哪场考过了，会重复点进去。
   *
   * 考试范围限定为「该考生被分配到的考试」（ExamCandidate），不是全库考试。
   *
   * 查询顺序是有意的：先算出「机会已用尽」的考试 id，再用 notIn 把它推进 SQL，
   * 这样最后一步才能安全地在库层 take UPCOMING_LIMIT。
   * 反过来「先取分配记录、再在内存里按次数过滤」则无法在库层截断——按任何上限截断
   * 都可能把上限之外尚可作答的考试丢掉，导致首页误报「暂无待考安排」。
   * 而「已用尽」的判定含「交卷次数 < 重考上限 + 1」这种跨字段比较，Prisma 的 where
   * 表达不了，只能先查出来再排除。
   *
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   */
  async getUpcomingExams(
    userId: number,
    userType: AppUserType,
  ): Promise<AppUpcomingExamVo[]> {
    const now = new Date();
    const candidateWhere = this.candidateWhere(userId, userType);
    // 未结束考试的范围条件，下面两处查询共用，避免口径分叉
    const openExamWhere = {
      status: { in: UPCOMING_EXAM_STATUS },
      endTime: { gt: now },
    };

    // 本人在「未结束考试」里的已交卷次数。
    // 限定 exam 范围而非全量取本人所有答卷：已考完的历史考试与待考无关，
    // 且这个集合只包含「考过的未结束考试」，规模远小于全部在配考试。
    const submittedRows = await this.prisma.answerSheet.groupBy({
      by: ['examId'],
      where: {
        ...candidateWhere,
        submitTime: { not: null },
        exam: openExamWhere,
      },
      _count: { _all: true },
    });
    const attemptByExam = new Map(submittedRows.map((r) => [r.examId, r._count._all]));

    // 交过卷的那几场再查重考上限，据此算出「机会已用尽」的考试 id
    const exhaustedExamIds: number[] = [];
    if (attemptByExam.size > 0) {
      const settings = await this.prisma.examSetting.findMany({
        where: { examId: { in: [...attemptByExam.keys()] } },
        select: { examId: true, retakeLimit: true },
      });
      const retakeLimitByExam = new Map(settings.map((s) => [s.examId, s.retakeLimit]));
      for (const [examId, attempts] of attemptByExam) {
        // 总机会数 = 重考次数 + 1（retakeLimit=0 表示仅一次机会）；
        // 无 ExamSetting 记录时按仅一次机会处理，与考试列表页 submitted 的判定口径一致
        const allowed = (retakeLimitByExam.get(examId) ?? 0) + 1;
        if (attempts >= allowed) exhaustedExamIds.push(examId);
      }
    }

    // 机会已用尽的用 notIn 排除在库里，故此处可安全地按 UPCOMING_LIMIT 截断
    const assignments = await this.prisma.examCandidate.findMany({
      where: {
        ...candidateWhere,
        exam: {
          ...openExamWhere,
          ...(exhaustedExamIds.length > 0 ? { id: { notIn: exhaustedExamIds } } : {}),
        },
      },
      select: {
        exam: {
          select: { id: true, name: true, startTime: true, endTime: true, status: true },
        },
      },
      orderBy: { exam: { startTime: 'asc' } },
      take: UPCOMING_LIMIT,
    });

    return assignments.map(({ exam }) => ({
      id: exam.id,
      name: exam.name,
      startTime: exam.startTime,
      endTime: exam.endTime,
      // status 在库里由定时任务/查询时惰性回写，可能滞后；
      // 这里按当前时间实时纠正，避免前端把已开始的考试显示成「未开始」而拦住入口
      status: exam.startTime <= now ? 'ongoing' : 'published',
      // 能走到这里的都还有作答机会，故 attemptCount>0 即「考过且可重考」
      attemptCount: attemptByExam.get(exam.id) ?? 0,
    }));
  }
}
