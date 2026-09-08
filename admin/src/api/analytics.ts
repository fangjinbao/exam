import request from '@/utils/http'

/** 单个公司的统计行 */
export interface CompanyStat {
  companyName: string
  /** 参考人数（重考去重后的人数，非答卷份数） */
  examinees: number
  /** 已发布成绩人数 */
  published: number
  /** 及格人数（仅已发布） */
  passed: number
  /**
   * 平均得分率百分比（仅已发布）；无可算样本时为 null
   *
   * 后端用得分率而非绝对分：各场试卷满分不同，绝对分均值跨考试没有可比性。
   */
  avgScoreRate: number | null
}

/** 分数段分布 */
export interface ScoreBucket {
  label: string
  count: number
}

/** 考试状态构成 */
export interface ExamStatusCount {
  status: string
  count: number
}

/** 首页概览统计 */
export interface AnalyticsOverview {
  companyStats: CompanyStat[]
  scoreDistribution: ScoreBucket[]
  examStatusCount: ExamStatusCount[]
  /** 已发布成绩人数 */
  publishedTotal: number
  /**
   * 实际计入得分率统计的人数
   *
   * 与 publishedTotal 的差额是试卷满分缺失、算不出得分率而被跳过的答卷。
   * 两者单列，避免「已发布 100 人」与分布图 80 人的落差无从解释。
   */
  ratedTotal: number
  /** 公司下拉选项，随本接口一并返回，不另发一次请求 */
  companies: string[]
}

/**
 * 首页概览统计
 *
 * showErrorMessage: false —— 首页是落地页，无权限时由页面自行静默降级，
 * 不弹全局错误提示。
 *
 * @param companyName 按公司过滤，不传为全量
 */
export function getAnalyticsOverview(companyName?: string) {
  return request.get<AnalyticsOverview>({
    url: '/admin/exam/analytics/overview',
    params: companyName ? { companyName } : {},
    showErrorMessage: false
  })
}

export const analyticsApi = {
  getOverview: getAnalyticsOverview
}
