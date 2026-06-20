import request from '@/utils/http'

/** 基础配置数据结构 */
export interface BaseConfig {
  /** 系统名称 */
  sysName: string
  /** 系统Logo（图片地址或 base64） */
  sysLogo: string
  /** 系统描述 */
  sysDesc: string
  /** 默认时区 */
  timezone: string
  /** 日期格式 */
  dateFormat: string
}

/**
 * 获取系统基础配置
 * GET /admin/sys/base-config
 */
export function getBaseConfig() {
  return request.get<BaseConfig>({
    url: '/admin/sys/base-config'
  })
}

/**
 * 保存系统基础配置（整体覆盖）
 * PUT /admin/sys/base-config
 */
export function updateBaseConfig(data: BaseConfig) {
  return request.put<BaseConfig>({
    url: '/admin/sys/base-config',
    data
  })
}
