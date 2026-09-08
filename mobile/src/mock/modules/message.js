/**
 * 文件名称：mock/modules/message.js - 消息模块 Mock 数据
 *
 * 功能描述：
 *   模拟消息通知列表、消息详情接口
 *   查看详情后自动将该消息标记为已读
 *
 * 使用方式：
 *   在 mock/index.js 中导入并注册
 */

import { messages } from '../data/examData'
import { MESSAGE_TYPE_TEXT } from '@/constants/exam'

/**
 * 从请求 URL 中解析查询参数
 * @param {string} url - 请求地址
 * @param {string} key - 参数名
 * @returns {string} 参数值，不存在返回空字符串
 */
const getQuery = (url, key) => {
  const matched = new RegExp(`[?&]${key}=([^&]*)`).exec(url || '')
  return matched ? decodeURIComponent(matched[1]) : ''
}

/**
 * 未读消息数：GET /api/message/unread-count
 * 供首页铃铛角标使用，避免为一个数字拉取完整列表
 * @returns {Object} 未读数量
 */
export const getUnreadCount = () => {
  return {
    code: 200,
    message: '获取成功',
    data: { unreadCount: messages.filter((item) => !item.isRead).length }
  }
}

/**
 * 消息列表：GET /api/message/list
 * 按时间倒序返回，同时给出未读数量
 * @returns {Object} 消息列表与未读数
 */
export const getMessageList = () => {
  const list = [...messages]
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .map((item) => ({
      id: item.id,
      title: item.title,
      type: item.type,
      typeText: MESSAGE_TYPE_TEXT[item.type],
      time: item.time,
      isRead: item.isRead
    }))

  return {
    code: 200,
    message: '获取成功',
    data: { list, unreadCount: messages.filter((item) => !item.isRead).length }
  }
}

/**
 * 消息详情：GET /api/message/detail?id=
 * 读取后将该消息标记为已读
 * @param {Object} options - Mock 请求配置
 * @returns {Object} 消息详情
 */
export const getMessageDetail = (options) => {
  const id = getQuery(options.url, 'id')
  const target = messages.find((item) => item.id === Number(id))

  if (!target) {
    return { code: 404, message: '消息不存在', data: null }
  }

  // 查看详情即标记已读
  target.isRead = true

  return {
    code: 200,
    message: '获取成功',
    data: {
      id: target.id,
      title: target.title,
      type: target.type,
      typeText: MESSAGE_TYPE_TEXT[target.type],
      time: target.time,
      content: target.content,
      isRead: true
    }
  }
}
