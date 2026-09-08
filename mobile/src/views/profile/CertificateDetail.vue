<!--
  页面名称：CertificateDetail - 证书详情

  功能描述：
    展示单张证书的完整信息并支持下载
    已过期证书仍可查看与下载，状态标注为已过期

  路由信息：
    路径：/profile/certificates/:id
    名称：CertificateDetail
    是否缓存：否
-->

<template>
  <div class="certificate-detail-page">
    <van-nav-bar title="证书详情" left-arrow fixed placeholder @click-left="router.back()" />

    <AppSkeleton v-if="loading" variant="image" :count="5" />

    <template v-else-if="detail">
      <div class="content">
        <!-- 证书图：与交卷结果页的证书小样共用 CertCanvas，两处必须长得一样 -->
        <CertCanvas
          v-if="hasLayout"
          :canvas-width="detail.canvasWidth"
          :canvas-height="detail.canvasHeight"
          :background-image="detail.backgroundImage"
          :seal-image="detail.sealImage"
          :elements="detail.elements"
          :available-width="stageWidth"
          :bg-alt="`${detail.name}底图`"
        >
          <!-- 过期证书在证书图上盖标记，避免只看图误以为仍然有效 -->
          <span v-if="detail.status !== CERT_STATUS.VALID" class="cert-expired-mark">
            {{ detail.statusText }}
          </span>
        </CertCanvas>

        <!-- 模板未配版式时回退到文字卡片，不留白屏 -->
        <section v-else class="cert-card">
          <van-icon name="medal-o" size="40" class="cert-icon" />
          <h1 class="cert-name">{{ detail.name }}</h1>
          <van-tag :type="detail.status === CERT_STATUS.VALID ? 'success' : 'default'">
            {{ detail.statusText }}
          </van-tag>
        </section>

        <!-- 证书信息 -->
        <section class="info-card">
          <!--
            border 关掉：cell-group 默认给整组加 van-hairline--top-bottom，
            在已有圆角白底的卡片里会多出顶、底两条贴边细线，像卡片裂了一道缝。
            行与行之间的分隔线由 van-cell 自身的 border 提供，不受影响。
          -->
          <van-cell-group :border="false">
            <van-cell title="持证人" :value="detail.holderName" />
            <van-cell title="证书编号" class="cell-nowrap" :value="detail.code" />
            <van-cell title="发证日期" class="cell-nowrap" :value="detail.issueDate" />
            <van-cell title="有效期至" class="cell-nowrap" :value="detail.expireDate" />
            <van-cell title="发证单位" :value="detail.issuer" />
          </van-cell-group>
        </section>
      </div>

      <div class="footer">
        <van-button type="primary" block round :loading="downloading" @click="handleDownload">
          下载证书
        </van-button>
      </div>
    </template>

    <van-empty v-else description="证书不存在" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { CERT_STATUS } from '@/constants/exam'
import { getCertificateDetailApi, downloadCertificateApi } from '@/api/modules/profileApi'
import AppSkeleton from '@/components/Common/AppSkeleton.vue'
import CertCanvas from '@/components/Business/CertCanvas.vue'

const route = useRoute()
const router = useRouter()

// 证书详情
const detail = ref(null)

// 证书图左右留白（两侧各 16px，与页面 padding 一致）
const STAGE_PADDING = 32

// 可用于展示证书图的宽度，随窗口变化重算（横竖屏切换）
const stageWidth = ref(window.innerWidth - STAGE_PADDING)

/** 是否有可渲染的版式：底图或元素至少有一样 */
const hasLayout = computed(() => {
  const d = detail.value
  if (!d) return false
  return !!d.backgroundImage || (Array.isArray(d.elements) && d.elements.length > 0)
})


/** 屏宽变化时重算缩放 */
const handleResize = () => {
  stageWidth.value = window.innerWidth - STAGE_PADDING
}

// 加载与下载状态
const loading = ref(false)
const downloading = ref(false)

/**
 * 加载证书详情
 */
const loadDetail = async () => {
  loading.value = true
  try {
    const res = await getCertificateDetailApi(route.params.id)
    detail.value = res.data
  } catch {
    detail.value = null
  } finally {
    loading.value = false
  }
}

/**
 * 下载证书
 */
const handleDownload = async () => {
  downloading.value = true
  try {
    const res = await downloadCertificateApi({ id: route.params.id })
    // available=false 表示后端尚未接入证书 PDF 生成，此时不能提示「已开始下载」，
    // 否则用户等半天什么也没发生，以为是卡住了
    if (res.data?.available) {
      showToast(`已开始下载：${res.data.fileName || '证书文件'}`)
    } else {
      showToast('证书下载暂未开放，请联系管理员获取纸质证书')
    }
  } catch {
    // 下载失败的原因由响应拦截器提示
  } finally {
    downloading.value = false
  }
}

onMounted(() => {
  loadDetail()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})
</script>

<style scoped>
.certificate-detail-page {
  min-height: 100vh;
  background-color: var(--bg-page);
}

.content {
  padding: var(--spacing-md);
  padding-bottom: 96px;
}

/* 过期水印：斜贴在证书图右上角 */
.cert-expired-mark {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 2px 10px;
  font-size: 12px;
  color: #fff;
  background-color: rgb(0 0 0 / 45%);
  border-radius: 10px;
}

.cert-card {
  padding: var(--spacing-xl) var(--spacing-md);
  background-color: var(--bg-card);
  border-radius: var(--radius-lg);
  text-align: center;
}

.cert-icon {
  color: var(--warning-color);
}

.cert-name {
  margin: var(--spacing-sm) 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.4;
}

.info-card {
  margin-top: var(--spacing-md);
  background-color: var(--bg-card);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

/*
  标签列定宽、值列左对齐。

  van-cell 默认标题与值各占一半，值列只剩一半卡宽——「发证单位」这类长机构名
  会折行，且右对齐下折行后每行起点参差不齐，看着像排版坏了。定宽标签 + 左对齐后
  所有行左边缘对齐，值列也宽了近一倍，多数内容一行就放得下，真要折行也是正常段落的样子。

  注意：这是本页专有的覆盖，非全站规范。ProfileEdit.vue 与 ExamResult.vue 的同类
  信息卡都只改 value 的颜色字重、维持 vant 默认的 50/50 右对齐——那两处的值是
  短文本，不存在折行问题。本页因发证机构名动辄十几个字才单独放宽标签列，
  勿据此推断其他页面也该跟着改。
*/
/*
  用 min-width + em 而非定宽 px：em 随字号缩放，系统字体放大时标签列同步变宽，
  不会把「有效期至」挤到第二行；5em 够放四个中文标签，min- 允许更长的标签自然撑开，
  各行左边缘仍然对齐。
*/
.info-card :deep(.van-cell__title) {
  flex: none;
  min-width: 5em;
  /* van-cell 不给 title 与 value 之间留间距，定宽后需自己补，否则两列贴在一起 */
  padding-right: var(--spacing-sm);
  color: var(--text-secondary);
}

.info-card :deep(.van-cell__value) {
  flex: 1;
  text-align: left;
  color: var(--text-primary);
}

/*
  日期与编号不该在中间断开：宁可整体缩排也不要「2029-」「08-22」拆两行。
  vant 给 value 设了 overflow:hidden，nowrap 不会撑破卡片，但会硬切断，
  故补省略号——被截断时至少能看出后面还有内容。
*/
.info-card :deep(.cell-nowrap .van-cell__value) {
  white-space: nowrap;
  text-overflow: ellipsis;
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
