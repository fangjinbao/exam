import axios, { AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { useUserStore } from '@/store/modules/user'
import { ApiStatus } from './status'
import { HttpError, handleError, showError, showSuccess } from './error'
import { $t } from '@/locales'
import { matchMock } from './mockRegistry'

/** 请求配置常量 */
const REQUEST_TIMEOUT = 15000
const LOGOUT_DELAY = 500
const MAX_RETRIES = 0
const RETRY_DELAY = 1000
const UNAUTHORIZED_DEBOUNCE_TIME = 3000
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

/** 401防抖状态 */
let isUnauthorizedErrorShown = false
let unauthorizedTimer: NodeJS.Timeout | null = null

/** 刷新 token 接口路径（用于识别刷新请求自身，避免其 401 触发再次刷新） */
const REFRESH_TOKEN_URL = '/admin/open/refreshToken'

/**
 * 正在进行的刷新请求
 *
 * 单飞：页面同时发出多个请求时，access token 过期会让它们一起 401。
 * 若各自去刷新，后端每次签发新 token 并覆盖 Redis 的 admin:token:{userId}，
 * 先刷到的那个立刻被后刷的顶掉，重试仍然 401——并发下反而必然登出。
 * 故所有 401 共用同一个刷新 Promise，只发一次刷新请求。
 */
let refreshPromise: Promise<string> | null = null

/** 扩展 AxiosRequestConfig */
interface ExtendedAxiosRequestConfig extends AxiosRequestConfig {
  showErrorMessage?: boolean
  showSuccessMessage?: boolean
  timeout?: number // 允许覆盖默认超时时间（用于大文件上传）
  skipResponseValidation?: boolean // 跳过标准响应验证（用于原始响应如 GeoJSON）
  skipAuthHandler?: boolean // 跳过 401 统一处理（用于退出登录等终态请求，避免重入 logOut 与重复弹错）
  /** 内部标记：该请求已因 401 刷新过一次 token 并重试，二次 401 直接登出，防止无限重试 */
  _tokenRetried?: boolean
}

const { VITE_API_URL, VITE_WITH_CREDENTIALS } = import.meta.env

/** Axios实例 */
const axiosInstance = axios.create({
  timeout: REQUEST_TIMEOUT,
  baseURL: VITE_API_URL,
  withCredentials: VITE_WITH_CREDENTIALS === 'true',
  validateStatus: (status) => status >= 200 && status < 300,
  transformResponse: [
    (data, headers) => {
      const contentType = String(headers['content-type'] ?? '')
      if (contentType.includes('application/json')) {
        try {
          return JSON.parse(data)
        } catch {
          return data
        }
      }
      return data
    }
  ]
})

/** 请求拦截器 */
axiosInstance.interceptors.request.use(
  (request: InternalAxiosRequestConfig) => {
    const { accessToken } = useUserStore()
    if (accessToken) {
      // 添加 Bearer 前缀
      request.headers.set('Authorization', `Bearer ${accessToken}`)
    }

    if (request.data && !(request.data instanceof FormData) && !request.headers['Content-Type']) {
      request.headers.set('Content-Type', 'application/json')
      request.data = JSON.stringify(request.data)
    }

    return request
  },
  (error) => {
    showError(createHttpError($t('httpMsg.requestConfigError'), ApiStatus.error))
    return Promise.reject(error)
  }
)

/** 响应拦截器 */
axiosInstance.interceptors.response.use(
  (response: AxiosResponse<Http.BaseResponse>) => {
    // 检查是否跳过验证（用于原始响应如 GeoJSON）
    const config = response.config as ExtendedAxiosRequestConfig
    if (config.skipResponseValidation) {
      return response
    }

    const { code, msg, message } = response.data
    // 优先使用 message 字段（后端返回），兼容 msg 字段
    const errorMessage = message || msg
    if (code === ApiStatus.success) return response
    // 退出登录等终态请求：401 不重入 logOut、不弹错，交由调用方自行 catch
    if (code === ApiStatus.unauthorized && !config.skipAuthHandler) {
      return recoverFromUnauthorized(config, errorMessage)
    }
    throw createHttpError(errorMessage || $t('httpMsg.requestFailed'), code)
  },
  (error) => {
    const config = error.config as ExtendedAxiosRequestConfig | undefined
    if (error.response?.status === ApiStatus.unauthorized && !config?.skipAuthHandler && config) {
      return recoverFromUnauthorized(config)
    }
    return Promise.reject(handleError(error))
  }
)

/**
 * 401 的恢复路径：先试着刷新 token 重放原请求，刷不动才登出
 *
 * 此前的实现是任何 401 直接 logOut，导致 access token 一到期（默认 2 小时）
 * 就被踢回登录页，而 15 天有效的 refresh token 从未被用过
 * （api/auth.ts 的 fetchRefreshToken 是死代码，全项目零调用）。
 *
 * 注意刷新救不回的两种 401，它们仍会登出且这是正确行为：
 * 一是被顶号——后端 admin:token:{userId} 一个用户一个键，别处重新登录会覆盖它，
 * 此时 refresh token 也已被换掉；二是 Redis 不可用，守卫读不到缓存即判失效。
 *
 * @param config 触发 401 的原请求配置
 * @param message 后端返回的错误文案（走响应体 code 分支时才有）
 */
async function recoverFromUnauthorized(
  config: ExtendedAxiosRequestConfig,
  message?: string
): Promise<AxiosResponse> {
  // 刷新请求自身 401、或已经刷过一轮仍 401：不再试，直接登出。
  // 少了这道判断会变成「401 → 刷新 → 重试 → 401 → 刷新」的死循环。
  if (config._tokenRetried || config.url === REFRESH_TOKEN_URL) {
    handleUnauthorizedError(message)
  }

  try {
    await refreshAccessToken()
  } catch {
    // 刷新失败：refresh token 也过期了、被顶号、或压根没有
    handleUnauthorizedError(message)
  }

  /*
    重放原请求。走 axiosInstance.request 会重新过一遍请求拦截器，
    Authorization 由拦截器按 store 里的新 token 覆盖写入，无需在此手动清旧值。
    Content-Type 与已序列化的 data 在首次已设好，拦截器里那两个条件不再成立，
    不会二次 JSON.stringify。
  */
  return axiosInstance.request({ ...config, _tokenRetried: true } as ExtendedAxiosRequestConfig)
}

/** 统一创建HttpError */
function createHttpError(message: string, code: number) {
  return new HttpError(message, code)
}

/**
 * 用 refresh token 换取新的 access token
 *
 * 直接走 axiosInstance 而不复用 api/auth.ts 的 fetchRefreshToken：后者从本模块
 * 引 request，本模块再引它会成循环依赖。
 *
 * 刷新接口是 @Public 的，但请求拦截器仍会带上那个已过期的 token，后端不校验故无妨。
 * skipAuthHandler 让刷新请求自身的失败不再重入 401 处理。
 *
 * @returns 新的 access token
 * @throws 刷新失败（无 refresh token、refresh 已过期、被顶号）
 */
function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise

  const userStore = useUserStore()
  const currentRefreshToken = userStore.refreshToken

  // 没有 refresh token 就没得刷（老会话遗留、或登录响应未带）
  if (!currentRefreshToken) {
    return Promise.reject(new Error('no refresh token'))
  }

  refreshPromise = axiosInstance
    .request<Http.BaseResponse<{ token: string; expire: number }>>({
      url: REFRESH_TOKEN_URL,
      method: 'POST',
      data: { refreshToken: currentRefreshToken },
      skipAuthHandler: true
    } as ExtendedAxiosRequestConfig)
    .then((res) => {
      const newToken = res.data?.data?.token
      if (!newToken) throw new Error('refresh response missing token')
      // 后端只签发新的 access token，refresh token 不变，故第二个参数不传
      userStore.setToken(newToken)
      return newToken
    })
    .finally(() => {
      // 无论成败都要清掉，否则失败后所有后续请求会一直复用这个失败的 Promise
      refreshPromise = null
    })

  return refreshPromise
}

