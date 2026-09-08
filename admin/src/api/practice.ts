/**
 * 岗位练兵 API
 * 对接 /admin/exam/practice/* 接口：列表、详情、创建、编辑、分配参与人员、
 * 抽题可用量、发布/撤回/结束、删除。
 * 统一关闭 http 层错误提示（showErrorMessage: false），由页面自行控制提示文案。
 */

import request from '@/utils/http'

/** 抽题方式：sequential 全库顺序练 / random 按规则抽题 */
export type PracticeDrawMode = 'sequential' | 'random'

/** 抽题方式选项 */
export const DRAW_MODE_OPTIONS: {
  label: string
  value: PracticeDrawMode
  desc: string
}[] = [
  { label: '全库顺序练', value: 'sequential', desc: '按题库顺序练完全部题目，支持断点续练' },
  { label: '按规则抽题', value: 'random', desc: '按题型/难度/知识点配置抽题数量，每次抽取' }
]

/** 参与范围：specified 指定员工 / all 全员参与 */
export type ParticipantScope = 'specified' | 'all'

/** 参与范围选项 */
export const PARTICIPANT_SCOPE_OPTIONS: { label: string; value: ParticipantScope }[] = [
  { label: '指定员工参与', value: 'specified' },
  { label: '全员参与', value: 'all' }
]

/** 练习状态文案映射 */
export const PRACTICE_STATUS_TEXT: Record<string, string> = {
  unpublished: '未发布',
  published: '已发布',
  ongoing: '进行中',
  finished: '已结束'
}

/**
 * 练习状态对应的 Tag 类型
 * 与 PRACTICE_STATUS_TEXT 放在一起导出：列表、详情页头、详情 Tab 三处都要染色，
 * 各自维护一份映射的话，加状态时只改一处就会静默不一致（与 examStatusTagType 同一套模式）。
 * 注意练习「记录」状态（not_started/ongoing/finished）是另一套枚举，不共用此函数。
 */
export function practiceStatusTagType(status: string): 'info' | 'primary' | 'warning' | 'success' {
  const map: Record<string, 'info' | 'primary' | 'warning' | 'success'> = {
    unpublished: 'info',
    published: 'primary',
    ongoing: 'warning',
    finished: 'success'
  }
  return map[status] || 'info'
}

/** 参与人数为该值时表示全员参与（后端哨兵值） */
export const ALL_PARTICIPANTS = -1

/** 练习实体（列表项） */
export interface Practice {
  id: number
  name: string
  code: string
  description?: string | null
  drawMode: PracticeDrawMode
  bankIds: number[]
  bankNames: string[]
  startTime?: string | null
  endTime?: string | null
  autoFinish: boolean
  participantScope: ParticipantScope
  /** 参与人数；为 ALL_PARTICIPANTS 时表示全员 */
  participantCount: number
  /** 题目总数：顺序练=题库题量合计，规则抽题=各规则抽取数合计 */
  questionCount: number
  status: string
  createBy?: number | null
  createByName?: string
  createTime?: string
  updateTime?: string
}

/** 练习设置 */
export interface PracticeSetting {
  allowRepeat: boolean
  showResultPerQuestion: boolean
  showAnswer: boolean
  showAnalysis: boolean
}

/**
 * 抽题规则项（difficulty 空串 = 不限，knowledgePointId 0 = 不限）。
 *
 * knowledgePointId 在界面态可为 undefined：ElTreeSelect 拿到 0 会当成已选值，
 * 而知识点树里没有 id=0 的节点，就把原始的「0」直接显示出来而非 placeholder「不限」。
 * 提交前统一兜成 0，与后端约定不变。
 */
export interface PracticeRuleItem {
  questionType: string
  difficulty: string
  knowledgePointId?: number
  drawCount: number
}

/** 抽题规则（详情，含知识点名称） */
export interface PracticeRuleDetail extends PracticeRuleItem {
  id: number
  knowledgePointName: string
}

/** 参与人员项 */
export interface PracticeParticipantItem {
  participantType: 'internal' | 'external'
  internalUserId?: number
  externalCandidateId?: number
}

/** 参与人员（详情，含姓名） */
export interface PracticeParticipantDetail extends PracticeParticipantItem {
  id: number
  participantName: string
}

