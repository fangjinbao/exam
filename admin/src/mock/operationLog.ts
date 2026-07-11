// @ts-nocheck
/**
 * 操作日志 Mock 数据
 * 字段：operator(操作人)/type(操作类型)/target(操作对象)/content(操作内容)/operateTime(操作时间)/sourceIp(来源地址)
 * 操作类型枚举：新增 / 编辑 / 删除 / 登录 / 其他
 * 仅支持查看，无新增/编辑/删除
 * 列表返回 { list, pagination: { page, pageSize, total } }
 */

// ==================== 操作日志数据 ====================
export const mockOperationLogs = [
  {
    id: 1,
    operator: '张伟',
    type: '登录',
    target: '系统',
    content: '登录管理后台',
    operateTime: '2026-07-10 08:30:15',
    sourceIp: '192.168.1.101'
  },
  {
    id: 2,
    operator: '李娜',
    type: '新增',
    target: '题目管理',
    content: '新增单选题《安全生产基础知识》',
    operateTime: '2026-07-10 09:12:40',
    sourceIp: '192.168.1.102'
  },
  {
    id: 3,
    operator: '王强',
    type: '编辑',
    target: '试卷管理',
    content: '编辑固定试卷《2026年度安全考核卷》',
    operateTime: '2026-07-10 10:05:22',
    sourceIp: '192.168.1.103'
  },
  {
    id: 4,
    operator: '张伟',
    type: '删除',
    target: '知识点分类',
    content: '删除知识点分类《已废弃分类》',
    operateTime: '2026-07-10 11:20:08',
    sourceIp: '192.168.1.101'
  },
  {
    id: 5,
    operator: '刘洋',
    type: '编辑',
    target: 'AI模型配置',
    content: '切换启用模型为「通义千问-生产」',
    operateTime: '2026-07-10 14:33:51',
    sourceIp: '192.168.1.104'
  },
  {
    id: 6,
    operator: '李娜',
    type: '其他',
    target: '阅卷中心',
    content: '发起AI阅卷任务，试卷《期中测评》',
    operateTime: '2026-07-10 15:48:19',
    sourceIp: '192.168.1.102'
  },
  {
    id: 7,
    operator: '赵敏',
    type: '登录',
    target: '系统',
    content: '登录管理后台',
    operateTime: '2026-07-11 08:15:03',
    sourceIp: '192.168.1.105'
  },
  {
    id: 8,
    operator: '王强',
    type: '新增',
    target: '考试管理',
    content: '创建考试《七月安全月度考试》',
    operateTime: '2026-07-11 09:40:27',
    sourceIp: '192.168.1.103'
  },
  {
    id: 9,
    operator: '张伟',
    type: '编辑',
    target: '参数配置',
    content: '修改「录像保留期限(天)」为 60',
    operateTime: '2026-07-11 10:22:44',
    sourceIp: '192.168.1.101'
  },
  {
    id: 10,
    operator: '刘洋',
    type: '删除',
    target: '用户管理',
    content: '删除离职用户账号「test001」',
    operateTime: '2026-07-11 11:05:16',
    sourceIp: '192.168.1.104'
  },
  {
    id: 11,
    operator: '赵敏',
    type: '其他',
    target: '证书管理',
    content: '批量发放证书 32 份',
    operateTime: '2026-07-11 13:50:38',
    sourceIp: '192.168.1.105'
  },
  {
    id: 12,
    operator: '李娜',
    type: '编辑',
    target: '角色管理',
    content: '调整「考务人员」角色权限',
    operateTime: '2026-07-11 14:28:09',
    sourceIp: '192.168.1.102'
  }
]

// ==================== 操作日志 Mock 函数 ====================

/** 获取操作日志列表（分页），支持按操作人模糊、操作类型、操作时间范围筛选 */
export function getOperationLogListMock(params = {}) {
  const { operator, type, startTime, endTime, page = 1, pageSize = 10 } = params || {}
  let filtered = [...mockOperationLogs]
  if (operator) {
    filtered = filtered.filter((l) => l.operator.includes(operator))
  }
  if (type) {
    filtered = filtered.filter((l) => l.type === type)
  }
  // 操作时间范围按日期字符串前缀比较（YYYY-MM-DD）
  if (startTime) {
    filtered = filtered.filter((l) => l.operateTime.slice(0, 10) >= startTime)
  }
  if (endTime) {
    filtered = filtered.filter((l) => l.operateTime.slice(0, 10) <= endTime)
  }
  // 按操作时间倒序展示
  filtered = filtered.sort((a, b) => b.operateTime.localeCompare(a.operateTime))
  const start = (page - 1) * pageSize
  const list = filtered.slice(start, start + Number(pageSize))
  return {
    list,
    pagination: { page: Number(page), pageSize: Number(pageSize), total: filtered.length }
  }
}
