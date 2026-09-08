/**
 * 文件名称：stores/userStore.js - 用户状态管理
 *
 * 功能描述：
 *   Pinia Store，管理用户的登录状态和用户信息
 *   包含登录、登出、获取用户信息等功能
 *
 * 使用方式：
 *   import { useUserStore } from '@/stores/userStore'
 *   const userStore = useUserStore()
 *   await userStore.login(account, password, 'internal')
 *
 * 主要功能：
 *   - 用户登录状态管理
 *   - 用户信息管理
 *   - Token 管理
 *   - 登录/登出操作
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  getToken,
  setToken,
  removeToken,
  getUserInfo,
  setUserInfo,
  removeUserInfo,
  setRefreshToken,
  removeRefreshToken,
  getUserType,
  setUserType,
  removeUserType
} from '@/utils/storage'
import {
  loginApi,
  getCurrentUserApi,
  logoutApi,
  USER_TYPE
} from '@/api/modules/authApi'

/**
 * 用户信息类型定义
 * @typedef {Object} UserInfo
 * @property {number|string} id - 用户ID
 * @property {string} name - 用户名
 * @property {string} phone - 手机号
 * @property {string} email - 邮箱
 * @property {string} avatar - 头像URL
 */

export const useUserStore = defineStore('user', () => {
  // ========== State（状态） ==========

  /** Token @type {import('vue').Ref<string>} */
  const token = ref(getToken() || '')

  /** 用户信息 @type {import('vue').Ref<UserInfo|null>} */
  const userInfo = ref(getUserInfo() || null)

  /** 登录状态 @type {import('vue').Ref<boolean>} */
  const isLogin = ref(!!token.value)

  /**
   * 用户类型：internal=石化员工，external=外部考生
   * 后端两类账号体系分表存储、id 各自独立自增，前端展示与再登录都需要它
   * @type {import('vue').Ref<'internal'|'external'|null>}
   */
  const userType = ref(getUserType() || null)

  /**
   * 会话标识：每次退出登录递增
   * 作为 KeepAlive 缓存页的 key 组成部分，换号登录时强制销毁上一账号的组件实例，
   * 避免缓存的本地状态（姓名、单位、成绩等）在新账号首帧被渲染出来
   * @type {import('vue').Ref<number>}
   */
  const sessionKey = ref(0)

  // ========== Getters（计算属性） ==========

  /** 用户ID */
  const userId = computed(() => userInfo.value?.id || '')

  /**
   * 用户名
   *
   * 三态区分：已登录且拿到信息 → 姓名；已登录但信息还没拉到（登录时 profile 请求
   * 失败的降级态）→「加载中」；确实未登录 →「未登录」。
   * 不能让前两者共用「未登录」——那会在 token 有效时显示未认证文案，语义矛盾。
   */
  const userName = computed(() => {
    if (userInfo.value?.name) return userInfo.value.name
    return isLogin.value ? '加载中' : '未登录'
  })

  /** 用户头像（后端字段为 headImg，外部考生恒为空） */
  const userAvatar = computed(() => userInfo.value?.headImg || '')

  /** 所属单位：内部员工取部门名，外部考生取外部单位名 */
  const userOrgName = computed(
    () => userInfo.value?.departmentName || userInfo.value?.orgName || ''
  )

  /** 是否外部考生 */
  const isExternal = computed(() => userType.value === USER_TYPE.EXTERNAL)

  /** 用户手机号 */
  const userPhone = computed(() => userInfo.value?.phone || '')

  /** 用户邮箱 */
  const userEmail = computed(() => userInfo.value?.email || '')

  // ========== Actions（方法） ==========

  /**
   * 设置 Token
   * @param {string} newToken - 新的 token
   */
  const setTokenValue = (newToken) => {
    token.value = newToken
    setToken(newToken)
    isLogin.value = true
  }

  /**
   * 设置用户信息
   * @param {UserInfo} info - 用户信息
   */
  const setUserInfoValue = (info) => {
    userInfo.value = info
    setUserInfo(info)
  }

  /**
   * 设置用户类型
   * @param {'internal'|'external'} type - 用户类型
   */
  const setUserTypeValue = (type) => {
    userType.value = type
    setUserType(type)
  }

  /**
   * 用户登录
   *
   * 后端登录接口只返回 token（不含用户信息），因此登录成功后需再拉一次 profile。
   * profile 失败不阻断登录：token 已有效，个人信息可在后续页面重试拉取。
   *
   * @param {string} account - 登录账号：internal 为统一身份账号，external 为手机号
   * @param {string} password - 密码
   * @param {'internal'|'external'} type - 用户类型
   * @returns {Promise<Object>} 登录接口原始响应
   */
  const login = async (account, password, type) => {
    const res = await loginApi({ account, password, userType: type })
    if (res.code === 200) {
      setTokenValue(res.data.token)
      setRefreshToken(res.data.refreshToken)
      // 以服务端返回的 userType 为准，不用入参，避免前后端理解不一致
      setUserTypeValue(res.data.userType || type)

      try {
        await fetchUserInfo()
      } catch (error) {
        // 个人信息拉取失败不影响登录结果，登录态已建立
        console.error('登录后获取个人信息失败：', error)
      }
    }
    return res
  }

  /**
   * 获取当前登录用户信息
   * @returns {Promise<Object>} profile 接口原始响应
   */
  const fetchUserInfo = async () => {
    const res = await getCurrentUserApi()
    if (res.code === 200) {
      setUserInfoValue(res.data)
      // profile 也带 userType，顺带校正本地缓存
      if (res.data?.userType) {
        setUserTypeValue(res.data.userType)
      }
    }
    return res
  }

  /**
   * 清除本地登录态（不调接口）
   * 供登出与 401 拦截共用：401 时服务端会话已失效，只需清本地。
   */
  const clearAuth = () => {
    token.value = ''
    removeToken()
    removeRefreshToken()

    userInfo.value = null
    removeUserInfo()

    userType.value = null
    removeUserType()

    isLogin.value = false

    // 作废上一会话的页面缓存
    sessionKey.value += 1
  }

  /**
   * 用户登出
   *
   * 先请求服务端注销（清 Redis 中的 app: 会话缓存，使 token 立即失效），
   * 再清本地状态。服务端调用失败也必须清本地——否则用户会卡在「点了退出仍是登录态」。
   */
  const logout = async () => {
    try {
      if (token.value) {
        await logoutApi()
      }
    } catch (error) {
      // 注销接口失败不阻断本地登出（可能是网络问题或 token 已过期）
      console.error('注销接口调用失败，仍清除本地登录态：', error)
    } finally {
      clearAuth()
    }
  }

  // 返回 Store 的公共接口
  return {
    // State
    token,
    userInfo,
    isLogin,
    userType,
    sessionKey,
    // Getters
    userId,
    userName,
    userAvatar,
    userPhone,
    userEmail,
    userOrgName,
    isExternal,
    // Actions
    setTokenValue,
    setUserInfoValue,
    setUserTypeValue,
    login,
    logout,
    clearAuth,
    fetchUserInfo
  }
})
