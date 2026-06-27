// @ts-nocheck
/**
 * 设备分类 Mock 数据
 * 树形结构：id/name/parentId/checklistId/checklistName/deviceCount/createTime/children
 * - 列表返回树形数组
 * - deviceCount 模拟该分类下关联设备数（用于删除阻止校验，真实数据来自设备档案 F08）
 * - 检查清单候选为内置数据（真实数据来自检查清单 F09）
 */

// ==================== 设备分类数据（扁平存储，对外组装为树） ====================
const mockCategories = [
  { id: 1, name: '电气设备', parentId: null, checklistId: 1, checklistName: '电气设备日常检查清单', deviceCount: 0, createTime: '2026-01-05 09:00:00' },
  { id: 2, name: '高压设备', parentId: 1, checklistId: null, checklistName: '', deviceCount: 3, createTime: '2026-01-05 09:10:00' },
  { id: 3, name: '低压设备', parentId: 1, checklistId: 2, checklistName: '低压配电检查清单', deviceCount: 0, createTime: '2026-01-05 09:20:00' },
  { id: 4, name: '机械设备', parentId: null, checklistId: null, checklistName: '', deviceCount: 0, createTime: '2026-01-06 10:00:00' },
  { id: 5, name: '泵类', parentId: 4, checklistId: 3, checklistName: '泵类设备点检清单', deviceCount: 2, createTime: '2026-01-06 10:15:00' },
  { id: 6, name: '储罐设备', parentId: null, checklistId: null, checklistName: '', deviceCount: 0, createTime: '2026-01-07 11:00:00' }
]

let nextCategoryId = 7

// 检查清单候选（真实数据来自 F09 检查清单模块）
const mockChecklistOptions = [
  { id: 1, name: '电气设备日常检查清单' },
  { id: 2, name: '低压配电检查清单' },
  { id: 3, name: '泵类设备点检清单' },
  { id: 4, name: '储罐安全检查清单' }
]

// ==================== 工具函数 ====================

/** 扁平数组组装为树 */
function buildTree(list, parentId = null) {
  return list
    .filter((item) => item.parentId === parentId)
    .map((item) => {
      const children = buildTree(list, item.id)
      const node = { ...item }
      if (children.length) node.children = children
      return node
    })
}

/** 计算某分类的上级完整路径（如"电气设备/高压设备"），用于导出 */
function getCategoryPath(item) {
  const names = [item.name]
  let cur = item
  while (cur.parentId !== null) {
    const parent = mockCategories.find((c) => c.id === cur.parentId)
    if (!parent) break
    names.unshift(parent.name)
    cur = parent
  }
  return names.join('/')
}

// PART_FUNCS

// ==================== Mock 函数 ====================

/** 获取设备分类树（可按名称筛选保留命中节点及其祖先） */
export function getCategoryTreeMock(params = {}) {
  const { name } = params || {}
  if (!name) return buildTree(mockCategories)
  // 命中节点：自身名称匹配，连同其所有祖先一起保留
  const keepIds = new Set()
  mockCategories.forEach((item) => {
    if (item.name.includes(name)) {
      let cur = item
      while (cur) {
        keepIds.add(cur.id)
        cur = cur.parentId !== null ? mockCategories.find((c) => c.id === cur.parentId) : null
      }
    }
  })
  return buildTree(mockCategories.filter((item) => keepIds.has(item.id)))
}

/** 获取检查清单候选列表 */
export function getChecklistOptionsMock() {
  return [...mockChecklistOptions]
}

/** 新增分类（同层级名称去重校验） */
export function addCategoryMock(data = {}) {
  const name = String(data.name || '').trim()
  if (!name) throw new Error('请输入分类名称')
  const parentId = data.parentId ?? null
  const duplicated = mockCategories.some((c) => c.parentId === parentId && c.name === name)
  if (duplicated) throw new Error('同一层级下已存在相同名称的分类')
  const newItem = {
    id: nextCategoryId++,
    name,
    parentId,
    checklistId: null,
    checklistName: '',
    deviceCount: 0,
    createTime: new Date().toLocaleString('zh-CN', { hour12: false })
  }
  mockCategories.push(newItem)
  return newItem
}

/** 更新分类名称（同层级名称去重校验） */
export function updateCategoryMock(id, data = {}) {
  const index = mockCategories.findIndex((c) => c.id === id)
  if (index === -1) throw new Error('分类不存在')
  const name = String(data.name || '').trim()
  if (!name) throw new Error('请输入分类名称')
  const target = mockCategories[index]
  const duplicated = mockCategories.some(
    (c) => c.id !== id && c.parentId === target.parentId && c.name === name
  )
  if (duplicated) throw new Error('同一层级下已存在相同名称的分类')
  target.name = name
  return { ...target }
}

/** 删除分类（有子分类或关联设备时阻止） */
export function deleteCategoryMock(id) {
  const target = mockCategories.find((c) => c.id === id)
  if (!target) throw new Error('分类不存在')
  const hasChildren = mockCategories.some((c) => c.parentId === id)
  if (hasChildren) throw new Error('该分类下存在子分类，请先删除或移动子分类')
  if (target.deviceCount > 0) {
    throw new Error(`该分类下有 ${target.deviceCount} 台设备，请先将设备调整至其他分类`)
  }
  const index = mockCategories.findIndex((c) => c.id === id)
  mockCategories.splice(index, 1)
  return true
}

/** 绑定/解绑检查清单（checklistId 为 null 表示解绑） */
export function bindChecklistMock(id, checklistId) {
  const target = mockCategories.find((c) => c.id === id)
  if (!target) throw new Error('分类不存在')
  if (checklistId === null || checklistId === undefined) {
    target.checklistId = null
    target.checklistName = ''
  } else {
    const option = mockChecklistOptions.find((o) => o.id === checklistId)
    if (!option) throw new Error('检查清单不存在')
    target.checklistId = checklistId
    target.checklistName = option.name
  }
  return { ...target }
}

/**
 * 批量导入分类
 * @param rows [{ name, parentPath, remark }]
 * 校验：名称非空、上级路径必须存在；返回 { successCount }
 */
export function importCategoriesMock(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('导入数据为空')
  }
  // 先整体校验，任一行失败则整体回滚（抛错）
  const prepared = []
  rows.forEach((row, idx) => {
    const lineNo = idx + 1
    const name = String(row.name || '').trim()
    if (!name) throw new Error(`第${lineNo}行：分类名称不能为空`)
    let parentId = null
    const parentPath = String(row.parentPath || '').trim()
    if (parentPath) {
      const match = mockCategories.find((c) => getCategoryPath(c) === parentPath)
      if (!match) throw new Error(`第${lineNo}行：上级分类"${parentPath}"不存在`)
      parentId = match.id
    }
    prepared.push({ name, parentId })
  })
  prepared.forEach((item) => {
    mockCategories.push({
      id: nextCategoryId++,
      name: item.name,
      parentId: item.parentId,
      checklistId: null,
      checklistName: '',
      deviceCount: 0,
      createTime: new Date().toLocaleString('zh-CN', { hour12: false })
    })
  })
  return { successCount: prepared.length }
}

/** 获取导出用的扁平数据（分类名称、上级分类路径、关联清单名称） */
export function getCategoryExportDataMock() {
  return mockCategories.map((item) => ({
    name: item.name,
    parentPath: item.parentId === null ? '' : getCategoryPath(mockCategories.find((c) => c.id === item.parentId)),
    checklistName: item.checklistName || ''
  }))
}
