// @ts-nocheck
/**
 * 问题类型 Mock 数据
 * 字段：id/name/auditorId/auditorName/orderNum/status/createTime
 * 列表返回 { list, pagination: { page, pageSize, total } }
 * 审核人候选：组织管理中具有业务主管角色的人员
 */

// ==================== 问题类型数据（模块级持久化） ====================
const mockIssueTypes = [
  { id: 1, name: '设备故障', auditorId: 2, auditorName: '李建国', orderNum: 1, status: 1, createTime: '2026-01-10 09:00:00' },
  { id: 2, name: '安全隐患', auditorId: 3, auditorName: '王海燕', orderNum: 2, status: 1, createTime: '2026-01-11 10:30:00' },
  { id: 3, name: '环境问题', auditorId: 2, auditorName: '李建国', orderNum: 3, status: 1, createTime: '2026-01-12 14:20:00' },
  { id: 4, name: '工艺违规', auditorId: null, auditorName: '', orderNum: 4, status: 1, createTime: '2026-01-13 16:00:00' },
  { id: 5, name: '文件缺失', auditorId: 3, auditorName: '王海燕', orderNum: 5, status: 0, createTime: '2026-01-14 11:10:00' }
]

let nextIssueTypeId = 6

// 审核人候选数据（具有业务主管角色的人员）
const mockAuditors = [
  { id: 2, name: '李建国', username: 'lijianguo' },
  { id: 3, name: '王海燕', username: 'wanghaiyan' },
  { id: 4, name: '张志强', username: 'zhangzhiqiang' }
]

// ==================== Mock 函数 ====================

/** 获取问题类型列表（分页，按名称模糊筛选） */
export function getIssueTypeListMock(params = {}) {
  const { name, page = 1, pageSize = 10 } = params || {}
  let filtered = [...mockIssueTypes]
  if (name) {
    filtered = filtered.filter((item) => item.name.includes(name))
  }
  // 按排序值升序展示
  filtered.sort((a, b) => a.orderNum - b.orderNum)
  const total = filtered.length
  const start = (Number(page) - 1) * Number(pageSize)
  const list = filtered.slice(start, start + Number(pageSize))
  return { list, pagination: { page: Number(page), pageSize: Number(pageSize), total } }
}

/** 新增问题类型 */
export function addIssueTypeMock(data = {}) {
  if (!data.name || !String(data.name).trim()) {
    throw new Error('请输入类型名称')
  }
  const auditor = data.auditorId ? mockAuditors.find((a) => a.id === data.auditorId) : null
  const newItem = {
    id: nextIssueTypeId++,
    name: String(data.name).trim(),
    auditorId: data.auditorId ?? null,
    auditorName: auditor ? auditor.name : '',
    orderNum: data.orderNum ?? 0,
    status: data.status ?? 1,
    createTime: new Date().toLocaleString('zh-CN', { hour12: false })
  }
  mockIssueTypes.push(newItem)
  return newItem
}

/** 更新问题类型 */
export function updateIssueTypeMock(id, data = {}) {
  const index = mockIssueTypes.findIndex((item) => item.id === id)
  if (index === -1) throw new Error('问题类型不存在')
  if (data.name !== undefined && !String(data.name).trim()) {
    throw new Error('请输入类型名称')
  }
  const auditor = data.auditorId ? mockAuditors.find((a) => a.id === data.auditorId) : null
  mockIssueTypes[index] = {
    ...mockIssueTypes[index],
    name: data.name !== undefined ? String(data.name).trim() : mockIssueTypes[index].name,
    auditorId: data.auditorId ?? null,
    auditorName: auditor ? auditor.name : '',
    orderNum: data.orderNum ?? mockIssueTypes[index].orderNum,
    status: data.status ?? mockIssueTypes[index].status
  }
  return mockIssueTypes[index]
}

/** 删除问题类型 */
export function deleteIssueTypeMock(id) {
  const index = mockIssueTypes.findIndex((item) => item.id === id)
  if (index === -1) throw new Error('问题类型不存在')
  mockIssueTypes.splice(index, 1)
  return true
}

/** 切换问题类型状态 */
export function updateIssueTypeStatusMock(id, status) {
  const index = mockIssueTypes.findIndex((item) => item.id === id)
  if (index === -1) throw new Error('问题类型不存在')
  mockIssueTypes[index].status = status
  return mockIssueTypes[index]
}

/** 获取审核人候选列表（具有业务主管角色的人员） */
export function getIssueTypeAuditorsMock() {
  return [...mockAuditors]
}
