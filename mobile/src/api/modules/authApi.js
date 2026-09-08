/**
 * 文件名称：api/modules/authApi.js - 认证相关 API
 *
 * 功能描述：
 *   封装考生端认证相关的 API 接口，对接后端 /app/auth/* 真实接口
 *   包含登录、登出、获取个人信息、刷新 token
 *
 * 使用方式：
 *   import { loginApi, getCurrentUserApi } from '@/api/modules/authApi'
 *   const res = await loginApi({ account, password, userType: 'internal' })
 *
 * 说明：
 *   考生端与管理后台是两套独立的鉴权体系，token 互不通用。
 *   登录接口只返回 token，用户信息需登录后另外调 getCurrentUserApi 拉取。
 */

import request from '../request'

/**
 * 用户类型枚举
 * internal - 石化员工（来源：组织管理·人员管理，用统一身份账号登录）
 * external - 外部考生（来源：外部考生管理，用手机号登录）
 */
export const USER_TYPE = {
  INTERNAL: 'internal',
  EXTERNAL: 'external'
}

/**
 * 登录参数类型
 * @typedef {Object} LoginParams
 * @property {string} account - 登录账号：internal 为统一身份账号，external 为手机号
 * @property {string} password - 密码
 * @property {'internal'|'external'} userType - 用户类型
 */

/**
 * 考生端登录
 * @param {LoginParams} data - 登录参数
 * @returns {Promise<Object>} { code, data: { token, refreshToken, expire, userType }, message }
 * @example
 * loginApi({ account: 'E0001', password: '123456', userType: 'internal' })
 */
export const loginApi = (data) => {
  return request({
    url: '/auth/login',
    method: 'post',
    data
  })
}

/**
 * 获取当前登录者的身份信息（认证态）
 *
 * 两类用户返回同一结构，由 userType 区分来源；
 * 内部员工带 departmentId/departmentName，外部考生带 orgId/orgName。
 *
 * 命名注意：不要叫 getProfileApi——profileApi.js 里已有同名导出，那个打的是
 * /profile/info（「我的」页的业务数据，目前仍为 mock）。两者语义不同，
 * 同名会让后续维护者误 import 而不报错，数据源却悄悄换掉。
 *
 * @returns {Promise<Object>} { code, data: AppProfile, message }
 */
export const getCurrentUserApi = () => {
  return request({
    url: '/auth/profile',
    method: 'get'
  })
}

/**
 * 退出登录
 * 服务端会清除考生端会话缓存，使当前 token 立即失效。
 * @returns {Promise<Object>} { code, data: null, message }
 */
export const logoutApi = () => {
  return request({
    url: '/auth/logout',
    method: 'post',
    // 本地 token 未过期但服务端会话已失效时，本接口会返回 401。
    // 那属于「主动退出」而非「登录失效」，交给 userStore.logout 清态、页面自行跳转，
    // 不要触发拦截器的失效提示与整页跳转（否则文案矛盾且跳转叠加）。
    skipAuthRedirect: true
  })
}

/*
 * 刷新 token 不在此暴露方法：
 * 续期是拦截器层面的横切关注点，由 request.js 在收到 401 时自动完成（含并发去重、
 * 原请求重放、失败降级登出），业务代码不应也不需要手动调用。
 * 后端接口为 POST /app/auth/refreshToken。
 */
