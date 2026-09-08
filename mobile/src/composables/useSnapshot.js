/**
 * 文件名称：composables/useSnapshot.js - 考试人脸抓拍组合式函数
 *
 * 功能描述：
 *   按考试配置定时抓拍考生人脸并上传，用于身份留证
 *   摄像头不可用时跳过抓拍，不阻断考生作答
 *
 * 使用方式：
 *   const { videoRef, start, stop } = useSnapshot(examId, () => submitted.value)
 *   await start({ needSnapshot: true, snapshotInterval: 60 })
 */

import { onUnmounted } from 'vue'
import { showToast } from 'vant'
import { useCamera } from './useCamera'
import { uploadSnapshotApi } from '@/api/modules/examApi'

/**
 * 人脸抓拍能力
 * @param {number|string} examId - 考试 ID
 * @param {Function} isStopped - 返回 true 时跳过本次抓拍（如已交卷）
 * @returns {Object} 抓拍所需的 video 引用与启停方法
 */
export const useSnapshot = (examId, isStopped) => {
  const { videoRef, open, capture, close } = useCamera()

  /** 定时抓拍的定时器句柄 */
  let timer = null

  /**
   * 停止定时抓拍并释放摄像头
   */
  const stop = () => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    close()
  }

  /**
   * 按考试配置启动定时抓拍
   * @param {Object} config - 抓拍配置
   * @param {boolean} config.needSnapshot - 是否需要抓拍
   * @param {number} config.snapshotInterval - 抓拍间隔（秒）
   */
  const start = async ({ needSnapshot, snapshotInterval }) => {
    if (!needSnapshot || !snapshotInterval) return

    const opened = await open()
    if (!opened) {
      showToast('摄像头不可用，本场考试将不进行身份留证')
      return
    }

    timer = setInterval(async () => {
      if (typeof isStopped === 'function' && isStopped()) return
      const image = capture()
      if (!image) return
      try {
        await uploadSnapshotApi({ examId, image })
      } catch {
        // 抓拍上传失败不打断考生作答
      }
    }, snapshotInterval * 1000)
  }

  onUnmounted(stop)

  return { videoRef, start, stop }
}
