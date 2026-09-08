/**
 * 文件名称：utils/storage.js - 本地存储工具函数
 *
 * 功能描述：
 *   封装 localStorage 操作，提供统一的本地存储接口
 *   包含 token、用户信息等数据的存储和读取
 *
 * 使用方式：
 *   import { getToken, setToken, removeToken } from '@/utils/storage'
 *   setToken('your-token')
 *   const token = getToken()
 *
 * 主要功能：
 *   - Token 管理（存储、读取、删除）
 *   - 用户信息管理（存储、读取、删除）
 *   - 通用存储方法（支持任意数据类型）
 */

// 存储键名常量
const TOKEN_KEY = 'token'
const USER_INFO_KEY = 'userInfo'
const REFRESH_TOKEN_KEY = 'refreshToken'
const USER_TYPE_KEY = 'userType'
/** 记住的登录账号（只存账号与用户类型，不含密码） */
const REMEMBERED_LOGIN_KEY = 'rememberedLogin'

/**
 * 获取 Token
 * @returns {string|null} Token 字符串，不存在则返回 null
 * @example getToken() // 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
 */
export const getToken = () => {
  return localStorage.getItem(TOKEN_KEY)
}

/**
 * 设置 Token
 * @param {string} token - Token 字符串
 * @example setToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')
 */
export const setToken = (token) => {
  localStorage.setItem(TOKEN_KEY, token)
}

/**
 * 删除 Token
 * @example removeToken()
 */
export const removeToken = () => {
  localStorage.removeItem(TOKEN_KEY)
}

/**
 * 获取用户信息
 * @returns {Object|null} 用户信息对象，不存在则返回 null
 * @example getUserInfo() // { id: 1, name: '张三', avatar: '...' }
 */
export const getUserInfo = () => {
  const userInfo = localStorage.getItem(USER_INFO_KEY)
  if (!userInfo) return null

  try {
    return JSON.parse(userInfo)
  } catch (error) {
    console.error('解析用户信息失败：', error)
    return null
  }
}

/**
 * 设置用户信息
 * @param {Object} userInfo - 用户信息对象
 * @example setUserInfo({ id: 1, name: '张三', avatar: '...' })
 */
export const setUserInfo = (userInfo) => {
  localStorage.setItem(USER_INFO_KEY, JSON.stringify(userInfo))
}

/**
 * 删除用户信息
 * @example removeUserInfo()
 */
export const removeUserInfo = () => {
  localStorage.removeItem(USER_INFO_KEY)
}

/**
 * 获取刷新 Token
 * @returns {string|null} refreshToken 字符串，不存在则返回 null
 */
export const getRefreshToken = () => {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

/**
 * 设置刷新 Token
 * @param {string} refreshToken - refreshToken 字符串
 */
export const setRefreshToken = (refreshToken) => {
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
}

/**
 * 删除刷新 Token
 */
export const removeRefreshToken = () => {
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

/**
 * 获取用户类型
 * @returns {'internal'|'external'|null} 用户类型，不存在则返回 null
 */
export const getUserType = () => {
  return localStorage.getItem(USER_TYPE_KEY)
}

/**
 * 设置用户类型
 * @param {'internal'|'external'} userType - 用户类型
 */
export const setUserType = (userType) => {
  localStorage.setItem(USER_TYPE_KEY, userType)
}

/**
 * 删除用户类型
 */
export const removeUserType = () => {
  localStorage.removeItem(USER_TYPE_KEY)
}

/**
 * 获取记住的登录账号
 *
 * 只记账号与用户类型，不记密码——密码留在本地会在设备被他人取用时直接泄露，
 * 「记住用户」的通行做法也只是免去重复输入账号。
 *
 * @returns {{account: string, userType: string}|null} 记住的账号信息，无则返回 null
 */
export const getRememberedLogin = () => {
  const raw = localStorage.getItem(REMEMBERED_LOGIN_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    // 结构校验：手工改过 localStorage 或历史遗留的脏数据一律视为无效
    if (parsed && typeof parsed.account === 'string' && parsed.account) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

/**
 * 记住登录账号
 * @param {string} account - 登录账号（工号或手机号）
 * @param {'internal'|'external'} userType - 用户类型，回填时用于恢复所在 tab
 */
export const setRememberedLogin = (account, userType) => {
  localStorage.setItem(REMEMBERED_LOGIN_KEY, JSON.stringify({ account, userType }))
}

/**
 * 清除记住的登录账号
 */
export const removeRememberedLogin = () => {
  localStorage.removeItem(REMEMBERED_LOGIN_KEY)
}

/**
 * 清除所有本地存储数据
 * @example clearAll()
 */
export const clearAll = () => {
  localStorage.clear()
}

/**
 * 通用存储方法 - 存储任意数据
 * @param {string} key - 存储键名
 * @param {*} value - 存储值（会自动转换为 JSON）
 * @example setStorage('myData', { foo: 'bar' })
 */
export const setStorage = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value))
}

/**
 * 通用读取方法 - 读取任意数据
 * @param {string} key - 存储键名
 * @returns {*} 存储的值（自动解析 JSON），不存在则返回 null
 * @example getStorage('myData') // { foo: 'bar' }
 */
export const getStorage = (key) => {
  const value = localStorage.getItem(key)
  if (!value) return null

  try {
    return JSON.parse(value)
  } catch (error) {
    console.error(`解析存储数据失败 (${key}):`, error)
    return null
  }
}

/**
 * 通用删除方法 - 删除指定数据
 * @param {string} key - 存储键名
 * @example removeStorage('myData')
 */
export const removeStorage = (key) => {
  localStorage.removeItem(key)
}