/** 处理401错误（带防抖） */
function handleUnauthorizedError(message?: string): never {
  const error = createHttpError(message || $t('httpMsg.unauthorized'), ApiStatus.unauthorized)

  if (!isUnauthorizedErrorShown) {
    isUnauthorizedErrorShown = true
    logOut()

    unauthorizedTimer = setTimeout(resetUnauthorizedError, UNAUTHORIZED_DEBOUNCE_TIME)

    showError(error, true)
    throw error
  }

  throw error
}

/** 重置401防抖状态 */
function resetUnauthorizedError() {
  isUnauthorizedErrorShown = false
  if (unauthorizedTimer) clearTimeout(unauthorizedTimer)
  unauthorizedTimer = null
}

/** 退出登录函数 */
function logOut() {
  setTimeout(() => {
    useUserStore().logOut()
  }, LOGOUT_DELAY)
}

/** 是否需要重试 */
function shouldRetry(statusCode: number) {
  return [
    ApiStatus.requestTimeout,
    ApiStatus.internalServerError,
    ApiStatus.badGateway,
    ApiStatus.serviceUnavailable,
    ApiStatus.gatewayTimeout
  ].includes(statusCode)
}

/** 请求重试逻辑 */
// 函数重载：skipResponseValidation 为 true 时返回原始数据
async function retryRequest<T>(
  config: ExtendedAxiosRequestConfig & { skipResponseValidation: true },
  retries?: number
): Promise<T>
async function retryRequest<T>(
  config: ExtendedAxiosRequestConfig,
  retries?: number
): Promise<{ code: number; message: string; data: T }>
async function retryRequest<T>(
  config: ExtendedAxiosRequestConfig,
  retries: number = MAX_RETRIES
): Promise<T | { code: number; message: string; data: T }> {
  try {
    return await request<T>(config as any)
  } catch (error) {
    if (retries > 0 && error instanceof HttpError && shouldRetry(error.code)) {
      await delay(RETRY_DELAY)
      return retryRequest<T>(config, retries - 1)
    }
    throw error
  }
}