/**
 * 参与人员名单的一行（名单弹窗用）
 *
 * 比 PracticeParticipantDetail 多出档案字段与 hasPracticed：
 * 前者供编辑页回显、只需姓名；名单弹窗要与考试的考生名单同列，
 * 且要据 hasPracticed 禁掉移除按钮。
 */
export interface PracticeParticipantRoster extends PracticeParticipantDetail {
  /** 内部人员为统一身份账号，外部考生为登录手机号 */
  account: string | null
  /** 仅外部考生库维护该字段，内部人员恒为 null */
  idCard: string | null
  phone: string | null
  companyName: string
  departmentName: string
  /** 已有练习记录：移除会留下无主记录，故禁止移除 */
  hasPracticed: boolean
}

/** 题库范围项（详情，含名称与题量） */
export interface PracticeBankDetail {
  bankId: number
  bankName: string
  questionCount: number
}

/** 练习详情 */
export interface PracticeDetail extends Practice {
  banks: PracticeBankDetail[]
  rules: PracticeRuleDetail[]
  participants: PracticeParticipantDetail[]
  setting: PracticeSetting | null
}

/** 分页返回结构 */
export interface PracticeListResult {
  list: Practice[]
  pagination: { page: number; pageSize: number; total: number }
}

/** 练习记录状态 */
export type PracticeRecordStatus = 'not_started' | 'ongoing' | 'finished'

/** 练习记录列表的一行（按人聚合，一人一行） */
export interface PracticeRecordUser {
  userType: 'internal' | 'external'
  userId: number
  name: string
  /** 所属公司（内部人员取最近的省公司/分公司节点；外部考生取所属单位） */
  companyName: string
  /** 所属部门（外部考生无部门概念，为空串） */
  departmentName: string
  /** 练习次数；0 表示从未练过 */
  attemptCount: number
  lastTotalCount: number
  lastAnsweredCount: number
  lastCorrectCount: number
  /** 最近一次正确率（0-100 整数），无记录为 null */
  lastAccuracy: number | null
  lastPracticeTime: string | null
  status: PracticeRecordStatus
}

export interface PracticeRecordPageResult {
  list: PracticeRecordUser[]
  pagination: { page: number; pageSize: number; total: number }
}

/** 某人的单次练习记录（抽屉第一级） */
export interface PracticeRecordAttempt {
  id: number
  totalCount: number
  answeredCount: number
  correctCount: number
  finished: boolean
  finishTime: string | null
  createTime: string
  accuracy: number | null
  status: PracticeRecordStatus
}

/** 单次记录的逐题作答（抽屉第二级） */
export interface PracticeAnswerItem {
  id: number
  questionNo: number
  questionId: number
  questionType: string
  stem: string
  /** 选项原文（客观题有值，用 splitOptionsRich 解析；主观题为空） */
  options: string | null
  /** 答案解析（可空） */
  analysis: string | null
  candidateAnswer: string | null
  standardAnswer: string | null
  /** 未作答为 null */
  isCorrect: boolean | null
}

export interface PracticeRecordDetail extends PracticeRecordAttempt {
  practiceId: number | null
  sourceName: string
  userType: 'internal' | 'external'
  userId: number
  name: string
  companyName: string
  departmentName: string
  answers: PracticeAnswerItem[]
}

/** 创建/编辑练习入参 */
export interface PracticePayload {
  name: string
  code?: string
  description?: string
  drawMode: PracticeDrawMode
  bankIds: number[]
  startTime?: string
  endTime?: string
  autoFinish?: boolean
  participantScope: ParticipantScope
  rules?: PracticeRuleItem[]
  participants?: PracticeParticipantItem[]
  setting?: Partial<PracticeSetting>
}

/** 获取练习列表（分页） */
export function getPracticeList(params?: {
  keyword?: string
  status?: string
  startDate?: string
  endDate?: string
  page?: number
  pageSize?: number
}) {
  return request.get<PracticeListResult>({
    url: '/admin/exam/practice/list',
    params,
    showErrorMessage: false
  })
}

/** 练习详情 */
export function getPracticeDetail(id: number) {
  return request.get<PracticeDetail>({
    url: `/admin/exam/practice/detail/${id}`,
    showErrorMessage: false
  })
}

