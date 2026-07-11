/**
 * 操作日志 API
 * 对接 /admin/sys/operation-log/* 接口（原型阶段由 mock/operationLog.ts 提供数据）
 * 操作日志仅支持查看，无新增/编辑/删除
 * 统一关闭 http 层错误提示（showErrorMessage: false），由页面自行控制提示文案
 */

import request from '@/utils/http'

/** 操作日志实体 */
export interface OperationLogRecord {
  id: number
  /** 操作人姓名 */
  operator: string
  /** 操作类型：新增 / 编辑 / 删除 / 登录 / 其他 */
  type: string
  /** 操作对象 */
  target: string
  /** 操作内容描述 */
  content: string
  /** 操作时间 YYYY-MM-DD HH:mm:ss */
  operateTime: string
  /** 来源网络地址 */
  sourceIp: string
}

/** 操作日志查询参数 */
export interface OperationLogQuery {
  /** 操作人（模糊） */
  operator?: string
  /** 操作类型 */
  type?: string
  /** 起始日期 YYYY-MM-DD */
  startTime?: string
  /** 结束日期 YYYY-MM-DD */
  endTime?: string
  page?: number
  pageSize?: number
}

/** 操作日志列表分页返回结构 */
export interface OperationLogListResult {
  list: OperationLogRecord[]
  pagination: { page: number; pageSize: number; total: number }
}

/** 获取操作日志列表（分页） */
export function getOperationLogList(params?: OperationLogQuery) {
  return request.get<OperationLogListResult>({
    url: '/admin/sys/operation-log/list',
    params,
    showErrorMessage: false
  })
}

/** 操作日志 API 聚合导出 */
export const operationLogApi = {
  getList: getOperationLogList
}
