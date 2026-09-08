/**
 * 题目管理 API
 * 对接 /admin/exam/question/* 接口
 * 统一关闭 http 层错误提示（showErrorMessage: false），由页面自行控制提示文案
 */

import request from '@/utils/http'

/** 题目实体 */
export interface Question {
  id: number
  /** 题干（富文本 HTML） */
  stem: string
  /** 题干纯文本镜像（搜索/列表展示用；存量数据由迁移回填） */
  stemText?: string | null
  /** 题型（字典 question_type 的 value：single/multiple/judge/blank/qa/essay/composite） */
  type: string
  /** 选项（JSON 数组字符串，兼容旧的一行一个纯文本；主观题为空） */
  options?: string | null
  /** 材料题 ID：非空表示这是某道材料题下的小题 */
  parentId?: number | null
  /** 小题在材料题内的排序 */
  sortNo?: number
  /** 材料题的小题数量（列表带出，用于展示「共 N 小问」） */
  childrenCount?: number
  /** 材料题的小题列表（仅详情接口带出） */
  children?: Question[]
  /** 标准答案 */
  answer: string
  /** 答案解析 */
  analysis?: string | null
  /** 难度（字典 difficulty 的 value：easy/medium/hard） */
  difficulty: string
  /** 所属知识点 ID 列表（多对多，可为空） */
  knowledgePointIds: number[]
  /** 所属知识点名称（顿号拼接，列表带出） */
  knowledgePointNames?: string | null
  /** 所属题库 ID */
  questionBankId?: number | null
  /** 分值（必填，正数，最多 2 位小数） */
  suggestedScore: number
  /** 状态：formal 正式 / pending 待审 */
  status: string
  /** 退回原因 */
  rejectReason?: string | null
  createTime?: string
  updateTime?: string
}

/** 题目列表分页返回结构 */
export interface QuestionListResult {
  list: Question[]
  pagination: { page: number; pageSize: number; total: number }
}

/** 新增/编辑题目入参 */
export interface QuestionPayload {
  stem: string
  type: string
  options?: string
  answer: string
  analysis?: string
  difficulty: string
  /** 所属知识点 ID 列表（多对多，可选） */
  knowledgePointIds?: number[]
  questionBankId?: number
  /** 分值（必填，正数，最多 2 位小数） */
  suggestedScore: number
}

/** 题目列表查询参数 */
export interface QuestionListParams {
  keyword?: string
  type?: string
  difficulty?: string
  knowledgePointId?: number
  questionBankId?: number
  status?: string
  page?: number
  pageSize?: number
}

/** 导入题目单行（题型/难度用中文名称，知识点名称顿号/逗号分隔） */
export interface ImportQuestionRow {
  stem: string
  typeName: string
  options?: string
  answer: string
  analysis?: string
  difficultyName: string
  suggestedScore: string
  knowledgePointNames?: string
}

/** 导出题目单行（题型/难度已转中文名称） */
export interface ExportQuestionRow {
  stem: string
  typeName: string
  options: string
  answer: string
  analysis: string
  difficultyName: string
  suggestedScore: number
  knowledgePointNames: string
}

/** 批量导入结果（逐行导入：成功入库、失败跳过并返回行号与原因） */
export interface ImportResult {
  success: number
  failed: number
  errors: { row: number; reason: string }[]
}

/** 材料题下的一个小题 */
export interface CompositeChildPayload {
  /** 既有小题 ID；不传表示新增。后端据此原地更新以保住已有作答记录 */
  id?: number
  type: string
  stem: string
  options?: string
  answer: string
  analysis?: string
  difficulty: string
  suggestedScore: number
}

/** 保存材料题入参（材料题字段 + 小题列表；材料题分值由小题之和派生，不必传） */
export interface CompositePayload {
  id?: number
  /** 共享材料（富文本 HTML） */
  stem: string
  analysis?: string
  difficulty: string
  knowledgePointIds?: number[]
  questionBankId?: number
  children: CompositeChildPayload[]
}

/**
 * 保存材料题及其小题（新增与编辑同一入口）
 *
 * 小题按 id 差分：带 id 的原地更新、不带的新建、库中多出的删除。
 * 后端会在删除前校验作答记录，已被作答的小题不允许删除。
 */
export function saveComposite(data: CompositePayload) {
  return request.post({
    url: '/admin/exam/question/composite/save',
    data,
    showErrorMessage: false
  })
}

/** 获取题目列表（分页），支持题干模糊 + 题型/难度/知识点/题库/状态筛选 */
export function getQuestionList(params?: QuestionListParams) {
  return request.get<QuestionListResult>({
    url: '/admin/exam/question/list',
    params,
    showErrorMessage: false
  })
}

/** 题目详情 */
export function getQuestionDetail(id: number) {
  return request.get<Question>({
    url: `/admin/exam/question/detail/${id}`,
    showErrorMessage: false
  })
}

/** 新增题目 */
export function addQuestion(data: QuestionPayload) {
  return request.post({
    url: '/admin/exam/question/add',
    data,
    showErrorMessage: false
  })
}

/** 更新题目 */
export function updateQuestion(data: QuestionPayload & { id: number }) {
  return request.put({
    url: '/admin/exam/question/update',
    data,
    showErrorMessage: false
  })
}

/** 删除题目（被试卷引用时后端阻止） */
export function deleteQuestion(id: number) {
  return request.del({
    url: `/admin/exam/question/delete/${id}`,
    showErrorMessage: false
  })
}

/** 批量删除题目 */
export function batchDeleteQuestions(ids: number[]) {
  return request.post({
    url: '/admin/exam/question/batch-delete',
    data: { ids },
    showErrorMessage: false
  })
}

/** 批量导入题目到指定题库（逐行导入，成功入库、失败跳过并返回明细） */
export function importQuestions(questionBankId: number, rows: ImportQuestionRow[]) {
  return request.post<ImportResult>({
    url: '/admin/exam/question/import',
    data: { questionBankId, rows },
    showErrorMessage: false
  })
}

/** 按题库导出全部题目（全量不分页） */
export function exportQuestions(questionBankId: number) {
  return request.get<ExportQuestionRow[]>({
    url: '/admin/exam/question/export',
    params: { questionBankId },
    showErrorMessage: false
  })
}

/** 题目 API 聚合导出 */
export const questionApi = {
  getList: getQuestionList,
  getDetail: getQuestionDetail,
  add: addQuestion,
  update: updateQuestion,
  delete: deleteQuestion,
  batchDelete: batchDeleteQuestions,
  import: importQuestions,
  export: exportQuestions,
  saveComposite
}
