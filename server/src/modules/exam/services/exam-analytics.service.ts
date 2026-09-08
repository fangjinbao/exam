import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';

/**
 * 被视为「公司」层级的部门类型
 *
 * 取值与 org-scope.service.ts 一致（含「集团公司」），而非
 * participant-resolver.service.ts 的两项版本。项目里这个判定存在两套取值，
 * 统计侧必须用含集团公司的这套：否则集团本部人员上溯到集团公司节点时不认，
 * 一路走到 parentId=null 返回 null，整批人在公司维度图表里落进「未知」桶。
 *
 * 没有直接 import org-scope 的常量：那边是模块私有 const 未导出，
 * 且它服务于资源可见范围（company scope），与统计口径是两件事——
 * 一处改动不该悄悄改掉另一处的语义。此处独立声明并注明来源。
 */
const COMPANY_DEPT_TYPES = ['集团公司', '省公司', '分公司'];

/** 部门树上溯的深度上限，防脏数据成环导致死循环 */
const MAX_DEPT_TREE_DEPTH = 20;

/** 未能定位公司归属时的兜底桶名 */
const UNKNOWN_COMPANY = '未归属';

/** 统计用的答卷行（select 收窄后的字段集） */
interface SheetRow {
  id: number;
  examId: number;
  candidateType: string;
  internalUserId: number | null;
  externalCandidateId: number | null;
  totalScore: number | null;
  passed: boolean | null;
  scorePublished: boolean;
  submitTime: Date | null;
  /** 关联试卷满分，用于换算得分率 */
  exam: { paper: { totalScore: number } | null } | null;
}

/** 部门树节点（上溯所需的最小字段集） */
interface DeptNode {
  id: number;
  name: string;
  type: string | null;
  parentId: number | null;
}

/** 单个公司的统计行 */
export interface CompanyStatRow {
  companyName: string;
  /** 参考人数（去重后的人数，非答卷份数） */
  examinees: number;
  /** 已发布成绩人数 */
  published: number;
  /** 及格人数（仅已发布） */
  passed: number;
  /**
   * 平均得分率百分比（仅已发布，一位小数）；无可算样本时为 null
   *
   * 用得分率而非绝对分：跨考试聚合时各卷满分不同，绝对分均值无意义。
   */
  avgScoreRate: number | null;
}

/** 分数段分布行 */
export interface ScoreBucketRow {
  label: string;
  count: number;
}

/** 考试状态构成行 */
export interface ExamStatusRow {
  status: string;
  count: number;
}

/** 首页概览返回体 */
export interface AnalyticsOverview {
  companyStats: CompanyStatRow[];
  scoreDistribution: ScoreBucketRow[];
  examStatusCount: ExamStatusRow[];
  /** 已发布成绩人数 */
  publishedTotal: number;
  /**
   * 实际计入得分率统计的人数
   *
   * 与 publishedTotal 单列：试卷满分缺失或为 0 时算不出得分率，该答卷被跳过。
   * 只报 publishedTotal 会让「已发布 100 人」与分布图里 80 人的落差无法解释，
   * 前端据此在样本量说明中标出差额。
   */
  ratedTotal: number;
  /**
   * 公司下拉选项
   *
   * 随 overview 一并返回，不另开接口：公司归属是全表扫描加部门树上溯算出来的，
   * 单独提供一个 companies 接口等于把这份重活做两遍。
   */
  companies: string[];
}

/**
 * 首页统计分析服务
 *
 * 只做聚合读，不写库。所有口径与既有实现对齐，关键三条：
 * 1. 平均分/及格率只统计 scorePublished=true 的答卷——totalScore 与 passed
 *    仅发布后才有值，把未发布的按 0 计会严重拉低均值。
 * 2. 重考产生的多份答卷按 (candidateType, id, examId) 取最新一份，
 *    避免一个人被计成多人；键为何带 examId 见 dedupeByCandidate 的注释。
 * 3. 公司归属靠部门树上溯（内部考生）或直读外部单位（外部考生），
 *    库里没有「公司」这一列，无法用 groupBy 直接分组。
 */
