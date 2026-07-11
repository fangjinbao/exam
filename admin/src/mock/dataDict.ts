// @ts-nocheck
/**
 * 数据字典 Mock 数据
 * 两级结构：字典类型（dictType）→ 字典项（dictItem）
 * 字典类型：id/typeName/typeCode
 * 字典项：id/typeId/name/value/sort/status(1启用0停用)/referenced(是否被业务引用)
 * 业务规则：
 *  - 同一字典类型下 name、value 唯一
 *  - referenced=true 的字典项禁止删除
 *  - 字典类型列表的"字典项数量"由字典项自动统计
 */

// ==================== 字典类型 ====================
export const mockDictTypes = [
  { id: 1, typeName: '题型', typeCode: 'question_type' },
  { id: 2, typeName: '难度', typeCode: 'difficulty' },
  { id: 3, typeName: '事件类型', typeCode: 'event_type' },
  { id: 4, typeName: '操作类型', typeCode: 'operation_type' }
]

// ==================== 字典项 ====================
export const mockDictItems = [
  { id: 101, typeId: 1, name: '单选题', value: 'single', sort: 1, status: 1, referenced: true },
  { id: 102, typeId: 1, name: '多选题', value: 'multiple', sort: 2, status: 1, referenced: true },
  { id: 103, typeId: 1, name: '判断题', value: 'judge', sort: 3, status: 1, referenced: false },
  { id: 104, typeId: 1, name: '填空题', value: 'blank', sort: 4, status: 1, referenced: false },
  { id: 105, typeId: 1, name: '问答题', value: 'qa', sort: 5, status: 1, referenced: false },
  { id: 106, typeId: 1, name: '论述题', value: 'essay', sort: 6, status: 0, referenced: false },
  { id: 201, typeId: 2, name: '简单', value: 'easy', sort: 1, status: 1, referenced: true },
  { id: 202, typeId: 2, name: '中等', value: 'medium', sort: 2, status: 1, referenced: false },
  { id: 203, typeId: 2, name: '困难', value: 'hard', sort: 3, status: 1, referenced: false },
  { id: 301, typeId: 3, name: '切屏', value: 'switch_screen', sort: 1, status: 1, referenced: false },
  { id: 302, typeId: 3, name: '离屏', value: 'leave_screen', sort: 2, status: 1, referenced: false },
  { id: 303, typeId: 3, name: '人脸不匹配', value: 'face_mismatch', sort: 3, status: 1, referenced: false },
  { id: 304, typeId: 3, name: '多屏', value: 'multi_screen', sort: 4, status: 1, referenced: false },
  { id: 305, typeId: 3, name: '其他', value: 'other', sort: 5, status: 1, referenced: false },
  { id: 401, typeId: 4, name: '新增', value: 'create', sort: 1, status: 1, referenced: false },
  { id: 402, typeId: 4, name: '编辑', value: 'update', sort: 2, status: 1, referenced: false },
  { id: 403, typeId: 4, name: '删除', value: 'delete', sort: 3, status: 1, referenced: false },
  { id: 404, typeId: 4, name: '登录', value: 'login', sort: 4, status: 1, referenced: false }
]

let nextDictItemId = 1000

// ==================== 字典类型 Mock 函数 ====================

/** 获取字典类型列表（分页），字典项数量自动统计 */
export function getDictTypeListMock(params = {}) {
  const { page = 1, pageSize = 10 } = params || {}
  const withCount = mockDictTypes.map((t) => ({
    ...t,
    itemCount: mockDictItems.filter((i) => i.typeId === t.id).length
  }))
  const start = (page - 1) * pageSize
  const list = withCount.slice(start, start + Number(pageSize))
  return {
    list,
    pagination: { page: Number(page), pageSize: Number(pageSize), total: mockDictTypes.length }
  }
}

// ==================== 字典项 Mock 函数 ====================

/** 获取指定字典类型下的字典项列表（分页），按 sort 升序 */
export function getDictItemListMock(params = {}) {
  const { typeId, page = 1, pageSize = 10 } = params || {}
  let filtered = mockDictItems.filter((i) => i.typeId === Number(typeId))
  filtered = filtered.sort((a, b) => a.sort - b.sort)
  const start = (page - 1) * pageSize
  const list = filtered.slice(start, start + Number(pageSize))
  return {
    list,
    pagination: { page: Number(page), pageSize: Number(pageSize), total: filtered.length }
  }
}

/** 校验同一字典类型下 name、value 唯一 */
function assertItemUnique(typeId, name, value, excludeId) {
  const dup = mockDictItems.some(
    (i) =>
      i.typeId === Number(typeId) &&
      i.id !== excludeId &&
      (i.name === name || i.value === value)
  )
  if (dup) throw new Error('该字典项已存在，请更换名称或值')
}

/** 新增字典项 */
export function addDictItemMock(data) {
  assertItemUnique(data.typeId, data.name, data.value)
  const newItem = {
    id: nextDictItemId++,
    typeId: Number(data.typeId),
    name: data.name || '',
    value: data.value || '',
    sort: data.sort ?? 0,
    status: data.status ?? 1,
    referenced: false
  }
  mockDictItems.push(newItem)
  return newItem
}

/** 更新字典项 */
export function updateDictItemMock(id, data) {
  const index = mockDictItems.findIndex((i) => i.id === id)
  if (index === -1) throw new Error('字典项不存在')
  const target = mockDictItems[index]
  assertItemUnique(target.typeId, data.name, data.value, id)
  target.name = data.name ?? target.name
  target.value = data.value ?? target.value
  target.sort = data.sort ?? target.sort
  target.status = data.status ?? target.status
  return target
}

/** 删除字典项；被业务引用时阻止 */
export function deleteDictItemMock(id) {
  const target = mockDictItems.find((i) => i.id === id)
  if (!target) throw new Error('字典项不存在')
  if (target.referenced) throw new Error('该字典项已被引用，无法删除')
  const index = mockDictItems.findIndex((i) => i.id === id)
  mockDictItems.splice(index, 1)
  return true
}