/** 练习记录分页（按人聚合，含从未练过的参与人员） */
export function getPracticeRecordPage(
  practiceId: number,
  params?: { keyword?: string; status?: string; page?: number; pageSize?: number }
) {
  return request.get<PracticeRecordPageResult>({
    url: `/admin/exam/practice/record-page/${practiceId}`,
    params,
    showErrorMessage: false
  })
}

/** 某人在此练习下的历次记录 */
export function getPracticeRecordList(
  practiceId: number,
  userType: 'internal' | 'external',
  userId: number
) {
  return request.get<PracticeRecordAttempt[]>({
    url: `/admin/exam/practice/record-list/${practiceId}`,
    params: { userType, userId },
    showErrorMessage: false
  })
}

/** 单次记录的逐题明细 */
export function getPracticeRecordDetail(recordId: number) {
  return request.get<PracticeRecordDetail>({
    url: `/admin/exam/practice/record-detail/${recordId}`,
    showErrorMessage: false
  })
}

/** 创建练习 */
export function addPractice(data: PracticePayload) {
  return request.post({ url: '/admin/exam/practice/add', data, showErrorMessage: false })
}

/** 编辑练习（仅未发布） */
export function updatePractice(data: PracticePayload & { id: number }) {
  return request.put({ url: '/admin/exam/practice/update', data, showErrorMessage: false })
}

/** 分配/更新参与人员 */
export function assignParticipants(practiceId: number, participants: PracticeParticipantItem[]) {
  return request.post({
    url: '/admin/exam/practice/assign-participants',
    data: { practiceId, participants },
    showErrorMessage: false
  })
}

/** 参与人员名单（带是否已练过标记，已发布/进行中的练习用） */
export function getPracticeParticipants(practiceId: number) {
  return request.get<PracticeParticipantRoster[]>({
    url: `/admin/exam/practice/participants/${practiceId}`,
    showErrorMessage: false
  })
}

/** 追加参与人员（只增不减，已在名单里的由后端跳过） */
export function appendParticipants(practiceId: number, participants: PracticeParticipantItem[]) {
  return request.post({
    url: '/admin/exam/practice/append-participants',
    data: { practiceId, participants },
    showErrorMessage: false
  })
}

/** 移除参与人员（仅未练过者；ids 为名单行 id） */
export function removeParticipants(practiceId: number, ids: number[]) {
  return request.post({
    url: '/admin/exam/practice/remove-participants',
    data: { practiceId, ids },
    showErrorMessage: false
  })
}

/** 统计各抽题规则在题库范围内的可用题量（与 rules 下标对齐） */
export function fetchRuleAvailability(data: { bankIds: number[]; rules: PracticeRuleItem[] }) {
  return request.post<{ counts: number[] }>({
    url: '/admin/exam/practice/rule-availability',
    data,
    showErrorMessage: false
  })
}

/** 发布练习 */
export function publishPractice(id: number) {
  return request.post({ url: `/admin/exam/practice/publish/${id}`, showErrorMessage: false })
}

/** 撤回练习 */
export function withdrawPractice(id: number) {
  return request.post({ url: `/admin/exam/practice/withdraw/${id}`, showErrorMessage: false })
}

/** 手动结束练习 */
export function finishPractice(id: number) {
  return request.post({ url: `/admin/exam/practice/finish/${id}`, showErrorMessage: false })
}

/** 删除练习 */
export function deletePractice(id: number) {
  return request.del({ url: `/admin/exam/practice/delete/${id}`, showErrorMessage: false })
}

/** 批量删除练习 */
export function batchDeletePractices(ids: number[]) {
  return request.post<{ success: number; failed: string[] }>({
    url: '/admin/exam/practice/batch-delete',
    data: { ids },
    showErrorMessage: false
  })
}

/** 岗位练兵 API 聚合导出 */
export const practiceApi = {
  getList: getPracticeList,
  getDetail: getPracticeDetail,
  getRecordPage: getPracticeRecordPage,
  getRecordList: getPracticeRecordList,
  getRecordDetail: getPracticeRecordDetail,
  add: addPractice,
  update: updatePractice,
  assignParticipants,
  getParticipants: getPracticeParticipants,
  appendParticipants,
  removeParticipants,
  ruleAvailability: fetchRuleAvailability,
  publish: publishPractice,
  withdraw: withdrawPractice,
  finish: finishPractice,
  delete: deletePractice,
  batchDelete: batchDeletePractices
}
