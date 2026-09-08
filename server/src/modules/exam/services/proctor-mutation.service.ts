import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import { GradingService } from './grading.service';

/**
 * 监考写入服务
 *
 * 三个动作都直接改考生的答题数据，故一律要求考试处于 ongoing：
 * 未开考时没有可干预的作答，已结束后干预会与成绩、阅卷状态冲突。
 * 状态校验放在控制器（那里已有 getRealStatus 的惰性回写），此处只做数据层面的前置判断。
 */
@Injectable()
export class ProctorMutationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gradingService: GradingService,
  ) {}

  /**
   * 强制交卷
   *
   * 复用考生端交卷的判分与置位逻辑（客观题自动判分、纯客观卷直接完成并发布），
   * 不另写一套：两处若分叉，监考交的卷与考生自己交的卷会落在不同的 gradingStatus 上，
   * 阅卷中心的待阅列表随之对不上。
   *
   * @param sheetId 答卷 ID
   * @param passScore 该场考试及格分（纯客观卷即时判定是否及格）
   * @returns 错误文案；成功返回 null
   */
  async forceSubmit(examId: number, sheetId: number, passScore: number): Promise<string | null> {
    // 必须连 examId 一起查：调用方只校验了对该场考试的监考权，
    // 若此处按裸 sheetId 取，传入别场考试的答卷 id 就能越权操作他人答卷
    const sheet = await this.prisma.answerSheet.findFirst({
      where: { id: sheetId, examId },
      select: { id: true, startTime: true, submitTime: true },
    });
    if (!sheet) return '答卷不存在';
    if (sheet.submitTime) return '该考生已交卷';
    // 未取卷的考生没有 AnswerItem，判分会得到 0 分并直接落成绩，
    // 与「他根本没参加」的事实不符，故不允许对未开考的人强制交卷
    if (!sheet.startTime) return '该考生尚未开考，无法强制交卷';

    const objectiveScore = await this.gradingService.autoGradeObjective(sheetId);
    const hasSubjective = await this.hasSubjectiveItems(sheetId);
    await this.prisma.answerSheet.update({
      where: { id: sheetId },
      data: {
        submitTime: new Date(),
        objectiveScore,
        // 有主观题要走阅卷；纯客观卷在交卷这一刻即完成并发布，与考生端交卷同口径
        gradingStatus: hasSubjective ? 'pending' : 'completed',
        totalScore: hasSubjective ? null : objectiveScore,
        scorePublished: !hasSubjective,
        passed: hasSubjective ? null : objectiveScore >= passScore,
      },
    });
    return null;
  }

  /**
   * 解锁续答（轻量、可逆）
   *
   * 面向「切屏超次数被强制交卷，但经核实是误判」这一场景：
   * 切屏计数归零并撤销交卷状态，已答内容全部保留，考生可继续答题。
   *
   * 连带清掉判分结果与发布标记：交卷时纯客观卷会即时判分并发布成绩，
   * 只撤 submitTime 会留下一份「未交卷却已有成绩且已发布」的答卷，
   * 考生端能查到分、还能继续改答案。
   *
   * @param sheetId 答卷 ID
   * @returns 错误文案；成功返回 null
   */
  async unlockForContinue(examId: number, sheetId: number): Promise<string | null> {
    // 同 forceSubmit：限定 examId，防按裸 sheetId 越权操作他人答卷
    const sheet = await this.prisma.answerSheet.findFirst({
      where: { id: sheetId, examId },
      select: {
        id: true,
        startTime: true,
        submitTime: true,
        switchCount: true,
        candidateType: true,
        internalUserId: true,
        externalCandidateId: true,
      },
    });
    if (!sheet) return '答卷不存在';
    if (!sheet.startTime) return '该考生尚未开考，无需解锁';

    /*
      该考生已有另一份未交卷的答卷时，不给解锁。

      解锁是把 submitTime 置回 null。允许重考的考试里考生可能已经开始下一次，
      此时再解锁历史那次，同一人就有两份未交答卷；而考生端 ensureSheet 取
      id 最小的未交答卷，会把考生切回被解锁的旧答卷，正在进行的那次从此进不去。

      监考页改为「一份答卷一行」后，历史已交行上也会出现解锁按钮，
      这条校验是该场景的唯一防线，不能只靠 UI 隐藏。
    */
    const otherOpen = await this.prisma.answerSheet.findFirst({
      where: {
        examId,
        id: { not: sheetId },
        submitTime: null,
        candidateType: sheet.candidateType,
        // 两类考生 id 各自自增，必须按 candidateType 对应的那一列匹配，否则会串号
        ...(sheet.candidateType === 'internal'
          ? { internalUserId: sheet.internalUserId }
          : { externalCandidateId: sheet.externalCandidateId }),
      },
      select: { id: true },
    });
    if (otherOpen) {
      return '该考生另有一次考试正在进行中，不能解锁此次；请先处理进行中的那次';
    }

    /*
      已进入人工复核的答卷不给解锁。

      ReviewRecord 是 append-only 的复核台账，撤销成绩会让那些记录悬空——
      台账上写着「复核过 N 分」，答卷却回到未交卷、无分状态，对不上账。
      这种情况应走考试管理的重考，而不是在监考里改。
    */
    const reviewed = await this.prisma.reviewRecord.findFirst({
      where: { answerSheetId: sheetId },
      select: { id: true },
    });
    if (reviewed) return '该答卷已有人工复核记录，不能解锁续答；如需重考请走考试管理';

    await this.prisma.answerSheet.update({
      where: { id: sheetId },
      data: {
        switchCount: 0,
        submitTime: null,
        objectiveScore: null,
        subjectiveScore: null,
        totalScore: null,
        passed: null,
        gradingStatus: 'pending',
        scorePublished: false,
      },
    });
    return null;
  }

  /**
   * 清空重考（破坏性、不可逆）
   *
   * 删掉该考生本场的答卷，AnswerItem 与 ReviewRecord 由外键级联删除。
   * 考生下次进入考试会重新取卷、计时从头开始。
   *
   * 用删除而非清空字段：答卷上的作答是逐题行（AnswerItem），
   * 逐行清空既慢又容易漏（新增题型的字段忘了清），删整份再让考生端重新生成更稳。
   *
   * @param sheetId 答卷 ID
   * @returns 错误文案；成功返回 null
   */
  async resetForRetake(examId: number, sheetId: number): Promise<string | null> {
    // 同 forceSubmit：限定 examId。此处是删除动作，越权后果最重
    const sheet = await this.prisma.answerSheet.findFirst({
      where: { id: sheetId, examId },
      select: { id: true, scorePublished: true },
    });
    if (!sheet) return '答卷不存在';
    /*
      成绩已发布的不给清空。

      考生已经看到过分数，删掉答卷会让那个分数无据可查；
      且证书发放、统计分析都可能已经引用了这份成绩。
      要重考须先在考试管理里撤回成绩，那条路径上有对应的连带处理。
    */
    if (sheet.scorePublished) {
      return '该考生成绩已发布，不能清空重考；如需重考请先在考试管理中撤回成绩';
    }
    await this.prisma.answerSheet.delete({ where: { id: sheetId } });
    return null;
  }

  /**
   * 该答卷是否含主观题
   * @param sheetId 答卷 ID
   */
  private async hasSubjectiveItems(sheetId: number): Promise<boolean> {
    const row = await this.prisma.answerItem.findFirst({
      where: { answerSheetId: sheetId, questionCategory: 'subjective' },
      select: { id: true },
    });
    return !!row;
  }
}
