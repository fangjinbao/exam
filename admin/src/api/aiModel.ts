/**
 * AI模型配置 API
 * 对接 /admin/sys/ai-model/* 接口（原型阶段由 mock/aiModel.ts 提供数据）
 * 统一关闭 http 层错误提示（showErrorMessage: false），由页面自行控制提示文案
 */

import request from '@/utils/http'

/** 模型服务商枚举 */
export type AiModelProvider = '通义千问' | 'DeepSeek' | '智谱' | 'OpenAI' | '其他'

/** 连接状态：正常 / 异常 / 未测试 */
export type AiModelConnStatus = 'normal' | 'error' | 'unknown'

/** AI模型配置实体（列表项，密钥为脱敏值） */
export interface AiModel {
  id: number
  /** 配置名称 */
  name: string
  /** 模型服务商 */
  provider: AiModelProvider
  /** 模型名称 */
  model: string
  /** 接口地址 */
  apiUrl: string
  /** 脱敏后的密钥（仅展示，不含完整密钥） */
  apiKeyMasked: string
  /** 最大并发数 */
  maxConcurrency?: number | null
  /** 超时时间（秒） */
  timeout?: number | null
  /** 启用状态：1 启用 / 0 停用，全局仅一项启用 */
  status: number
  /** 连接状态 */
  connStatus: AiModelConnStatus
  createTime?: string
  updateTime?: string
}

/** 新增/编辑入参（apiKey 为明文，编辑时留空表示不修改） */
export interface AiModelPayload {
  name: string
  provider: AiModelProvider | ''
  model: string
  apiUrl: string
  apiKey?: string
  maxConcurrency?: number | null
  timeout?: number | null
}

/** AI模型列表分页返回结构 */
export interface AiModelListResult {
  list: AiModel[]
  pagination: { page: number; pageSize: number; total: number }
}

/** 获取AI模型配置列表（分页） */
export function getAiModelList(params?: { page?: number; pageSize?: number }) {
  return request.get<AiModelListResult>({
    url: '/admin/sys/ai-model/list',
    params,
    showErrorMessage: false
  })
}

/** 新增AI模型配置 */
export function addAiModel(data: AiModelPayload) {
  return request.post({
    url: '/admin/sys/ai-model/add',
    data,
    showErrorMessage: false
  })
}

/** 更新AI模型配置 */
export function updateAiModel(data: AiModelPayload & { id: number }) {
  return request.put({
    url: '/admin/sys/ai-model/update',
    data,
    showErrorMessage: false
  })
}

/** 删除AI模型配置（当前启用项后端阻止） */
export function deleteAiModel(id: number) {
  return request.del({
    url: `/admin/sys/ai-model/delete/${id}`,
    showErrorMessage: false
  })
}

/** 切换启用（全局互斥，原启用项自动停用） */
export function enableAiModel(id: number) {
  return request.put({
    url: '/admin/sys/ai-model/enable',
    data: { id },
    showErrorMessage: false
  })
}

/** 连接测试，返回是否连接成功 */
export function testAiModel(id: number) {
  return request.post<{ success: boolean }>({
    url: '/admin/sys/ai-model/test',
    data: { id },
    showErrorMessage: false
  })
}

/** AI模型配置 API 聚合导出 */
export const aiModelApi = {
  getList: getAiModelList,
  add: addAiModel,
  update: updateAiModel,
  delete: deleteAiModel,
  enable: enableAiModel,
  test: testAiModel
}
