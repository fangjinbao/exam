/**
 * 文件名称：mock/index.js - Mock 数据配置
 *
 * 功能描述：
 *   Mock.js 数据模拟配置，用于开发环境模拟后端接口
 *   无需真实后端即可进行前端开发和测试
 *
 * 使用方式：
 *   在 main.js 中导入即可自动拦截 API 请求
 *   import '@/mock'
 *
 * 主要功能：
 *   - 配置 Mock 延迟时间
 *   - 定义模拟接口和响应数据
 *   - 使用 Mock.js 语法生成随机数据
 */

import Mock from 'mockjs'
import { getUpcomingExams, getOverview } from './modules/home'
import {
  getExamList,
  getExamDetail,
  getExamPaper,
  saveAnswer,
  submitExam,
  reportSwitchAlarm,
  getExamResult
} from './modules/exam'
import {
  getPracticeOptions,
  getPracticeQuestions,
  submitPractice,
  getWrongList,
  getWrongQuestions
} from './modules/practice'
import { getMessageList, getMessageDetail, getUnreadCount } from './modules/message'
import {
  getProfile,
  updateProfile,
  getScoreList,
  getScoreDetail,
  getCertificateList,
  getCertificateDetail,
  downloadCertificate
} from './modules/profile'

// 配置 Mock
Mock.setup({
  timeout: '200-600' // 模拟网络延迟（200-600ms）
})

/**
 * 认证相关接口：已对接真实后端，不再 mock
 *
 * 登录/登出/个人信息/刷新 token 走后端 /app/auth/*（见 api/modules/authApi.js）。
 * Mock.js 只拦截此处注册的路径，未注册的请求会正常发到网络层，
 * 因此这里不注册即等于放行到真实后端。
 * 其余业务接口后端尚未实现，仍由下方 mock 兜住。
 */

/**
 * 首页相关接口
 */
Mock.mock(/\/app\/home\/upcoming/, 'get', getUpcomingExams)
Mock.mock(/\/app\/home\/overview/, 'get', getOverview)

/**
 * 考试相关接口
 */
Mock.mock(/\/app\/exam\/list/, 'get', getExamList)
Mock.mock(/\/app\/exam\/detail/, 'get', getExamDetail)
Mock.mock(/\/app\/exam\/result/, 'get', getExamResult)
Mock.mock(/\/app\/exam\/paper/, 'get', getExamPaper)
Mock.mock(/\/app\/exam\/save-answer/, 'post', saveAnswer)
Mock.mock(/\/app\/exam\/submit/, 'post', submitExam)
Mock.mock(/\/app\/exam\/switch-alarm/, 'post', reportSwitchAlarm)

/**
 * 在线练习 / 错题本接口
 */
Mock.mock(/\/app\/practice\/options/, 'get', getPracticeOptions)
Mock.mock(/\/app\/practice\/wrong-questions/, 'get', getWrongQuestions)
Mock.mock(/\/app\/practice\/wrong-list/, 'get', getWrongList)
Mock.mock(/\/app\/practice\/questions/, 'get', getPracticeQuestions)
Mock.mock(/\/app\/practice\/submit/, 'post', submitPractice)

/**
 * 消息相关接口
 */
Mock.mock(/\/app\/message\/unread-count/, 'get', getUnreadCount)
Mock.mock(/\/app\/message\/list/, 'get', getMessageList)
Mock.mock(/\/app\/message\/detail/, 'get', getMessageDetail)

/**
 * 我的（个人信息 / 成绩 / 证书）相关接口
 */
Mock.mock(/\/app\/profile\/info/, 'get', getProfile)
Mock.mock(/\/app\/profile\/update/, 'post', updateProfile)
Mock.mock(/\/app\/profile\/score-list/, 'get', getScoreList)
Mock.mock(/\/app\/profile\/score-detail/, 'get', getScoreDetail)
Mock.mock(/\/app\/profile\/certificate-list/, 'get', getCertificateList)
Mock.mock(/\/app\/profile\/certificate-detail/, 'get', getCertificateDetail)
Mock.mock(/\/app\/profile\/certificate-download/, 'post', downloadCertificate)

export default Mock
