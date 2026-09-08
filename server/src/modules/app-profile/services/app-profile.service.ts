import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma.service';
import { AppUserType } from '@/modules/app-auth/dto/app-auth.dto';
import {
  CERT_TEMPLATE_SNAPSHOT_SELECT,
  resolveCertTemplate,
} from '@/modules/exam/utils/cert-template-snapshot';
import { buildCertElements, resolveCanvas } from '@/modules/exam/utils/cert-render';
import {
  AppScoreItemVo,
  AppScoreDetailVo,
  AppScoreQuestionVo,
  AppCertificateItemVo,
  AppCertificateDetailVo,
  AppCertElementVo,
} from '../vo/app-profile.vo';

// 成绩详情逐题回顾所需的答题项字段白名单。
// question.answer 作为 standardAnswer 的回退：历史答卷未冗余标准答案快照，
// 缺失时读题目当前答案，否则复盘页的「正确答案」会是空白。
const SCORE_ITEM_SELECT = {
  // id 用于关联评分留痕（ReviewRecord.answerItemId），不下发给前端
  id: true,
  questionId: true,
  // 只有主观题才有人工评分留痕，客观题一律不下发批阅人信息
  questionCategory: true,
  candidateAnswer: true,
  standardAnswer: true,
  score: true,
  finalScore: true,
  question: {
    select: { type: true, stem: true, options: true, analysis: true, answer: true },
  },
} satisfies Prisma.AnswerItemSelect;

type ScoreAnswerItem = Prisma.AnswerItemGetPayload<{
  select: typeof SCORE_ITEM_SELECT;
}>;

/** 单题最近一次人工评分留痕（成绩详情展示批阅人与评语用） */
type ReviewBrief = {
  answerItemId: number;
  reviewerName: string;
  reviewComment: string;
  reviewTime: Date;
};

/** 题型中文名映射，用于成绩详情展示 */
const QUESTION_TYPE_TEXT: Record<string, string> = {
  single: '单选题',
  multiple: '多选题',
  judge: '判断题',
  blank: '填空题',
  qa: '简答题',
};

/**
 * 考生端个人中心服务
 *
 * 提供成绩查询与证书查询。与考试模块的关键差别：成绩详情**会**下发标准答案
 * 与解析（供错题复盘），因此必须严格限定「成绩已发布」才可读，
 * 否则考生可在阅卷前通过成绩详情套出答案。
 *
 * 两类考生（internal/external）id 各自自增，所有查询必须带 candidateType。
 */
@Injectable()
export class AppProfileService {
  constructor(private readonly prisma: PrismaService) {}

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
   * @param date 日期
   */
  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * 我的成绩列表
   *
   * 只返回已交卷且成绩已发布的答卷。未发布的成绩（含主观题待阅卷）不返回，
   * 否则考生会看到半成品分数；前端的平均分也是按这个列表现算的。
   *
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   */
  async getScoreList(userId: number, userType: AppUserType): Promise<AppScoreItemVo[]> {
    const rows = await this.prisma.answerSheet.findMany({
      // 只要交了卷就列出，含未发布成绩的（待阅卷）。若按 scorePublished 过滤，
      // 含主观题的考试交完卷后记录会直接消失，考生会以为成绩丢了。
      where: {
        ...this.candidateWhere(userId, userType),
        submitTime: { not: null },
      },
      select: {
        id: true,
        // 用时按「开始作答 → 交卷」实算，故两个时间都要取
        startTime: true,
        submitTime: true,
        totalScore: true,
        passed: true,
        scorePublished: true,
        exam: {
          select: {
            name: true,
            passScore: true,
            // 考场安排的起止时段，与考生实际作答时间是两件事，列表两者都要展示
            startTime: true,
            endTime: true,
            paper: { select: { totalScore: true } },
            // 本场是否对考生公开成绩。不取这个字段，「查看成绩」关闭的考试
            // 分数照样从本列表漏出去——该开关此前只在交卷结果页生效
            setting: { select: { allowViewScore: true } },
          },
        },
      },
      orderBy: { submitTime: 'desc' },
    });

    return rows.map((r) => {
      /*
        本场不公开成绩时，分数与及格与否一律不下发。

        默认 true（无 setting 行按开放处理），与 schema @default 及
        app-exam.getResult 里 scoreAllowed 的兜底方向一致。

        与 pendingReview 并列而不是合并：两者都「无分可看」，但
        待阅卷是「等一等就有」，不公开是「永远不会有」。合成一个布尔
        会让前端把后者显示成「待阅卷」，考生会一直等一个不会来的结果。
      */
      const scoreHidden = !(r.exam?.setting?.allowViewScore ?? true);
      return {
        sheetId: r.id,
        examName: r.exam?.name ?? '',
        // 考场安排时段。exam 理论上必然存在，仍留 null 兜底避免类型不符
        examStartTime: (r.exam?.startTime ?? null) as unknown as string | null,
        examEndTime: (r.exam?.endTime ?? null) as unknown as string | null,
        // startTime 本就为算用时而查，一并下发，前端可展示「开始 → 交卷」的完整区间
        startTime: r.startTime as unknown as string | null,
        submitTime: r.submitTime as unknown as string,
        passScore: r.exam?.passScore ?? 0,
        fullScore: r.exam?.paper?.totalScore ?? 0,
        usedMinutes: this.calcUsedMinutes(r.startTime, r.submitTime),
        // 待阅卷时分数与及格与否都还不存在，给 null 让前端显示「待阅卷」而非 0 分/不及格；
        // 本场不公开时同样给 null，且不能只靠前端不渲染——接口下发了就等于泄漏
        totalScore: !scoreHidden && r.scorePublished ? r.totalScore : null,
        passed: !scoreHidden && r.scorePublished ? (r.passed ?? false) : null,
        pendingReview: !r.scorePublished,
        scoreHidden,
      };
    });
  }

