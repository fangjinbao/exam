/**
 * 考点管理 API
 * 对接 /admin/sys/exam-site/* 接口（原型阶段由 mock/examSite.ts 提供数据）
 * 统一关闭 http 层错误提示（showErrorMessage: false），由页面自行控制提示文案
 */

import request from '@/utils/http'

/** 考点实体 */
export interface ExamSite {
  id: number
  name: string
  address?: string
  capacity?: number | null
  contact?: string
  phone?: string
  status: number
  createTime?: string
  updateTime?: string
}

/** 考点列表分页返回结构 */
export interface ExamSiteListResult {
  list: ExamSite[]
  pagination: { page: number; pageSize: number; total: number }
}

/** 新增/编辑考点入参 */
export interface ExamSitePayload {
  name: string
  address: string
  capacity?: number | null
  contact?: string
  phone?: string
  status: number
}

/** 获取考点列表（分页），支持按名称模糊、状态筛选 */
export function getExamSiteList(params?: {
  keyword?: string
  status?: number | ''
  page?: number
  pageSize?: number
}) {
  return request.get<ExamSiteListResult>({
    url: '/admin/sys/exam-site/list',
    params,
    showErrorMessage: false
  })
}

/** 新增考点 */
export function addExamSite(data: ExamSitePayload) {
  return request.post({
    url: '/admin/sys/exam-site/add',
    data,
    showErrorMessage: false
  })
}

/** 更新考点 */
export function updateExamSite(data: ExamSitePayload & { id: number }) {
  return request.put({
    url: '/admin/sys/exam-site/update',
    data,
    showErrorMessage: false
  })
}

/** 更新考点状态（启用/停用） */
export function updateExamSiteStatus(id: number, status: number) {
  return request.put({
    url: '/admin/sys/exam-site/update-status',
    data: { id, status },
    showErrorMessage: false
  })
}

/** 删除考点（被考试引用时后端阻止） */
export function deleteExamSite(id: number) {
  return request.del({
    url: `/admin/sys/exam-site/delete/${id}`,
    showErrorMessage: false
  })
}

/** 批量删除考点（任一被考试引用时后端整体阻止） */
export function batchDeleteExamSites(ids: number[]) {
  return request.post({
    url: '/admin/sys/exam-site/batch-delete',
    data: { ids },
    showErrorMessage: false
  })
}

/** 考点 API 聚合导出 */
export const examSiteApi = {
  getList: getExamSiteList,
  add: addExamSite,
  update: updateExamSite,
  updateStatus: updateExamSiteStatus,
  delete: deleteExamSite,
  batchDelete: batchDeleteExamSites
}
