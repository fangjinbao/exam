/**
 * 证书模板管理 API
 * 对接 /admin/exam/certificate-template/* 接口
 * 统一关闭 http 层错误提示（showErrorMessage: false），由页面自行控制提示文案
 */

import request from '@/utils/http'

/** 证书模板实体 */
export interface CertificateTemplate {
  id: number
  name: string
  title: string
  issuingOrg: string
  description?: string | null
  sealImage?: string | null
  numberRule: string
  /** 证书尺寸 1=A4横版 2=A4竖版 */
  size: number
  /** 证书底图 URL */
  backgroundImage?: string | null
  /** 版式 JSON（可视化设计器排版元素） */
  content?: string | null
  status: number
  createTime?: string
  updateTime?: string
}

/** 证书模板列表分页返回结构 */
export interface CertificateTemplateListResult {
  list: CertificateTemplate[]
  pagination: { page: number; pageSize: number; total: number }
}

/** 新增/编辑证书模板入参 */
export interface CertificateTemplatePayload {
  name: string
  title: string
  issuingOrg: string
  description?: string
  sealImage?: string
  numberRule: string
  size?: number
  backgroundImage?: string
  content?: string
  status: number
}

/** 证书模板下拉选项（供认证项目关联证书模板） */
export interface CertificateTemplateOption {
  id: number
  name: string
}

/** 获取证书模板列表（分页），keyword 同时模糊匹配名称/标题/颁发机构，status 精确 */
export function getCertificateTemplateList(params?: {
  keyword?: string
  status?: number | ''
  page?: number
  pageSize?: number
}) {
  return request.get<CertificateTemplateListResult>({
    url: '/admin/exam/certificate-template/list',
    params,
    showErrorMessage: false
  })
}

/** 新增证书模板 */
export function addCertificateTemplate(data: CertificateTemplatePayload) {
  return request.post({
    url: '/admin/exam/certificate-template/add',
    data,
    showErrorMessage: false
  })
}

/** 更新证书模板 */
export function updateCertificateTemplate(data: CertificateTemplatePayload & { id: number }) {
  return request.put({
    url: '/admin/exam/certificate-template/update',
    data,
    showErrorMessage: false
  })
}

/** 更新证书模板状态（启用/停用） */
export function updateCertificateTemplateStatus(id: number, status: number) {
  return request.put({
    url: '/admin/exam/certificate-template/update-status',
    data: { id, status },
    showErrorMessage: false
  })
}

/** 删除证书模板（被认证项目引用时后端阻止） */
export function deleteCertificateTemplate(id: number) {
  return request.del({
    url: `/admin/exam/certificate-template/delete/${id}`,
    showErrorMessage: false
  })
}

/** 批量删除证书模板（任一被认证项目引用时后端整体阻止） */
export function batchDeleteCertificateTemplates(ids: number[]) {
  return request.post({
    url: '/admin/exam/certificate-template/batch-delete',
    data: { ids },
    showErrorMessage: false
  })
}

/** 获取启用状态的证书模板下拉选项 */
export function getCertificateTemplateOptions() {
  return request.get<CertificateTemplateOption[]>({
    url: '/admin/exam/certificate-template/options',
    showErrorMessage: false
  })
}

/** 证书模板 API 聚合导出 */
export const certificateTemplateApi = {
  getList: getCertificateTemplateList,
  add: addCertificateTemplate,
  update: updateCertificateTemplate,
  updateStatus: updateCertificateTemplateStatus,
  delete: deleteCertificateTemplate,
  batchDelete: batchDeleteCertificateTemplates,
  getOptions: getCertificateTemplateOptions
}
