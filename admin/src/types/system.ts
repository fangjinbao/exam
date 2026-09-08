/**
 * 系统设置类型定义
 */

/**
 * 状态枚举
 */
export enum StatusEnum {
  /** 停用 */
  DISABLED = 0,
  /** 启用 */
  ENABLED = 1
}

/**
 * 系统配置
 */
export interface SystemConfig {
  /** 配置ID */
  id: number
  /** 配置键 */
  key: string
  /** 配置值 */
  value: string
  /** 配置说明 */
  description?: string
  /** 更新时间 */
  updateTime: string
}

/**
 * 站点配置
 */
export interface SiteConfig {
  /** 站点名称 */
  siteName: string
  /** 站点Logo */
  siteLogo?: string
  /** 联系电话 */
  contactPhone?: string
  /** 联系邮箱 */
  contactEmail?: string
  /** 备案信息 */
  icp?: string
  /** 默认考试时长（分钟） */
  defaultExamDuration?: number
  /** 默认及格分数 */
  defaultPassScore?: number
}

/**
 * 证书模板类型统一以 API 层为准，避免类型来源分裂（对齐 SRS 3.5.7.1）
 */
export type { CertificateTemplate } from '@/api/certificateTemplate'

/**
 * 证书模板查询参数
 */
export interface CertificateTemplateQueryParams {
  /** 模板名称 */
  name?: string
  /** 状态 */
  status?: number | string | null
  /** 当前页码 */
  page: number
  /** 每页大小 */
  pageSize: number
}

/**
 * 操作日志
 */
export interface OperationLog {
  /** 日志ID */
  id: number
  /** 操作人ID */
  userId: number
  /** 操作人姓名 */
  userName: string
  /** 操作类型 */
  type: string
  /** 操作模块 */
  module: string
  /** 操作内容 */
  content: string
  /** IP地址 */
  ip: string
  /** 操作时间 */
  createTime: string
}

/**
 * 操作日志查询参数
 */
export interface OperationLogQueryParams {
  /** 操作人姓名 */
  userName?: string
  /** 操作类型 */
  type?: string
  /** 操作模块 */
  module?: string
  /** 开始时间 */
  startTime?: string
  /** 结束时间 */
  endTime?: string
  /** 当前页码 */
  page: number
  /** 每页大小 */
  pageSize: number
}
