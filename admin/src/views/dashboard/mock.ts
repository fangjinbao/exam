/**
 * 首页的静态演示数据（考试台账页也复用这里的 MOCK_EXAMS）
 *
 * 后端接口尚未落地，页面先按静态数据成型。接后端时删掉本文件、
 * 把 index.vue 里的 load() 换回 gradingApi / analyticsApi 调用即可，
 * 数据结构与真实接口的类型完全一致（复用 GradingExam / AnalyticsOverview），
 * 故切换时页面逻辑无需改动。
 *
 * 数据内部自洽是硬要求：KPI、四张图、两张表都从同一份基础数据派生，
 * 任何一处对不上都会在页面上直接露出来（如及格人数大于参考人数）。
 */

import type { GradingExam } from '@/api/grading'
import type { AnalyticsOverview } from '@/api/analytics'

/** 八家参考公司，公司维度的图表与台账都用这一份 */
export const MOCK_COMPANIES = [
  '华东分公司',
  '华南分公司',
  '华北分公司',
  '西南分公司',
  '东北分公司',
  '西北分公司',
  '华中分公司',
  '直属单位'
]

/*
  有待办的八场考试。

  待批阅（128 份）与待发布（558 份）两个 KPI 全部由这八行加出来，改动此处会直接改变指标卡。
  已发布比例刻意从 68% 递增到 98%，让表格里的进度条有层次而非齐平。

  缺考 KPI 不止这八行：填充场次里的已结束场次也带缺考，全表合计 991 人。
  改动填充计划的 finished 数量会改变这个数字。
*/
const BUSY_EXAMS: GradingExam[] = [
  {
    id: 1001,
    name: '2024 年度安全生产知识考核',
    paperName: '安全生产知识 A 卷',
    sourceName: '企业内部',
    /*
      已结束而非进行中：这场是「已发布 68%」那一行，进行中的考试不该发成绩，
      否则台账里会是「已发布 609 份、平均分 —」。已结束 + 发了 68% 才讲得通：
      卷子交完了，还有 287 份在走流程。
    */
    status: 'finished',
    startTime: '2024-03-15 09:00',
    endTime: '2024-03-15 11:00',
    passScore: 60,
    examNo: 'EX20240315001',
    candidateCount: 1268,
    sheetCount: 896,
    pendingCount: 42,
    publishedCount: 609
  },
  {
    id: 1002,
    name: '设备操作规范认证考试',
    paperName: '设备操作规范 B 卷',
    sourceName: '企业内部',
    status: 'finished',
    startTime: '2024-03-12 14:00',
    endTime: '2024-03-12 15:30',
    passScore: 60,
    examNo: 'EX20240312002',
    candidateCount: 856,
    sheetCount: 812,
    pendingCount: 26,
    publishedCount: 690
  },
  {
    id: 1003,
    name: '市场营销专业技能考核',
    paperName: '市场营销技能卷',
    sourceName: '企业内部',
    status: 'finished',
    startTime: '2024-03-10 09:30',
    endTime: '2024-03-10 11:00',
    passScore: 60,
    examNo: 'EX20240310003',
    candidateCount: 642,
    sheetCount: 612,
    pendingCount: 18,
    publishedCount: 551
  },
  {
    id: 1004,
    name: '加油站管理人员资格认证考试',
    paperName: '加油站管理资格卷',
    sourceName: '资格认证',
    status: 'finished',
    startTime: '2024-03-08 10:00',
    endTime: '2024-03-08 12:00',
    passScore: 70,
    examNo: 'EX20240308004',
    candidateCount: 534,
    sheetCount: 497,
    pendingCount: 14,
    publishedCount: 457
  },
  {
    id: 1005,
    name: '财务报销规范知识测试',
    paperName: '财务报销规范卷',
    sourceName: '企业内部',
    status: 'finished',
    startTime: '2024-03-05 14:30',
    endTime: '2024-03-05 15:30',
    passScore: 60,
    examNo: 'EX20240305005',
    candidateCount: 423,
    sheetCount: 401,
    pendingCount: 12,
    publishedCount: 381
  },
  {
    id: 1006,
    name: '危险化学品运输安全考核',
    paperName: '危化品运输安全卷',
    sourceName: '资格认证',
    status: 'finished',
    startTime: '2024-03-02 09:00',
    endTime: '2024-03-02 11:00',
    passScore: 70,
    examNo: 'EX20240302006',
    candidateCount: 386,
    sheetCount: 352,
    pendingCount: 8,
    publishedCount: 338
  },
  {
    id: 1007,
    name: '客户服务标准化流程考试',
    paperName: '客服标准化流程卷',
    sourceName: '企业内部',
    status: 'finished',
    startTime: '2024-02-28 15:00',
    endTime: '2024-02-28 16:00',
    passScore: 60,
    examNo: 'EX20240228007',
    candidateCount: 312,
    sheetCount: 298,
    pendingCount: 5,
    publishedCount: 289
  },
  {
    id: 1008,
    name: '党建知识专项测试',
    paperName: '党建知识卷',
    sourceName: '企业内部',
    status: 'finished',
    startTime: '2024-02-25 10:00',
    endTime: '2024-02-25 11:00',
    passScore: 60,
    examNo: 'EX20240225008',
    candidateCount: 268,
    sheetCount: 241,
    pendingCount: 3,
    publishedCount: 236
  }
]

