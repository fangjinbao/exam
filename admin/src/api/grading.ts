/**
 * 阅卷中心 API
 * 对接 /admin/exam/grading/* 接口：考试维度列表、考生名单、整卷阅卷详情、
 * 主观题人工评分、成绩发布/撤回。只做人工阅卷，不含 AI 阅卷与复核流程。
 * 统一关闭 http 层错误提示（showErrorMessage: false），由页面自行控制提示文案。
 */

import request from '@/utils/http'

/** 阅卷任务（一份答卷一条） */
export interface GradingTask {
  id: number
  examId: number
  examName: string
  candidateName: string
  objectiveCount: number
  subjectiveCount: number
  objectiveScore: number | null
  subjectiveScore: number | null
  totalScore: number | null
  gradingStatus: string // pending 待批阅 | completed 已阅完
  scorePublished: boolean
  passed: boolean | null
  submitTime: string | null
}

/** 考试维度阅卷行（一场考试一条，阅卷中心首屏） */
export interface GradingExam {
  id: number
  name: string
  paperName: string
  status: string
  startTime: string
  endTime: string
  passScore: number
  /** 考试编号（后端按创建日期+ID 派生，非库中字段） */
  examNo: string
  /** 来源：关联认证项目名，未关联时回落试卷名 */
  sourceName: string
  /** 应考人数（考生分配数，含未交卷） */
  candidateCount: number
  /** 已交答卷总份数 */
  sheetCount: number
  /** 待批阅份数（尚有未评分主观题的答卷数） */
  pendingCount: number
  /** 已发布成绩份数 */
  publishedCount: number
}

/** 阅卷工作台的考生名单项 */
export interface GradingCandidate {
  id: number
  candidateName: string
  candidateType: string
  /** 所属组织：内部为部门名，外部为所属单位名；缺失为空串 */
  orgName: string
  objectiveScore: number | null
  subjectiveScore: number | null
  totalScore: number | null
  gradingStatus: string
  scorePublished: boolean
  passed: boolean | null
  submitTime: string | null
  /** 尚未给出最终分的主观题数 */
  pendingSubjectiveCount: number
}

/** 整场发布/撤回的共有结果字段（跳过的份数与去重原因） */
interface GradingBatchBase {
  /** 被跳过的份数（主观题未阅完等） */
  skipped: number
  /** 跳过原因（后端已去重） */
  reasons: string[]
}

/**
 * 整场发布结果
 * published 由后端必返回（见 server GradingPublishResultVo），故不设为可选——
 * 标可选会让调用处以为要写 `?? 0` 兜底，实际是给类型加了个不存在的失败分支。
 */
export interface GradingPublishResult extends GradingBatchBase {
  /** 实际发布成功的份数 */
  published: number
}

/** 整场撤回结果（withdrawn 同样由后端必返回） */
export interface GradingWithdrawResult extends GradingBatchBase {
  /** 实际撤回的份数 */
  withdrawn: number
}

/**
 * 阅卷状态文案（列表页与工作台共用，避免两处各写一份而分叉）
 *
 * ai_grading / pending_review 保留：现行流程只有人工阅卷、不会再产生这两个状态，
 * 但库里可能存有早期 AI 阅卷流程留下的答卷，删掉映射会让它们显示成原始枚举串。
 */
export const GRADING_STATUS_TEXT: Record<string, string> = {
  pending: '待批阅',
  ai_grading: 'AI阅卷中',
  pending_review: '待复核',
  completed: '已阅完'
}

/** 阅卷状态文案映射 */
export function gradingStatusLabel(status: string): string {
  return GRADING_STATUS_TEXT[status] || status
}

/** 阅卷状态对应的 Tag 类型 */
export function gradingStatusTagType(status: string): 'info' | 'warning' | 'primary' | 'success' {
  const map: Record<string, 'info' | 'warning' | 'primary' | 'success'> = {
    pending: 'info',
    ai_grading: 'warning',
    pending_review: 'primary',
    completed: 'success'
  }
  return map[status] || 'info'
}

/** 分值格式化：null / undefined 统一显示「-」 */
export function formatScore(value: number | null | undefined): string {
  return value === null || value === undefined ? '-' : String(value)
}

/** 整场进度筛选项 */
export const GRADING_PROGRESS_OPTIONS: { label: string; value: string }[] = [
  { label: '尚有未阅完', value: 'pending' },
  { label: '全部已阅完', value: 'completed' },
  { label: '全部已发布', value: 'published' }
]

