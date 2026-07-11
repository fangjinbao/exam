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
  admissionNo: string
  company?: string
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

/** 新增/编辑外部考生入参 */
export interface ExternalCandidatePayload {
  name: string
  admissionNo: string
  company?: string
  idCard?: string
  phone: string
  email?: string
}

/** 获取外部考生列表（分页），支持按姓名/所属单位/准考证号模糊、账号状态筛选 */
export function getExternalCandidateList(params?: {
  name?: string
  company?: string
  admissionNo?: string
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

/** 更新外部考生（准考证号不可修改） */
export function updateExternalCandidate(data: ExternalCandidatePayload & { id: number }) {
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

/** 批量导入外部考生，传入按模板解析出的考生行数组，返回成功导入数量 */
export function importExternalCandidates(rows: ExternalCandidatePayload[]) {
  return request.post<{ count: number }>({
    url: '/admin/exam/external-candidate/import',
    data: { rows },
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

/** 外部考生 API 聚合导出 */
export const externalCandidateApi = {
  getList: getExternalCandidateList,
  add: addExternalCandidate,
  update: updateExternalCandidate,
  updateStatus: updateExternalCandidateStatus,
  resetPassword: resetExternalCandidatePassword,
  import: importExternalCandidates,
  delete: deleteExternalCandidate
}