  /**
   * 成绩详情（逐题回顾）
   *
   * 会下发标准答案与解析供复盘，因此双重校验：答卷必须属于当前考生，
   * 且成绩必须已发布——未发布就能读等于考试期间可套答案。
   *
   * @param sheetId 答卷 ID
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   * @throws NotFoundException 答卷不存在或不属于当前考生
   * @throws ForbiddenException 成绩尚未发布
   */
  async getScoreDetail(
    sheetId: number,
    userId: number,
    userType: AppUserType,
  ): Promise<AppScoreDetailVo> {
    const sheet = await this.prisma.answerSheet.findFirst({
      // 用 findFirst + candidateWhere 而非 findUnique(id)：只按 id 查会读到别人的成绩
      where: { id: sheetId, ...this.candidateWhere(userId, userType) },
      select: {
        id: true,
        examId: true,
        submitTime: true,
        totalScore: true,
        objectiveScore: true,
        subjectiveScore: true,
        passed: true,
        scorePublished: true,
        // 用时按「开始作答 → 交卷」实算，不用考试时长（那是上限，不是实际用时）
        startTime: true,
        exam: {
          select: {
            name: true,
            passScore: true,
            // 满分取试卷总分：Exam 自身不存满分，及格分是绝对分值需与满分对照才有意义
            paper: { select: { totalScore: true } },
            // endTime 用于判断本场是否已结束（结束后不可能再作答，答案应开放）
            endTime: true,
            setting: {
              select: {
                retakeLimit: true,
                allowViewAnalysis: true,
                // 本场是否对考生公开成绩。与 allowViewAnalysis 是两个独立开关，
                // 各管一段：这个管分数，那个管标准答案与解析
                allowViewScore: true,
              },
            },
          },
        },
      },
    });
    if (!sheet) {
      throw new NotFoundException('成绩不存在');
    }
    if (!sheet.scorePublished) {
      throw new ForbiddenException('成绩尚未发布');
    }

    // 本场是否还能再考。允许重考的考试若照常下发标准答案，考生就能
    // 「第一次随便答拿答案 → 第二次照抄」：固定卷两次考的是同一批题，
    // 这是确定性的作弊通道。故仍有作答机会时只给分数、隐去答案与解析。
    const canRetake = sheet.exam
      ? await this.hasRemainingAttempts(
          sheet.examId,
          userId,
          userType,
          sheet.exam.setting?.retakeLimit ?? 0,
          sheet.exam.endTime,
        )
      : false;

    /*
      考试设置「查看解析」关闭时同样隐去答案与解析。

      与 canRetake 合并成一个判定：两者的效果完全一致（answer/analysis 置空），
      前端只需一条分支。但两者原因不同，故用 answerHiddenReason 告知——
      可重考是「暂时隐去、考完就能看」，设置关闭是「本场始终不公开」，
      提示文案不同，若只给一个布尔前端无法区分，会把「本场不公开」
      说成「考完可见」，是错误承诺。

      兜底取 false（不公开），与 schema 的 @default(false) 及管理端创建时的
      默认值（ExamService 建 setting 行时同样用 ?? false）方向一致。
      这一项与其他设置相反、默认偏保守：解析含标准答案，
      对没有显式配置过的老考试（无 setting 行）放开等于漏题。
    */
    const analysisAllowed = sheet.exam?.setting?.allowViewAnalysis ?? false;
    const answerHidden = canRetake || !analysisAllowed;

    /*
      本场不公开成绩：总分、客观/主观分、及格与否、以及逐题得分全部置 null。

      不在此处直接抛 Forbidden，是因为「查看成绩」与「查看解析」是两个独立开关，
      关掉前者不该连带把复盘入口也关掉——考生仍可对着题目看自己答了什么、
      以及（若「查看解析」开着）标准答案与解析。只是没有任何得分可看。

      默认 true（无 setting 行按开放处理），与 getScoreList、
      app-exam.getResult 的兜底方向一致。
    */
    const scoreHidden = !(sheet.exam?.setting?.allowViewScore ?? true);

    const items = await this.prisma.answerItem.findMany({
      where: { answerSheetId: sheetId },
      select: SCORE_ITEM_SELECT,
      orderBy: { questionNo: 'asc' },
    });

    /*
      主观题批阅信息（阅卷人 / 评语 / 批阅时间）。

      与分数同受 scoreHidden 管：评语里通常写着「第二问漏答扣 3 分」这类内容，
      藏了分数却放出评语等于把扣分过程说了一遍。故不公开成绩时整块不查也不下发。
    */
    const latestReviews = scoreHidden
      ? new Map<number, ReviewBrief>()
      : await this.latestReviewByItem(sheetId);

    return {
      examName: sheet.exam?.name ?? '',
      submitTime: sheet.submitTime as unknown as string,
      // 不公开时一律置 null，不能只靠前端不渲染——接口下发了就等于泄漏
      totalScore: scoreHidden ? null : sheet.totalScore,
      objectiveScore: scoreHidden ? null : sheet.objectiveScore,
      subjectiveScore: scoreHidden ? null : sheet.subjectiveScore,
      // 及格分与满分不是本人成绩，是本场考试的公开属性，不随分数隐去
      passScore: sheet.exam?.passScore ?? 0,
      fullScore: sheet.exam?.paper?.totalScore ?? 0,
      usedMinutes: this.calcUsedMinutes(sheet.startTime, sheet.submitTime),
      // 及格与否本身就是成绩信息，藏分数却告知及格等于半开
      passed: scoreHidden ? null : (sheet.passed ?? false),
      scoreHidden,
      // 告知前端答案被隐去的原因，否则页面只会显示一片空白让人以为是 bug
      answerHidden,
      // 区分隐去原因，供前端给出准确文案（见上方注释）
      answerHiddenReason: answerHidden ? (canRetake ? 'retake' : 'setting') : null,
      questions: items.map((item) =>
        this.toScoreQuestion(item, answerHidden, scoreHidden, latestReviews.get(item.id)),
      ),
    };
  }