/*
  各公司的相对体量，顺序与 MOCK_COMPANIES 一一对应。

  取值来自下方 companyStats 的 examinees 除以其均值（4665 / 8 ≈ 583）。
  填充场次的应考人数按这个权重缩放，台账里「按公司汇总应考人数」的相对关系
  才会与柱图的参考人数一致——否则柱图显示华东是直属单位的 2.2 倍，
  台账汇总却只有 1.35 倍，同一份演示里两张图对公司体量的暗示互相矛盾。

  改动 companyStats 的 examinees 时要回来同步这组权重。
*/
const COMPANY_WEIGHTS = [1.475, 1.273, 1.123, 0.993, 0.878, 0.748, 0.839, 0.672]

/** 台账里出现的考试名称词根，与公司交叉组合出场次名 */
const TOPICS = [
  '安全生产知识',
  '设备操作规范',
  '消防应急演练',
  '职业健康防护',
  '成品油质量管理',
  '计量器具使用',
  '环保排放标准',
  '合同管理规范',
  '信息安全意识',
  '反商业贿赂'
]

/*
  批量生成其余场次，把状态构成补齐到 MOCK_OVERVIEW.examStatusCount 声明的分布。

  已办完的场次不带待办量（pendingCount 为 0、已发布等于已交），
  否则 KPI 会被这些填充数据顶高，指标卡就与上面八行对不上了。
  用固定公式而非随机数：每次刷新数字必须一致，否则截图和验收都没法对。
*/
function buildFillerExams(): GradingExam[] {
  /*
    以已结束为主：台账是历史流水，真实环境里绝大多数场次都已考完，
    未发布/已发布（尚未开考）只占少数。若把未开考的场次堆到一半以上，
    台账的平均分、及格率两列会大面积显示「—」，既不真实也看不出东西。
  */
  const plan: Array<{ status: string; count: number }> = [
    { status: 'unpublished', count: 8 },
    { status: 'published', count: 12 },
    { status: 'ongoing', count: 6 },
    { status: 'finished', count: 52 }
  ]

  const total = plan.reduce((acc, p) => acc + p.count, 0)
  const companyCount = MOCK_COMPANIES.length

  /*
    各公司分到的场次数并不相等（本组数据是 11 或 10 场），必须按场次数归一化。

    否则场次少的公司即使体量权重更高，汇总下来仍可能被场次多、体量小的公司超过，
    柱图的公司排序就与台账「按公司汇总应考」的排序对不上。
    归一化后每家公司的汇总只由体量权重决定，与它恰好分到几场无关。
  */
  /*
    下限取 1 而非裸算：场次总数少于公司数时，靠后的公司一场都分不到，
    裸公式会返回 0，接着 maxExams / 0 得 Infinity，candidateCount 变成 NaN
    并静默渲染成空单元格——不报错，但表格里凭空出现一列空白，极难定位。
  */
  const examsOf = (idx: number) => Math.max(1, Math.floor((total - idx - 1) / companyCount) + 1)
  const maxExams = Math.max(...MOCK_COMPANIES.map((_, i) => examsOf(i)))

  const list: GradingExam[] = []
  let id = 2000

  for (const { status, count } of plan) {
    for (let i = 0; i < count; i++) {
      id += 1
      const seq = list.length
      const topic = TOPICS[seq % TOPICS.length]
      const companyIndex = seq % MOCK_COMPANIES.length
      const company = MOCK_COMPANIES[companyIndex]
      // 按公司体量缩放、再按场次数归一，使台账的应考汇总与柱图的参考人数成比例
      const candidateCount = Math.round(
        (120 + ((seq * 37) % 260)) *
          COMPANY_WEIGHTS[companyIndex] *
          (maxExams / examsOf(companyIndex))
      )

      /*
        未开考的场次没有答卷。

        「已发布」指考试已公布但尚未开考，与「成绩已发布」是两件事——
        这类场次同样不该有已交答卷，否则台账会出现「未开考却已交 200 份」。
      */
      const noSheets = status === 'unpublished' || status === 'published'

      /*
        进行中的场次有答卷但不发成绩。

        考试还在跑就把成绩发出去，后面考的人能打听到答案，实务上不会这么做。
        数据上若给进行中的场次一个非零已发布数，台账会出现
        「已发布 340 份、平均分却是 —」——成绩都发了却算不出均分，说不通。
      */
      const scoresPublished = status === 'finished'
      // 已结束场次留一点缺考，全员到场不真实
      const absent = status === 'finished' ? 4 + (seq % 9) : 0
      const sheetCount = noSheets ? 0 : Math.max(0, candidateCount - absent)

      const month = 1 + (seq % 3)
      const day = 1 + (seq % 28)
      const hour = 9 + (seq % 8)
      const pad = (n: number) => String(n).padStart(2, '0')
      const date = `2024-${pad(month)}-${pad(day)}`

      list.push({
        id,
        name: `${company}${topic}考核`,
        paperName: `${topic}标准卷`,
        sourceName: seq % 4 === 0 ? '资格认证' : '企业内部',
        status,
        startTime: `${date} ${pad(hour)}:00`,
        endTime: `${date} ${pad(hour + 1)}:30`,
        passScore: seq % 3 === 0 ? 70 : 60,
        examNo: `EX${date.replace(/-/g, '')}${pad(seq + 10)}`,
        candidateCount,
        sheetCount,
        // 填充场次不产生待批阅，待批阅 KPI 只由手写的八场决定
        pendingCount: 0,
        publishedCount: scoresPublished ? sheetCount : 0
      })
    }
  }

  return list
}

