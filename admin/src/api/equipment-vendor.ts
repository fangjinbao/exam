import request from '@/utils/http'

/** 厂商信息 */
export interface Vendor {
  /** 主键 ID */
  id: number
  /** 厂商名称 */
  name: string
  /** 联系人 */
  contact: string
  /** 联系电话 */
  phone: string
  /** 邮箱 */
  email: string
  /** 地址 */
  address: string
  /** 备注 */
  remark: string
  /** 创建时间 */
  createTime: string
}

/** 新增/编辑提交数据 */
export interface VendorPayload {
  id?: number
  name: string
  contact?: string
  phone?: string
  email?: string
  address?: string
  remark?: string
}

/** 列表查询参数 */
export interface VendorQuery {
  name?: string
  page?: number
  pageSize?: number
}

/** 分页列表返回结构 */
export interface VendorListResult {
  list: Vendor[]
  pagination: { page: number; pageSize: number; total: number }
}

/** 导入行数据 */
export interface VendorImportRow {
  name: string
  contact?: string
  phone?: string
  email?: string
  address?: string
  remark?: string
}

/**
 * 获取厂商列表（分页）
 * GET /admin/equipment/vendor/list
 */
export function getVendorList(params?: VendorQuery) {
  return request.get<VendorListResult>({
    url: '/admin/equipment/vendor/list',
    params
  })
}

/**
 * 新增厂商
 * POST /admin/equipment/vendor/add
 */
export function addVendor(data: VendorPayload) {
  return request.post<{ id: number }>({
    url: '/admin/equipment/vendor/add',
    data
  })
}

/**
 * 更新厂商
 * PUT /admin/equipment/vendor/update
 */
export function updateVendor(data: VendorPayload) {
  return request.put<{ id: number }>({
    url: '/admin/equipment/vendor/update',
    data
  })
}

/**
 * 删除厂商（被设备引用时阻止）
 * DELETE /admin/equipment/vendor/delete/:id
 */
export function deleteVendor(id: number) {
  return request.del({
    url: `/admin/equipment/vendor/delete/${id}`
  })
}

/**
 * 批量删除厂商
 * POST /admin/equipment/vendor/batch-delete
 */
export function batchDeleteVendors(ids: number[]) {
  return request.post({
    url: '/admin/equipment/vendor/batch-delete',
    data: { ids }
  })
}

/**
 * 批量导入厂商
 * POST /admin/equipment/vendor/import
 */
export function importVendors(rows: VendorImportRow[]) {
  return request.post<{ successCount: number }>({
    url: '/admin/equipment/vendor/import',
    data: { rows }
  })
}

/**
 * 获取导出数据（按名称筛选当前结果）
 * GET /admin/equipment/vendor/export-data
 */
export function getVendorExportData(params?: { name?: string }) {
  return request.get<VendorImportRow[]>({
    url: '/admin/equipment/vendor/export-data',
    params
  })
}