  /**
   * 解析题目选项
   *
   * 库里 options 按项目既有约定存为「一行一个选项」的纯文本
   * （形如 "A. xxx\nB. yyy"），与 app-exam 取卷时的解析方式保持一致——
   * 两处若不一致，同一道题在答题页与复盘页会显示成不同的选项。
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
   * 计算答题用时（分钟）
   *
   * 向上取整：答 40 秒显示「1 分钟」比「0 分钟」合理。
   * 历史答卷可能没有 startTime，返回 null 让前端隐去该项而非显示 0。
   *
   * @param startTime 开始作答时间
   * @param submitTime 交卷时间
   */
  private calcUsedMinutes(
    startTime: Date | null,
    submitTime: Date | null,
  ): number | null {
    if (!startTime || !submitTime) return null;
    const ms = submitTime.getTime() - startTime.getTime();
    // 时钟回拨等异常数据会算出负值，按无效处理
    if (ms <= 0) return null;
    return Math.ceil(ms / 60000);
  }

  /**
   * 把答题项组装为成绩详情里的单题回顾
   *
   * @param item 答题项（含关联题目）
   * @param hideAnswer 是否隐去标准答案与解析（本场仍可重考、或设置关闭「查看解析」）
   * @param hideScore 是否隐去本题得分（设置关闭「查看成绩」）。与 hideAnswer 相互独立
   * @param review 该题最近一次人工评分留痕（客观题、未评、或不公开成绩时为 undefined）
   */
  private toScoreQuestion(
    item: ScoreAnswerItem,
    hideAnswer: boolean,
    hideScore: boolean,
    review?: ReviewBrief,
  ): AppScoreQuestionVo {
    // 客观题由系统判分，没有阅卷人可言；主观题未评时留痕表里也没有行
    const reviewed = item.questionCategory === 'subjective' ? review : undefined;
    return {
      id: item.questionId,
      type: item.question?.type ?? '',
      typeText: QUESTION_TYPE_TEXT[item.question?.type ?? ''] ?? '题目',
      content: item.question?.stem ?? '',
      // 选项与答案无关，不随 hideAnswer 隐去：藏了选项考生连题都读不完整，
      // 而选项本身不泄露哪个是对的
      options: this.parseOptions(item.question?.options ?? null),
      userAnswer: item.candidateAnswer ?? '',
      // 还能重考时不给答案（见 getScoreDetail 里 canRetake 的说明），
      // 用完全部机会才允许复盘
      answer: hideAnswer ? '' : (item.standardAnswer ?? item.question?.answer ?? ''),
      analysis: hideAnswer ? undefined : (item.question?.analysis ?? undefined),
      // 主观题人工复核后的分数记在 finalScore，客观题记在 score。
      // 本场不公开成绩时置 null——逐题得分加起来就是总分，藏了总分不藏这里等于没藏
      score: hideScore ? null : (item.finalScore ?? item.score),
      reviewerName: reviewed?.reviewerName ?? null,
      // 评语选填，库里存空串；空串与「没评过」在展示上是同一件事，统一给 null 省去前端两处判空
      reviewComment: reviewed?.reviewComment || null,
      // Date 交由全局 TransformInterceptor 统一格式化为 'YYYY-MM-DD HH:mm:ss'，
      // 与本文件 submitTime 的处理方式一致
      reviewTime: (reviewed?.reviewTime ?? null) as unknown as string | null,
    };
  }

