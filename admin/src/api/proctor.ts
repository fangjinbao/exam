/**
 * 监考中心 API
 * 对接 /admin/exam/proctor/* 接口：监考考试列表（只含指派给自己的）、
 * 考生监考名单（含切屏次数与作答进度），以及强制交卷 / 解锁续答 / 清空重考三个动作。
 * 统一关闭 http 层错误提示（showErrorMessage: false），由页面自行控制提示文案。
 */

import request from '@/utils/http'

/** 监考中心的考试行（一场考试一条） */
export interface ProctorExam {
  id: number
  /** 考试编号（JCKS-创建日期+4位ID 派生，非库中字段） */
  examNo: string
  name: string
  /** published/ongoing/finished（后端按当前时间实时推算，不取库中滞后值） */
  status: string
  startTime: string
  endTime: string
  duration: number
  /** 应考人数 */
  candidateCount: number
  /** 已交卷份数 */
  submittedCount: number
  /** 进行中份数（已取卷未交卷） */
  ongoingCount: number
}

/** 考生监考状态 */
export type ProctorCandidateStatus = 'not_started' | 'ongoing' | 'submitted'

/** 监考名单的一行：一份答卷一行，允许重考时同一考生有多行 */
export interface ProctorCandidate {
  /** 行唯一键（一人多行时 candidateId 不唯一，表格 row-key 用此字段） */
  rowKey: string
  /** 考生分配行 ID（ExamCandidate.id） */
  candidateId: number
  /** 第几次考试，从 1 开始；未取卷为 0 */
  attemptNo: number
  /** 是否重考（第 2 次及以后） */
  isRetake: boolean
  /** 答卷 ID；未取卷时为 null，此时无任何监考动作可执行 */
  sheetId: number | null
  candidateType: 'internal' | 'external'
  candidateName: string
  /** 内部人员为统一身份账号，外部考生为登录手机号 */
  account: string | null
  companyName: string
  status: ProctorCandidateStatus
  switchCount: number
  /** 是否已超出允许切屏次数（allowSwitchTimes 为 0 时恒为 false） */
  switchExceeded: boolean
  startTime: string | null
  submitTime: string | null
  /** 卷面总题数；未取卷为 0 */
  totalCount: number
  answeredCount: number
  gradingStatus: string | null
  /** 本人已交卷次数（不含正在答的这次；同一考生各行相同） */
  attemptUsed: number
  /** 总机会数 = 考试设置 retakeLimit + 1 */
  attemptLimit: number
  /** 本次成绩；本次未交卷或主观题未阅完时为 null */
  score: number | null
  /** none 本次未交卷 / pending 待阅卷 / graded 已阅完未发布 / published 已发布 */
  scoreState: 'none' | 'pending' | 'graded' | 'published'
}

/** 名单概览计数（按人统计，非行数） */
export interface ProctorStats {
  total: number
  notStarted: number
  ongoing: number
  submitted: number
  /** 切屏超次人数，一人多次超次只计一次 */
  exceeded: number
}

/** 考生名单接口返回：考试上下文 + 名单 */
export interface ProctorCandidatesResult {
  exam: {
    id: number
    name: string
    examNo: string
    status: string
    startTime: string
    endTime: string
    duration: number
    /** 允许切屏次数，0 为不限（仅记录不强制交卷） */
    allowSwitchTimes: number
    /** 防切屏检测总开关；关闭时切屏次数只是历史残留，不判超次 */
    screenSwitchDetect: boolean
    /** 最多重考次数，0 为不允许重考；大于 0 时列表才显示次数与重考标记 */
    retakeLimit: number
  }
  stats: ProctorStats
  list: ProctorCandidate[]
}

/** 分页返回结构 */
export interface ProctorExamListResult {
  list: ProctorExam[]
  pagination: { page: number; pageSize: number; total: number }
}

/** 监考状态文案 */
export const PROCTOR_STATUS_TEXT: Record<ProctorCandidateStatus, string> = {
  not_started: '未开考',
  ongoing: '进行中',
  submitted: '已交卷'
}

/** 监考状态对应的 ElTag type */
export function proctorStatusTagType(
  status: ProctorCandidateStatus
): 'info' | 'primary' | 'success' {
  if (status === 'ongoing') return 'primary'
  if (status === 'submitted') return 'success'
  return 'info'
}

/** 监考考试列表（只含指派给自己监考的；超管看全部） */
export function getProctorExamList(params?: {
  name?: string
  status?: string
  page?: number
  pageSize?: number
}) {
  return request.get<ProctorExamListResult>({
    url: '/admin/exam/proctor/list',
    params,
    showErrorMessage: false
  })
}

/** 某场考试的考生监考名单 */
export function getProctorCandidates(examId: number) {
  return request.get<ProctorCandidatesResult>({
    url: `/admin/exam/proctor/candidates/${examId}`,
    showErrorMessage: false
  })
}

/** 强制交卷（监考代考生提交） */
export function proctorForceSubmit(examId: number, sheetId: number) {
  return request.post({
    url: '/admin/exam/proctor/force-submit',
    data: { examId, sheetId },
    showErrorMessage: false
  })
}

/** 解锁续答（清零切屏次数并撤销交卷，保留已答内容） */
export function proctorUnlock(examId: number, sheetId: number) {
  return request.post({
    url: '/admin/exam/proctor/unlock',
    data: { examId, sheetId },
    showErrorMessage: false
  })
}

/** 清空重考（删除答卷与已答内容，不可逆） */
export function proctorReset(examId: number, sheetId: number) {
  return request.post({
    url: '/admin/exam/proctor/reset',
    data: { examId, sheetId },
    showErrorMessage: false
  })
}

export const proctorApi = {
  getExamList: getProctorExamList,
  getCandidates: getProctorCandidates,
  forceSubmit: proctorForceSubmit,
  unlock: proctorUnlock,
  reset: proctorReset
}
