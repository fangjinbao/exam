import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import {
  ParticipantResolverService,
  type ParticipantProfile,
} from './participant-resolver.service';

/** 考生成绩列表筛选条件 */
export interface ExamScoreFilter {
  /** 考生姓名（模糊） */
  keyword?: string;
  /** 考试状态 not_started 未参加 / ongoing 考试中 / pending_grading 待阅卷 / completed 已完成 */
  status?: string;
}

/** 按考生聚合后的一行成绩 */
export interface ExamScoreItem {
  /** 考生类型 internal 内部 / external 外部 */
  candidateType: string;
  /** 考生业务 ID（内部为 SysUser.id，外部为 ExternalCandidate.id） */
  candidateId: number;
  /** 姓名 */
  name: string;
  /** 所属公司（内部沿部门树上溯取最近公司节点；外部取所属单位） */
  companyName: string;
  /** 所属部门（外部考生无部门概念，恒为空串） */
  departmentName: string;
  /** 登录账号（内部为统一身份账号，外部考生以手机号登录） */
  account: string | null;
  /** 身份证号（仅外部考生库维护该字段，内部人员恒为 null） */
  idCard: string | null;
  phone: string | null;
  /** 考试状态，取值见 EXAM_SCORE_STATUS */
  status: string;
  /** 客观题得分（未判分为 null） */
  objectiveScore: number | null;
  /** 主观题得分（未阅完为 null） */
  subjectiveScore: number | null;
  /** 总分（成绩未发布为 null） */
  totalScore: number | null;
  /** 是否及格（成绩未发布为 null） */
  passed: boolean | null;
  /** 作答用时（分钟；开考或交卷时间缺失为 null） */
  durationMinutes: number | null;
  /** 开考时间 */
  startTime: Date | null;
  /** 交卷时间 */
  submitTime: Date | null;
  /** 切屏次数 */
  switchCount: number;
}

/** 考试状态常量，与前端筛选项一一对应 */
export const EXAM_SCORE_STATUS = {
  NOT_STARTED: 'not_started',
  ONGOING: 'ongoing',
  PENDING_GRADING: 'pending_grading',
  COMPLETED: 'completed',
} as const;

/**
 * 考生成绩服务
 *
 * 以「考试已分配的考生」为全集左连答卷：没考的人也要出现在列表里并标为未参加，
 * 否则管理员看不出还差谁没考。这与阅卷中心只列已有答卷的口径不同，故单独成服务。
 */
