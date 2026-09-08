/**
 * 文件名称：api/modules/practiceApi.js - 在线练习 / 错题本 API
 *
 * 功能描述：
 *   封装岗位练兵列表、自主练习取题与逐题提交、错题本与错题重练接口
 *
 * 使用方式：
 *   import { getPracticeQuestionsApi, getWrongListApi } from '@/api/modules/practiceApi'
 *
 * 说明：
 *   路径不带 /app 前缀——request.js 的 baseURL 已是 /app（见 .env 的
 *   VITE_API_BASE_URL），此处再带一次会打成 /app/app/practice/* 而 404。
 *   后端路由本身带 /app，vite proxy 直通不做 rewrite。
 */

import request from '../request'

/**
 * 我的岗位练兵列表
 * @returns {Promise<Object>} 练习列表（含我的进度与是否可练）
 * @example getAssignedPracticeListApi()
 */
export const getAssignedPracticeListApi = () => {
  return request({
    url: '/practice/list',
    method: 'get'
  })
}

/**
 * 我的练习概览（题库数、已练题数、正确率、进行中）
 * @returns {Promise<Object>} 四项统计数据
 * @example getPracticeStatsApi()
 */
export const getPracticeStatsApi = () => {
  return request({
    url: '/practice/stats',
    method: 'get'
  })
}

/**
 * 获取自主练习范围选项（题库与知识点）
 * @returns {Promise<Object>} 题库列表与知识点列表
 * @example getPracticeOptionsApi()
 */
export const getPracticeOptionsApi = () => {
  return request({
    url: '/practice/options',
    method: 'get'
  })
}

/**
 * 取练习题（岗位练兵 / 自主练习 / 错题重练）
 * @param {Object} params - 取题参数
 * @param {number|string} [params.practiceId] - 岗位练兵 ID
 * @param {number|string} [params.bankId] - 题库 ID（自主练习）
 * @param {number|string} [params.knowledgePointId] - 知识点 ID（自主练习）
 * @param {string} [params.mode] - 传 wrong 表示错题重练
 * @returns {Promise<Object>} 练习记录 ID、题目列表、练习设置与断点题序
 * @example getPracticeQuestionsApi({ practiceId: 1 })
 */
export const getPracticeQuestionsApi = (params) => {
  return request({
    url: '/practice/questions',
    method: 'get',
    params
  })
}

/**
 * 提交单题作答并即时判分
 * @param {Object} data - 作答数据
 * @param {number} data.recordId - 练习记录 ID
 * @param {number} data.questionNo - 题序
 * @param {string} data.answer - 我的作答
 * @returns {Promise<Object>} 是否答对与累计进度
 * @example submitPracticeAnswerApi({ recordId: 1, questionNo: 1, answer: 'B' })
 */
export const submitPracticeAnswerApi = (data) => {
  return request({
    url: '/practice/answer',
    method: 'post',
    data
  })
}

/**
 * 结束整份练习
 * @param {Object} data - 提交数据
 * @param {number} data.recordId - 练习记录 ID
 * @returns {Promise<Object>} 题数、答对数与正确率
 * @example finishPracticeApi({ recordId: 1 })
 */
export const finishPracticeApi = (data) => {
  return request({
    url: '/practice/finish',
    method: 'post',
    data
  })
}

/**
 * 获取错题本列表
 * @returns {Promise<Object>} 错题列表（含答错次数与来源）
 * @example getWrongListApi()
 */
export const getWrongListApi = () => {
  return request({
    url: '/practice/wrong-list',
    method: 'get'
  })
}

/**
 * 错题重练取题
 * @returns {Promise<Object>} 练习记录 ID 与错题列表
 * @example getWrongQuestionsApi()
 */
export const getWrongQuestionsApi = () => {
  return request({
    url: '/practice/questions',
    method: 'get',
    params: { mode: 'wrong' }
  })
}

/**
 * 收藏 / 取消收藏题目（同一接口按当前状态翻转）
 * @param {Object} data - 请求数据
 * @param {number} data.questionId - 题目 ID
 * @returns {Promise<Object>} { favorited } 翻转后的收藏态
 * @example toggleFavoriteApi({ questionId: 1 })
 */
export const toggleFavoriteApi = (data) => {
  return request({
    url: '/practice/favorite/toggle',
    method: 'post',
    data
  })
}

/**
 * 批量查询指定题目的收藏态
 * @param {Object} params - 查询参数
 * @param {string} params.questionIds - 题目 ID，逗号分隔
 * @returns {Promise<number[]>} 其中已收藏的题目 ID
 * @example getFavoriteIdsApi({ questionIds: '1,2,3' })
 */
export const getFavoriteIdsApi = (params) => {
  return request({
    url: '/practice/favorite/ids',
    method: 'get',
    params
  })
}

/**
 * 收藏列表
 * @returns {Promise<Array>} 收藏的题目列表
 * @example getFavoriteListApi()
 */
export const getFavoriteListApi = () => {
  return request({
    url: '/practice/favorite/list',
    method: 'get'
  })
}
