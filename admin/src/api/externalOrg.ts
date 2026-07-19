/**
 * 外部单位管理 API
 * 对接 /admin/exam/external-org/* 接口
 * 统一关闭 http 层错误提示（showErrorMessage: false），由页面自行控制提示文案
 */

import request from '@/utils/http'

/** 外部单位实体 */
export interface ExternalOrg {
  id: number
  name: string
  code?: string
  contact?: string
  phone?: string
  address?: string
  remark?: string
  status: number
  createTime?: string
}

/** 外部单位列表分页返回结构 */
export interface ExternalOrgListResult {
  list: ExternalOrg[]
  pagination: { page: number; pageSize: number; total: number }
}

/** 新增/编辑外部单位入参 */
export interface ExternalOrgPayload {
  name: string
  code?: string
  contact?: string
  phone?: string
  address?: string
  remark?: string
  status: number
}

/** 外部单位下拉选项（供外部考生所属单位选择） */
export interface ExternalOrgOption {
  id: number
  name: string
}

/** 批量导入行数据（按模板中文表头解析后的字段） */
export interface ImportOrgRow {
  name: string
  code?: string
  contact?: string
  phone?: string
  address?: string
  remark?: string
}

/** 批量导入结果（逐行导入：成功入库、失败跳过并返回行号与原因） */
export interface ImportResult {
  success: number
  failed: number
  errors: { row: number; reason: string }[]
}

/** 获取外部单位列表（分页），keyword 同时模糊匹配单位名称/编码，status 精确 */
export function getExternalOrgList(params?: {
  keyword?: string
  status?: number | ''
  page?: number
  pageSize?: number
}) {
  return request.get<ExternalOrgListResult>({
    url: '/admin/exam/external-org/list',
    params,
    showErrorMessage: false
  })
}

/** 新增外部单位 */
export function addExternalOrg(data: ExternalOrgPayload) {
  return request.post({
    url: '/admin/exam/external-org/add',
    data,
    showErrorMessage: false
  })
}

/** 更新外部单位 */
export function updateExternalOrg(data: ExternalOrgPayload & { id: number }) {
  return request.put({
    url: '/admin/exam/external-org/update',
    data,
    showErrorMessage: false
  })
}

/** 更新外部单位状态（启用/停用） */
export function updateExternalOrgStatus(id: number, status: number) {
  return request.put({
    url: '/admin/exam/external-org/update-status',
    data: { id, status },
    showErrorMessage: false
  })
}

/** 删除外部单位（被外部考生引用时后端阻止） */
export function deleteExternalOrg(id: number) {
  return request.del({
    url: `/admin/exam/external-org/delete/${id}`,
    showErrorMessage: false
  })
}

/** 批量删除外部单位（任一被外部考生引用时后端整体阻止） */
export function batchDeleteExternalOrgs(ids: number[]) {
  return request.post({
    url: '/admin/exam/external-org/batch-delete',
    data: { ids },
    showErrorMessage: false
  })
}

/** 获取启用状态的外部单位下拉选项 */
export function getExternalOrgOptions() {
  return request.get<ExternalOrgOption[]>({
    url: '/admin/exam/external-org/options',
    showErrorMessage: false
  })
}

/** 批量导入外部单位（逐行导入），返回成功/失败数量与失败行明细 */
export function importExternalOrgs(rows: ImportOrgRow[]) {
  return request.post<ImportResult>({
    url: '/admin/exam/external-org/import',
    data: { rows },
    showErrorMessage: false
  })
}

/** 导出外部单位（按当前筛选，全量不分页），返回全部匹配记录供前端生成表格 */
export function exportExternalOrgs(params?: { keyword?: string; status?: number | '' }) {
  return request.get<ExternalOrg[]>({
    url: '/admin/exam/external-org/export',
    params,
    showErrorMessage: false
  })
}

/** 外部单位 API 聚合导出 */
export const externalOrgApi = {
  getList: getExternalOrgList,
  add: addExternalOrg,
  update: updateExternalOrg,
  updateStatus: updateExternalOrgStatus,
  delete: deleteExternalOrg,
  batchDelete: batchDeleteExternalOrgs,
  getOptions: getExternalOrgOptions,
  import: importExternalOrgs,
  export: exportExternalOrgs
}
