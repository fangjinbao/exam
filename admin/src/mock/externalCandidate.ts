// @ts-nocheck
/**
 * 外部考生管理 Mock 数据
 * 字段：name/admissionNo/company/idCard/phone/email/status/createTime
 * 列表返回 { list, pagination: { page, pageSize, total } }
 * admissionNo（准考证号）系统内唯一，作为考试账号登录名
 * assignedIds：模拟"已分配考试"的考生 id，删除时命中则阻止
 */

// ==================== 外部考生数据 ====================
export const mockExternalCandidates = [
  {
    id: 1,
    name: '陈建国',
    admissionNo: 'WB2026001',
    company: '华东电力设计院',
    idCard: '310101199001011234',
    phone: '13800001001',
    email: 'chenjg@example.com',
    status: 1,
    createTime: '2026-02-01 09:12:00'
  },
  {
    id: 2,
    name: '林晓梅',
    admissionNo: 'WB2026002',
    company: '南方检测技术公司',
    idCard: '440301199203056789',
    phone: '13800001002',
    email: '',
    status: 1,
    createTime: '2026-02-01 10:30:00'
  },
  {
    id: 3,
    name: '赵德柱',
    admissionNo: 'WB2026003',
    company: '',
    idCard: '',
    phone: '13800001003',
    email: 'zhaodz@example.com',
    status: 0,
    createTime: '2026-02-02 14:05:00'
  },
  {
    id: 4,
    name: '孙丽华',
    admissionNo: 'WB2026004',
    company: '西北工程监理集团',
    idCard: '610101199505128888',
    phone: '13800001004',
    email: 'sunlh@example.com',
    status: 1,
    createTime: '2026-02-03 08:45:00'
  },
  {
    id: 5,
    name: '周伟东',
    admissionNo: 'WB2026005',
    company: '华东电力设计院',
    idCard: '',
    phone: '13800001005',
    email: '',
    status: 1,
    createTime: '2026-02-04 16:20:00'
  },
  {
    id: 6,
    name: '吴晓峰',
    admissionNo: 'WB2026006',
    company: '中部安装工程公司',
    idCard: '420101198811093456',
    phone: '13800001006',
    email: 'wuxf@example.com',
    status: 0,
    createTime: '2026-02-05 11:10:00'
  }
]

// 已分配到考试的考生 id，删除时命中则阻止（模拟业务规则）
const assignedIds = [1]

let nextCandidateId = 100

// ==================== 外部考生 Mock 函数 ====================

/** 获取外部考生列表（分页），支持按姓名/所属单位/准考证号模糊、账号状态筛选 */
export function getExternalCandidateListMock(params = {}) {
  const { name, company, admissionNo, status, page = 1, pageSize = 10 } = params || {}
  let filtered = [...mockExternalCandidates]
  if (name) {
    filtered = filtered.filter((c) => c.name.includes(name))
  }
  if (company) {
    filtered = filtered.filter((c) => (c.company || '').includes(company))
  }
  if (admissionNo) {
    filtered = filtered.filter((c) => c.admissionNo.includes(admissionNo))
  }
  if (status !== undefined && status !== null && status !== '') {
    const statusValue = typeof status === 'string' ? parseInt(status) : status
    filtered = filtered.filter((c) => c.status === statusValue)
  }
  const start = (page - 1) * pageSize
  const list = filtered.slice(start, start + Number(pageSize))
  return {
    list,
    pagination: { page: Number(page), pageSize: Number(pageSize), total: filtered.length }
  }
}

/** 校验准考证号是否重复（排除自身 id） */
function isAdmissionNoDuplicated(admissionNo, excludeId) {
  return mockExternalCandidates.some((c) => c.admissionNo === admissionNo && c.id !== excludeId)
}

/** 新增外部考生；准考证号重复时阻止，成功后生成考试账号 */
export function addExternalCandidateMock(data) {
  if (isAdmissionNoDuplicated(data.admissionNo)) {
    throw new Error(`准考证号【${data.admissionNo}】已存在，请更换`)
  }
  const now = new Date().toLocaleString('zh-CN')
  const newCandidate = {
    id: nextCandidateId++,
    name: data.name || '',
    admissionNo: data.admissionNo || '',
    company: data.company || '',
    idCard: data.idCard || '',
    phone: data.phone || '',
    email: data.email || '',
    status: 1,
    createTime: now
  }
  mockExternalCandidates.push(newCandidate)
  return newCandidate
}

/** 更新外部考生；准考证号不可修改，此处忽略传入的 admissionNo 变化 */
export function updateExternalCandidateMock(id, data) {
  const index = mockExternalCandidates.findIndex((c) => c.id === id)
  if (index === -1) throw new Error('外部考生不存在')
  mockExternalCandidates[index] = {
    ...mockExternalCandidates[index],
    name: data.name ?? mockExternalCandidates[index].name,
    company: data.company ?? mockExternalCandidates[index].company,
    idCard: data.idCard ?? mockExternalCandidates[index].idCard,
    phone: data.phone ?? mockExternalCandidates[index].phone,
    email: data.email ?? mockExternalCandidates[index].email
  }
  return mockExternalCandidates[index]
}

/** 更新账号状态（启用/停用） */
export function updateExternalCandidateStatusMock(id, status) {
  const index = mockExternalCandidates.findIndex((c) => c.id === id)
  if (index === -1) throw new Error('外部考生不存在')
  mockExternalCandidates[index].status = status
  return true
}

/** 重置考试账号密码，返回重置后的默认密码 */
export function resetExternalCandidatePasswordMock(id) {
  const exist = mockExternalCandidates.some((c) => c.id === id)
  if (!exist) throw new Error('外部考生不存在')
  return { password: 'Exam@123456' }
}

/** 删除外部考生；已分配考试时阻止 */
export function deleteExternalCandidateMock(id) {
  if (assignedIds.includes(id)) {
    throw new Error('该考生已分配考试，无法删除')
  }
  const index = mockExternalCandidates.findIndex((c) => c.id === id)
  if (index === -1) throw new Error('外部考生不存在')
  mockExternalCandidates.splice(index, 1)
  return true
}

/** 批量导入外部考生，模拟按模板生成账号并返回导入数量 */
export function importExternalCandidatesMock() {
  // 原型阶段不解析真实文件，固定模拟导入 3 条数据
  const now = new Date().toLocaleString('zh-CN')
  const seeds = [
    { name: '导入考生A', company: '批量导入单位', idCard: '', phone: '13900000001', email: '' },
    { name: '导入考生B', company: '批量导入单位', idCard: '', phone: '13900000002', email: '' },
    { name: '导入考生C', company: '批量导入单位', idCard: '', phone: '13900000003', email: '' }
  ]
  seeds.forEach((seed, i) => {
    mockExternalCandidates.push({
      id: nextCandidateId++,
      name: seed.name,
      admissionNo: `WBI${Date.now()}${i}`,
      company: seed.company,
      idCard: seed.idCard,
      phone: seed.phone,
      email: seed.email,
      status: 1,
      createTime: now
    })
  })
  return { count: seeds.length }
}