/** 全部 86 场考试：八场有待办 + 78 场填充，状态构成对齐环图 */
export const MOCK_EXAMS: GradingExam[] = [...BUSY_EXAMS, ...buildFillerExams()]

/*
  统计概览。

  published 取与 examinees 相同：演示数据里假定参考的人成绩都已发布，
  这样「各公司及格率」的分母（published）与柱图的参考人数一致，
  两张图放在一起不会让人算出两个不同的及格率。

  scoreDistribution 的合计必须等于 ratedTotal（4665），
  否则「成绩分布」卡右上角标注的人数与柱子加起来的人数对不上。
*/
export const MOCK_OVERVIEW: AnalyticsOverview = {
  companyStats: [
    { companyName: '华东分公司', examinees: 860, published: 860, passed: 612, avgScoreRate: 74.2 },
    { companyName: '华南分公司', examinees: 742, published: 742, passed: 529, avgScoreRate: 73.6 },
    { companyName: '华北分公司', examinees: 655, published: 655, passed: 455, avgScoreRate: 72.1 },
    { companyName: '西南分公司', examinees: 579, published: 579, passed: 382, avgScoreRate: 69.8 },
    /*
      东北与华中的人数刻意按此顺序：两家体量接近，而台账里各公司的场次数
      不完全相等（10 或 11 场），若让人数少的那家占到更高的权重档位，
      柱图的公司排序就会与台账「按公司汇总应考人数」的排序对不上。
      两者相加仍为 4665，不影响总量。
    */
    { companyName: '东北分公司', examinees: 512, published: 512, passed: 337, avgScoreRate: 69.1 },
    { companyName: '西北分公司', examinees: 436, published: 436, passed: 289, avgScoreRate: 69.5 },
    { companyName: '华中分公司', examinees: 489, published: 489, passed: 321, avgScoreRate: 69.2 },
    { companyName: '直属单位', examinees: 392, published: 392, passed: 253, avgScoreRate: 68.4 }
  ],
  scoreDistribution: [
    { label: '60% 以下', count: 389 },
    { label: '60-69%', count: 690 },
    { label: '70-79%', count: 1252 },
    { label: '80-89%', count: 1447 },
    { label: '90-100%', count: 887 }
  ],
  /*
    必须与 MOCK_EXAMS 的实际状态分布严格一致：8 + 12 + 6 + 60 = 86。
    手写的八场现在全是已结束，故 finished 60 = 手写 8 + 填充 52，
    另外三个状态全部来自填充计划。
    这里手写、那边生成，改动填充计划后务必回来同步，
    否则环图与指标卡会对同一件事报出两个不同的场次数，同一页自相矛盾。
  */
  examStatusCount: [
    { status: 'unpublished', count: 8 },
    { status: 'published', count: 12 },
    { status: 'ongoing', count: 6 },
    { status: 'finished', count: 60 }
  ],
  publishedTotal: 4665,
  ratedTotal: 4665,
  companies: MOCK_COMPANIES
}

/*
  台账行的构造在 views/analytics/exam-ledger/mock.ts —— 台账是统计分析下的独立页面，
  数据组装放在它自己那边。本文件只提供基础场次（MOCK_EXAMS），由台账那边 import 后派生，
  两处共用同一批考试，避免同一场考试的应考人数在首页与台账里对不上。
*/
