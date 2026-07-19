/**
 * 外部考生管理 API
 * 对接 /admin/exam/external-candidate/* 接口（原型阶段由 mock/externalCandidate.ts 提供数据）
 * 统一关闭 http 层错误提示（showErrorMessage: false），由页面自行控制提示文案
 */

import request from '@/utils/http'

/** 外部考生实体 */
export interface ExternalCandidate {
  id: number
  name: string
  orgId: number
  orgName?: string
  idCard?: string
  phone: string
  email?: string
  status: number
  createTime?: string
}

/** 外部考生列表分页返回结构 */
export interface ExternalCandidateListResult {
  list: ExternalCandidate[]
  pagination: { page: number; pageSize: number; total: number }
}

/** 新增/编辑外部考生入参（password 仅新增可选传入，留空则后端取手机号后 6 位） */
export interface ExternalCandidatePayload {
  name: string
  orgId: number
  idCard?: string
  phone: string
  email?: string
  password?: string
}

/** 批量导入行数据（所属单位仍用单位名称文本，后端按名称匹配启用单位） */
export interface ImportCandidateRow {
  name: string
  company: string
  idCard?: string
  phone: string
  email?: string
}

/** 批量导入结果（逐行导入：成功入库、失败跳过并返回行号与原因） */
export interface ImportResult {
  success: number
  failed: number
  errors: { row: number; reason: string }[]
}

/** 获取外部考生列表（分页），支持按姓名/手机号模糊、所属单位与账号状态精确筛选 */
export function getExternalCandidateList(params?: {
  name?: string
  orgId?: number
  phone?: string
  status?: number | ''
  page?: number
  pageSize?: number
}) {
  return request.get<ExternalCandidateListResult>({
    url: '/admin/exam/external-candidate/list',
    params,
    showErrorMessage: false
  })
}

/** 新增外部考生（成功后系统生成考试账号） */
export function addExternalCandidate(data: ExternalCandidatePayload) {
  return request.post({
    url: '/admin/exam/external-candidate/add',
    data,
    showErrorMessage: false
  })
}

/** 更新外部考生（不含密码，改密走 reset-password） */
export function updateExternalCandidate(data: Omit<ExternalCandidatePayload, 'password'> & { id: number }) {
  return request.put({
    url: '/admin/exam/external-candidate/update',
    data,
    showErrorMessage: false
  })
}

/** 更新外部考生账号状态（启用/停用） */
export function updateExternalCandidateStatus(id: number, status: number) {
  return request.put({
    url: '/admin/exam/external-candidate/update-status',
    data: { id, status },
    showErrorMessage: false
  })
}

/** 重置外部考生考试账号密码，返回重置后的默认密码 */
export function resetExternalCandidatePassword(id: number) {
  return request.put<{ password: string }>({
    url: '/admin/exam/external-candidate/reset-password',
    data: { id },
    showErrorMessage: false
  })
}

/** 批量导入外部考生（逐行导入），返回成功/失败数量与失败行明细 */
export function importExternalCandidates(rows: ImportCandidateRow[]) {
  return request.post<ImportResult>({
    url: '/admin/exam/external-candidate/import',
    data: { rows },
    showErrorMessage: false
  })
}

/** 导出外部考生（按当前筛选，全量不分页），返回全部匹配记录供前端生成表格 */
export function exportExternalCandidates(params?: {
  name?: string
  orgId?: number
  phone?: string
  status?: number | ''
}) {
  return request.get<ExternalCandidate[]>({
    url: '/admin/exam/external-candidate/export',
    params,
    showErrorMessage: false
  })
}

/** 删除外部考生（已分配考试时后端阻止） */
export function deleteExternalCandidate(id: number) {
  return request.del({
    url: `/admin/exam/external-candidate/delete/${id}`,
    showErrorMessage: false
  })
}

/** 批量删除外部考生（任一已分配考试时后端整体阻止） */
export function batchDeleteExternalCandidates(ids: number[]) {
  return request.post({
    url: '/admin/exam/external-candidate/batch-delete',
    data: { ids },
    showErrorMessage: false
  })
}

/** 外部考生 API 聚合导出 */
export const externalCandidateApi = {
  getList: getExternalCandidateList,
  add: addExternalCandidate,
  update: updateExternalCandidate,
  updateStatus: updateExternalCandidateStatus,
  resetPassword: resetExternalCandidatePassword,
  import: importExternalCandidates,
  export: exportExternalCandidates,
  delete: deleteExternalCandidate,
  batchDelete: batchDeleteExternalCandidates
}
