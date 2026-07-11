// @ts-nocheck
/**
 * 考点管理 Mock 数据
 * 字段与考点管理页面一致：name/address/capacity/contact/phone/status
 * 列表返回 { list, pagination: { page, pageSize, total } }
 * referencedIds：模拟"被考试引用"的考点 id，删除时命中则阻止
 */

// ==================== 考点数据 ====================
export const mockExamSites = [
  {
    id: 1,
    name: '北京市第一考点',
    address: '北京市海淀区中关村大街1号',
    capacity: 200,
    contact: '张伟',
    phone: '13800000001',
    status: 1,
    createTime: '2026-01-05 09:00:00',
    updateTime: '2026-03-01 09:00:00'
  },
  {
    id: 2,
    name: '上海市徐汇考点',
    address: '上海市徐汇区漕溪北路88号',
    capacity: 150,
    contact: '李娜',
    phone: '13800000002',
    status: 1,
    createTime: '2026-01-06 09:00:00',
    updateTime: '2026-03-01 09:00:00'
  },
  {
    id: 3,
    name: '广州市天河考点',
    address: '广州市天河区体育西路12号',
    capacity: 120,
    contact: '王强',
    phone: '13800000003',
    status: 1,
    createTime: '2026-01-07 09:00:00',
    updateTime: '2026-03-01 09:00:00'
  },
  {
    id: 4,
    name: '深圳市南山考点',
    address: '深圳市南山区科技园路5号',
    capacity: 180,
    contact: '',
    phone: '',
    status: 0,
    createTime: '2026-01-08 09:00:00',
    updateTime: '2026-03-01 09:00:00'
  },
  {
    id: 5,
    name: '成都市高新考点',
    address: '',
    capacity: null,
    contact: '刘洋',
    phone: '13800000005',
    status: 1,
    createTime: '2026-01-09 09:00:00',
    updateTime: '2026-03-01 09:00:00'
  }
]

// 被考试引用的考点 id，删除时命中则阻止（模拟业务规则）
const referencedIds = [1]

let nextExamSiteId = 10

// ==================== 考点 Mock 函数 ====================

/** 获取考点列表（分页），支持按名称模糊、状态筛选 */
export function getExamSiteListMock(params = {}) {
  const { keyword, status, page = 1, pageSize = 10 } = params || {}
  let filtered = [...mockExamSites]
  if (keyword) {
    filtered = filtered.filter((s) => s.name.includes(keyword))
  }
  if (status !== undefined && status !== null && status !== '') {
    const statusValue = typeof status === 'string' ? parseInt(status) : status
    filtered = filtered.filter((s) => s.status === statusValue)
  }
  const start = (page - 1) * pageSize
  const list = filtered.slice(start, start + Number(pageSize))
  return {
    list,
    pagination: { page: Number(page), pageSize: Number(pageSize), total: filtered.length }
  }
}

/** 新增考点 */
export function addExamSiteMock(data) {
  const now = new Date().toLocaleString('zh-CN')
  const newSite = {
    id: nextExamSiteId++,
    name: data.name || '',
    address: data.address || '',
    capacity: data.capacity ?? null,
    contact: data.contact || '',
    phone: data.phone || '',
    status: data.status ?? 1,
    createTime: now,
    updateTime: now
  }
  mockExamSites.push(newSite)
  return newSite
}

/** 更新考点 */
export function updateExamSiteMock(id, data) {
  const index = mockExamSites.findIndex((s) => s.id === id)
  if (index === -1) throw new Error('考点不存在')
  mockExamSites[index] = {
    ...mockExamSites[index],
    ...data,
    id,
    updateTime: new Date().toLocaleString('zh-CN')
  }
  return mockExamSites[index]
}

/** 更新考点状态（启用/停用） */
export function updateExamSiteStatusMock(id, status) {
  const index = mockExamSites.findIndex((s) => s.id === id)
  if (index === -1) throw new Error('考点不存在')
  mockExamSites[index].status = status
  mockExamSites[index].updateTime = new Date().toLocaleString('zh-CN')
  return true
}

/** 删除考点；被考试引用时阻止 */
export function deleteExamSiteMock(id) {
  if (referencedIds.includes(id)) {
    throw new Error('该考点已被考试引用，无法删除')
  }
  const index = mockExamSites.findIndex((s) => s.id === id)
  if (index === -1) throw new Error('考点不存在')
  mockExamSites.splice(index, 1)
  return true
}