@Injectable()
export class ExamScoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: ParticipantResolverService,
  ) {}

  /** 人员唯一键，与 ParticipantResolverService.key 同构 */
  private keyOf(candidateType: string, candidateId: number): string {
    return `${candidateType}:${candidateId}`;
  }

  /**
   * 查询某场考试的全部考生成绩（不分页，导出用）
   * @param examId 考试 ID
   * @param filter 姓名模糊 + 状态筛选
   * @returns 成绩行数组，排序同分页接口
   */
  async listByExam(examId: number, filter: ExamScoreFilter = {}): Promise<ExamScoreItem[]> {
    const candidates = await this.prisma.examCandidate.findMany({
      where: { examId },
      select: { candidateType: true, internalUserId: true, externalCandidateId: true },
      orderBy: { id: 'asc' },
    });
    if (!candidates.length) return [];

    const sheets = await this.prisma.answerSheet.findMany({
      where: { examId },
      select: {
        candidateType: true,
        internalUserId: true,
        externalCandidateId: true,
        objectiveScore: true,
        subjectiveScore: true,
        totalScore: true,
        gradingStatus: true,
        scorePublished: true,
        passed: true,
        startTime: true,
        submitTime: true,
        switchCount: true,
      },
      // 同一考生允许重考产生多份答卷，取最新一份代表其成绩
      orderBy: { id: 'desc' },
    });

    // 按人取首份（orderBy desc 已保证首份即最新），重考的旧答卷不参与展示
    const sheetMap = new Map<string, (typeof sheets)[number]>();
    for (const s of sheets) {
      const cid = s.candidateType === 'internal' ? s.internalUserId : s.externalCandidateId;
      if (!cid) continue; // 脏数据：类型与 ID 不匹配，跳过而非算到某人头上
      const k = this.keyOf(s.candidateType, cid);
      if (!sheetMap.has(k)) sheetMap.set(k, s);
    }

    const refs = candidates
      .map((c) => ({
        type: c.candidateType,
        internalUserId: c.internalUserId,
        externalCandidateId: c.externalCandidateId,
      }))
      .filter((c) => (c.type === 'internal' ? !!c.internalUserId : !!c.externalCandidateId));
    const profiles = await this.resolver.resolveProfiles(refs);

    let list = refs.map((ref) => {
      const cid = (ref.type === 'internal' ? ref.internalUserId : ref.externalCandidateId) as number;
      const k = this.keyOf(ref.type, cid);
      const profile = profiles.get(k);
      return this.toItem(ref.type, cid, profile, sheetMap.get(k));
    });

    if (filter.keyword) {
      const kw = filter.keyword.trim();
      if (kw) list = list.filter((i) => i.name.includes(kw));
    }
    if (filter.status) list = list.filter((i) => i.status === filter.status);

    // 交卷早的排前面；未参加的沉到末尾，便于一眼看出还差谁没考
    list.sort((a, b) => {
      const ta = a.submitTime ? a.submitTime.getTime() : Number.MAX_SAFE_INTEGER;
      const tb = b.submitTime ? b.submitTime.getTime() : Number.MAX_SAFE_INTEGER;
      return ta - tb;
    });
    return list;
  }

  /**
   * 按考生聚合的成绩分页
   *
   * 全集与筛选都在内存里完成（考生规模为百人级），故先取全量再切片，
   * 与练习记录列表同构。
   * @param examId 考试 ID
   * @param filter 姓名模糊 + 状态筛选
   * @param page 页码，从 1 开始
   * @param pageSize 每页条数（1-100）
   * @returns 列表与分页信息
   */
  async pageByExam(
    examId: number,
    filter: ExamScoreFilter,
    page?: number,
    pageSize?: number,
  ) {
    const p = Math.max(page || 1, 1);
    const ps = Math.min(Math.max(pageSize || 10, 1), 100);
    const list = await this.listByExam(examId, filter);
    const start = (p - 1) * ps;
    return {
      list: list.slice(start, start + ps),
      pagination: { page: p, pageSize: ps, total: list.length },
    };
  }

  /**
   * 把某考生的分配记录与答卷折成一行
   *
   * 状态判定顺序：无答卷=未参加；未交卷=考试中；阅卷未完成=待阅卷；其余=已完成。
   * @param candidateType 考生类型
   * @param candidateId 考生业务 ID
   * @param profile 姓名/公司/部门/账号档案（人员已被删除时为 undefined）
   * @param sheet 该考生最新一份答卷（无答卷时为 undefined）
   */
  private toItem(
    candidateType: string,
    candidateId: number,
    profile: ParticipantProfile | undefined,
    sheet:
      | {
          objectiveScore: number | null;
          subjectiveScore: number | null;
          totalScore: number | null;
          gradingStatus: string;
          scorePublished: boolean;
          passed: boolean | null;
          startTime: Date | null;
          submitTime: Date | null;
          switchCount: number;
        }
      | undefined,
  ): ExamScoreItem {
    const base = {
      candidateType,
      candidateId,
      name: profile?.name ?? '',
      companyName: profile?.companyName ?? '',
      departmentName: profile?.departmentName ?? '',
      account: profile?.account ?? null,
      idCard: profile?.idCard ?? null,
      phone: profile?.phone ?? null,
    };
    if (!sheet) {
      return {
        ...base,
        status: EXAM_SCORE_STATUS.NOT_STARTED,
        objectiveScore: null,
        subjectiveScore: null,
        totalScore: null,
        passed: null,
        durationMinutes: null,
        startTime: null,
        submitTime: null,
        switchCount: 0,
      };
    }
    return {
      ...base,
      status: this.resolveStatus(sheet.submitTime, sheet.gradingStatus),
      objectiveScore: sheet.objectiveScore,
      subjectiveScore: sheet.subjectiveScore,
      totalScore: sheet.totalScore,
      passed: sheet.passed,
      durationMinutes: this.calcDuration(sheet.startTime, sheet.submitTime),
      startTime: sheet.startTime,
      submitTime: sheet.submitTime,
      switchCount: sheet.switchCount,
    };
  }

  /** 由交卷时间与阅卷状态推导考试状态 */
  private resolveStatus(submitTime: Date | null, gradingStatus: string): string {
    if (!submitTime) return EXAM_SCORE_STATUS.ONGOING;
    return gradingStatus === 'completed'
      ? EXAM_SCORE_STATUS.COMPLETED
      : EXAM_SCORE_STATUS.PENDING_GRADING;
  }

  /** 作答用时（分钟，向上取整）；任一时间缺失返回 null，前端显示「-」 */
  private calcDuration(startTime: Date | null, submitTime: Date | null): number | null {
    if (!startTime || !submitTime) return null;
    const ms = submitTime.getTime() - startTime.getTime();
    if (ms <= 0) return null;
    return Math.ceil(ms / 60000);
  }
}
