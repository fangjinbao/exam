/**
 * 文件名称：api/modules/messageApi.js - 消息相关 API
 *
 * 功能描述：
 *   封装消息通知列表与消息详情接口
 *   读取详情时后端会将该消息标记为已读
 *
 * 使用方式：
 *   import { getMessageListApi, getMessageDetailApi } from '@/api/modules/messageApi'
 */

import request from '../request'

/**
 * 获取未读消息数量
 * 供首页铃铛角标使用，比消息列表接口更轻
 * @returns {Promise<Object>} 未读数量
 * @example getUnreadCountApi()
 */
export const getUnreadCountApi = () => {
  return request({
    url: '/message/unread-count',
    method: 'get'
  })
}

/**
 * 获取消息列表
 * @returns {Promise<Object>} 消息列表与未读数量
 * @example getMessageListApi()
 */
export const getMessageListApi = () => {
  return request({
    url: '/message/list',
    method: 'get'
  })
}

/**
 * 获取消息详情（读取后自动标记已读）
 * @param {number|string} id - 消息 ID
 * @returns {Promise<Object>} 消息详情
 * @example getMessageDetailApi(5001)
 */
export const getMessageDetailApi = (id) => {
  return request({
    url: '/message/detail',
    method: 'get',
    params: { id }
  })
}
