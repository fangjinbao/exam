/**
 * 数据字典 API
 * 对接 /admin/sys/dict/* 接口（原型阶段由 mock/dataDict.ts 提供数据）
 * 两级结构：字典类型 → 字典项
 * 统一关闭 http 层错误提示（showErrorMessage: false），由页面自行控制提示文案
 */

import request from '@/utils/http'

/** 字典类型实体（含字典项数量） */
export interface DictType {
  id: number
  /** 字典类型名称 */
  typeName: string
  /** 字典类型编码 */
  typeCode: string
  /** 该类型下字典项数量（系统统计） */
  itemCount: number
}

/** 字典项实体 */
export interface DictItem {
  id: number
  /** 所属字典类型 id */
  typeId: number
  /** 字典项名称 */
  name: string
  /** 字典项值 */
  value: string
  /** 排序，数值越小越靠前 */
  sort: number
  /** 状态：1 启用 / 0 停用 */
  status: number
  /** 是否被业务引用（引用时禁止删除） */
  referenced?: boolean
}

/** 字典项新增/编辑入参 */
export interface DictItemPayload {
  typeId: number
  name: string
  value: string
  sort?: number
  status: number
}

/** 字典类型列表分页返回结构 */
export interface DictTypeListResult {
  list: DictType[]
  pagination: { page: number; pageSize: number; total: number }
}

/** 字典项列表分页返回结构 */
export interface DictItemListResult {
  list: DictItem[]
  pagination: { page: number; pageSize: number; total: number }
}

/** 获取字典类型列表（分页，keyword 模糊匹配名称/编码） */
export function getDictTypeList(params?: { keyword?: string; page?: number; pageSize?: number }) {
  return request.get<DictTypeListResult>({
    url: '/admin/sys/dict/type/list',
    params,
    showErrorMessage: false
  })
}

/** 获取指定字典类型下的字典项列表（分页，keyword 模糊匹配名称/值） */
export function getDictItemList(params: {
  typeId: number
  keyword?: string
  page?: number
  pageSize?: number
}) {
  return request.get<DictItemListResult>({
    url: '/admin/sys/dict/item/list',
    params,
    showErrorMessage: false
  })
}

/** 新增字典项 */
export function addDictItem(data: DictItemPayload) {
  return request.post({
    url: '/admin/sys/dict/item/add',
    data,
    showErrorMessage: false
  })
}

/** 更新字典项 */
export function updateDictItem(data: DictItemPayload & { id: number }) {
  return request.put({
    url: '/admin/sys/dict/item/update',
    data,
    showErrorMessage: false
  })
}

/** 删除字典项（被引用时后端阻止） */
export function deleteDictItem(id: number) {
  return request.del({
    url: `/admin/sys/dict/item/delete/${id}`,
    showErrorMessage: false
  })
}

/** 数据字典 API 聚合导出 */
export const dataDictApi = {
  getTypeList: getDictTypeList,
  getItemList: getDictItemList,
  addItem: addDictItem,
  updateItem: updateDictItem,
  deleteItem: deleteDictItem
}