  /**
   * 取本卷每个答题项「最近一次」评分留痕
   *
   * ReviewRecord 是 append-only 的，同一题改过几次就有几行，考生只关心最终那次。
   * 排序用 (reviewTime, id) 双键：同一次提交批阅在一个事务里批量 create，
   * reviewTime 取库函数 now()，同事务内多行时间戳可能完全相同，
   * 只按时间排序时「最近」是未定义的；id 自增可稳定区分先后。
   *
   * @param sheetId 答卷 ID
   * @returns answerItemId → 最近一次留痕
   */
  private async latestReviewByItem(sheetId: number): Promise<Map<number, ReviewBrief>> {
    const records = await this.prisma.reviewRecord.findMany({
      where: { answerSheetId: sheetId },
      orderBy: [{ reviewTime: 'asc' }, { id: 'asc' }],
      select: {
        answerItemId: true,
        reviewerName: true,
        reviewComment: true,
        reviewTime: true,
      },
    });
    // 升序遍历 + 覆盖写，最后留下的即每题最近一次
    const map = new Map<number, ReviewBrief>();
    for (const r of records) map.set(r.answerItemId, r);
    return map;
  }

  /**
   * 判断本场考试对该考生是否还有作答机会
   *
   * 口径与取卷放行一致：retakeLimit=0 表示仅一次机会，=N 表示可再考 N 次，
   * 故总机会数为 N+1；另外只要存在未交卷的答卷，也说明还能继续作答。
   *
   * @param examId 考试 ID
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   * @param retakeLimit 允许重考次数
   */
  private async hasRemainingAttempts(
    examId: number,
    userId: number,
    userType: AppUserType,
    retakeLimit: number,
    endTime: Date,
  ): Promise<boolean> {
    // 考试窗口一关，取卷就被硬拒绝（getExamPaper 判 FINISHED），再也不可能作答。
    // 少了这一条，「还剩次数没用完」或「留有一份未交答卷」的考生会被永久判定为
    // 仍能重考，标准答案从此再也看不到。
    if (Date.now() >= endTime.getTime()) return false;

    const where = { examId, ...this.candidateWhere(userId, userType) };

    const ongoing = await this.prisma.answerSheet.findFirst({
      where: { ...where, submitTime: null },
      select: { id: true },
    });
    if (ongoing) return true;

    const submittedCount = await this.prisma.answerSheet.count({
      where: { ...where, submitTime: { not: null } },
    });
    return submittedCount < retakeLimit + 1;
  }

