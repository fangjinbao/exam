// @ts-nocheck
/**
 * 厂商信息 Mock 数据
 * 字段：id/name/contact/phone/email/address/remark/deviceRefs/createTime
 * - 列表返回 { list, pagination: { page, pageSize, total } }
 * - deviceRefs 模拟引用该厂商的设备名称数组（用于删除阻止校验，真实来自设备档案 F08）
 */

// ==================== 厂商数据（模块级持久化） ====================
const mockVendors = [
  { id: 1, name: '西门子（中国）有限公司', contact: '张伟', phone: '13800001111', email: 'zhangwei@siemens.com', address: '北京市朝阳区望京中环南路7号', remark: '电气设备主力供应商', deviceRefs: ['1号高压配电柜', '2号变压器'], createTime: '2026-01-05 09:00:00' },
  { id: 2, name: 'ABB（中国）有限公司', contact: '李娜', phone: '13900002222', email: 'lina@abb.com', address: '上海市浦东新区康桥路1528号', remark: '', deviceRefs: ['3号低压配电柜'], createTime: '2026-01-06 10:30:00' },
  { id: 3, name: '格兰富水泵有限公司', contact: '王强', phone: '13700003333', email: 'wangqiang@grundfos.com', address: '江苏省苏州市工业园区苏虹中路200号', remark: '泵类设备供应商', deviceRefs: [], createTime: '2026-01-07 11:15:00' },
  { id: 4, name: '施耐德电气有限公司', contact: '赵敏', phone: '13600004444', email: 'zhaomin@schneider.com', address: '', remark: '', deviceRefs: [], createTime: '2026-01-08 14:00:00' },
  { id: 5, name: '中石化储罐工程公司', contact: '孙磊', phone: '13500005555', email: 'sunlei@sinopec.com', address: '山东省东营市东营区济南路168号', remark: '储罐设备定制', deviceRefs: [], createTime: '2026-01-09 16:20:00' }
]

let nextVendorId = 6

// ==================== Mock 函数 ====================

/** 获取厂商列表（分页，按名称模糊筛选） */
export function getVendorListMock(params = {}) {
  const { name, page = 1, pageSize = 10 } = params || {}
  let filtered = [...mockVendors]
  if (name) {
    filtered = filtered.filter((item) => item.name.includes(name))
  }
  const total = filtered.length
  const start = (Number(page) - 1) * Number(pageSize)
  const list = filtered.slice(start, start + Number(pageSize)).map((item) => ({
    id: item.id,
    name: item.name,
    contact: item.contact,
    phone: item.phone,
    email: item.email,
    address: item.address,
    remark: item.remark,
    createTime: item.createTime
  }))
  return { list, pagination: { page: Number(page), pageSize: Number(pageSize), total } }
}

// PART_FUNCS

/** 新增厂商 */
export function addVendorMock(data = {}) {
  const name = String(data.name || '').trim()
  if (!name) throw new Error('请输入厂商名称')
  const newItem = {
    id: nextVendorId++,
    name,
    contact: String(data.contact || '').trim(),
    phone: String(data.phone || '').trim(),
    email: String(data.email || '').trim(),
    address: String(data.address || '').trim(),
    remark: String(data.remark || '').trim(),
    deviceRefs: [],
    createTime: new Date().toLocaleString('zh-CN', { hour12: false })
  }
  mockVendors.push(newItem)
  return { id: newItem.id }
}

/** 更新厂商 */
export function updateVendorMock(id, data = {}) {
  const target = mockVendors.find((v) => v.id === id)
  if (!target) throw new Error('厂商不存在')
  const name = String(data.name || '').trim()
  if (!name) throw new Error('请输入厂商名称')
  target.name = name
  target.contact = String(data.contact || '').trim()
  target.phone = String(data.phone || '').trim()
  target.email = String(data.email || '').trim()
  target.address = String(data.address || '').trim()
  target.remark = String(data.remark || '').trim()
  return { id: target.id }
}

/** 删除厂商（被设备引用时阻止） */
export function deleteVendorMock(id) {
  const target = mockVendors.find((v) => v.id === id)
  if (!target) throw new Error('厂商不存在')
  if (target.deviceRefs.length > 0) {
    const sample = target.deviceRefs[0]
    throw new Error(`该厂商已被【${sample}】等 ${target.deviceRefs.length} 台设备引用，无法删除`)
  }
  const index = mockVendors.findIndex((v) => v.id === id)
  mockVendors.splice(index, 1)
  return true
}

/** 批量删除厂商（任一被引用则整体阻止） */
export function batchDeleteVendorsMock(ids = []) {
  if (!Array.isArray(ids) || ids.length === 0) throw new Error('请选择要删除的厂商')
  const blocked = mockVendors.find((v) => ids.includes(v.id) && v.deviceRefs.length > 0)
  if (blocked) {
    const sample = blocked.deviceRefs[0]
    throw new Error(`厂商【${blocked.name}】已被【${sample}】等 ${blocked.deviceRefs.length} 台设备引用，无法删除`)
  }
  ids.forEach((id) => {
    const index = mockVendors.findIndex((v) => v.id === id)
    if (index !== -1) mockVendors.splice(index, 1)
  })
  return true
}

/**
 * 批量导入厂商
 * @param rows [{ name, contact, phone, email, address, remark }]
 * 校验：名称非空；返回 { successCount }
 */
export function importVendorsMock(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('导入数据为空')
  const prepared = []
  rows.forEach((row, idx) => {
    const lineNo = idx + 1
    const name = String(row.name || '').trim()
    if (!name) throw new Error(`第${lineNo}行：厂商名称不能为空`)
    prepared.push({
      name,
      contact: String(row.contact || '').trim(),
      phone: String(row.phone || '').trim(),
      email: String(row.email || '').trim(),
      address: String(row.address || '').trim(),
      remark: String(row.remark || '').trim()
    })
  })
  prepared.forEach((item) => {
    mockVendors.push({
      id: nextVendorId++,
      ...item,
      deviceRefs: [],
      createTime: new Date().toLocaleString('zh-CN', { hour12: false })
    })
  })
  return { successCount: prepared.length }
}

/** 获取导出数据（按名称筛选当前结果） */
export function getVendorExportDataMock(params = {}) {
  const { name } = params || {}
  let filtered = [...mockVendors]
  if (name) {
    filtered = filtered.filter((item) => item.name.includes(name))
  }
  return filtered.map((item) => ({
    name: item.name,
    contact: item.contact,
    phone: item.phone,
    email: item.email,
    address: item.address,
    remark: item.remark
  }))
}
