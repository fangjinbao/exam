/**
 * 文件名称：api/request.js - Axios 请求封装
 *
 * 功能描述：
 *   封装 Axios HTTP 客户端，提供统一的请求和响应处理
 *   包含请求拦截器、响应拦截器、错误处理等功能
 *
 * 使用方式：
 *   import request from '@/api/request'
 *   request.get('/api/users')
 *   request.post('/api/login', { username, password })
 *
 * 主要功能：
 *   - 统一的请求配置（baseURL、timeout、headers）
 *   - 自动添加 Token 到请求头
 *   - 统一的响应数据处理
 *   - 统一的错误提示和处理
 */

import axios from 'axios'
import { showToast } from 'vant'
import {
  setToken,
  getRefreshToken,
  removeToken,
  removeRefreshToken,
  removeUserInfo,
  removeUserType
} from '@/utils/storage'

/** 防止并发请求同时触发多次跳转 */
let redirecting = false

/**
 * 正在进行的刷新请求（Promise 去重）
 *
 * access token 默认 2 小时过期、refresh token 15 天。页面上多个请求可能同时拿到 401，
 * 若各自去刷新会：① 打多次刷新请求；② 后完成的那次覆盖前一次签发的 token，
 * 导致前面已用新 token 重放的请求再次失效。所以同一时刻只允许一次刷新，
 * 其余请求共享同一个 Promise。
 * @type {Promise<string|null>|null}
 */
let refreshingPromise = null

/**
 * 用 refresh token 换取新的 access token
 *
 * 用裸 axios 而非本模块的 request 实例：避免刷新请求本身再次被响应拦截器处理，
 * 否则刷新失败会递归触发 401 处理。
 *
 * @returns {Promise<string|null>} 新的 access token；无法刷新时返回 null
 */
const refreshAccessToken = async () => {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return null

  try {
    const { data } = await axios.post(
      `${request.defaults.baseURL}/auth/refreshToken`,
      { refreshToken },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
    )
    if (data?.code === 200 && data?.data?.token) {
      setToken(data.data.token)
      return data.data.token
    }
    return null
  } catch (error) {
    // 刷新失败（refresh token 过期/被注销、后端 5xx、网络超时）→ 交由调用方走登出流程。
    // 这三种情况对用户都表现为「被登出」，但排障时需要区分，所以留一行日志。
    // 生产构建会由 terser 的 drop_console 清掉，不会带进包体。
    console.error('刷新 token 失败，将按登录失效处理：', error)
    return null
  }
}

/**
 * 单例化的刷新入口：并发调用共享同一次刷新
 * @returns {Promise<string|null>} 新的 access token，失败为 null
 */
const refreshTokenOnce = () => {
  if (!refreshingPromise) {
    refreshingPromise = refreshAccessToken().finally(() => {
      refreshingPromise = null
    })
  }
  return refreshingPromise
}

/**
 * 处理 401 登录失效
 *
 * 直接操作 storage 而不引入 userStore：
 * userStore → authApi → request 已构成引用链，此处再 import store 会形成循环依赖。
 * 用整页跳转而非 router.push，顺带丢弃上一会话遗留的所有页面缓存与内存状态。
 *
 * 注意：路由是 createWebHistory（history 模式），跳转必须走 pathname，
 * 不能改 window.location.hash——那样只会追加一个 fragment 而不会真正导航。
 */
const handleUnauthorized = () => {
  removeToken()
  removeRefreshToken()
  removeUserInfo()
  removeUserType()

  // 已在登录页则不再跳，避免循环
  if (redirecting || window.location.pathname.startsWith('/login')) return
  redirecting = true

  showToast('登录已失效，请重新登录')
  const redirect = encodeURIComponent(
    window.location.pathname + window.location.search
  )
  // 不在跳转后把 redirecting 置回 false：assign 是异步导航，当前 tick 仍会继续执行，
  // 若此时又来一个 401 就会重复弹 toast 并再排一次跳转。页面即将销毁，无需恢复。
  setTimeout(() => {
    window.location.assign(`/login?redirect=${redirect}`)
  }, 300)
}

/**
 * 通用响应接口类型定义
 * @typedef {Object} ApiResponse
 * @property {number} code - 响应码（200 表示成功）
 * @property {*} data - 响应数据
 * @property {string} message - 响应消息
 */

// 创建 axios 实例
const request = axios.create({
  // 考生端接口统一在后端 /app 前缀下（管理后台是 /admin，两套鉴权体系互不通用）
  baseURL: import.meta.env.VITE_API_BASE_URL || '/app',
  timeout: 10000, // 请求超时时间（10秒）
  headers: {
    'Content-Type': 'application/json' // 默认请求头
  }
})

/**
 * 请求拦截器
 * 在请求发送前执行，用于添加 Token、修改请求配置等
 */
request.interceptors.request.use(
  (config) => {
    // 从 localStorage 获取 token 并添加到请求头
    const token = localStorage.getItem('token')
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    // 请求错误处理
    return Promise.reject(error)
  }
)

/**
 * 响应拦截器
 * 在响应返回后执行，用于统一处理响应数据和错误
 */
request.interceptors.response.use(
  (response) => {
    const { code, message } = response.data

    // 成功响应（code 为 200）
    if (code === 200) {
      return response.data
    }

    // 业务错误（code 不为 200）
    showToast(message || '请求失败')
    return Promise.reject(new Error(message || '请求失败'))
  },
  async (error) => {
    // 网络错误或 HTTP 状态码错误
    if (error.response) {
      const { status, data } = error.response
      const config = error.config || {}

      // 401：先尝试用 refresh token 静默续期，失败才走登出。
      // 考试场景下 access token 默认 2 小时，考生答到一半被强制重登是不可接受的，
      // 而 refresh token 有 15 天，足以覆盖整场考试。
      //
      // 三种情况不尝试刷新，直接按失效处理：
      // ① 调用方声明 skipAuthRedirect（如主动登出，见 authApi.logoutApi）
      // ② 本次失败的就是刷新请求自身（防递归）
      // ③ 该请求已经重放过一次（防无限重试）
      if (status === 401) {
        const isRefreshCall = (config.url || '').includes('/auth/refreshToken')

        if (config.skipAuthRedirect || isRefreshCall || config._retried) {
          if (!config.skipAuthRedirect) {
            handleUnauthorized()
          }
          return Promise.reject(error)
        }

        const newToken = await refreshTokenOnce()
        if (newToken) {
          // 重放原请求。不必在此手动设 Authorization：refreshAccessToken 已把新 token
          // 写进 storage，重放会再走一遍请求拦截器、由它统一读取并覆盖该头。
          // _retried 打标防止重放后再次 401 造成死循环。
          config._retried = true
          return request(config)
        }

        handleUnauthorized()
        return Promise.reject(error)
      }

      // 业务校验类错误（400）与业务拒绝（403）后端都会给出明确中文 message，
      // 优先展示它。403 尤其重要：后端给的是「成绩尚未发布」「作答时长已用尽，
      // 请交卷」「考试已结束」这类可行动的信息，笼统的「拒绝访问」会让用户不知所措
      if ((status === 400 || status === 403) && data?.message) {
        showToast(data.message)
        return Promise.reject(error)
      }

      // HTTP 状态码错误提示映射
      const errorMap = {
        403: '拒绝访问',
        404: '请求的资源不存在',
        500: '服务器错误',
        502: '网关错误',
        503: '服务不可用'
      }
      showToast(errorMap[status] || data?.message || '请求失败')
    } else {
      // 网络连接失败
      showToast('网络连接失败')
    }
    return Promise.reject(error)
  }
)

export default request
