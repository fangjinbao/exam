/**
 * 参数配置 API
 * 对接 /admin/sys/param-config/* 接口（原型阶段由 mock/paramConfig.ts 提供数据）
 * 统一关闭 http 层错误提示（showErrorMessage: false），由页面自行控制提示文案
 */

import request from '@/utils/http'

/** 参数配置实体 */
export interface ParamConfig {
  id: number
  /** 参数名称 */
  name: string
  /** 参数值（统一以字符串存储） */
  value: string
  /** 参数说明 */
  description: string
  /** 参数值类型，如 int */
  valueType: string
  /** 允许最小值（int 类型） */
  min?: number
  /** 允许最大值（int 类型） */
  max?: number
  updateTime?: string
}

/** 参数配置列表分页返回结构 */
export interface ParamConfigListResult {
  list: ParamConfig[]
  pagination: { page: number; pageSize: number; total: number }
}

/** 获取参数配置列表（分页） */
export function getParamConfigList(params?: { page?: number; pageSize?: number }) {
  return request.get<ParamConfigListResult>({
    url: '/admin/sys/param-config/list',
    params,
    showErrorMessage: false
  })
}

/** 更新参数值（超出预设范围时后端阻止） */
export function updateParamConfig(id: number, value: string) {
  return request.put({
    url: '/admin/sys/param-config/update',
    data: { id, value },
    showErrorMessage: false
  })
}

/** 参数配置 API 聚合导出 */
export const paramConfigApi = {
  getList: getParamConfigList,
  update: updateParamConfig
}
