/**
 * 题库管理 API
 * 对接 /admin/exam/question-bank/* 接口
 * 统一关闭 http 层错误提示（showErrorMessage: false），由页面自行控制提示文案
 */

import request from '@/utils/http'

/** 题库实体 */
export interface QuestionBank {
  id: number
  name: string
  code: string
  description?: string | null
  status: number
  /** 该题库下题目总数（列表附带的统计字段） */
  questionCount: number
  /** 创建人用户 ID */
  createBy?: number | null
  /** 创建人姓名（后端关联查询） */
  createByName?: string
  /** 创建人所属单位（由创建人部门上溯到公司节点，后端实时派生） */
  createByOrgName?: string
  /** 可见范围 self=仅自己 dept=本部门 company=本公司 all=全部 */
  visibleScope?: VisibleScope
  /** 共享权限级别 manage=可管理 view=可查看 */
  shareLevel?: ShareLevel
  /** 当前用户是否可管理该题库（含题目增删改） */
  canManage?: boolean
  /** 当前用户是否可修改共享设置（仅创建人与超管） */
  canEditShare?: boolean
  createTime?: string
  updateTime?: string
}

/** 可见范围 */
export type VisibleScope = 'self' | 'dept' | 'company' | 'all'
/** 共享权限级别 */
export type ShareLevel = 'manage' | 'view'

/** 可见范围选项（下拉与展示共用） */
export const VISIBLE_SCOPE_OPTIONS: { label: string; value: VisibleScope }[] = [
  { label: '仅自己', value: 'self' },
  { label: '本部门', value: 'dept' },
  { label: '本公司', value: 'company' },
  { label: '全部组织', value: 'all' }
]

/** 权限级别选项 */
export const SHARE_LEVEL_OPTIONS: { label: string; value: ShareLevel }[] = [
  { label: '可管理', value: 'manage' },
  { label: '可查看', value: 'view' }
]

/** 题库列表分页返回结构 */
export interface QuestionBankListResult {
  list: QuestionBank[]
  pagination: { page: number; pageSize: number; total: number }
}

/** 新增/编辑题库入参（编码留空时后端自动生成） */
export interface QuestionBankPayload {
  name: string
  code?: string
  description?: string
  status: number
  /** 可见范围（仅创建人可改，后端二次校验） */
  visibleScope?: VisibleScope
  /** 权限级别（仅创建人可改，后端二次校验） */
  shareLevel?: ShareLevel
}

/** 导入题库单行（编码留空后端自动生成） */
export interface ImportQuestionBankRow {
  name: string
  code?: string
  description?: string
}

/** 批量导入结果（逐行导入：成功入库、失败跳过并返回行号与原因） */
export interface ImportResult {
  success: number
  failed: number
  errors: { row: number; reason: string }[]
}

/** 获取题库列表（分页），支持按名称模糊、状态筛选 */
export function getQuestionBankList(params?: {
  keyword?: string
  status?: number | ''
  /** 按可见范围筛选 */
  visibleScope?: VisibleScope | ''
  /** 仅看我创建的 */
  onlyMine?: 1 | ''
  page?: number
  pageSize?: number
}) {
  return request.get<QuestionBankListResult>({
    url: '/admin/exam/question-bank/list',
    params,
    showErrorMessage: false
  })
}

/** 获取题库详情（返回体含 canManage / canEditShare，用于前端按权限控制写操作） */
export function getQuestionBankDetail(id: number) {
  return request.get<QuestionBank>({
    url: `/admin/exam/question-bank/detail/${id}`,
    showErrorMessage: false
  })
}

/** 新增题库 */
export function addQuestionBank(data: QuestionBankPayload) {
  return request.post({
    url: '/admin/exam/question-bank/add',
    data,
    showErrorMessage: false
  })
}

/** 更新题库 */
export function updateQuestionBank(data: QuestionBankPayload & { id: number }) {
  return request.put({
    url: '/admin/exam/question-bank/update',
    data,
    showErrorMessage: false
  })
}

/** 删除题库（题库下有题目时后端阻止） */
export function deleteQuestionBank(id: number) {
  return request.del({
    url: `/admin/exam/question-bank/delete/${id}`,
    showErrorMessage: false
  })
}

/** 批量删除题库（任一题库下有题目时后端整体阻止） */
export function batchDeleteQuestionBanks(ids: number[]) {
  return request.post({
    url: '/admin/exam/question-bank/batch-delete',
    data: { ids },
    showErrorMessage: false
  })
}

/** 批量导入题库（逐行导入，成功入库、失败跳过并返回明细） */
export function importQuestionBanks(rows: ImportQuestionBankRow[]) {
  return request.post<ImportResult>({
    url: '/admin/exam/question-bank/import',
    data: { rows },
    showErrorMessage: false
  })
}

/** 按筛选条件导出题库（全量不分页） */
export function exportQuestionBanks(params?: {
  keyword?: string
  status?: number | ''
  visibleScope?: VisibleScope | ''
  onlyMine?: 1 | ''
}) {
  return request.get<QuestionBank[]>({
    url: '/admin/exam/question-bank/export',
    params,
    showErrorMessage: false
  })
}

/** 题库 API 聚合导出 */
export const questionBankApi = {
  getList: getQuestionBankList,
  detail: getQuestionBankDetail,
  add: addQuestionBank,
  update: updateQuestionBank,
  delete: deleteQuestionBank,
  batchDelete: batchDeleteQuestionBanks,
  import: importQuestionBanks,
  export: exportQuestionBanks
}
