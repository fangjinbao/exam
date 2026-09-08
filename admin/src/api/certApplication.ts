/**
 * 报名审核管理 API
 * 对接 /admin/exam/cert-application/* 接口：列表、详情、单条审核、批量审核
 * 统一关闭 http 层错误提示（showErrorMessage: false），由页面自行控制提示文案
 *
 * 记录来自「鉴定报名」：单位管理员按本单位名额挑人提交，故带单位/部门/提交人字段。
 */

import request from '@/utils/http'

/** 报考记录审核状态 */
export type CertApplicationStatus = 'pending' | 'approved' | 'rejected'

/** 报考记录实体（列表项） */
export interface CertApplication {
  id: number
  projectId: number
  projectName: string
  candidateType: string // internal | external
  candidateName: string
  applyTime: string
  status: CertApplicationStatus
  reviewerName?: string | null
  rejectReason?: string | null
  reviewTime?: string | null
  /** 报名单位（公司节点）。为空表示该记录不占单位名额 */
  orgId?: number | null
  orgName?: string
  /** 所占名额的部门。为空表示名额分给整个单位、不细分部门 */
  deptId?: number | null
  deptName?: string
  /** 提交人（代报的单位管理员） */
  submitterName?: string | null
}

/** 报考记录列表分页返回结构 */
export interface CertApplicationListResult {
  list: CertApplication[]
  pagination: { page: number; pageSize: number; total: number }
}

/** 审核入参（驳回时必须携带驳回原因） */
export interface CertApplicationReviewPayload {
  id: number
  result: 'approved' | 'rejected'
  rejectReason?: string
}

/**
 * 批量审核入参
 *
 * 整批要么全成要么全不成：含已审核记录时服务端整批拒绝，
 * 不会挑出待审的悄悄审掉。
 */
export interface CertApplicationReviewBatchPayload {
  ids: number[]
  result: 'approved' | 'rejected'
  rejectReason?: string
}

/** 获取报考记录列表（分页），支持按认证项目、审核状态精确与考生关键词模糊筛选 */
export function getCertApplicationList(params?: {
  projectId?: number
  status?: CertApplicationStatus | ''
  keyword?: string
  /** 按报名单位筛选（公司节点 ID） */
  orgId?: number
  page?: number
  pageSize?: number
}) {
  return request.get<CertApplicationListResult>({
    url: '/admin/exam/cert-application/list',
    params,
    showErrorMessage: false
  })
}

/** 报考记录详情 */
export function getCertApplicationDetail(id: number) {
  return request.get<CertApplication>({
    url: `/admin/exam/cert-application/detail/${id}`,
    showErrorMessage: false
  })
}

/** 审核报考记录（通过/驳回） */
export function reviewCertApplication(data: CertApplicationReviewPayload) {
  return request.post({
    url: '/admin/exam/cert-application/review',
    data,
    showErrorMessage: false
  })
}

/** 批量审核报名记录（通过/驳回） */
export function reviewCertApplicationBatch(data: CertApplicationReviewBatchPayload) {
  return request.post({
    url: '/admin/exam/cert-application/review-batch',
    data,
    showErrorMessage: false
  })
}

/** 报名审核 API 聚合导出 */
export const certApplicationApi = {
  getList: getCertApplicationList,
  getDetail: getCertApplicationDetail,
  review: reviewCertApplication,
  reviewBatch: reviewCertApplicationBatch
}
