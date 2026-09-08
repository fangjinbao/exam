/**
 * 文件名称：api/modules/profileApi.js - 我的模块 API
 *
 * 功能描述：
 *   封装个人信息查询与更新、我的成绩列表与详情、
 *   我的证书列表、详情与下载接口
 *
 * 使用方式：
 *   import { updateProfileApi } from '@/api/modules/profileApi'
 */

import request from '../request'

/**
 * 获取个人信息
 *
 * 打 app-auth 的 /auth/profile：后端已实现，返回姓名、手机号、邮箱、
 * 所属单位（internal 由部门树上溯到公司节点）与所属部门。
 * 原先的 /profile/info 后端无对应模块，会 404。
 *
 * @returns {Promise<Object>} 个人基本信息
 * @example getProfileApi()
 */
export const getProfileApi = () => {
  return request({
    url: '/auth/profile',
    method: 'get'
  })
}

/**
 * 更新个人信息
 * @param {Object} data - 个人信息
 * @param {string} data.name - 姓名（2-20 字，必填）
 * @param {string} data.phone - 联系电话（11 位手机号，必填）
 * @param {string} [data.email] - 电子邮箱（最多 50 字，选填）
 * @returns {Promise<Object>} 更新结果
 * @example updateProfileApi({ name: '张建国', phone: '13800138000' })
 */
export const updateProfileApi = (data) => {
  return request({
    // 走 app-auth 模块：个人信息的读写都在 /auth/profile 下，与 token 身份同源
    url: '/auth/profile',
    method: 'put',
    data
  })
}

/**
 * 获取我的成绩列表（仅已发布成绩）
 * @returns {Promise<Object>} 历次考试成绩
 * @example getScoreListApi()
 */
export const getScoreListApi = () => {
  return request({
    url: '/profile/score-list',
    method: 'get'
  })
}

/**
 * 获取成绩详情（单次考试的作答与得分）
 * @param {number|string} sheetId - 答卷 ID
 * @returns {Promise<Object>} 逐题作答、正确答案与解析
 * @example getScoreDetailApi(9001)
 */
export const getScoreDetailApi = (sheetId) => {
  return request({
    url: '/profile/score-detail',
    method: 'get',
    params: { sheetId }
  })
}

/**
 * 获取我的证书列表
 * @returns {Promise<Object>} 已获得的证书列表
 * @example getCertificateListApi()
 */
export const getCertificateListApi = () => {
  return request({
    url: '/profile/certificate-list',
    method: 'get'
  })
}

/**
 * 获取证书详情
 * @param {number|string} id - 证书 ID
 * @returns {Promise<Object>} 证书详情
 * @example getCertificateDetailApi(6001)
 */
export const getCertificateDetailApi = (id) => {
  return request({
    url: '/profile/certificate-detail',
    method: 'get',
    params: { id }
  })
}

/**
 * 下载证书
 * @param {Object} data - 下载参数
 * @param {number|string} data.id - 证书 ID
 * @returns {Promise<Object>} 下载结果（文件名）
 * @example downloadCertificateApi({ id: 6001 })
 */
export const downloadCertificateApi = (data) => {
  return request({
    url: '/profile/certificate-download',
    method: 'post',
    data
  })
}

