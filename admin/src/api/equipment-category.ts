import request from '@/utils/http'

/** 设备分类节点 */
export interface EquipmentCategory {
  /** 主键 ID */
  id: number
  /** 分类名称 */
  name: string
  /** 父级分类 ID，顶级为 null */
  parentId: number | null
  /** 绑定的检查清单 ID */
  checklistId: number | null
  /** 绑定的检查清单名称（展示用） */
  checklistName: string
  /** 该分类下关联设备数量 */
  deviceCount: number
  /** 创建时间 */
  createTime: string
  /** 子分类 */
  children?: EquipmentCategory[]
}

/** 检查清单候选项 */
export interface ChecklistOption {
  id: number
  name: string
}

/** 导入行数据 */
export interface CategoryImportRow {
  /** 分类名称 */
  name: string
  /** 上级分类完整路径，如"电气设备/高压设备" */
  parentPath?: string
  /** 备注 */
  remark?: string
}

/** 导出行数据 */
export interface CategoryExportRow {
  name: string
  parentPath: string
  checklistName: string
}

/**
 * 获取设备分类树
 * GET /admin/equipment/category/tree
 */
export function getCategoryTree(params?: { name?: string }) {
  return request.get<EquipmentCategory[]>({
    url: '/admin/equipment/category/tree',
    params
  })
}

/**
 * 获取检查清单候选列表（用于绑定）
 * GET /admin/equipment/category/checklist-options
 */
export function getChecklistOptions() {
  return request.get<ChecklistOption[]>({
    url: '/admin/equipment/category/checklist-options'
  })
}

/**
 * 新增设备分类
 * POST /admin/equipment/category/add
 */
export function addCategory(data: { name: string; parentId?: number | null }) {
  return request.post<EquipmentCategory>({
    url: '/admin/equipment/category/add',
    data
  })
}

/**
 * 更新设备分类名称
 * PUT /admin/equipment/category/update
 */
export function updateCategory(data: { id: number; name: string }) {
  return request.put<EquipmentCategory>({
    url: '/admin/equipment/category/update',
    data
  })
}

/**
 * 删除设备分类（有子分类或关联设备时阻止）
 * DELETE /admin/equipment/category/delete/:id
 */
export function deleteCategory(id: number) {
  return request.del({
    url: `/admin/equipment/category/delete/${id}`
  })
}

/**
 * 绑定/解绑检查清单（checklistId 传 null 解绑）
 * PUT /admin/equipment/category/bind-checklist
 */
export function bindChecklist(id: number, checklistId: number | null) {
  return request.put<EquipmentCategory>({
    url: '/admin/equipment/category/bind-checklist',
    data: { id, checklistId }
  })
}

/**
 * 批量导入设备分类
 * POST /admin/equipment/category/import
 */
export function importCategories(rows: CategoryImportRow[]) {
  return request.post<{ successCount: number }>({
    url: '/admin/equipment/category/import',
    data: { rows }
  })
}

/**
 * 获取导出数据（分类名称、上级分类路径、关联清单名称）
 * GET /admin/equipment/category/export-data
 */
export function getCategoryExportData() {
  return request.get<CategoryExportRow[]>({
    url: '/admin/equipment/category/export-data'
  })
}
