/**
 * 自主练习 API
 * 对接 /admin/exam/self-practice/* 接口：可开放题库列表、开放配置读写、
 * 切换开放状态、取消开放。
 * 自主练习以题库为主体：管理员开放题库供学员自主选择练习。
 * 统一关闭 http 层错误提示（showErrorMessage: false），由页面自行控制提示文案。
 */

import request from '@/utils/http'

/** 开放范围：all 全员开放 / specified 指定员工 */
export type OpenScope = 'all' | 'specified'

/** 开放范围选项 */
export const OPEN_SCOPE_OPTIONS: { label: string; value: OpenScope }[] = [
  { label: '全员开放', value: 'all' },
  { label: '指定员工', value: 'specified' }
]

/** 开放人数为该值时表示全员开放（后端哨兵值） */
export const ALL_OPEN_USERS = -1

/** 自主练习题库列表项 */
export interface SelfPracticeBank {
  bankId: number
  bankName: string
  createBy?: number | null
  createByName: string
  /** 试题数（题库内正式题目数） */
  questionCount: number
  /** 开放人数；为 ALL_OPEN_USERS 时表示全员 */
  openUserCount: number
  /** 考核点数（限定的可练知识点数，0 表示不限） */
  knowledgePointCount: number
  isOpen: boolean
  openScope: OpenScope
}

/** 开放人员项 */
export interface SelfPracticeUserItem {
  userType: 'internal' | 'external'
  internalUserId?: number
  externalCandidateId?: number
}

/** 开放人员（详情，含姓名） */
export interface SelfPracticeUserDetail extends SelfPracticeUserItem {
  id: number
  userName: string
}

/** 可练知识点 */
export interface SelfPracticeKnowledgePoint {
  knowledgePointId: number
  knowledgePointName: string
}

/** 题库开放配置详情 */
export interface SelfPracticeConfig {
  bankId: number
  bankName: string
  isOpen: boolean
  openScope: OpenScope
  /** 单次练习题数上限（0 = 不限） */
  maxQuestionsPerRound: number
  allowRepeat: boolean
  showResultPerQuestion: boolean
  showAnswer: boolean
  showAnalysis: boolean
  users: SelfPracticeUserDetail[]
  knowledgePoints: SelfPracticeKnowledgePoint[]
}

/** 保存开放配置入参 */
export interface SelfPracticeConfigPayload {
  bankId: number
  isOpen?: boolean
  openScope: OpenScope
  maxQuestionsPerRound?: number
  knowledgePointIds?: number[]
  users?: SelfPracticeUserItem[]
  allowRepeat?: boolean
  showResultPerQuestion?: boolean
  showAnswer?: boolean
  showAnalysis?: boolean
}

/** 分页返回结构 */
export interface SelfPracticeListResult {
  list: SelfPracticeBank[]
  pagination: { page: number; pageSize: number; total: number }
}

/** 获取可开放题库列表（分页；未配置过的题库也会列出） */
export function getSelfPracticeList(params?: {
  keyword?: string
  isOpen?: boolean
  page?: number
  pageSize?: number
}) {
  return request.get<SelfPracticeListResult>({
    url: '/admin/exam/self-practice/list',
    params,
    showErrorMessage: false
  })
}

/** 题库开放配置详情（未配置时返回默认值） */
export function getSelfPracticeConfig(bankId: number) {
  return request.get<SelfPracticeConfig>({
    url: `/admin/exam/self-practice/config/${bankId}`,
    showErrorMessage: false
  })
}

/** 保存题库开放配置 */
export function saveSelfPracticeConfig(data: SelfPracticeConfigPayload) {
  return request.put({
    url: '/admin/exam/self-practice/config',
    data,
    showErrorMessage: false
  })
}

/** 切换题库开放状态 */
export function toggleSelfPracticeOpen(bankId: number, isOpen: boolean) {
  return request.post({
    url: `/admin/exam/self-practice/toggle/${bankId}`,
    params: { isOpen },
    showErrorMessage: false
  })
}

/** 取消开放（移出自主练习范围，不影响题库本身） */
export function removeSelfPracticeConfig(bankId: number) {
  return request.del({
    url: `/admin/exam/self-practice/config/${bankId}`,
    showErrorMessage: false
  })
}

/** 自主练习 API 聚合导出 */
export const selfPracticeApi = {
  getList: getSelfPracticeList,
  getConfig: getSelfPracticeConfig,
  saveConfig: saveSelfPracticeConfig,
  toggleOpen: toggleSelfPracticeOpen,
  removeConfig: removeSelfPracticeConfig
}
