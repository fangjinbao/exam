// @ts-nocheck
/**
 * 系统配置 Mock 数据（基础配置）
 * 基础配置为单一配置对象（非列表），字段与页面表单保持一致：
 * - sysName/sysLogo/sysDesc/timezone/dateFormat
 * - 获取返回完整配置对象，保存接收完整字段并覆盖持久化
 */

// ==================== 基础配置数据 ====================
// 模块级变量持久化，模拟服务端已保存的配置
const mockBaseConfig = {
  sysName: 'PM能源科技智慧厂区巡检平台',
  sysLogo: '',
  sysDesc: '面向能源厂区的设备巡检、隐患整改与数字化监管一体化平台',
  timezone: '(UTC+08:00) 北京',
  dateFormat: 'YYYY-MM-DD'
}

/**
 * 获取基础配置
 */
export function getBaseConfigMock() {
  return { ...mockBaseConfig }
}

/**
 * 保存基础配置（整体覆盖）
 */
export function updateBaseConfigMock(data = {}) {
  // 系统名称必填校验（服务端兜底）
  if (!data.sysName || !String(data.sysName).trim()) {
    throw new Error('请填写系统名称')
  }
  Object.assign(mockBaseConfig, {
    sysName: data.sysName,
    sysLogo: data.sysLogo ?? '',
    sysDesc: data.sysDesc ?? '',
    timezone: data.timezone,
    dateFormat: data.dateFormat
  })
  return { ...mockBaseConfig }
}
