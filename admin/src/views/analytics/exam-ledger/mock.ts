/**
 * 考试台账的静态演示数据
 *
 * 后端接口（/admin/exam/analytics/... ，权限 exam:analytics:list）尚未落地，
 * 页面先按静态数据成型。接后端时删掉本文件、把 index.vue 的 load() 换成真实请求即可。
 *
 * 基础场次直接复用首页那份 MOCK_EXAMS，不另写一份：
 * 台账与首页「待处理的考试」展示的是同一批考试，两处各写一份数据的话，
 * 同一场考试的应考人数就可能对不上——这种矛盾在演示时最难解释。
 */

import { MOCK_EXAMS, MOCK_COMPANIES } from '@/views/dashboard/mock'

export { MOCK_COMPANIES }

/** 台账行：一场考试一行的全量流水 */
export interface ExamLedgerRow {
  id: number
  examNo: string
  name: string
  companyName: string
  paperName: string
  startTime: string
  /** 时长（分钟） */
  duration: number
  passScore: number
  /** 应考人数 */
  candidateCount: number
  /** 实考人数（已交答卷份数） */
  actualCount: number
  /** 缺考人数；仅已结束考试有意义，其余为 null（考试还没跑完，谈不上缺考） */
  absentCount: number | null
  /** 待阅份数 */
  pendingCount: number
  /** 已发布份数 */
  publishedCount: number
  /** 平均分；未出成绩为 null */
  avgScore: number | null
  /** 及格率百分比；未出成绩为 null */
  passRate: number | null
  status: string
}

/** 由起止时间算分钟数，跨天按 0 处理（演示数据不存在跨天场次） */
function durationOf(start: string, end: string): number {
  const toMinutes = (s: string) => {
    const time = s.split(' ')[1] ?? '00:00'
    const [h, m] = time.split(':').map(Number)
    return h * 60 + m
  }
  return Math.max(0, toMinutes(end) - toMinutes(start))
}

/*
  台账行由 MOCK_EXAMS 派生。

  平均分与及格率只在成绩已发布时给值，未发布/进行中给 null，页面渲染成「—」。
  编一个假的平均分会让人以为成绩已经出来了，比留空更容易误导。

  及格率与平均分用 id 派生的固定公式而非随机数：每次刷新数字必须一致，
  否则截图和验收都没法对。

  两者不可各自独立取值——必须让及格率跟着「平均分高出及格线多少」走。
  独立生成会同页出现「平均分 94、及格线 70，及格率却 62%」这种反向矛盾：
  平均分高出及格线 24 分意味着多数人都过了，及格率不可能垫底。
  演示时一旦有人点开台账逐行看，这种行会被直接质疑。
*/
export const MOCK_LEDGER: ExamLedgerRow[] = MOCK_EXAMS.map((e, i) => {
  // 已发布成绩才算出了分；进行中的场次即便有已发布份数也不给全局平均分
  const graded = e.publishedCount > 0 && e.status === 'finished'
  const finished = e.status === 'finished'

  // 平均分落在及格线上方 4~26 分
  const margin = 4 + ((e.id * 7) % 220) / 10
  const avg = e.passScore + margin

  /*
    及格率由 margin 线性映射：高出 4 分对应约 62%，高出 26 分对应约 95%。
    再叠一个 ±2 分的确定性抖动，避免所有行落在一条直线上显得是算出来的。

    抖动能保证的范围要说准：映射斜率是 1.5 个百分点/分（33/22），抖动值域 ±2，
    故 margin 相差 3 分以上时斜率贡献 4.5 超过最大抖动差 4.0，不可能倒置；
    相差 1~2 分时少数行会轻微逆序，幅度都在数个百分点以内、且集中在 margin 几乎相同处。

    这种小幅逆序不必消除——真实考试里平均分相同、及格率差几个点是正常的，
    及格率取决于分数分布形态而非仅仅均值。要消除的是原先那种
    「平均分高出及格线 24 分、及格率却 62%」的极端反向，那已经不会出现。
    若后续放大抖动幅度，必须重新核对逆序范围。
  */
  const jitter = (((e.id * 13) % 41) - 20) / 10
  const rate = 62 + ((margin - 4) / 22) * 33 + jitter

  return {
    id: e.id,
    examNo: e.examNo,
    name: e.name,
    // 场次名以公司名开头的取该公司，其余按序分配，保证每家公司都有台账数据
    companyName:
      MOCK_COMPANIES.find((c) => e.name.startsWith(c)) ?? MOCK_COMPANIES[i % MOCK_COMPANIES.length],
    paperName: e.paperName,
    startTime: e.startTime,
    duration: durationOf(e.startTime, e.endTime),
    passScore: e.passScore,
    candidateCount: e.candidateCount,
    actualCount: e.sheetCount,
    absentCount: finished ? Math.max(0, e.candidateCount - e.sheetCount) : null,
    pendingCount: e.pendingCount,
    publishedCount: e.publishedCount,
    avgScore: graded ? Math.round(Math.min(avg, 98) * 10) / 10 : null,
    passRate: graded ? Math.round(Math.min(rate, 96) * 10) / 10 : null,
    status: e.status
  }
})