  /**
   * 按有效期实时判定证书状态
   *
   * 证书过期不会去改库里的行，到期与否按读取时的当前时间算。
   *
   * @param expireDate 有效期至
   */
  private resolveCertStatus(expireDate: Date): { status: string; statusText: string } {
    return expireDate.getTime() >= Date.now()
      ? { status: 'valid', statusText: '有效' }
      : { status: 'expired', statusText: '已过期' };
  }

  /**
   * 我的证书列表
   *
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   */
  async getCertificateList(
    userId: number,
    userType: AppUserType,
  ): Promise<AppCertificateItemVo[]> {
    const rows = await this.prisma.certificate.findMany({
      where: this.candidateWhere(userId, userType),
      select: {
        id: true,
        certNo: true,
        issueDate: true,
        expireDate: true,
        // 标题同详情：以发证时的快照为准，模板改名不改写已发证书
        templateSnapshot: true,
        template: { select: { title: true } },
      },
      orderBy: { issueDate: 'desc' },
    });

    return rows.map((r) => ({
      id: r.id,
      name: resolveCertTemplate(r.templateSnapshot, r.template).title || '证书',
      code: r.certNo,
      ...this.resolveCertStatus(r.expireDate),
      validPeriod: `${this.formatDate(r.issueDate)} 至 ${this.formatDate(r.expireDate)}`,
    }));
  }

  /**
   * 证书详情
   *
   * @param id 证书 ID
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   * @throws NotFoundException 证书不存在或不属于当前考生
   */
  async getCertificateDetail(
    id: number,
    userId: number,
    userType: AppUserType,
  ): Promise<AppCertificateDetailVo> {
    const cert = await this.prisma.certificate.findFirst({
      // 同成绩详情：必须带 candidateWhere，只按 id 查会读到别人的证书
      where: { id, ...this.candidateWhere(userId, userType) },
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
    });
    if (!cert) {
      throw new NotFoundException('证书不存在');
    }

    const issueDate = this.formatDate(cert.issueDate);
    const expireDate = this.formatDate(cert.expireDate);
    // 模板改版不应改写已发出的证书，故一律以发证时的快照为准
    const tpl = resolveCertTemplate(cert.templateSnapshot, cert.template);
    const size = tpl.size;
    const canvas = resolveCanvas(size);

    return {
      id: cert.id,
      name: tpl.title || '证书',
      code: cert.certNo,
      ...this.resolveCertStatus(cert.expireDate),
      // validPeriod 保留：证书列表页仍按区间展示，两处口径不必强行统一
      validPeriod: `${issueDate} 至 ${expireDate}`,
      holderName: cert.candidateName,
      issueDate,
      expireDate,
      issuer: tpl.issuingOrg,
      size,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      backgroundImage: tpl.backgroundImage,
      sealImage: tpl.sealImage,
      elements: buildCertElements(tpl.content, {
        certTitle: tpl.title,
        issuingOrg: tpl.issuingOrg,
        candidateName: cert.candidateName,
        certNo: cert.certNo,
        projectName: cert.project?.name ?? '',
        issueDate,
        expireDate,
      }),
    };
  }

  /**
   * 证书下载
   *
   * 当前只校验归属并返回建议文件名：项目尚未接入证书 PDF 套打渲染，
   * 生成真实文件需要模板排版能力。接入后在此补文件生成与 url 返回即可，
   * 接口契约不变。
   *
   * @param id 证书 ID
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   */
  async downloadCertificate(
    id: number,
    userId: number,
    userType: AppUserType,
  ): Promise<{ fileName: string; code: string; available: boolean }> {
    const cert = await this.getCertificateDetail(id, userId, userType);
    return {
      fileName: `${cert.name}-${cert.holderName}-${cert.code}.pdf`,
      code: cert.code,
      // 显式告知前端文件尚不可得：只回文件名会让前端提示「已开始下载」，
      // 而实际什么都不会发生，用户以为卡住了。接入 PDF 套打后改为 true 并回传 url。
      available: false,
    };
  }
}
