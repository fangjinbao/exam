/**
 * 知识点分类 API
 * 对接 /admin/exam/knowledge-point/* 接口（树形结构，题库管理基础分类）
 * 统一关闭 http 层错误提示（showErrorMessage: false），由页面自行控制提示文案
 */

import request from '@/utils/http'

/** 知识点分类实体（树形，children 为子节点） */
export interface KnowledgePoint {
  id: number
  parentId: number | null
  name: string
  orderNum: number
  remark?: string | null
  createTime?: string
  updateTime?: string
  children?: KnowledgePoint[]
}

/** 新增知识点入参 */
export interface CreateKnowledgePointPayload {
  parentId?: number | null
  name: string
  orderNum?: number
  remark?: string
}

/** 更新知识点入参 */
export interface UpdateKnowledgePointPayload extends CreateKnowledgePointPayload {
  id: number
}

/** 获取知识点分类树 */
export function getKnowledgePointTree() {
  return request.get<KnowledgePoint[]>({
    url: '/admin/exam/knowledge-point/tree',
    showErrorMessage: false
  })
}

/** 新增知识点分类（校验父级存在） */
export function addKnowledgePoint(data: CreateKnowledgePointPayload) {
  return request.post({
    url: '/admin/exam/knowledge-point/add',
    data,
    showErrorMessage: false
  })
}

/** 更新知识点分类 */
export function updateKnowledgePoint(data: UpdateKnowledgePointPayload) {
  return request.put({
    url: '/admin/exam/knowledge-point/update',
    data,
    showErrorMessage: false
  })
}

/** 删除知识点分类（有子分类或被题目引用时后端阻止） */
export function deleteKnowledgePoint(id: number) {
  return request.del({
    url: `/admin/exam/knowledge-point/delete/${id}`,
    showErrorMessage: false
  })
}

/** 知识点分类 API 聚合导出 */
export const knowledgePointApi = {
  getTree: getKnowledgePointTree,
  add: addKnowledgePoint,
  update: updateKnowledgePoint,
  delete: deleteKnowledgePoint
}
