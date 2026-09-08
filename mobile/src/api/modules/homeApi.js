/**
 * 文件名称：api/modules/homeApi.js - 首页相关 API
 *
 * 功能描述：
 *   封装首页待考提醒与数据概览接口
 *
 * 使用方式：
 *   import { getUpcomingExamsApi, getOverviewApi } from '@/api/modules/homeApi'
 */

import request from '../request'

/**
 * 获取待考提醒列表
 * @returns {Promise<Object>} 待参加的考试列表（含实时状态）
 * @example getUpcomingExamsApi()
 */
export const getUpcomingExamsApi = () => {
  return request({
    url: '/home/upcoming',
    method: 'get'
  })
}

/**
 * 获取个人数据概览
 * @returns {Promise<Object>} 已参加考试数、练习题数、已获证书数、错题数
 * @example getOverviewApi()
 */
export const getOverviewApi = () => {
  return request({
    url: '/home/overview',
    method: 'get'
  })
}