@Injectable()
export class ExamAnalyticsService {
  private readonly logger = new Logger(ExamAnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 首页概览统计
   *
   * @param companyName 可选，只统计该公司（前端下拉筛选用）
   */
  async getOverview(companyName?: string): Promise<AnalyticsOverview> {
    const [sheets, examStatus] = await Promise.all([
      this.prisma.answerSheet.findMany({
        /*
          只取已交卷的答卷。

          答卷是「首次取卷即创建」，未交卷的行 submitTime 为 null 且各分数字段全空，
          它们既不该算进参考人数（人只是点开看了一眼），也算不出任何成绩。
          不过滤会让参考人数虚高，且这些行白占内存。

          仍然是全表量级的读取（无时间窗口）。答卷表是本系统最大的表，
          十万行以内可接受，百万行需要改为按时间窗口聚合或落统计中间表——
          当前先保证口径正确，性能留待有真实数据量时按实测优化。
        */
        where: { submitTime: { not: null } },
        // 只取统计用得上的字段，避免把答题明细一并拉出
        select: {
          id: true,
          examId: true,
          candidateType: true,
          internalUserId: true,
          externalCandidateId: true,
          totalScore: true,
          passed: true,
          scorePublished: true,
          submitTime: true,
          // 试卷满分用于把绝对分换算成得分率：各场试卷满分不一定是 100，
          // 直接按绝对分分段会把满分 50 的卷全归到「不及格」段
          exam: { select: { paper: { select: { totalScore: true } } } },
        },
        // 取最新一份用于重考去重，与 exam-score.service.ts 的 orderBy 一致
        orderBy: { id: 'desc' },
      }),
      this.prisma.exam.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

    const latest = this.dedupeByCandidate(sheets);
    const companyOf = await this.resolveCompanyMap(latest);

    // 公司选项取自全量（未筛选前），否则选中某公司后下拉里只剩它自己，无法切回别家
    const companies = [...new Set(companyOf.values())].sort();

    const rows = companyName
      ? latest.filter((s) => companyOf.get(this.keyOf(s)) === companyName)
      : latest;

    const scoreDistribution = this.buildScoreDistribution(rows);

    return {
      companyStats: this.buildCompanyStats(rows, companyOf),
      scoreDistribution,
      examStatusCount: examStatus.map((g) => ({
        status: g.status,
        count: g._count._all,
      })),
      publishedTotal: rows.filter((s) => s.scorePublished).length,
      // 分布图各桶之和即实际计入得分率的人数，与 publishedTotal 的差额就是满分缺失被跳过的
      ratedTotal: scoreDistribution.reduce((n, b) => n + b.count, 0),
      companies,
    };
  }

  /** 去重键：两类考生的 id 各自自增，internal 的 1 与 external 的 1 不是同一个人 */
  private keyOf(s: SheetRow): string {
    const id = s.candidateType === 'internal' ? s.internalUserId : s.externalCandidateId;
    return `${s.candidateType}:${id}`;
  }

  /**
   * 重考去重：同一考生同一场只留最新一份
   *
   * 去重键带 examId，与 exam-score.service.ts:101-112 的键**刻意不同**（那里不含 examId）。
   * 两处都对：那里是单场考试的成绩列表，天然限定在一场内，键里不需要 examId；
   * 这里跨全部考试聚合，不带 examId 会把同一个人在其它场的成绩全部抹掉，
   * 只留他最近一场的——公司维度的参考人数会凭空缩水。
   * 改动任一处前先确认属于哪种场景，不要为了「统一」把两边改成一样。
   *
   * 入参已按 id desc 排序，故首次见到的即最新。
   */
  private dedupeByCandidate(sheets: SheetRow[]): SheetRow[] {
    const seen = new Set<string>();
    const out: SheetRow[] = [];
    for (const s of sheets) {
      const cid = s.candidateType === 'internal' ? s.internalUserId : s.externalCandidateId;
      // 脏数据：类型与 ID 不匹配，跳过而非算到某人头上
      if (!cid) continue;
      const key = `${this.keyOf(s)}:${s.examId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
    return out;
  }

  /**
   * 批量解析每份答卷对应考生的公司名
   *
   * 两类考生两条路径：内部沿部门树上溯找最近的公司节点（库里没有公司表），
   * 外部直读 ExternalOrg.name（一跳直达）。
   *
   * 部门树一次取全表在内存里走，不逐人查库——否则是「人数 × 树深」次往返。
   * 部门表通常几十到几百行，这个代价可以忽略。
   *
   * @returns key 为 `${candidateType}:${id}`，value 为公司名
   */
  private async resolveCompanyMap(sheets: SheetRow[]): Promise<Map<string, string>> {
    const internalIds = [
      ...new Set(
        sheets.filter((s) => s.candidateType === 'internal').map((s) => s.internalUserId!)
      ),
    ];
    const externalIds = [
      ...new Set(
        sheets.filter((s) => s.candidateType !== 'internal').map((s) => s.externalCandidateId!)
      ),
    ];

    const [users, candidates, depts] = await Promise.all([
      internalIds.length
        ? this.prisma.sysUser.findMany({
            where: { id: { in: internalIds } },
            select: { id: true, departmentId: true },
          })
        : [],
      externalIds.length
        ? this.prisma.externalCandidate.findMany({
            where: { id: { in: externalIds } },
            select: { id: true, org: { select: { name: true } } },
          })
        : [],
      // 只在有内部考生时才需要部门树
      internalIds.length
        ? this.prisma.sysDepartment.findMany({
            select: { id: true, name: true, type: true, parentId: true },
          })
        : [],
    ]);

    const deptIndex = new Map<number, DeptNode>(depts.map((d): [number, DeptNode] => [d.id, d]));
    const map = new Map<string, string>();

    for (const u of users) {
      const dept = u.departmentId === null ? undefined : deptIndex.get(u.departmentId);
      map.set(`internal:${u.id}`, dept ? this.climbToCompany(dept, deptIndex) : UNKNOWN_COMPANY);
    }
    for (const c of candidates) {
      // orgId 是非空外键，org 必然存在；仍兜底防脏数据
      map.set(`external:${c.id}`, c.org?.name || UNKNOWN_COMPANY);
    }
    return map;
  }

  /**
   * 沿部门树上溯，返回最近的公司节点名
   *
   * 带环检测与深度上限双兜底：部门表的 parentId 无约束保证无环，
   * 脏数据成环会让上溯死循环，拖垮整个请求。
   */
  private climbToCompany(dept: DeptNode, index: Map<number, DeptNode>): string {
    let current = dept;
    const visited = new Set<number>([current.id]);
    for (let depth = 0; depth < MAX_DEPT_TREE_DEPTH; depth += 1) {
      if (current.type && COMPANY_DEPT_TYPES.includes(current.type)) return current.name;
      if (current.parentId === null) break;
      if (visited.has(current.parentId)) {
        this.logger.warn(`部门树存在环，从 ${dept.id} 上溯时在 ${current.parentId} 处中断`);
        break;
      }
      const parent = index.get(current.parentId);
      // 父节点被删但子节点未清理，视为断链
      if (!parent) break;
      visited.add(parent.id);
      current = parent;
    }
    return UNKNOWN_COMPANY;
  }

  /**
   * 按公司汇总
   *
   * 平均分与及格数只统计已发布的答卷：未发布的 totalScore 是 null，
   * 按 0 计会把均值拉到地板上，得出「某公司平均 12 分」这种假结论。
   * 参考人数则统计全部（含未发布），那是「有多少人考了」，与发布状态无关。
   */
  private buildCompanyStats(
    sheets: SheetRow[],
    companyOf: Map<string, string>
  ): CompanyStatRow[] {
    const acc = new Map<
      string,
      { examinees: number; published: number; passed: number; rateSum: number; rateCount: number }
    >();

    for (const s of sheets) {
      const company = companyOf.get(this.keyOf(s)) ?? UNKNOWN_COMPANY;
      const row =
        acc.get(company) ?? { examinees: 0, published: 0, passed: 0, rateSum: 0, rateCount: 0 };
      row.examinees += 1;
      if (s.scorePublished) {
        row.published += 1;
        if (s.passed) row.passed += 1;
        // 得分率单独计数：满分缺失的答卷算不出得分率，不能计入分母
        const full = s.exam?.paper?.totalScore;
        if (full && s.totalScore !== null) {
          row.rateSum += (s.totalScore / full) * 100;
          row.rateCount += 1;
        }
      }
      acc.set(company, row);
    }

    return [...acc.entries()]
      .map(([companyName, r]) => ({
        companyName,
        examinees: r.examinees,
        published: r.published,
        passed: r.passed,
        avgScoreRate: r.rateCount ? Math.round((r.rateSum / r.rateCount) * 10) / 10 : null,
      }))
      // 按参考人数降序：图表要先看到量大的公司
      .sort((a, b) => b.examinees - a.examinees);
  }

  /**
   * 得分率分布
   *
   * 按「得分率」而非绝对分分段。各场试卷满分不同（Paper.totalScore），
   * 按绝对分切会把满分 50 的整场考试全部归进「0-59 不及格」段，
   * 拿一张满分 50 的卷和一张满分 100 的卷放同一张图上比绝对分没有意义。
   *
   * 只统计已发布成绩：未发布的 totalScore 是 null，放进来就是一堆假的 0 分。
   * 满分缺失或为 0 的答卷跳过——除数为 0 算不出得分率，
   * 计入任何一段都是编造，宁可不计并在样本量上体现出来。
   */
  private buildScoreDistribution(sheets: SheetRow[]): ScoreBucketRow[] {
    const buckets: ScoreBucketRow[] = [
      { label: '60% 以下', count: 0 },
      { label: '60-69%', count: 0 },
      { label: '70-79%', count: 0 },
      { label: '80-89%', count: 0 },
      { label: '90-100%', count: 0 },
    ];
    for (const s of sheets) {
      if (!s.scorePublished || s.totalScore === null) continue;
      const full = s.exam?.paper?.totalScore;
      if (!full) continue;
      const rate = (s.totalScore / full) * 100;
      // 上界用 >= 判断，满分（含超过满分的脏数据）落在最后一档而非溢出
      if (rate >= 90) buckets[4].count += 1;
      else if (rate >= 80) buckets[3].count += 1;
      else if (rate >= 70) buckets[2].count += 1;
      else if (rate >= 60) buckets[1].count += 1;
      else buckets[0].count += 1;
    }
    return buckets;
  }

}
