/**
 * 试卷管理 API
 * 对接 /admin/exam/paper/* 接口：列表、详情/预览、固定/随机试卷新增与编辑、AI 组卷方案、发布、删除。
 * 统一关闭 http 层错误提示（showErrorMessage: false），由页面自行控制提示文案。
 */

import request from '@/utils/http'

/** 试卷实体（列表项） */
export interface Paper {
  id: number
  name: string
  type: string // fixed | random
  status: string // draft | published
  totalScore: number
  questionCount: number
  suggestDuration: number
  knowledgeDistribution?: string | null
  /** 创建人用户 ID */
  createBy?: number | null
  /** 创建人姓名（后端关联查询下发） */
  createByName?: string
  /** 创建人所属单位（由创建人部门上溯到公司节点，后端实时派生） */
  createByOrgName?: string
  /** 可见范围 */
  visibleScope?: VisibleScope
  /** 共享权限级别 */
  shareLevel?: ShareLevel
  /** 当前用户是否可管理（编辑/发布/删除），后端计算下发 */
  canManage?: boolean
  /** 当前用户是否可修改共享设置（仅创建人与超管） */
  canEditShare?: boolean
  createTime?: string
  updateTime?: string
}

/** 可见范围：仅自己 / 本部门（含子部门）/ 本公司 / 全部组织 */
export type VisibleScope = 'self' | 'dept' | 'company' | 'all'

/** 共享权限级别：可管理（编辑/发布/删除）/ 可查看（只读） */
export type ShareLevel = 'manage' | 'view'

/** 可见范围下拉选项（与后端枚举一致） */
export const VISIBLE_SCOPE_OPTIONS: { label: string; value: VisibleScope }[] = [
  { label: '仅自己', value: 'self' },
  { label: '本部门', value: 'dept' },
  { label: '本公司', value: 'company' },
  { label: '全部组织', value: 'all' }
]

/** 共享权限级别选项 */
export const SHARE_LEVEL_OPTIONS: { label: string; value: ShareLevel }[] = [
  { label: '可管理', value: 'manage' },
  { label: '可查看', value: 'view' }
]

/** 共享设置入参（新增/编辑试卷时随表单一起提交） */
export interface PaperSharePayload {
  visibleScope?: VisibleScope
  shareLevel?: ShareLevel
}

/**
 * 固定试卷题目项
 *
 * 不含 sortNo：卷面顺序由服务端按题型重排后落库，提交时多传该字段会被
 * 全局 forbidNonWhitelisted 校验拒绝。题目相对次序用数组顺序表达。
 */
export interface PaperQuestionItem {
  questionId: number
  score: number
}

/** 固定试卷题目项详情（预览） */
/** 材料题下的一个小题（卷面预览用） */
export interface PaperChildQuestion {
  id: number
  stem: string
  stemText?: string | null
  questionType: string
  options: string | null
  answer: string
  analysis: string | null
  /** 小题难度，保存时未单独指定则继承材料题 */
  difficulty: string
  /** 小题分值，取小题的建议分（与取卷展开一致） */
  score: number
}

export interface PaperQuestionDetail extends PaperQuestionItem {
  id: number
  stem: string
  /** 题干纯文本镜像，按纯文本展示时优先用它 */
  stemText?: string | null
  /** 小题数：仅材料题有值，结构预览用于标注「N 小问」 */
  childrenCount?: number
  /** 小题列表：仅材料题非空，卷面预览按 sortNo 顺序排在材料之后 */
  children?: PaperChildQuestion[]
  questionType: string
  options: string | null
  answer: string
  /** 答案解析，教师版预览展示；题目未录解析时为空 */
  analysis: string | null
  difficulty: string
}

/** 随机试卷抽题规则项 */
export interface PaperRuleItem {
  questionType: string
  difficulty: string
  knowledgePointId: number
  drawCount: number
  scorePerQuestion: number
}

/** 随机试卷抽题规则详情（含可用题量） */
export interface PaperRuleDetail extends PaperRuleItem {
  id: number
  knowledgePointName: string
  availableCount: number
}

/** 试卷详情 */
export interface PaperDetail extends Paper {
  bankIds: number[]
  bankNames: string[]
  /** 各题库抽题权重（与 bankIds 同序；随机卷有效，固定卷恒 0） */
  bankWeights?: number[]
  questions: PaperQuestionDetail[]
  rules: PaperRuleDetail[]
}

/** 分页返回结构 */
export interface PaperListResult {
  list: Paper[]
  pagination: { page: number; pageSize: number; total: number }
}

/** 新增/编辑固定试卷入参 */
export interface FixedPaperPayload extends PaperSharePayload {
  name: string
  suggestDuration: number
  bankIds: number[]
  items: PaperQuestionItem[]
  knowledgeDistribution?: string
}

/**
 * 随机试卷的题库范围项（题库 + 抽题权重）
 *
 * 权重按题库设定，每条抽题规则的数量都按此比例拆到各库，
 * 避免题目多的库被抽光、其余库几乎不出题。各库权重合计须为 1。
 */
export interface PaperBankWeight {
  bankId: number
  weight: number
}

