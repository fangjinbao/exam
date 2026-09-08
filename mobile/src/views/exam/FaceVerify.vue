<!--
  页面名称：FaceVerify - 人脸核身

  功能描述：
    开启人脸核身的考试在进入作答前完成身份核验
    采集前置摄像头画面提交核验，通过后进入作答页

  路由信息：
    路径：/exam/face-verify/:id
    名称：FaceVerify
    是否缓存：否
-->

<template>
  <div class="face-verify-page">
    <van-nav-bar title="身份核验" left-arrow fixed placeholder @click-left="router.back()" />

    <div class="content">
      <!-- 采集画面 -->
      <div class="camera-box">
        <video ref="videoRef" class="camera-video" playsinline muted></video>
        <div v-if="!ready" class="camera-mask">
          <van-icon name="photo-fail" size="32" />
          <p class="mask-text">{{ error || '正在开启摄像头' }}</p>
        </div>
      </div>

      <p class="tips">请将面部置于取景框内，保持光线充足后点击开始核验。</p>

      <!-- 核验失败提示 -->
      <van-notice-bar
        v-if="failMessage"
        type="danger"
        :text="failMessage"
        wrapable
        :scrollable="false"
      />
    </div>

    <div class="footer">
      <van-button
        v-if="!ready"
        type="default"
        block
        round
        :loading="opening"
        @click="handleOpenCamera"
      >
        重新开启摄像头
      </van-button>
      <van-button v-else type="primary" block round :loading="verifying" @click="handleVerify">
        开始核验
      </van-button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { useCamera } from '@/composables/useCamera'
import { faceVerifyApi } from '@/api/modules/examApi'

const route = useRoute()
const router = useRouter()

// 考试 ID
const examId = route.params.id

// 摄像头能力
const { videoRef, ready, error, open, capture, close } = useCamera()

// 摄像头开启中
const opening = ref(false)

// 核验请求中
const verifying = ref(false)

// 核验失败提示
const failMessage = ref('')

/**
 * 开启摄像头
 */
const handleOpenCamera = async () => {
  opening.value = true
  try {
    await open()
  } finally {
    opening.value = false
  }
}

/**
 * 提交核验
 * 核验通过后释放摄像头并进入作答页
 */
const handleVerify = async () => {
  const faceImage = capture()
  if (!faceImage) {
    showToast('未采集到画面，请重试')
    return
  }

  verifying.value = true
  failMessage.value = ''
  try {
    const res = await faceVerifyApi({ examId, faceImage })
    if (res.code === 200 && res.data?.passed) {
      showToast('核验通过')
      close()
      router.replace(`/exam/answer/${examId}`)
    }
  } catch (err) {
    // 核身未通过时保留在当前页，允许重试
    failMessage.value = err.message || '身份核验未通过，无法进入考试'
  } finally {
    verifying.value = false
  }
}

onMounted(handleOpenCamera)
</script>

<style scoped>
.face-verify-page {
  min-height: 100vh;
  background-color: var(--bg-page);
}

.content {
  padding: var(--spacing-md);
  padding-bottom: 96px;
}

/* 取景框：正方形圆角区域 */
.camera-box {
  position: relative;
  aspect-ratio: 1;
  width: 100%;
  border-radius: var(--radius-lg);
  overflow: hidden;
  background-color: #000;
}

.camera-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* 前置摄像头画面镜像，符合用户照镜子的直觉 */
  transform: scaleX(-1);
}

/* 未就绪时的遮罩提示 */
.camera-mask {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  color: #fff;
  background-color: rgba(0, 0, 0, 0.6);
}

.mask-text {
  font-size: 14px;
}

.tips {
  margin: var(--spacing-md) 0;
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.6;
  text-align: center;
}

.footer {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  padding: var(--spacing-sm) var(--spacing-md);
  padding-bottom: calc(var(--spacing-sm) + env(safe-area-inset-bottom));
  background-color: var(--bg-card);
  border-top: 1px solid var(--border-color);
}
</style>
