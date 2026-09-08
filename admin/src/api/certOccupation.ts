/**
 * 鉴定工种管理 API
 * 对接 /admin/exam/cert-occupation/* 接口：工种树、详情、增删改、状态更新
 * 统一关闭 http 层错误提示（showErrorMessage: false），由页面自行控制提示文案
 *
 * 级别有两套写法，按场景选：
 * - 工种的 add/update 带 levels 整组提交，服务端全量替换（一次配齐整套分级）
 * - level/add、level/update、level/delete 单条操作（只动一级）
 * 只改一级时必须用单条接口：整组提交会把未提交的其他级别当作已删除。
 */

import request from '@/utils/http'

/** 鉴定级别（树形表格里工种的子行） */
export interface CertOccupationLevel {
  id?: number
  occupationId?: number
  name: string
  orderNum?: number
  description?: string | null
}

/** 鉴定工种（树形表格的父行） */
export interface CertOccupation {
  id: number
  name: string
  code: string
  description?: string | null
  orderNum: number
  status: number // 1=启用 0=停用
  /** 级别数量（后端直接给，列表不必数 children） */
  levelCount: number
  /** 该工种下的级别；字段名为 children 以直接对接 ElTable 的 tree-props */
  children: CertOccupationLevel[]
  createTime?: string
  updateTime?: string
}

/** 新增/编辑工种入参 */
export interface CertOccupationPayload {
  name: string
  code?: string
  description?: string
  orderNum?: number
  status?: number
  levels?: CertOccupationLevel[]
}

/**
 * 获取鉴定工种树（工种为父行、级别为 children）
 * 不分页：工种是基础数据，树形表格需一次拿全才能正确展开
 */
export function getCertOccupationTree(params?: { keyword?: string; status?: number | '' }) {
  return request.get<CertOccupation[]>({
    url: '/admin/exam/cert-occupation/tree',
    params,
    showErrorMessage: false
  })
}

/** 工种详情（含级别），供编辑回填 */
export function getCertOccupationDetail(id: number) {
  return request.get<CertOccupation & { levels: CertOccupationLevel[] }>({
    url: `/admin/exam/cert-occupation/detail/${id}`,
    showErrorMessage: false
  })
}

/** 新增工种（连带创建级别） */
export function addCertOccupation(data: CertOccupationPayload) {
  return request.post({ url: '/admin/exam/cert-occupation/add', data, showErrorMessage: false })
}

/** 更新工种（级别整组替换） */
export function updateCertOccupation(data: CertOccupationPayload & { id: number }) {
  return request.put({ url: '/admin/exam/cert-occupation/update', data, showErrorMessage: false })
}

/** 更新工种状态（启用/停用） */
export function updateCertOccupationStatus(id: number, status: number) {
  return request.put({
    url: '/admin/exam/cert-occupation/update-status',
    data: { id, status },
    showErrorMessage: false
  })
}

/** 删除工种（其级别随之删除） */
export function deleteCertOccupation(id: number) {
  return request.del({
    url: `/admin/exam/cert-occupation/delete/${id}`,
    showErrorMessage: false
  })
}

/** 批量删除工种 */
export function batchDeleteCertOccupation(ids: number[]) {
  return request.post({
    url: '/admin/exam/cert-occupation/batch-delete',
    data: { ids },
    showErrorMessage: false
  })
}

/** 单独新增级别入参 */
export interface CertLevelAddPayload {
  occupationId: number
  name: string
  orderNum?: number
  description?: string
}

/** 单独编辑级别入参（不含 occupationId：级别不支持改挂到别的工种下） */
export interface CertLevelUpdatePayload {
  id: number
  name: string
  orderNum?: number
  description?: string
}

/**
 * 单独新增一个级别（给已有工种补一级）
 * 与工种弹窗里的整组提交并存，排序号留空时排到该工种末尾
 */
export function addCertLevel(data: CertLevelAddPayload) {
  return request.post({
    url: '/admin/exam/cert-occupation/level/add',
    data,
    showErrorMessage: false
  })
}

/**
 * 单独编辑一个级别
 * 不走工种的整组替换：那会把未提交的其他级别当作已删除
 */
export function updateCertLevel(data: CertLevelUpdatePayload) {
  return request.put({
    url: '/admin/exam/cert-occupation/level/update',
    data,
    showErrorMessage: false
  })
}

/** 单独删除一个级别 */
export function deleteCertLevel(id: number) {
  return request.del({
    url: `/admin/exam/cert-occupation/level/delete/${id}`,
    showErrorMessage: false
  })
}

/** 鉴定工种 API 聚合导出 */
export const certOccupationApi = {
  getTree: getCertOccupationTree,
  getDetail: getCertOccupationDetail,
  add: addCertOccupation,
  update: updateCertOccupation,
  updateStatus: updateCertOccupationStatus,
  delete: deleteCertOccupation,
  batchDelete: batchDeleteCertOccupation,
  addLevel: addCertLevel,
  updateLevel: updateCertLevel,
  deleteLevel: deleteCertLevel
}
