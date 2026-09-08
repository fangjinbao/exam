/**
 * 文件名称：composables/useAntiCheat.js - 切屏检测组合式函数
 *
 * 功能描述：
 *   监听页面可见性变化，检测考生切屏行为并触发告警回调
 *   页面重新可见时累计切屏次数，供上报服务端使用
 *
 * 使用方式：
 *   const { switchCount, startWatch, stopWatch } = useAntiCheat(onSwitch)
 *   startWatch()
 */

import { ref, onUnmounted } from 'vue'

/**
 * 切屏检测能力
 * @param {Function} [onSwitch] - 检测到切屏时的回调，参数为累计切屏次数
 * @returns {Object} 切屏状态与操作方法
 */
export const useAntiCheat = (onSwitch) => {
  /** 累计切屏次数 */
  const switchCount = ref(0)

  /** 是否正在监听 */
  let watching = false

  /**
   * 页面可见性变化处理
   * 页面转为隐藏即视为切屏
   */
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      switchCount.value += 1
      if (typeof onSwitch === 'function') onSwitch(switchCount.value)
    }
  }

  /**
   * 开始监听切屏
   */
  const startWatch = () => {
    if (watching) return
    document.addEventListener('visibilitychange', handleVisibilityChange)
    watching = true
  }

  /**
   * 停止监听切屏
   */
  const stopWatch = () => {
    if (!watching) return
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    watching = false
  }

  onUnmounted(stopWatch)

  return { switchCount, startWatch, stopWatch }
}
