import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import { AppUserType } from '@/modules/app-auth/dto/app-auth.dto';
import { GradingService } from '@/modules/exam/services/grading.service';
import { countStemBlanks } from '@/common/utils/objective-judge.util';
import {
  CERT_TEMPLATE_SNAPSHOT_SELECT,
  resolveCertTemplate,
} from '@/modules/exam/utils/cert-template-snapshot';
import { buildCertElements, resolveCanvas } from '@/modules/exam/utils/cert-render';
import {
  buildRuleWhere,
  allocateByWeight,
  pickRandom,
} from '@/modules/exam/utils/rule-where';
import { AppExamItemVo, AppExamDetailVo, AppExamResultVo } from '../vo/app-exam.vo';

/** 考试实时状态 */
const STATUS = {
  PUBLISHED: 'published',
  ONGOING: 'ongoing',
  FINISHED: 'finished',
} as const;

/**
 * 考生端考试服务
 *
 * 覆盖考试全流程：列表 → 详情 → 人脸核验 → 取卷作答 → 交卷，
 * 以及考中防作弊上报（切屏告警、定时抓拍）。
 *
 * 两类考生（internal/external）在业务表里用不同外键列区分且 id 各自自增，
 * 所有查询必须带 candidateType，否则会串号（见 candidateWhere）。
 */
@Injectable()
export class AppExamService {
  private readonly logger = new Logger(AppExamService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gradingService: GradingService,
  ) {}

  /**
   * 算填空题的空位数，非填空题恒为 0
   *
   * 复用 objective-judge.util 的 countStemBlanks，与建题校验、判分切分同一套口径。
   * 这个数下发给考生端决定渲染几个输入框——前端若自己实现一份正则，
   * 遇到「下划线中间被富文本标签打断」这类写法两边就会算出不同的空数，
   * 而判分按 answer.split('\n') 逐空比对、段数不等直接判错，考生会莫名其妙丢分。
   *
   * @param type 题型
   * @param stem 题干（含富文本标签的原文，与判分侧输入保持一致）
   */
  private countBlanks(type: string, stem: string): number {
    if (type !== 'blank') return 0;
    return countStemBlanks(stem);
  }

  /**
   * 构造「限定为当前考生」的查询条件
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
   * 格式化为 YYYY-MM-DD
   *
   * 证书的颁发日期与有效期只到天，按本地时区取值而非 toISOString：
   * 后者按 UTC 切分，东八区凌晨的日期会退一天。
   * 与 AppProfileService.formatDate 同实现——两个模块各自私有，
   * 为一个四行函数引一层共享依赖不划算。
   */
  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * 按当前时间判定考试实时状态
   *
   * 管理端发布后库里的 status 不会随时间自动改写（一场考试到点了库里可能仍是
   * published），考生端必须按时间惰性纠正，否则列表状态与倒计时会不一致。
   *
   * @param startTime 考试开始时间
   * @param endTime 考试结束时间
   */
  private resolveStatus(startTime: Date, endTime: Date): string {
    const now = Date.now();
    if (now >= endTime.getTime()) return STATUS.FINISHED;
    if (now >= startTime.getTime()) return STATUS.ONGOING;
    return STATUS.PUBLISHED;
  }


