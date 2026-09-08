import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';

/** 整卷单题（阅卷工作台中栏逐题批阅用） */
export interface SheetQuestionItem {
  /** 答题项 ID，提交评分时回传 */
  id: number;
  questionNo: number;
  /** 题型字典 value（single/multiple/judge/blank/qa/essay），前端按此分大题 */
  questionType: string;
  /** objective 客观题（只读） / subjective 主观题（可评分） */
  questionCategory: string;
  stem: string;
  /** 选项原文（选择题有值，前端按 splitOptions 解析） */
  options: string | null;
  candidateAnswer: string | null;
  standardAnswer: string | null;
  scoringCriteria: string | null;
  fullScore: number;
  /** 已给分数：客观题为自动判分结果，主观题为人工评分；null 表示主观题未评 */
  score: number | null;
  /** 客观题对错；主观题为 null */
  isCorrect: boolean | null;
  /**
   * 最近一次人工评分的评语（主观题；未评或未写评语为空串）
   *
   * 取自 ReviewRecord 而非 AnswerItem：评语只存在留痕表里，
   * 不回读则工作台重新打开这份卷时评语框恒为空，阅卷员会以为评语没保存上。
   */
  reviewComment: string;
  /** 最近一次人工评分的阅卷人姓名（主观题；未评为 null） */
  reviewerName: string | null;
  /** 最近一次人工评分时间（主观题；未评为 null） */
  reviewTime: Date | null;
}

/**
 * 阅卷整卷详情服务
 *
 * 与 GradingService 分开：后者已承载列表/判分/发布等职责且接近文件行数上限，
 * 本服务只负责「工作台打开一份卷所需的整卷数据」这一件事。
 */
@Injectable()
export class GradingSheetService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 查询一份答卷的整卷阅卷详情（卷头信息 + 全部题目，题号升序）
   *
   * 一次给全卷而非分客观题/主观题两个接口：工作台要按题型分大题展示，
   * 分两次拉会让「第几大题」的编号在两个响应间无法对齐。
   *
   * @returns 答卷不存在时返回 null
   */
  async getSheetDetail(sheetId: number) {
    const sheet = await this.prisma.answerSheet.findUnique({
      where: { id: sheetId },
      select: {
        id: true,
        candidateName: true,
        objectiveScore: true,
        subjectiveScore: true,
        totalScore: true,
        gradingStatus: true,
        scorePublished: true,
        passed: true,
        submitTime: true,
        exam: {
          select: { id: true, name: true, passScore: true, paper: { select: { totalScore: true } } },
        },
      },
    });
    if (!sheet) return null;

    const rows = await this.prisma.answerItem.findMany({
      where: { answerSheetId: sheetId },
      orderBy: { questionNo: 'asc' },
      select: {
        id: true,
        questionNo: true,
        questionCategory: true,
        candidateAnswer: true,
        standardAnswer: true,
        scoringCriteria: true,
        fullScore: true,
        score: true,
        finalScore: true,
        isCorrect: true,
        question: { select: { type: true, stem: true, options: true } },
      },
    });

    const latestReviews = await this.latestReviewByItem(sheetId);

    const { exam, ...rest } = sheet;
    return {
      ...rest,
      examId: exam.id,
      examName: exam.name,
      passScore: exam.passScore,
      /** 试卷总分取卷面配置值；随机试卷同样在卷上配好总分 */
      paperTotalScore: exam.paper?.totalScore ?? 0,
      items: rows.map<SheetQuestionItem>((r) => ({
        id: r.id,
        questionNo: r.questionNo,
        // 题型以题目表为准；题目被删导致关联缺失时按大类回落，避免整卷渲染不出来
        questionType: r.question?.type ?? this.fallbackType(r.questionCategory),
        questionCategory: r.questionCategory,
        stem: r.question?.stem ?? '',
        options: r.question?.options ?? null,
        candidateAnswer: r.candidateAnswer,
        standardAnswer: r.standardAnswer,
        scoringCriteria: r.scoringCriteria,
        fullScore: r.fullScore,
        // 主观题以 finalScore 为准（未评为 null），客观题用自动判分的 score
        score: r.questionCategory === 'subjective' ? r.finalScore : r.score,
        isCorrect: r.isCorrect,
        reviewComment: latestReviews.get(r.id)?.reviewComment ?? '',
        reviewerName: latestReviews.get(r.id)?.reviewerName ?? null,
        reviewTime: latestReviews.get(r.id)?.reviewTime ?? null,
      })),
    };
  }

  /**
   * 取本卷每个答题项「最近一次」评分留痕
   *
   * ReviewRecord 是 append-only 的，同一题改过几次就有几行，展示只关心最后一次。
   * 一次查全卷后在内存里归并，不按题 N+1 次查库。
   *
   * 排序用 (reviewTime, id) 双键：同一次提交批阅是一个事务里的批量 create，
   * reviewTime 默认值取自库函数 now()，同事务内多行可能拿到完全相同的时间戳，
   * 只按时间排序时哪行算「最近」是未定义的，改分后可能回读到旧评语。
   * id 自增，作为次级键可稳定区分先后。
   *
   * @param sheetId 答卷 ID
   * @returns answerItemId → 最近一次留痕
   */
  private async latestReviewByItem(sheetId: number) {
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
    const map = new Map<number, (typeof records)[number]>();
    for (const r of records) map.set(r.answerItemId, r);
    return map;
  }

  /** 题目已删除时按大类回落题型，只用于分组显示 */
  private fallbackType(category: string): string {
    return category === 'objective' ? 'single' : 'qa';
  }
}
