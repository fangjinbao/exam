/**
 * 文件名称：composables/useCountdown.js - 倒计时组合式函数
 *
 * 功能描述：
 *   考试剩余时间倒计时，每秒递减，归零时触发回调
 *   组件卸载时自动清理定时器
 *
 * 使用方式：
 *   const { remain, remainText, start, stop } = useCountdown(onTimeout)
 *   start(3600)
 */

import { ref, computed, onUnmounted } from 'vue'

/**
 * 倒计时能力
 * @param {Function} [onTimeout] - 倒计时归零时的回调
 * @returns {Object} 倒计时状态与操作方法
 */
export const useCountdown = (onTimeout) => {
  /** 剩余秒数 */
  const remain = ref(0)

  /** 定时器句柄 */
  let timer = null

  /** 结束时刻的绝对时间戳，用于抗后台节流的重算 */
  let deadline = 0

  /**
   * 按结束时刻重算剩余秒数
   * 移动端页面不可见时定时器会被挂起或节流，纯递减会让剩余时间偏多，
   * 因此每次 tick 与回到前台时都以绝对时间戳为准重算
   * @returns {boolean} 是否已到期
   */
  function syncRemain() {
    remain.value = Math.max(0, Math.round((deadline - Date.now()) / 1000))
    return remain.value <= 0
  }

  /**
   * 页面重新可见时立即校正剩余时间，避免显示滞后
   */
  function handleVisibilityChange() {
    if (document.visibilityState !== 'visible' || !timer) return
    if (syncRemain()) {
      stop()
      if (typeof onTimeout === 'function') onTimeout()
    }
  }

  /**
   * 停止倒计时
   */
  const stop = () => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }

  /**
   * 启动倒计时
   * @param {number} seconds - 起始剩余秒数
   */
  const start = (seconds) => {
    stop()
    // 以启动时刻推算结束时刻，后续一律按绝对时间重算，不做逐秒递减
    deadline = Date.now() + Math.max(0, Number(seconds) || 0) * 1000

    if (syncRemain()) {
      if (typeof onTimeout === 'function') onTimeout()
      return
    }

    timer = setInterval(() => {
      if (syncRemain()) {
        stop()
        if (typeof onTimeout === 'function') onTimeout()
      }
    }, 1000)

    document.addEventListener('visibilitychange', handleVisibilityChange)
  }

  /** 剩余时间展示文案（HH:mm:ss） */
  const remainText = computed(() => {
    const total = Math.max(0, remain.value)
    const hours = String(Math.floor(total / 3600)).padStart(2, '0')
    const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
    const seconds = String(total % 60).padStart(2, '0')
    return `${hours}:${minutes}:${seconds}`
  })

  onUnmounted(stop)

  return { remain, remainText, start, stop }
}
