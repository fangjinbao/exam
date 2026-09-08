/**
 * 证书发放台账管理 API
 * 对接 /admin/exam/certificate/* 接口：列表、详情、下载
 * 统一关闭 http 层错误提示（showErrorMessage: false），由页面自行控制提示文案
 */

import request from '@/utils/http'

/** 证书状态 */
export type CertStatus = 'valid' | 'expired'

/** 证书发放记录实体（列表项） */
export interface Certificate {
  id: number
  certNo: string
  projectId: number
  projectName: string
  templateId: number
  templateName: string
  candidateType: string // internal | external
  candidateName: string
  issueDate: string
  expireDate: string
  certStatus: CertStatus
}

/** 证书详情（含证书完整展示内容） */
export interface CertificateDetail extends Certificate {
  title: string
  issuingOrg: string
  templateDescription?: string | null
  sealImage?: string | null
  backgroundImage?: string | null
  content?: string | null
}

/** 证书列表分页返回结构 */
export interface CertificateListResult {
  list: Certificate[]
  pagination: { page: number; pageSize: number; total: number }
}

/** 获取证书发放列表（分页），支持按认证项目、证书状态精确与考生关键词模糊筛选 */
export function getCertificateList(params?: {
  projectId?: number
  keyword?: string
  certStatus?: CertStatus | ''
  page?: number
  pageSize?: number
}) {
  return request.get<CertificateListResult>({
    url: '/admin/exam/certificate/list',
    params,
    showErrorMessage: false
  })
}

/** 证书详情（查看用，含完整证书内容） */
export function getCertificateDetail(id: number) {
  return request.get<CertificateDetail>({
    url: `/admin/exam/certificate/detail/${id}`,
    showErrorMessage: false
  })
}

/** 下载证书（拿完整数据，前端生成文件） */
export function downloadCertificate(id: number) {
  return request.get<CertificateDetail>({
    url: `/admin/exam/certificate/download/${id}`,
    showErrorMessage: false
  })
}

/** 证书发放 API 聚合导出 */
export const certificateApi = {
  getList: getCertificateList,
  getDetail: getCertificateDetail,
  download: downloadCertificate
}
