import request from '@/utils/http'

/** 问题类型数据结构 */
export interface IssueType {
  /** 主键 ID */
  id: number
  /** 类型名称 */
  name: string
  /** 默认审核人 ID（可为空） */
  auditorId: number | null
  /** 默认审核人姓名（展示用） */
  auditorName: string
  /** 排序值，数字越小越靠前 */
  orderNum: number
  /** 状态：1=启用 0=停用 */
  status: number
  /** 创建时间 */
  createTime: string
}

/** 审核人候选项 */
export interface IssueTypeQuery {
  /** 类型名称（模糊搜索） */
  name?: string
  /** 页码 */
  page?: number
  /** 每页条数 */
  pageSize?: number
}

/** 分页列表返回结构 */
export interface IssueTypeListResult {
  list: IssueType[]
  pagination: { page: number; pageSize: number; total: number }
}

/** 新增/编辑提交数据 */
export interface IssueTypePayload {
  id?: number
  name: string
  auditorId?: number | null
  orderNum?: number
  status?: number
}

/**
 * 获取问题类型列表（分页）
 * GET /admin/sys/issue-type/list
 */
export function getIssueTypeList(params?: IssueTypeQuery) {
  return request.get<IssueTypeListResult>({
    url: '/admin/sys/issue-type/list',
    params
  })
}

/**
 * 新增问题类型
 * POST /admin/sys/issue-type/add
 */
export function addIssueType(data: IssueTypePayload) {
  return request.post<IssueType>({
    url: '/admin/sys/issue-type/add',
    data
  })
}

/**
 * 更新问题类型
 * PUT /admin/sys/issue-type/update
 */
export function updateIssueType(data: IssueTypePayload) {
  return request.put<IssueType>({
    url: '/admin/sys/issue-type/update',
    data
  })
}

/**
 * 删除问题类型
 * DELETE /admin/sys/issue-type/delete/:id
 */
export function deleteIssueType(id: number) {
  return request.del({
    url: `/admin/sys/issue-type/delete/${id}`
  })
}

/**
 * 切换问题类型状态
 * PUT /admin/sys/issue-type/update-status
 */
export function updateIssueTypeStatus(id: number, status: number) {
  return request.put<IssueType>({
    url: '/admin/sys/issue-type/update-status',
    data: { id, status }
  })
}
