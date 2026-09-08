/**
 * 文件名称：composables/useCamera.js - 摄像头采集组合式函数
 *
 * 功能描述：
 *   封装前置摄像头开启、画面抓拍与资源释放
 *   供人脸核身与考试期间人脸抓拍复用
 *
 * 使用方式：
 *   const { videoRef, ready, error, open, capture, close } = useCamera()
 *   await open()
 *   const image = capture()
 */

import { ref, onUnmounted } from 'vue'

/**
 * 摄像头采集能力
 * @returns {Object} 摄像头状态与操作方法
 */
export const useCamera = () => {
  /** video 元素引用 @type {import('vue').Ref<HTMLVideoElement|null>} */
  const videoRef = ref(null)

  /** 摄像头是否就绪 */
  const ready = ref(false)

  /** 错误提示文案，空字符串表示无错误 */
  const error = ref('')

  /** 当前媒体流 */
  let stream = null

  /**
   * 关闭摄像头并释放媒体流
   */
  const close = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      stream = null
    }
    // 同时解除 video 元素对已停止流的引用，避免残留引用误判为「仍有可用流」
    if (videoRef.value) {
      videoRef.value.srcObject = null
    }
    ready.value = false
  }

  /**
   * 开启前置摄像头
   * @returns {Promise<boolean>} 是否开启成功
   */
  const open = async () => {
    error.value = ''

    // 先释放可能已存在的旧流，避免重复调用 open 时旧 track 未 stop 造成摄像头占用
    close()

    // 浏览器不支持或非安全上下文时无法采集
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      error.value = '当前环境不支持摄像头采集'
      return false
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false
      })
      if (videoRef.value) {
        videoRef.value.srcObject = stream
        await videoRef.value.play()
      }
      ready.value = true
      return true
    } catch {
      // 用户拒绝授权或设备被占用
      error.value = '摄像头开启失败，请检查权限设置'
      close()
      return false
    }
  }

  /**
   * 抓拍当前画面
   * @returns {string} 图像的 base64 数据，未就绪时返回空字符串
   */
  const capture = () => {
    const video = videoRef.value
    if (!ready.value || !video || !video.videoWidth) return ''

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)

    // 用较低质量压缩，减小上传体积
    return canvas.toDataURL('image/jpeg', 0.7)
  }

  onUnmounted(close)

  return { videoRef, ready, error, open, capture, close }
}