/** 新增/编辑随机试卷入参 */
export interface RandomPaperPayload extends PaperSharePayload {
  name: string
  suggestDuration: number
  banks: PaperBankWeight[]
  rules: PaperRuleItem[]
}

/** AI 组卷方案结果 */
export interface AiComposeResult {
  items: Array<{
    questionId: number
    stem: string
    questionType: string
    difficulty: string
    score: number
  }>
  totalScore: number
  count: number
}

/** 获取试卷列表（分页；后端按共享可见范围过滤） */
export function getPaperList(params?: {
  keyword?: string
  type?: string
  status?: string
  visibleScope?: VisibleScope | ''
  onlyMine?: number
  page?: number
  pageSize?: number
}) {
  return request.get<PaperListResult>({
    url: '/admin/exam/paper/list',
    params,
    showErrorMessage: false
  })
}

/** 试卷详情/预览 */
export function getPaperDetail(id: number) {
  return request.get<PaperDetail>({
    url: `/admin/exam/paper/detail/${id}`,
    showErrorMessage: false
  })
}

/** 新增固定试卷（手动/AI 组卷保存） */
export function addFixedPaper(data: FixedPaperPayload) {
  return request.post({ url: '/admin/exam/paper/fixed', data, showErrorMessage: false })
}

/** 新增随机试卷 */
export function addRandomPaper(data: RandomPaperPayload) {
  return request.post({ url: '/admin/exam/paper/random', data, showErrorMessage: false })
}

/** 抽题规则筛选条件（只含三个维度，用于探测可用题量） */
export interface RuleCondition {
  questionType: string
  difficulty: string
  knowledgePointId: number
}

/** 查询抽题规则可用题量（编辑页实时探测，不落库） */
export function fetchRuleAvailability(data: { bankIds: number[]; rules: RuleCondition[] }) {
  return request.post<{ counts: number[]; maxDistinct: number }>({
    url: '/admin/exam/paper/rule-availability',
    data,
    showErrorMessage: false
  })
}

/** AI 组卷方案推荐（不落库） */
export function aiComposePaper(data: {
  bankIds: number[]
  totalScore: number
  suggestDuration?: number
  knowledgeDistribution?: string
}) {
  return request.post<AiComposeResult>({
    url: '/admin/exam/paper/ai-compose',
    data,
    showErrorMessage: false
  })
}

/** 编辑固定试卷（仅草稿） */
export function updateFixedPaper(data: FixedPaperPayload & { id: number }) {
  return request.put({ url: '/admin/exam/paper/fixed', data, showErrorMessage: false })
}

/** 编辑随机试卷（仅草稿） */
export function updateRandomPaper(data: RandomPaperPayload & { id: number }) {
  return request.put({ url: '/admin/exam/paper/random', data, showErrorMessage: false })
}

/** 发布试卷（草稿→已发布） */
export function publishPaper(id: number) {
  return request.post({ url: `/admin/exam/paper/publish/${id}`, showErrorMessage: false })
}

/**
 * 生成随机试卷题目（按抽题规则抽取并固化为卷面）
 *
 * 对已生成的卷再次调用即重新生成，会覆盖含手工调整在内的全部题目，
 * 调用方须先向用户确认。
 */
export function generateRandomPaper(id: number) {
  return request.post<{ questionCount: number; totalScore: number }>({
    url: `/admin/exam/paper/random/${id}/generate`,
    showErrorMessage: false
  })
}

/** 删除试卷 */
export function deletePaper(id: number) {
  return request.del({ url: `/admin/exam/paper/delete/${id}`, showErrorMessage: false })
}

/** 批量删除试卷 */
export function batchDeletePapers(ids: number[]) {
  return request.post({
    url: '/admin/exam/paper/batch-delete',
    data: { ids },
    showErrorMessage: false
  })
}

/**
 * 修改试卷共享设置（仅创建人/超管）
 * 与编辑接口分离：已发布试卷不可编辑内容，但共享范围仍可调整。
 */
export function updatePaperShare(data: { id: number } & PaperSharePayload) {
  return request.put({ url: '/admin/exam/paper/share', data, showErrorMessage: false })
}

/** 按筛选条件导出试卷清单（全量不分页） */
export function exportPapers(params?: {
  keyword?: string
  type?: string
  status?: string
  visibleScope?: VisibleScope | ''
  onlyMine?: number
}) {
  return request.get<Paper[]>({
    url: '/admin/exam/paper/export',
    params,
    showErrorMessage: false
  })
}

/** 试卷 API 聚合导出 */
export const paperApi = {
  updateShare: updatePaperShare,
  getList: getPaperList,
  getDetail: getPaperDetail,
  addFixed: addFixedPaper,
  addRandom: addRandomPaper,
  aiCompose: aiComposePaper,
  ruleAvailability: fetchRuleAvailability,
  updateFixed: updateFixedPaper,
  updateRandom: updateRandomPaper,
  generateRandom: generateRandomPaper,
  publish: publishPaper,
  delete: deletePaper,
  batchDelete: batchDeletePapers,
  export: exportPapers
}
