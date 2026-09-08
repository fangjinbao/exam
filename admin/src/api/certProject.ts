/**
 * 鉴定项目管理 API
 *
 * 对接 /admin/exam/cert-project/* 接口：列表、详情、下拉、单位/部门下拉、增删改、状态更新
 * 统一关闭 http 层错误提示（showErrorMessage: false），由页面自行控制提示文案
 *
 * 名额不单独走接口：它没有独立于项目的生命周期，
 * 由项目的 add/update 带 quotas 整组提交，服务端全量替换。
 */

import request from '@/utils/http'

/** 名额分配行（deptId 可空，空表示名额分给整个单位） */
export interface CertProjectQuota {
  id?: number
  orgId: number
  orgName?: string
  deptId?: number | null
  deptName?: string
  quota: number
}

/** 鉴定项目实体（列表项） */
export interface CertProject {
  id: number
  name: string
  description?: string | null
  occupationId: number
  occupationName: string
  levelId: number
  levelName: string
  managerId: number
  managerName: string
  contactPhone: string
  applyDeadline: string
  startTime: string
  endTime: string
  applyCondition?: string | null
  /**
   * 启用状态，恒为 1
   *
   * 启停能力已下线，写入口已移除。保留字段是为读取存量数据（早期版本可能存出 0），
   * 界面不再展示、也不再提交它。停止各单位报名请用撤回。
   */
  status: number
  /**
   * 发布状态：unpublished 未发布 / published 已发布
   *
   * 本模块唯一的生命周期。已发布即锁定，编辑与删除都要求先撤回。
   */
  publishStatus: string
  /** 发布时间（未发布为空） */
  publishTime?: string | null
  /** 名额分配（仅详情接口返回） */
  quotas?: CertProjectQuota[]
  /** 创建人（列表按创建人隔离，超管 admin 可见全部） */
  createBy?: number | null
  createByName?: string
  /** 创建人所属单位（服务端从其部门上溯到公司节点得出，查不到为空串） */
  createByOrgName?: string
  createTime?: string
}

/** 鉴定项目列表分页返回结构 */
export interface CertProjectListResult {
  list: CertProject[]
  pagination: { page: number; pageSize: number; total: number }
}

/** 下拉选项（鉴定项目 / 部门通用 {id,name}） */
export interface IdNameOption {
  id: number
  name: string
}

/**
 * 单位树节点
 *
 * 单位是公司节点（集团公司/省公司/分公司），按原层级嵌套，
 * 叶子节点无 children 字段。
 */
export interface OrgTreeNode {
  id: number
  name: string
  type: string
  children?: OrgTreeNode[]
}

/** 新增/编辑鉴定项目入参 */
export interface CertProjectPayload {
  name: string
  occupationId: number
  levelId: number
  managerId: number
  contactPhone: string
  applyDeadline: string
  startTime: string
  endTime: string
  description?: string
  applyCondition?: string
  // 不含 status：启停已下线，服务端 DTO 也已移除该字段
  quotas?: CertProjectQuota[]
}

/** 获取鉴定项目列表（分页），支持按鉴定名称模糊、发布状态精确筛选 */
export function getCertProjectList(params?: {
  name?: string
  /** unpublished 未发布 / published 已发布 */
  publishStatus?: string
  page?: number
  pageSize?: number
}) {
  return request.get<CertProjectListResult>({
    url: '/admin/exam/cert-project/list',
    params,
    showErrorMessage: false
  })
}

/** 鉴定项目详情（含名额分配，供编辑回填） */
export function getCertProjectDetail(id: number) {
  return request.get<CertProject>({
    url: `/admin/exam/cert-project/detail/${id}`,
    showErrorMessage: false
  })
}

/** 报名按单位聚合的一行（同一单位的不同审核状态各占一行，前端自行合并） */
export interface CertProgressByOrg {
  orgId: number | null
  deptId: number | null
  status: 'pending' | 'approved' | 'rejected'
  _count: { _all: number }
}

/** 关联到本鉴定项目的考试 */
export interface CertProgressExam {
  id: number
  name: string
  status: string
  startTime: string
  endTime: string
  passScore: number
}

/** 鉴定项目阶段进展 */
export interface CertProjectProgress {
  project: CertProject
  byOrg: CertProgressByOrg[]
  byStatus: { status: 'pending' | 'approved' | 'rejected'; _count: { _all: number } }[]
  exams: CertProgressExam[]
}

/** 鉴定项目阶段进展（详情页用：报名/审核/考试各阶段汇总） */
export function getCertProjectProgress(id: number) {
  return request.get<CertProjectProgress>({
    url: `/admin/exam/cert-project/progress/${id}`,
    showErrorMessage: false
  })
}

/** 获取启用状态的鉴定项目下拉选项（供报考审核、证书发放等页面使用） */
export function getCertProjectOptions() {
  return request.get<IdNameOption[]>({
    url: '/admin/exam/cert-project/options',
    showErrorMessage: false
  })
}

/** 单位树（集团公司/省公司/分公司，供名额分配选单位） */
export function getOrgOptions() {
  return request.get<OrgTreeNode[]>({
    url: '/admin/exam/cert-project/org-options',
    showErrorMessage: false
  })
}

/** 某单位下的部门下拉（仅 type=部门；多数分公司下为空，故部门选填） */
export function getDeptOptions(orgId: number) {
  return request.get<IdNameOption[]>({
    url: `/admin/exam/cert-project/dept-options/${orgId}`,
    showErrorMessage: false
  })
}

/** 新增鉴定项目（连带创建名额行） */
export function addCertProject(data: CertProjectPayload) {
  return request.post({ url: '/admin/exam/cert-project/add', data, showErrorMessage: false })
}

/** 更新鉴定项目（名额整组替换） */
export function updateCertProject(data: CertProjectPayload & { id: number }) {
  return request.put({ url: '/admin/exam/cert-project/update', data, showErrorMessage: false })
}

/*
  此处原有 updateCertProjectStatus（启用/停用）。启停能力已下线，
  服务端 update-status 路由不再注册（真 404），故一并删除：
  留着会让后来人照它加按钮，然后撞 404。要停止报名请用 withdraw。
*/

/**
 * 发布鉴定项目（未发布→已发布，各单位从此可在「鉴定报名」中报人）
 *
 * 服务端校验：须已配名额、不可重复发布。
 * showErrorMessage:false —— 由页面照搬服务端文案提示，避免弹两次。
 */
export function publishCertProject(id: number) {
  return request.post({
    url: `/admin/exam/cert-project/publish/${id}`,
    showErrorMessage: false
  })
}

/** 撤回鉴定项目（已发布→未发布，仅无报名记录时可撤回） */
export function withdrawCertProject(id: number) {
  return request.post({
    url: `/admin/exam/cert-project/withdraw/${id}`,
    showErrorMessage: false
  })
}

/** 删除鉴定项目 */
export function deleteCertProject(id: number) {
  return request.del({ url: `/admin/exam/cert-project/delete/${id}`, showErrorMessage: false })
}

/** 鉴定项目 API 聚合导出 */
export const certProjectApi = {
  getList: getCertProjectList,
  getDetail: getCertProjectDetail,
  getOptions: getCertProjectOptions,
  getOrgOptions,
  publish: publishCertProject,
  withdraw: withdrawCertProject,
  getDeptOptions,
  add: addCertProject,
  update: updateCertProject,
  progress: getCertProjectProgress,
  delete: deleteCertProject
}
