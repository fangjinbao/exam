// @ts-nocheck
/**
 * AI模型配置 Mock 数据（仅 OpenAI / Anthropic 官方标准接入）
 * 字段：name/provider/model/apiUrl/apiKey/status(1启用0停用)/connStatus(normal/error/unknown)
 * 业务规则：
 *  - 全局仅一项 status=1（启用），切换启用时其余自动置 0
 *  - 密钥列表返回脱敏值（maskApiKey），不下发完整密钥
 *  - 当前启用项禁止删除
 * 列表返回 { list, pagination: { page, pageSize, total } }
 */

/** 密钥脱敏：仅保留首尾各 4 位，中间以 * 代替 */
function maskApiKey(key) {
  if (!key) return ''
  if (key.length <= 8) return '*'.repeat(key.length)
  return `${key.slice(0, 4)}${'*'.repeat(key.length - 8)}${key.slice(-4)}`
}

// ==================== AI模型数据（apiKey 为完整密钥，仅存于 mock 内部，不下发） ====================
export const mockAiModels = [
  {
    id: 1,
    name: 'OpenAI-示例',
    provider: 'OpenAI',
    model: 'gpt-4o',
    apiUrl: 'https://api.openai.com/v1',
    apiKey: '',
    status: 0,
    connStatus: 'unknown',
    createTime: '2026-05-01 10:00:00',
    updateTime: '2026-05-01 10:00:00'
  },
  {
    id: 2,
    name: 'Anthropic-示例',
    provider: 'Anthropic',
    model: 'claude-sonnet-4-20250514',
    apiUrl: 'https://api.anthropic.com/v1',
    apiKey: '',
    status: 0,
    connStatus: 'unknown',
    createTime: '2026-05-02 10:00:00',
    updateTime: '2026-05-02 10:00:00'
  }
]

let nextAiModelId = 10

/** 将内部记录转为下发给前端的对象（密钥脱敏，不含完整 apiKey） */
function toClient(item) {
  const { apiKey, ...rest } = item
  return { ...rest, apiKeyMasked: maskApiKey(apiKey) }
}

// ==================== AI模型 Mock 函数 ====================

/** 获取AI模型配置列表（分页），密钥脱敏返回 */
export function getAiModelListMock(params = {}) {
  const { page = 1, pageSize = 10 } = params || {}
  const start = (page - 1) * pageSize
  const list = mockAiModels.slice(start, start + Number(pageSize)).map(toClient)
  return {
    list,
    pagination: { page: Number(page), pageSize: Number(pageSize), total: mockAiModels.length }
  }
}

/** 校验配置名称全局唯一 */
function assertNameUnique(name, excludeId) {
  const dup = mockAiModels.some((m) => m.name === name && m.id !== excludeId)
  if (dup) throw new Error('配置名称已存在，请更换')
}

/** 新增AI模型配置 */
export function addAiModelMock(data) {
  assertNameUnique(data.name)
  const now = new Date().toLocaleString('zh-CN')
  const newModel = {
    id: nextAiModelId++,
    name: data.name || '',
    provider: data.provider || '',
    model: data.model || '',
    apiUrl: data.apiUrl || '',
    apiKey: data.apiKey || '',
    status: 0,
    connStatus: 'unknown',
    createTime: now,
    updateTime: now
  }
  mockAiModels.push(newModel)
  return toClient(newModel)
}

/** 更新AI模型配置；密钥留空表示不修改 */
export function updateAiModelMock(id, data) {
  const index = mockAiModels.findIndex((m) => m.id === id)
  if (index === -1) throw new Error('配置不存在')
  assertNameUnique(data.name, id)
  const target = mockAiModels[index]
  target.name = data.name ?? target.name
  target.provider = data.provider ?? target.provider
  target.model = data.model ?? target.model
  target.apiUrl = data.apiUrl ?? target.apiUrl
  // 密钥留空表示不修改，保留原值
  if (data.apiKey) target.apiKey = data.apiKey
  // 配置信息变更后连接状态失效，重置为未测试，提示用户重新测试
  target.connStatus = 'unknown'
  target.updateTime = new Date().toLocaleString('zh-CN')
  return toClient(target)
}

/** 删除AI模型配置；当前启用项禁止删除 */
export function deleteAiModelMock(id) {
  const target = mockAiModels.find((m) => m.id === id)
  if (!target) throw new Error('配置不存在')
  if (target.status === 1) throw new Error('该配置为当前启用模型，无法删除')
  const index = mockAiModels.findIndex((m) => m.id === id)
  mockAiModels.splice(index, 1)
  return true
}

/** 切换启用：将指定配置设为启用，其余自动停用（全局互斥） */
export function enableAiModelMock(id) {
  const target = mockAiModels.find((m) => m.id === id)
  if (!target) throw new Error('配置不存在')
  mockAiModels.forEach((m) => {
    m.status = m.id === id ? 1 : 0
  })
  return true
}

/** 连接测试：mock 阶段按是否填写密钥判定（真实连接由后端向服务商发请求） */
export function testAiModelMock(id) {
  const target = mockAiModels.find((m) => m.id === id)
  if (!target) throw new Error('配置不存在')
  const ok = Boolean(target.apiKey && target.apiUrl)
  target.connStatus = ok ? 'normal' : 'error'
  target.updateTime = new Date().toLocaleString('zh-CN')
  return { success: ok, message: ok ? '连接测试成功' : '未配置密钥或接口地址' }
}
