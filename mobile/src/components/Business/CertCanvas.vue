<template>
  <!--
    证书画布：按模板版式还原一张证书。

    画布本体保持设计稿原始像素（A4 基准 2px/mm，竖版 420×594 / 横版 594×420），
    整体用 transform scale 等比缩放，元素坐标不逐个换算，避免累积舍入误差导致排版偏移。
    外层占位盒必须显式给缩放后的尺寸：transform 不影响布局盒子，不给高会压住下方内容。

    证书详情页与交卷结果页的小样共用本组件：同一张证书在两处必须长得一样，
    各写一遍必然漂移（早先结果页只画底图，渲成了一个没有任何文字的空白框）。
  -->
  <div class="cert-stage" :style="stageStyle">
    <div class="cert-canvas" :style="canvasStyle">
      <img v-if="backgroundImage" class="cert-bg" :src="resolveUrl(backgroundImage)" :alt="bgAlt" />

      <template v-for="(el, i) in elements" :key="i">
        <img
          v-if="el.type === 'seal' && sealImage"
          class="cert-seal"
          :style="elementStyle(el)"
          :src="resolveUrl(sealImage)"
          alt="印章"
        />
        <span v-else-if="el.type === 'text'" class="cert-text" :style="elementStyle(el)">
          {{ el.text }}
        </span>
      </template>
    </div>

    <!-- 供调用方叠加水印一类的覆盖物（如过期标记） -->
    <slot />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { resolveUploadUrl } from '@/utils/url'

const props = defineProps({
  /** 画布宽（px，设计稿基准） */
  canvasWidth: { type: Number, default: 0 },
  /** 画布高（px，设计稿基准） */
  canvasHeight: { type: Number, default: 0 },
  /** 底图 URL */
  backgroundImage: { type: String, default: null },
  /** 印章图片 URL */
  sealImage: { type: String, default: null },
  /** 版式元素（占位符已由服务端填好值） */
  elements: { type: Array, default: () => [] },
  /** 可用展示宽度（px），组件按它等比缩放 */
  availableWidth: { type: Number, required: true },
  /** 底图的替代文本 */
  bgAlt: { type: String, default: '证书底图' }
})

const resolveUrl = resolveUploadUrl

/** 缩放比：按可用宽度等比缩，不放大超过 1 倍以免底图发虚 */
const scale = computed(() => {
  if (!props.canvasWidth) return 1
  return Math.min(props.availableWidth / props.canvasWidth, 1)
})

const stageStyle = computed(() => ({
  width: `${props.canvasWidth * scale.value}px`,
  height: `${props.canvasHeight * scale.value}px`
}))

const canvasStyle = computed(() => ({
  width: `${props.canvasWidth}px`,
  height: `${props.canvasHeight}px`,
  transform: `scale(${scale.value})`
}))

/**
 * 单个版式元素的定位样式
 *
 * @param {Object} el - 版式元素
 * @returns {Object} 内联样式
 */
const elementStyle = (el) => ({
  left: `${el.x}px`,
  top: `${el.y}px`,
  width: `${el.width}px`,
  fontSize: `${el.fontSize}px`,
  color: el.color,
  fontWeight: el.bold ? 700 : 400,
  textAlign: el.align,
  // 下划线用 borderBottom 而非 textDecoration：语义是「填空横线，铺满元素宽度」，
  // 与管理端设计器 DesignerCanvas.vue 的 elStyle 保持一致。
  // textDecoration 只贴文字那么长，会让设计器里的「姓名 ______」发到手上变成短下划线。
  borderBottom: el.underline ? `1px solid ${el.color}` : 'none',
  paddingBottom: el.underline ? '4px' : '0'
})
</script>

<style scoped>
/* 外层按缩放后尺寸占位，画布用 transform 缩放不影响布局盒子 */
.cert-stage {
  position: relative;
  margin: 0 auto;
  overflow: hidden;
  background-color: #fff;
  border-radius: var(--radius-md);
  box-shadow: 0 2px 12px rgb(0 0 0 / 10%);
}

.cert-canvas {
  position: relative;
  transform-origin: top left;
}

/* 底图铺满画布，元素绝对定位叠在上层 */
.cert-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cert-text {
  position: absolute;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.2;
}

.cert-seal {
  position: absolute;
  height: auto;
  /* 印章通常带白底，正片叠底让它压在底图上更像盖章 */
  mix-blend-mode: multiply;
}
</style>
