// @ts-nocheck
/**
 * 参数配置 Mock 数据
 * 字段：name(参数名称)/value(参数值)/description(参数说明)
 * valueType：参数值类型(int)，min/max：允许范围，用于提交校验
 * 列表返回 { list, pagination: { page, pageSize, total } }
 */

// ==================== 参数数据 ====================
export const mockParamConfigs = [
  {
    id: 1,
    name: '录像保留期限(天)',
    value: '30',
    description: '监考录像的自动保留天数，超期后系统自动清理，取值范围 1-365',
    valueType: 'int',
    min: 1,
    max: 365,
    updateTime: '2026-06-01 09:00:00'
  },
  {
    id: 2,
    name: '考试自动交卷提前提醒时间(分钟)',
    value: '5',
    description: '考试结束前多少分钟提醒考生交卷，取值范围 1-30',
    valueType: 'int',
    min: 1,
    max: 30,
    updateTime: '2026-06-01 09:00:00'
  },
  {
    id: 3,
    name: '登录密码最小长度',
    value: '8',
    description: '用户登录密码的最小字符数，取值范围 6-20',
    valueType: 'int',
    min: 6,
    max: 20,
    updateTime: '2026-06-01 09:00:00'
  },
  {
    id: 4,
    name: '单次AI出题最大数量',
    value: '20',
    description: '单次调用AI出题可生成的题目上限，取值范围 1-100',
    valueType: 'int',
    min: 1,
    max: 100,
    updateTime: '2026-06-01 09:00:00'
  },
  {
    id: 5,
    name: '操作日志保留期限(天)',
    value: '90',
    description: '操作日志的自动保留天数，超期后系统自动清理，取值范围 30-730',
    valueType: 'int',
    min: 30,
    max: 730,
    updateTime: '2026-06-01 09:00:00'
  }
]

// ==================== 参数配置 Mock 函数 ====================

/** 获取参数配置列表（分页） */
export function getParamConfigListMock(params = {}) {
  const { page = 1, pageSize = 10 } = params || {}
  const start = (page - 1) * pageSize
  const list = mockParamConfigs.slice(start, start + Number(pageSize))
  return {
    list,
    pagination: { page: Number(page), pageSize: Number(pageSize), total: mockParamConfigs.length }
  }
}

/** 更新参数值；超出预设范围时抛出错误 */
export function updateParamConfigMock(id, value) {
  const index = mockParamConfigs.findIndex((p) => p.id === id)
  if (index === -1) throw new Error('参数不存在')
  const target = mockParamConfigs[index]
  // 整数类型参数校验取值范围
  if (target.valueType === 'int') {
    const num = Number(value)
    if (!Number.isInteger(num) || num < target.min || num > target.max) {
      throw new Error('参数值超出允许范围')
    }
  }
  target.value = String(value)
  target.updateTime = new Date().toLocaleString('zh-CN')
  return target
}
