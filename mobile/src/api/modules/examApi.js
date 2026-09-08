/**
 * 文件名称：api/modules/examApi.js - 考试相关 API
 *
 * 功能描述：
 *   封装考生端考试接口：考试列表、详情、交卷结果、取卷、
 *   答案自动保存、交卷、切屏告警上报
 *
 * 使用方式：
 *   import { getExamListApi, submitExamApi } from '@/api/modules/examApi'
 */

import request from '../request'

/**
 * 获取可参加的考试列表
 * @returns {Promise<Object>} 考试列表（含实时状态与是否已交卷）
 * @example getExamListApi()
 */
export const getExamListApi = () => {
  return request({
    url: '/exam/list',
    method: 'get'
  })
}

/**
 * 获取考试详情
 * @param {number|string} id - 考试 ID
 * @returns {Promise<Object>} 考试详情
 * @example getExamDetailApi(1)
 */
export const getExamDetailApi = (id) => {
  return request({
    url: '/exam/detail',
    method: 'get',
    params: { id }
  })
}

/**
 * 获取交卷结果详情
 * 含主观题时成绩待阅卷发布，返回的分数字段为 null，需按 scoreReleased 判断
 * @param {number|string} examId - 考试 ID
 * @returns {Promise<Object>} 交卷时间、切屏次数与成绩
 * @example getExamResultApi(1)
 */
export const getExamResultApi = (examId) => {
  return request({
    url: '/exam/result',
    method: 'get',
    params: { examId }
  })
}

/**
 * 进入作答取卷（含剩余时间与已保存答案）
 * @param {number|string} examId - 考试 ID
 * @returns {Promise<Object>} 试题列表、剩余秒数与作答进度
 * @example getExamPaperApi(1)
 */
export const getExamPaperApi = (examId) => {
  return request({
    url: '/exam/paper',
    method: 'get',
    params: { examId }
  })
}

/**
 * 保存单题答案（作答期间自动保存）
 * @param {Object} data - 保存参数
 * @param {number|string} data.examId - 考试 ID
 * @param {number|string} data.questionId - 题目 ID
 * @param {string|string[]} data.answer - 考生作答
 * @returns {Promise<Object>} 保存结果
 * @example saveAnswerApi({ examId: 1, questionId: 101, answer: 'B' })
 */
export const saveAnswerApi = (data) => {
  return request({
    url: '/exam/save-answer',
    method: 'post',
    data
  })
}

/**
 * 交卷（交卷后不可再修改答案）
 * @param {Object} data - 交卷参数
 * @param {number|string} data.examId - 考试 ID
 * @returns {Promise<Object>} 交卷结果（客观题得分与是否待阅卷）
 * @example submitExamApi({ examId: 1 })
 */
export const submitExamApi = (data) => {
  return request({
    url: '/exam/submit',
    method: 'post',
    data
  })
}

/**
 * 上报切屏告警（作答期间检测到切屏时调用）
 * @param {Object} data - 上报参数
 * @param {number|string} data.examId - 考试 ID
 * @returns {Promise<Object>} 上报结果（累计切屏次数）
 * @example reportSwitchAlarmApi({ examId: 1 })
 */
export const reportSwitchAlarmApi = (data) => {
  return request({
    url: '/exam/switch-alarm',
    method: 'post',
    data
  })
}