/** 整卷单题（客观题只读、主观题可评分） */
export interface SheetQuestionItem {
  /** 答题项 ID，提交评分时回传 */
  id: number
  questionNo: number
  /** 题型字典 value，前端按此分大题 */
  questionType: string
  /** objective 客观题 / subjective 主观题 */
  questionCategory: string
  stem: string
  /** 选项原文（选择题有值，用 splitOptions 解析） */
  options: string | null
  candidateAnswer: string | null
  standardAnswer: string | null
  scoringCriteria: string | null
  fullScore: number
  /** 客观题为自动判分结果；主观题为人工评分，null 表示未评 */
  score: number | null
  isCorrect: boolean | null
  /** 最近一次评分的评语（主观题；未评或未写为空串），用于重新打开该卷时回显 */
  reviewComment: string
  /** 最近一次评分的阅卷人姓名（主观题；未评为 null） */
  reviewerName: string | null
  /** 最近一次评分时间（主观题；未评为 null） */
  reviewTime: string | null
}

/** 整卷阅卷详情（工作台打开一份卷的全部数据） */
export interface SheetDetail {
  id: number
  examId: number
  examName: string
  candidateName: string
  /** 试卷总分 */
  paperTotalScore: number
  passScore: number
  objectiveScore: number | null
  subjectiveScore: number | null
  totalScore: number | null
  gradingStatus: string
  scorePublished: boolean
  passed: boolean | null
  submitTime: string | null
  items: SheetQuestionItem[]
}

/** 主观题评分项入参（评语可选，留空表示只记录分数） */
export interface ReviewItemPayload {
  answerItemId: number
  scoreAfter: number
  reviewComment: string
}

/** 分页返回结构 */
export interface GradingListResult {
  list: GradingTask[]
  pagination: { page: number; pageSize: number; total: number }
}

/** 考试维度分页返回 */
export interface GradingExamListResult {
  list: GradingExam[]
  pagination: { page: number; pageSize: number; total: number }
}

/** 考试维度阅卷列表（阅卷中心首屏） */
export function getGradingExams(params?: {
  examName?: string
  progress?: string
  page?: number
  pageSize?: number
}) {
  return request.get<GradingExamListResult>({
    url: '/admin/exam/grading/exams',
    params,
    showErrorMessage: false
  })
}

/** 某场考试的考生名单（工作台切换考生用，不分页） */
export function getExamCandidates(examId: number) {
  return request.get<GradingCandidate[]>({
    url: `/admin/exam/grading/exams/${examId}/candidates`,
    showErrorMessage: false
  })
}

/** 整场发布成绩（主观题未阅完的会被跳过） */
export function publishExamScores(examId: number) {
  return request.post<GradingPublishResult>({
    url: `/admin/exam/grading/exams/${examId}/publish`,
    showErrorMessage: false
  })
}

/** 整场撤回成绩 */
export function withdrawExamScores(examId: number) {
  return request.post<GradingWithdrawResult>({
    url: `/admin/exam/grading/exams/${examId}/withdraw`,
    showErrorMessage: false
  })
}

/** 获取阅卷任务列表（分页） */
export function getGradingList(params?: {
  examName?: string
  gradingStatus?: string
  candidateKeyword?: string
  page?: number
  pageSize?: number
}) {
  return request.get<GradingListResult>({
    url: '/admin/exam/grading/list',
    params,
    showErrorMessage: false
  })
}

/** 整卷阅卷详情（卷头 + 全部题目；客观题未判分时后端自动补算） */
export function getSheetDetail(sheetId: number) {
  return request.get<SheetDetail>({
    url: `/admin/exam/grading/tasks/${sheetId}/sheet`,
    showErrorMessage: false
  })
}

/** 保存主观题评分（一次可提交多题，评语可为空串） */
export function submitReview(sheetId: number, items: ReviewItemPayload[]) {
  return request.post({
    url: `/admin/exam/grading/tasks/${sheetId}/review`,
    data: { items },
    showErrorMessage: false
  })
}

/** 成绩发布 */
export function publishScore(sheetId: number) {
  return request.post({
    url: `/admin/exam/grading/tasks/${sheetId}/publish`,
    showErrorMessage: false
  })
}

/** 成绩撤回 */
export function withdrawScore(sheetId: number) {
  return request.post({
    url: `/admin/exam/grading/tasks/${sheetId}/withdraw`,
    showErrorMessage: false
  })
}

/** 阅卷 API 聚合导出 */
export const gradingApi = {
  getExams: getGradingExams,
  getExamCandidates,
  publishExamScores,
  withdrawExamScores,
  getList: getGradingList,
  getSheetDetail,
  submitReview,
  publishScore,
  withdrawScore
}