/** 延迟函数 */
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 请求函数 */
// 函数重载：skipResponseValidation 为 true 时返回原始数据
async function request<T = any>(
  config: ExtendedAxiosRequestConfig & { skipResponseValidation: true }
): Promise<T>
async function request<T = any>(
  config: ExtendedAxiosRequestConfig
): Promise<{ code: number; message: string; data: T }>
async function request<T = any>(
  config: ExtendedAxiosRequestConfig
): Promise<T | { code: number; message: string; data: T }> {
  // POST | PUT 参数自动填充
  if (
    ['POST', 'PUT'].includes(config.method?.toUpperCase() || '') &&
    config.params &&
    !config.data
  ) {
    config.data = config.params
    config.params = undefined
  }

  // Mock 拦截：匹配到路由时直接返回，不走网络
  if (USE_MOCK) {
    const handler = matchMock(config.method || 'GET', config.url || '')
    // 未注册的接口会穿透到真实网络，开发期打印警告便于发现遗漏
    if (!handler) {
      console.warn(`[Mock] 未注册，已穿透到真实网络: ${(config.method || 'GET').toUpperCase()} ${config.url || ''}`)
    }
    if (handler) {
      try {
        const mockData = handler({ params: config.params, data: config.data, url: config.url || '' })
        if (mockData === null || mockData === undefined) {
          return Promise.reject(new HttpError('数据不存在', 404))
        }
        if (config.showSuccessMessage) {
          showSuccess('操作成功')
        }
        return { code: 200, message: '', data: mockData } as any
      } catch (e: any) {
        const err = new HttpError(e.message || '操作失败', 500)
        if (config.showErrorMessage !== false) {
          showError(err, true)
        }
        return Promise.reject(err)
      }
    }
  }

  try {
    const res = await axiosInstance.request<Http.BaseResponse<T>>(config)

    // 如果 skipResponseValidation 为 true，返回原始数据
    if (config.skipResponseValidation) {
      return res.data as T
    }

    // 显示成功消息（优先使用 message 字段）
    const successMessage = res.data.message || res.data.msg
    if (config.showSuccessMessage && successMessage) {
      showSuccess(successMessage)
    }

    // 解构返回，简化业务代码的数据访问
    return {
      code: res.data.code,
      message: res.data.message || '',
      data: res.data.data
    }
  } catch (error) {
    if (error instanceof HttpError && error.code !== ApiStatus.unauthorized) {
      const showMsg = config.showErrorMessage !== false
      showError(error, showMsg)
    }
    return Promise.reject(error)
  }
}

/** API方法集合 */
// GET 方法
function get<T>(config: ExtendedAxiosRequestConfig & { skipResponseValidation: true }): Promise<T>
function get<T>(
  config: ExtendedAxiosRequestConfig
): Promise<{ code: number; message: string; data: T }>
function get<T>(
  config: ExtendedAxiosRequestConfig
): Promise<T | { code: number; message: string; data: T }> {
  return retryRequest<T>({ ...config, method: 'GET' } as any)
}

// POST 方法
function post<T>(config: ExtendedAxiosRequestConfig & { skipResponseValidation: true }): Promise<T>
function post<T>(
  config: ExtendedAxiosRequestConfig
): Promise<{ code: number; message: string; data: T }>
function post<T>(
  config: ExtendedAxiosRequestConfig
): Promise<T | { code: number; message: string; data: T }> {
  return retryRequest<T>({ ...config, method: 'POST' } as any)
}

// PUT 方法
function put<T>(config: ExtendedAxiosRequestConfig & { skipResponseValidation: true }): Promise<T>
function put<T>(
  config: ExtendedAxiosRequestConfig
): Promise<{ code: number; message: string; data: T }>
function put<T>(
  config: ExtendedAxiosRequestConfig
): Promise<T | { code: number; message: string; data: T }> {
  return retryRequest<T>({ ...config, method: 'PUT' } as any)
}

// DELETE 方法
function del<T>(config: ExtendedAxiosRequestConfig & { skipResponseValidation: true }): Promise<T>
function del<T>(
  config: ExtendedAxiosRequestConfig
): Promise<{ code: number; message: string; data: T }>
function del<T>(
  config: ExtendedAxiosRequestConfig
): Promise<T | { code: number; message: string; data: T }> {
  return retryRequest<T>({ ...config, method: 'DELETE' } as any)
}

// REQUEST 方法
function requestMethod<T>(
  config: ExtendedAxiosRequestConfig & { skipResponseValidation: true }
): Promise<T>
function requestMethod<T>(
  config: ExtendedAxiosRequestConfig
): Promise<{ code: number; message: string; data: T }>
function requestMethod<T>(
  config: ExtendedAxiosRequestConfig
): Promise<T | { code: number; message: string; data: T }> {
  return retryRequest<T>(config as any)
}

const api = {
  get,
  post,
  put,
  del,
  request: requestMethod
}

export default api