  /**
   * 校验当前考生确实被分配到该场考试，并返回考试与设置
   *
   * 越权防线：所有按 examId 操作的接口都必须先过这道校验，否则考生改一下
   * 请求里的 examId 就能拿到别人的卷子、往别人的考试里写答案。
   * 用 404 而非 403，避免通过错误码枚举出「存在哪些考试」。
   *
   * @param examId 考试 ID
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   * @throws NotFoundException 考试不存在或未分配给当前考生
   */
  private async assertAssigned(examId: number, userId: number, userType: AppUserType) {
    const assigned = await this.prisma.examCandidate.findFirst({
      where: { examId, ...this.candidateWhere(userId, userType) },
      select: { id: true },
    });
    if (!assigned) {
      throw new NotFoundException('考试不存在或未分配给您');
    }

    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      select: {
        id: true,
        name: true,
        description: true,
        startTime: true,
        endTime: true,
        duration: true,
        passScore: true,
        paperId: true,
        status: true,
        // 结果页要判断「及格是否该有证」，取一个布尔列，不额外发查询
        autoIssueCert: true,
        // 考生端要消费的全部考试设置。
        // 这里取全字段而非按接口分别 select：assertAssigned 是所有考生端接口的
        // 共同入口，各接口只用其中几项，但分开 select 会让「哪个接口能看到哪个设置」
        // 散落在多处、加设置时极易漏。字段都是标量，一次取全的代价可忽略。
        // 注意不含 scorePublishMode：该列已废弃、不由设置控制。
        // 纯客观题交卷即自动发布（见 submitExam 的 `scorePublished: !hasSubjective`）；
        // 含主观题阅完后仍需管理端手动发布（GradingService.publishScore），可撤回。
        setting: {
          select: {
            screenSwitchDetect: true,
            allowSwitchTimes: true,
            shuffleQuestions: true,
            operationRestrict: true,
            retakeLimit: true,
            earlyEnterMinutes: true,
            requireCommitment: true,
            allowEarlySubmit: true,
            minAnswerMinutes: true,
            showRemainingTime: true,
            allowViewScore: true,
            allowViewAnalysis: true,
          },
        },
      },
    });
    if (!exam) {
      throw new NotFoundException('考试不存在');
    }
    // 未发布/已撤回的考试对考生不可见：状态判定只看时间，若不在此拦一道，
    // 管理员建好但尚未发布、或已撤回的考试一旦过了开始时间就会被判为进行中，
    // 考生可直接进入作答。不依赖管理端「仅允许撤回未开始考试」的隐式约束。
    if (exam.status === 'unpublished' || exam.status === 'draft') {
      throw new NotFoundException('考试不存在或未分配给您');
    }

    return { exam, candidate: assigned };
  }

  /**
   * 我的考试列表
   *
   * 只返回分配给当前考生的考试（经 ExamCandidate 过滤），按开始时间倒序。
   * 已交卷标记用于列表页把「进入考试」置灰为「已完成」。
   *
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   */
  async getExamList(userId: number, userType: AppUserType): Promise<AppExamItemVo[]> {
    const where = this.candidateWhere(userId, userType);

    const rows = await this.prisma.examCandidate.findMany({
      // 未发布/已撤回的考试不出现在考生列表里（与 assertAssigned 的口径一致）
      where: { ...where, exam: { status: { notIn: ['unpublished', 'draft'] } } },
      select: {
        exam: {
          select: {
            id: true,
            name: true,
            description: true,
            startTime: true,
            endTime: true,
            duration: true,
            passScore: true,
            // 题量取自试卷，与详情页同源；用嵌套 select 一次取出，不另发一轮查询
            paper: { select: { questionCount: true } },
          },
        },
      },
      orderBy: { exam: { startTime: 'desc' } },
    });

    // 一次查出本人各场考试的已交卷次数，避免逐条考试再查答卷（N+1）
    const submittedRows = await this.prisma.answerSheet.groupBy({
      by: ['examId'],
      where: { ...where, submitTime: { not: null } },
      _count: { _all: true },
    });
    const submittedCountByExam = new Map(
      submittedRows.map((r) => [r.examId, r._count._all]),
    );

    // 允许重考的考试要按剩余次数判断，交过一次就置灰会挡掉后续机会
    const settings = await this.prisma.examSetting.findMany({
      where: { examId: { in: rows.map((r) => r.exam.id) } },
      select: { examId: true, retakeLimit: true },
    });
    const retakeLimitByExam = new Map(settings.map((s) => [s.examId, s.retakeLimit]));

    return rows.map(({ exam }) => ({
      id: exam.id,
      name: exam.name,
      description: exam.description ?? undefined,
      startTime: exam.startTime as unknown as string,
      endTime: exam.endTime as unknown as string,
      duration: exam.duration,
      passScore: exam.passScore,
      questionCount: exam.paper?.questionCount ?? 0,
      status: this.resolveStatus(exam.startTime, exam.endTime),
      // submitted 语义是「已无作答机会」：允许重考时交过一次仍可再考
      submitted:
        (submittedCountByExam.get(exam.id) ?? 0) >=
        (retakeLimitByExam.get(exam.id) ?? 0) + 1,
    }));
  }

  /**
   * 考试详情
   *
   * 比列表多出说明、总分、题量与核验要求。题量与总分取自试卷：
   * 固定卷按实际挂题统计，随机卷按抽题规则的题量合计。
   *
   * @param examId 考试 ID
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   */
  async getExamDetail(
    examId: number,
    userId: number,
    userType: AppUserType,
  ): Promise<AppExamDetailVo> {
    const { exam, candidate } = await this.assertAssigned(examId, userId, userType);

    const [paper, submittedCount] = await Promise.all([
      this.prisma.paper.findUnique({
        where: { id: exam.paperId },
        select: { totalScore: true, questionCount: true },
      }),
      this.prisma.answerSheet.count({
        where: {
          examId,
          ...this.candidateWhere(userId, userType),
          submitTime: { not: null },
        },
      }),
    ]);

    return {
      id: exam.id,
      name: exam.name,
      description: exam.description ?? undefined,
      startTime: exam.startTime as unknown as string,
      endTime: exam.endTime as unknown as string,
      duration: exam.duration,
      status: this.resolveStatus(exam.startTime, exam.endTime),
      // 与列表一致：submitted 表示「已无作答机会」，而非「交过一次」
      submitted: submittedCount >= (exam.setting?.retakeLimit ?? 0) + 1,
      totalScore: paper?.totalScore ?? 0,
      passScore: exam.passScore,
      questionCount: paper?.questionCount ?? 0,
      /*
        详情页要用的三项设置。

        earlyEnterMinutes 让前端能算出「几点可以进」并据此启用按钮，
        而不是让考生对着灰按钮猜——服务端的准入校验（getExamPaper）是权威，
        这里下发同一个值只为把提示做准，两处判据一致不会打架。

        requireCommitment 决定进入作答前是否要先签承诺书。
        承诺书没有独立的签署留痕表，签署状态只存在于本次进入流程中：
        这一项的作用是「开考前让考生确认一次」，不是合规留证，
        故不建表、不落库，前端确认后直接取卷。若日后需要留证，
        应加一张签署记录表并由服务端在取卷时校验，而不是靠前端自觉。
      */
      earlyEnterMinutes: exam.setting?.earlyEnterMinutes ?? 0,
      requireCommitment: exam.setting?.requireCommitment ?? false,
      retakeLimit: exam.setting?.retakeLimit ?? 0,
    };
  }

  /**
   * 查当前考生姓名，用于写入各类记录的姓名快照
   *
   * token 载荷只有 id 与类型、不含姓名，故按类型回表查询。
   * 查不到时退化为占位串，不因缺姓名阻断考试流程。
   *
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   */
  private async resolveCandidateName(
    userId: number,
    userType: AppUserType,
  ): Promise<string> {
    if (userType === 'internal') {
      const user = await this.prisma.sysUser.findUnique({
        where: { id: userId },
        select: { name: true, nickName: true, username: true },
      });
      return user?.name || user?.nickName || user?.username || '考生';
    }
    const candidate = await this.prisma.externalCandidate.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    return candidate?.name || '考生';
  }

  /**
   * 计算剩余作答秒数
   *
   * 取「开考时刻 + 考试时长」与「考试结束时间」两者的较早者：
   * 迟到进场的考生不能因为时长够就答到考试窗口之外。
   *
   * @param sheetStart 答卷开考时间（历史数据可能为空，退化为按结束时间算）
   * @param durationMinutes 考试时长（分钟）
   * @param examEnd 考试结束时间
   */
  private calcRemainSeconds(
    sheetStart: Date | null,
    durationMinutes: number,
    examEnd: Date,
  ): number {
    const now = Date.now();
    const byExamEnd = Math.floor((examEnd.getTime() - now) / 1000);
    if (!sheetStart) return Math.max(0, byExamEnd);

    const byDuration = Math.floor(
      (sheetStart.getTime() + durationMinutes * 60 * 1000 - now) / 1000,
    );
    return Math.max(0, Math.min(byExamEnd, byDuration));
  }

  /**
   * 解析题目选项
   *
   * 库里 options 按项目既有约定存为「一行一个选项」的纯文本
   * （形如 "A. xxx\nB. yyy"），与判分逻辑拆分答案的方式保持一致。
   * 判断/填空/简答题无选项，存 null。
   *
   * @param raw 库中存储的 options 原文
   */
  private parseOptions(raw: string | null): string[] {
    if (!raw) return [];
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  /**
   * 取得或创建本场考试的进行中答卷
   *
   * 首次进入答题页创建答卷并记录开考时间；断线重连或刷新时复用同一份，
   * 保证倒计时不会因刷新而重置（开考时间只在创建时写入一次）。
   *
   * 并发防护：两个请求同时首次取卷可能各创建一份答卷，导致作答被拆散到
   * 两份卷子。这里创建后回查最早的一份，多余的空答卷不会被使用；
   * 已提交的答卷不参与复用（重考应产生新答卷）。
   *
   * @param examId 考试 ID
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   * @param candidateName 考生姓名快照
   */
  private async resolveActiveSheet(
    examId: number,
    userId: number,
    userType: AppUserType,
    candidateName: string,
  ) {
    const where = this.candidateWhere(userId, userType);

    const existing = await this.prisma.answerSheet.findFirst({
      where: { examId, ...where, submitTime: null },
      select: { id: true, startTime: true, switchCount: true },
      orderBy: { id: 'asc' },
    });
    if (existing) {
      // 历史答卷（startTime 是后加的可空列）可能没有开考时间。补写当前时间，
      // 而不是让 calcRemainSeconds 退化成「按考试结束时间算」——那等于凭空
      // 把个人时长放大到整个考试窗口。
      if (!existing.startTime) {
        const startTime = new Date();
        await this.prisma.answerSheet.update({
          where: { id: existing.id },
          data: { startTime },
        });
        return { ...existing, startTime };
      }
      return existing;
    }

    await this.prisma.answerSheet.create({
      data: {
        examId,
        ...where,
        candidateName,
        startTime: new Date(),
      },
    });

    // 回查最早的一份：并发下若产生了多份，所有请求都会稳定收敛到同一份
    const sheet = await this.prisma.answerSheet.findFirst({
      where: { examId, ...where, submitTime: null },
      select: { id: true, startTime: true, switchCount: true },
      orderBy: { id: 'asc' },
    });
    if (!sheet) {
      throw new BadRequestException('答卷创建失败，请重试');
    }
    return sheet;
  }

  /**
   * 载入试卷题目（固定卷与随机卷统一取挂题）
   *
   * 随机卷的题目在管理端点「生成试卷」时就已抽好写入 PaperQuestion，
   * 与固定卷同构，故两者走同一条读取路径，考生每次看到的题目一致。
   *
   * 不返回 answer/analysis 字段：标准答案绝不能下发到考生端，
   * 否则查看网络响应即可作弊。
   *
   * @param paperId 试卷 ID
   * @throws BadRequestException 试卷未挂题
   */
  private async loadPaperQuestions(paperId: number) {
    const paper = await this.prisma.paper.findUnique({
      where: { id: paperId },
      select: { id: true, type: true },
    });
    if (!paper) {
      throw new NotFoundException('试卷不存在');
    }

    {
      const rows = await this.prisma.paperQuestion.findMany({
        where: { paperId },
        select: {
          score: true,
          question: {
            select: {
              id: true,
              type: true,
              stem: true,
              options: true,
              // 材料题的小题，随材料题一同下发供考生一屏作答
              children: {
                select: { id: true, type: true, stem: true, options: true, suggestedScore: true },
                orderBy: { sortNo: 'asc' },
              },
            },
          },
        },
        orderBy: { sortNo: 'asc' },
      });
      if (rows.length === 0) {
        throw new BadRequestException('试卷未配置题目，请联系管理员');
      }
      // 材料题展开：材料题自身作为一个「材料 + 小题组」下发，
      // parentId 供考生端按组渲染（材料在上、小题依次在下，一屏答完）。
      // 材料题不占作答位，故不带 score；小题各自带分值。
      return rows.flatMap((r) => {
        const q = r.question;
        if (q.type !== 'composite') {
          const { children: _children, ...plain } = q;
          return [{ ...plain, parentId: null, score: r.score }];
        }
        return [
          // 材料本身：只用于展示，前端据 type=composite 判断不渲染作答控件
          { id: q.id, type: q.type, stem: q.stem, options: q.options, parentId: null, score: 0 },
          ...q.children.map((c) => ({
            id: c.id,
            type: c.type,
            stem: c.stem,
            options: c.options,
            parentId: q.id,
            score: c.suggestedScore,
          })),
        ];
      });
    }

    /*
      随机卷不再在此抽题。

      随机卷的定位已改为「快速组卷」：管理端点「生成试卷」时按规则抽一次并写入
      PaperQuestion，之后与固定卷同构。因此两种卷都走上面那段读题目项的逻辑，
      考生每次看到的题目一致，不会刷新就换题。
      （能开考的卷必为已发布，而发布前已校验题目非空，故此处不会走到）
    */
    throw new BadRequestException('试卷未配置题目，请联系管理员');
  }

  /**
   * 取得本份答卷的题目集合
   *
   * 两种卷的题目都已在试卷上确定：固定卷由人工挂题，随机卷在管理端点
   * 「生成试卷」时按规则抽好并写入 PaperQuestion。因此直接读试卷题目即可，
   * 考生刷新不会换题。
   *
   * （随机卷早期是在取卷时现抽的，为免刷新换题才需要把抽中结果冻结到答卷上；
   * 改为生成时固化后，那套冻结机制连同抽题逻辑一并移除。）
   *
   * @param sheetId 答卷 ID（保留参数：调用方签名不变，后续如需按答卷差异化取题仍从此处扩展）
   * @param paperId 试卷 ID
   */
  private async resolveSheetQuestions(_sheetId: number, paperId: number) {
    return this.loadPaperQuestions(paperId);
  }


  /**
   * 取卷（进入答题页）
   *
   * 依次校验：已分配 → 考试在进行中 → 需核验则已核验 → 未交卷，
   * 全部通过后取得/创建答卷并下发题目与已答记录。
   *
   * @param examId 考试 ID
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   * @param candidateName 考生姓名快照
   */
  async getExamPaper(examId: number, userId: number, userType: AppUserType) {
    const { exam, candidate } = await this.assertAssigned(examId, userId, userType);

    const status = this.resolveStatus(exam.startTime, exam.endTime);
    if (status === STATUS.PUBLISHED) {
      /*
        提前进场：earlyEnterMinutes 为 0 时严格到点才能进（保持原行为），
        为 N 时把准入门槛前移 N 分钟。

        注意只放开「进场」，不动个人时长的起算——答卷 startTime 仍是首次
        取卷的真实时刻，calcRemainSeconds 按 min(考试结束, 个人开考+时长) 算，
        所以提前进场的考生不会因为早进而多得时间，也不会少得：
        他的剩余时间同样从进场那刻起算 duration 分钟，且被考试结束时间夹住。
      */
      const earlyMs = (exam.setting?.earlyEnterMinutes ?? 0) * 60 * 1000;
      const openAt = exam.startTime.getTime() - earlyMs;
      if (Date.now() < openAt) {
        throw new ForbiddenException(
          earlyMs > 0
            ? `考试尚未开始，开考前 ${exam.setting?.earlyEnterMinutes} 分钟可进入`
            : '考试尚未开始',
        );
      }
    }
    if (status === STATUS.FINISHED) {
      throw new ForbiddenException('考试已结束');
    }

    // 重考次数校验：retakeLimit=0 表示不允许重考（仅一次机会），
    // =N 表示可再考 N 次，故总机会数为 N+1。已交卷次数达到上限即拒绝。
    const submittedCount = await this.prisma.answerSheet.count({
      where: {
        examId,
        ...this.candidateWhere(userId, userType),
        submitTime: { not: null },
      },
    });
    const allowedAttempts = (exam.setting?.retakeLimit ?? 0) + 1;
    if (submittedCount >= allowedAttempts) {
      throw new ForbiddenException('您已完成本场考试');
    }

    const candidateName = await this.resolveCandidateName(userId, userType);
    const sheet = await this.resolveActiveSheet(examId, userId, userType, candidateName);
    const questions = await this.resolveSheetQuestions(sheet.id, exam.paperId);

    // 已答记录按题目 ID 回填，供断线重连恢复
    const savedItems = await this.prisma.answerItem.findMany({
      where: { answerSheetId: sheet.id },
      select: { questionId: true, candidateAnswer: true },
    });
    const answers: Record<string, string> = {};
    for (const item of savedItems) {
      if (item.candidateAnswer) answers[String(item.questionId)] = item.candidateAnswer;
    }

    const ordered = exam.setting?.shuffleQuestions
      ? this.shuffleKeepingComposites(questions)
      : questions;

    return {
      sheetId: sheet.id,
      examId: exam.id,
      examName: exam.name,
      screenSwitchDetect: exam.setting?.screenSwitchDetect ?? false,
      allowSwitchTimes: exam.setting?.allowSwitchTimes ?? 0,
      switchCount: sheet.switchCount,
      // 答题页的三项开关。默认值与 schema 的 @default 一致：
      // 没有 setting 行时按「限制最松」处理（不限操作、可提前交卷、显示倒计时），
      // 否则老考试因缺行而突然禁掉提前交卷，比放宽更糟。
      operationRestrict: exam.setting?.operationRestrict ?? false,
      allowEarlySubmit: exam.setting?.allowEarlySubmit ?? true,
      minAnswerMinutes: exam.setting?.minAnswerMinutes ?? 0,
      showRemainingTime: exam.setting?.showRemainingTime ?? true,
      // 已作答时长（秒）：最短作答时长的判定基准由服务端给，
      // 不让前端用本地时钟算——改系统时间就能绕过。
      // startTime 理论上已由 resolveActiveSheet 补齐，这里仍兜 null：
      // 取 0 表示「刚开始答」，最短时长会拦住交卷，宁可偏严不放过。
      elapsedSeconds: sheet.startTime
        ? Math.max(
            0,
            Math.floor((Date.now() - sheet.startTime.getTime()) / 1000),
          )
        : 0,
      remainSeconds: this.calcRemainSeconds(
        sheet.startTime,
        exam.duration,
        exam.endTime,
      ),
      questions: ordered.map((q) => ({
        id: q.id,
        type: q.type,
        score: q.score,
        stem: q.stem,
        options: this.parseOptions(q.options),
        // parentId 必须下发：考生端据它把小题收拢到材料题名下，做到材料 + 全部小题一屏作答。
        // 漏掉这个字段，材料题会独占一页、小题被当成独立题散落到后面各页。
        parentId: q.parentId ?? null,
        blankCount: this.countBlanks(q.type, q.stem),
      })),
      answers,
    };
  }

  /**
   * 题目乱序，但保持材料题与其小题相邻且顺序不变
   *
   * 直接对扁平列表洗牌会把小题冲散到别处，考生端靠「小题紧跟材料题」收拢分组，
   * 相邻关系一破分组就失效：材料题独占一页、小题变成散落的独立题。
   * 故以「材料题及其小题」为不可拆分的整体参与洗牌。
   *
   * 组内小题不打乱：小题常有「结合上述材料回答第 1、2 问」这类互相引用的顺序关系。
   *
   * @param questions 扁平题目列表（材料题后紧跟其小题）
   * @returns 乱序后的扁平列表
   */
  private shuffleKeepingComposites<T extends { id: number; parentId?: number | null }>(
    questions: T[],
  ): T[] {
    // 先按材料题归组，得到可整体移动的洗牌单位
    const units: T[][] = [];
    for (const q of questions) {
      const last = units[units.length - 1];
      // 小题并入上一组：仅当上一组的首项确实是它的材料题
      if (q.parentId != null && last && last[0].id === q.parentId) {
        last.push(q);
        continue;
      }
      // 带 parentId 却挂不上任何组：数据异常（小题排在材料题之前、材料题缺失、
      // 或 sortNo 配错导致两组小题交叉）。此时该小题会脱离材料单独成页，
      // 考生看到没有材料的题。降级不静默，记日志让配置错误能被排查到。
      if (q.parentId != null) {
        this.logger.warn(
          `题目 ${q.id} 的 parentId=${q.parentId} 未能匹配到材料题，将脱离材料单独成页，请检查题库配置`,
        );
      }
      units.push([q]);
    }

    // Fisher-Yates：sort(() => Math.random() - 0.5) 的分布是有偏的，不能当洗牌用
    for (let i = units.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [units[i], units[j]] = [units[j], units[i]];
    }

    return units.flat();
  }

  /**
   * 保存单题作答（答题页自动保存）
   *
   * 幂等：同一题重复保存覆盖原作答，不产生重复答题项。
   * 保存时一并冗余标准答案与评分标准，交卷判分与后续阅卷据此进行
   * （题库题目日后被修改也不影响已考答卷的判分依据）。
   *
   * @param examId 考试 ID
   * @param questionId 题目 ID
   * @param answer 考生作答
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   */
  async saveAnswer(
    examId: number,
    questionId: number,
    answer: string,
    userId: number,
    userType: AppUserType,
  ): Promise<{ savedAt: Date }> {
    const { exam } = await this.assertAssigned(examId, userId, userType);

    if (this.resolveStatus(exam.startTime, exam.endTime) === STATUS.FINISHED) {
      throw new ForbiddenException('考试已结束，无法作答');
    }

    const sheet = await this.prisma.answerSheet.findFirst({
      where: { examId, ...this.candidateWhere(userId, userType), submitTime: null },
      select: { id: true, startTime: true },
      orderBy: { id: 'asc' },
    });
    if (!sheet) {
      throw new ForbiddenException('未找到进行中的答卷，请重新进入考试');
    }

    // 个人时长校验：只看考试窗口是不够的。迟到进场的考生个人时长会先于
    // 考试窗口到期，若不拦，改本机时间或直接调接口就能多答一段时间。
    const remain = this.calcRemainSeconds(sheet.startTime, exam.duration, exam.endTime);
    if (remain <= 0) {
      throw new ForbiddenException('作答时长已用尽，请交卷');
    }

    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      select: {
        id: true,
        type: true,
        answer: true,
        scoringCriteria: true,
        suggestedScore: true,
      },
    });
    if (!question) {
      throw new NotFoundException('题目不存在');
    }

    // 本题分值优先用试卷配置的分值，随机卷取题目建议分值
    const paperQuestion = await this.prisma.paperQuestion.findFirst({
      where: { paperId: exam.paperId, questionId },
      select: { score: true, sortNo: true },
    });
    const fullScore = paperQuestion?.score ?? question.suggestedScore;

    const existing = await this.prisma.answerItem.findFirst({
      where: { answerSheetId: sheet.id, questionId },
      select: { id: true },
    });

    const payload = {
      questionCategory: this.gradingService.isObjective(question.type)
        ? 'objective'
        : 'subjective',
      fullScore,
      candidateAnswer: answer ?? '',
      standardAnswer: question.answer,
      scoringCriteria: question.scoringCriteria,
    };

    if (existing) {
      await this.prisma.answerItem.update({
        where: { id: existing.id },
        data: payload,
      });
    } else {
      const count = await this.prisma.answerItem.count({
        where: { answerSheetId: sheet.id },
      });
      await this.prisma.answerItem.create({
        data: {
          answerSheetId: sheet.id,
          questionId,
          questionNo: paperQuestion?.sortNo ?? count + 1,
          ...payload,
        },
      });
    }

    return { savedAt: new Date() };
  }

  /**
   * 给未作答的题目补空答题项
   *
   * 考生跳过的题不会有答题项，若不补，判分时这些题既不算错也不占分，
   * 「答对 2 题得满分」这类错误就会出现。补成空作答后由判分逻辑判错。
   * 仅固定卷可补（随机卷的题目集合在取卷时才确定，无法回溯）。
   *
   * @param sheetId 答卷 ID
   * @param paperId 试卷 ID
   */
  private async fillMissingAnswerItems(sheetId: number, paperId: number): Promise<void> {
    const paperQuestions = await this.prisma.paperQuestion.findMany({
      where: { paperId },
      select: {
        questionId: true,
        score: true,
        sortNo: true,
        question: {
          select: {
            type: true,
            answer: true,
            scoringCriteria: true,
            // 材料题的小题：材料题本身不可作答，作答位由小题产生
            children: {
              select: { id: true, type: true, answer: true, scoringCriteria: true, suggestedScore: true },
              orderBy: { sortNo: 'asc' },
            },
          },
        },
      },
      orderBy: { sortNo: 'asc' },
    });
    if (paperQuestions.length === 0) return;

    // PaperQuestion 只引用材料题，故此处必须展开：
    // 材料题（composite）不可作答，若直接按 questionId 建答题项，会得到一条
    // 永远判不了分的空记录，且该材料题的小题完全不会出现在答卷里。
    // 题号沿用材料题的 sortNo 作为整数部分、小题在其内按序偏移，
    // 保证同一材料题的小题在答题卡上连续且紧随材料。
    type Slot = {
      questionId: number;
      questionNo: number;
      type: string;
      fullScore: number;
      standardAnswer: string;
      scoringCriteria: string | null;
    };
    const slots: Slot[] = [];
    for (const pq of paperQuestions) {
      if (pq.question.type === 'composite') {
        pq.question.children.forEach((child, idx) => {
          slots.push({
            questionId: child.id,
            // 小题题号在材料题 sortNo 基础上顺延，避免与相邻题撞号
            questionNo: pq.sortNo * 100 + idx + 1,
            type: child.type,
            // 分值取小题自身的建议分值（材料题分值是小题之和，不能整份给一个小题）
            fullScore: child.suggestedScore,
            standardAnswer: child.answer ?? '',
            scoringCriteria: child.scoringCriteria,
          });
        });
        continue;
      }
      slots.push({
        questionId: pq.questionId,
        questionNo: pq.sortNo,
        type: pq.question.type,
        fullScore: pq.score,
        standardAnswer: pq.question.answer,
        scoringCriteria: pq.question.scoringCriteria,
      });
    }
    if (slots.length === 0) return;

    const answered = await this.prisma.answerItem.findMany({
      where: { answerSheetId: sheetId },
      select: { questionId: true },
    });
    const answeredIds = new Set(answered.map((a) => a.questionId));

    const missing = slots.filter((s) => !answeredIds.has(s.questionId));
    if (missing.length === 0) return;

    await this.prisma.answerItem.createMany({
      data: missing.map((s) => ({
        answerSheetId: sheetId,
        questionId: s.questionId,
        questionNo: s.questionNo,
        questionCategory: this.gradingService.isObjective(s.type) ? 'objective' : 'subjective',
        fullScore: s.fullScore,
        candidateAnswer: '',
        standardAnswer: s.standardAnswer,
        scoringCriteria: s.scoringCriteria,
      })),
    });
  }

  /**
   * 交卷
   *
   * 先给未作答的题目补空答题项（否则漏答的题不计入判分，总分会虚高），
   * 再复用管理端的客观题自动判分；含主观题时留待阅卷，不即时出总分。
   *
   * 幂等：已交卷再次调用直接返回既有结果，不重复判分。
   *
   * @param examId 考试 ID
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   */
  /**
   * 交卷准入校验：提前交卷开关与最短作答时长
   *
   * 「是否提前交卷」在服务端按剩余时间判定，不接受前端传标记——
   * 若开放一个 auto=true 的入参，考生只要自己带上它就能绕过这两条限制。
   * 剩余时间为 0（个人时长用尽或考试已结束）即到点交卷，无条件放行：
   * 此时拦下去会让考生既交不了卷、又不能继续答，卡死在答题页。
   *
   * @param exam assertAssigned 返回的考试（含 setting 与 duration/endTime）
   * @param sheetStart 答卷开考时间，可空（历史数据）
   */
  private assertSubmitAllowed(
    exam: {
      duration: number;
      endTime: Date;
      setting: { allowEarlySubmit: boolean; minAnswerMinutes: number } | null;
    },
    sheetStart: Date | null,
  ): void {
    const remain = this.calcRemainSeconds(
      sheetStart,
      exam.duration,
      exam.endTime,
    );
    // 到点交卷（含自动交卷）不受限
    if (remain <= 0) return;

    if (exam.setting?.allowEarlySubmit === false) {
      throw new ForbiddenException('本场考试不允许提前交卷，请答完等待时间结束');
    }

    const minMinutes = exam.setting?.minAnswerMinutes ?? 0;
    if (minMinutes > 0 && sheetStart) {
      const elapsedSec = Math.floor((Date.now() - sheetStart.getTime()) / 1000);
      const needSec = minMinutes * 60;
      if (elapsedSec < needSec) {
        const leftMin = Math.ceil((needSec - elapsedSec) / 60);
        throw new ForbiddenException(
          `本场考试最短作答 ${minMinutes} 分钟，还需 ${leftMin} 分钟后可交卷`,
        );
      }
    }
  }

  async submitExam(examId: number, userId: number, userType: AppUserType) {
    const { exam } = await this.assertAssigned(examId, userId, userType);
    const where = this.candidateWhere(userId, userType);

    /*
      本场不公开成绩时，交卷响应不能带分数。

      纯客观题卷在交卷这一刻就判分并发布（见下方 scorePublished: !hasSubjective），
      objectiveScore 原先无条件下发，前端交卷提示直接报出「客观题得分 N 分」——
      比结果页更早的一个泄漏点，且结果页那边已按本开关挡住，这里漏了就等于白挡。

      默认 true（无 setting 行按开放处理），与 getResult / getScoreList /
      getScoreDetail / 成绩发布消息四处口径一致。
    */
    const scoreHidden = !(exam.setting?.allowViewScore ?? true);

    // 先找进行中的答卷。允许重考时考生同时存在「已交的」与「进行中的」，
    // 若先看已交答卷就返回，会误报旧成绩而漏交当前这份。
    const sheet = await this.prisma.answerSheet.findFirst({
      where: { examId, ...where, submitTime: null },
      // startTime 用于判定「是提前交卷还是到点交卷」，见下方 assertSubmitAllowed
      select: { id: true, startTime: true },
      orderBy: { id: 'asc' },
    });

    // 没有进行中的答卷 → 视为重复交卷，幂等返回最近一次成绩，不重复判分
    if (!sheet) {
      const submittedSheet = await this.prisma.answerSheet.findFirst({
        where: { examId, ...where, submitTime: { not: null } },
        select: {
          id: true,
          objectiveScore: true,
          scorePublished: true,
          gradingStatus: true,
        },
        orderBy: { id: 'desc' },
      });
      if (submittedSheet) {
        return {
          sheetId: submittedSheet.id,
          objectiveScore: scoreHidden ? null : (submittedSheet.objectiveScore ?? 0),
          hasSubjective: submittedSheet.gradingStatus !== 'completed',
          scorePublished: submittedSheet.scorePublished,
        };
      }
      throw new ForbiddenException('未找到进行中的答卷，请重新进入考试');
    }

    this.assertSubmitAllowed(exam, sheet.startTime);

    await this.fillMissingAnswerItems(sheet.id, exam.paperId);

    const objectiveScore = await this.gradingService.autoGradeObjective(sheet.id);
    const hasSubjective = await this.gradingService.hasUngradedSubjective(sheet.id);

    // 含主观题时进入待阅卷、成绩不发布；纯客观题即时出分并发布
    const passed = hasSubjective ? null : objectiveScore >= exam.passScore;
    await this.prisma.answerSheet.update({
      where: { id: sheet.id },
      data: {
        submitTime: new Date(),
        gradingStatus: hasSubjective ? 'pending' : 'completed',
        subjectiveScore: hasSubjective ? null : 0,
        totalScore: hasSubjective ? null : objectiveScore,
        scorePublished: !hasSubjective,
        passed,
      },
    });

    /*
      纯客观题卷在这里就已经发布成绩并判定及格，必须同步发证。
      少了这一步，开了自动发证的纯客观题考试永远发不出证书——
      发证原先只挂在 GradingService.publishScore 上，而那条路只有
      含主观题的卷经管理端阅卷发布时才会走到。

      失败只记日志不影响交卷结果：卷子已经交了、分也算了，
      因发证配置有问题把交卷一起失败掉更糟（与 publishScore 同一策略，
      故复用 tryIssueCertificate 而非在此另写一套 try/catch）。
    */
    if (passed) {
      await this.gradingService.tryIssueCertificate(sheet.id);
    }

    return {
      sheetId: sheet.id,
      // 置 null 而非留着让前端不显示：下发了抓包就能看到，等于没藏
      objectiveScore: scoreHidden ? null : objectiveScore,
      hasSubjective,
      scorePublished: !hasSubjective,
    };
  }

  /**
   * 查交卷结果（考生端结果页）
   *
   * 允许重考时同一考生同一场会有多份答卷，取最近交卷的那份——
   * 考生交完卷立刻跳到本页，看到的必须是刚交的这次。
   *
   * 分数字段按 scorePublished 决定是否下发：未发布时一律给 null，
   * 不能把库里已算出的客观题分提前透给考生，否则等于绕过成绩发布管控。
   *
   * @param examId 考试 ID
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   */
  async getExamResult(
    examId: number,
    userId: number,
    userType: AppUserType,
  ): Promise<AppExamResultVo> {
    const { exam } = await this.assertAssigned(examId, userId, userType);

    const [sheet, paper, submittedCount] = await Promise.all([
      this.prisma.answerSheet.findFirst({
        where: {
          examId,
          ...this.candidateWhere(userId, userType),
          submitTime: { not: null },
        },
        orderBy: { submitTime: 'desc' },
        select: {
          // id 用于按 answerSheetId 反查本场所发证书
          id: true,
          objectiveScore: true,
          subjectiveScore: true,
          totalScore: true,
          scorePublished: true,
          passed: true,
          submitTime: true,
          switchCount: true,
        },
      }),
      this.prisma.paper.findUnique({
        where: { id: exam.paperId },
        select: { totalScore: true, questionCount: true },
      }),
      // 已交卷次数，用于算本场是否还能再考（见下方 canRetake）
      this.prisma.answerSheet.count({
        where: {
          examId,
          ...this.candidateWhere(userId, userType),
          submitTime: { not: null },
        },
      }),
    ]);

    // 未交卷就没有结果可看。用 403 而非 404：考试确实存在且已分配给本人，
    // 只是还没交卷，与「考试不存在」是两种情况，前端提示口径也不同。
    if (!sheet) {
      throw new ForbiddenException('您还未交卷，暂无成绩');
    }

    /*
      成绩可见 = 已发布 且 考试设置允许考生查看成绩。

      两者分开下发而不是合成一个布尔：前端要给不同文案——
      未发布是「待阅卷，稍后可查」，设置不公开是「本场成绩不对考生公开」，
      合成一个会把后者显示成「待阅卷」，让考生一直等一个不会来的结果。
      默认 true（无 setting 行按开放处理），与 schema @default 一致。
    */
    const scoreAllowed = exam.setting?.allowViewScore ?? true;
    const released = sheet.scorePublished && scoreAllowed;

    /*
      本场是否还能再考，供结果页给出重考入口。

      判定必须与取卷闸门（startExam 里的重考次数校验）逐条对齐，
      否则会出现「结果页显示可重考、点了却被拒」——那比不给入口更糟。
      闸门是两条：考试未结束、已交卷次数 < 总机会数（retakeLimit + 1）。

      不看阅卷状态：含主观题的卷交完即待阅卷，但重考机会与阅卷进度无关，
      闸门也没查这一项，此处若多加一条会与闸门不一致。
    */
    const allowedAttempts = (exam.setting?.retakeLimit ?? 0) + 1;
    const retake = {
      canRetake:
        this.resolveStatus(exam.startTime, exam.endTime) !== STATUS.FINISHED &&
        submittedCount < allowedAttempts,
      submittedCount,
      allowedAttempts,
    };

    /*
      本场所发证书。只在「成绩已发布且及格」时才查：
      发证由阅卷发布触发且仅及格才发（见 GradingService.issueCertificate），
      未及格或未发布时查了必然为空，白发一次查询。

      按 answerSheetId 反查而非按人查：同一考生可能持有多张证书（含其他考试、
      手工发放），按人查会把无关证书带到本场结果页上。

      闸门用 scorePublished 而非 released：released 含 allowViewScore，
      而证书不该受那个开关影响。理由是那样藏不干净——同一张证书在
      「我的证书」列表（app-profile.getCertificateList）里没有、也不该有
      按考试设置的过滤，结果页藏了、那边照样看得见，等于只堵一个入口。
      与其做半途而废的隐藏，不如认定语义边界：allowViewScore 管的是分数，
      证书是已发放的凭证，属于考生自己的东西，不随分数一起藏。
      （若日后确需「连及格与否都不暴露」，得同时过滤 getCertificateList，
      但那意味着把考生已获得的证书从他自己手里藏起来，需产品先定。）
    */
    const cert =
      sheet.scorePublished && sheet.passed
        ? await this.prisma.certificate.findUnique({
            where: { answerSheetId: sheet.id },
            select: {
              id: true,
              certNo: true,
              candidateName: true,
              issueDate: true,
              expireDate: true,
              // 发证时定格的模板快照，渲染以它为准
              templateSnapshot: true,
              project: { select: { name: true } },
              // 仅供快照缺失的存量证书回退
              template: { select: CERT_TEMPLATE_SNAPSHOT_SELECT },
            },
          })
        : null;
    // 结果页的证书小样与证书详情页必须长得一样，故走同一套渲染，
    // 不再只给底图——只给底图会渲成一个没有任何文字的空白框。
    const certTpl = cert ? resolveCertTemplate(cert.templateSnapshot, cert.template) : null;

    return {
      examName: exam.name,
      scoreReleased: released,
      // 成绩被设置挡住（已发布但不允许考生查看），供前端区分文案
      scoreWithheld: sheet.scorePublished && !scoreAllowed,
      ...retake,
      totalScore: released ? (sheet.totalScore ?? 0) : null,
      objectiveScore: released ? (sheet.objectiveScore ?? 0) : null,
      // 无主观题的场次此列本就为 null，前端据此隐藏该行，故不做 ?? 0 兜底
      subjectiveScore: released ? sheet.subjectiveScore : null,
      passed: released ? sheet.passed : null,
      submitTime: sheet.submitTime as unknown as string,
      questionCount: paper?.questionCount ?? 0,
      fullScore: paper?.totalScore ?? 0,
      passScore: exam.passScore,
      switchCount: sheet.switchCount,
      certificate:
        cert && certTpl
          ? {
              id: cert.id,
              name: certTpl.title || '证书',
              code: cert.certNo,
              issuer: certTpl.issuingOrg,
              issueDate: this.formatDate(cert.issueDate),
              validPeriod: `${this.formatDate(cert.issueDate)} 至 ${this.formatDate(cert.expireDate)}`,
              backgroundImage: certTpl.backgroundImage,
              sealImage: certTpl.sealImage,
              // 字段名对齐证书详情页，同一张证书在两个接口里不该叫不同名字
              canvasWidth: resolveCanvas(certTpl.size).width,
              canvasHeight: resolveCanvas(certTpl.size).height,
              elements: buildCertElements(certTpl.content, {
                certTitle: certTpl.title,
                issuingOrg: certTpl.issuingOrg,
                candidateName: cert.candidateName,
                certNo: cert.certNo,
                projectName: cert.project?.name ?? '',
                issueDate: this.formatDate(cert.issueDate),
                expireDate: this.formatDate(cert.expireDate),
              }),
            }
          : null,
      // 该发但没查到：开了自动发证、已及格，却没有证书记录。
      // 与 cert 用同一个闸门（scorePublished 而非 released），
      // 否则关掉「查看成绩」时这里恒为 false，考生看不到「证书发放中」
      // 而证书卡也不显示，页面上就完全没有证书的任何痕迹了。
      certPending:
        sheet.scorePublished && !!sheet.passed && exam.autoIssueCert && !cert,
    };
  }

  /**
   * 切屏告警上报
   *
   * 累加答卷上的切屏次数。
   * 返回是否已超出允许次数，超出时前端应强制交卷。
   * allowSwitchTimes 为 0 表示不限次数，只记录不判超限。
   *
   * @param examId 考试 ID
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   */
  async reportSwitchAlarm(
    examId: number,
    userId: number,
    userType: AppUserType,
  ): Promise<{ switchCount: number; exceeded: boolean }> {
    const { exam } = await this.assertAssigned(examId, userId, userType);
    const where = this.candidateWhere(userId, userType);

    const sheet = await this.prisma.answerSheet.findFirst({
      where: { examId, ...where, submitTime: null },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    if (!sheet) {
      throw new ForbiddenException('未找到进行中的答卷');
    }

    /*
      未开防切屏时直接返回，不累加。
      前端已按 screenSwitchDetect 决定是否监听，这里再挡一道是因为：
      该接口是公开的考生端接口，前端不监听不等于没人调它——旧版本客户端、
      页面缓存未更新、或手工调用都会把次数刷上去，而 switchCount 会展示在
      考生结果页和管理端阅卷页，脏数据会让「没开防切屏的考试也显示切屏 N 次」。
      返回当前真实次数而非 0，避免前端以为上报成功却拿到矛盾的计数。
    */
    if (!exam.setting?.screenSwitchDetect) {
      const current = await this.prisma.answerSheet.findUnique({
        where: { id: sheet.id },
        select: { switchCount: true },
      });
      return { switchCount: current?.switchCount ?? 0, exceeded: false };
    }

    // 只累加切屏次数：这是超次数强制交卷的唯一判定依据，不再留存逐条异常事件台账。
    const updated = await this.prisma.answerSheet.update({
      where: { id: sheet.id },
      data: { switchCount: { increment: 1 } },
      select: { switchCount: true },
    });

    const allow = exam.setting?.allowSwitchTimes ?? 0;
    return {
      switchCount: updated.switchCount,
      exceeded: allow > 0 && updated.switchCount > allow,
    };
  }

}
