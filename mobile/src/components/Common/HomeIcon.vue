<!--
  组件名称：HomeIcon - 首页图标底板

  功能描述：
    首页待考提醒与快捷功能用的圆角底板图标，两类实现并存：

    - 快捷功能（target/pencil/book/chart）：位图，饱和渐变底板 + 白图形。
      底板已经烤进图里，组件只负责按 size 摆放，不再套底色和圆角。
      渐变做不进现有的纯色底板方案，故走图片。
    - 待考提醒（calendar）：内联 SVG，浅色底 + 同色系实心图形。
      底色要跟考试状态联动（进行中蓝、其余橙），位图做不到换色，保留 SVG。

  位图资源来源：
    生成图是 2x2 四宫格白底图，经两步脚本处理，产物在 assets/images/home-icons/：
      1. output/split_home_grid.py 压掉底板投影 + 拆成四张 627px 单图到 output/icons/home/
      2. output/build_home_icons.py 抠底 + 预乘 alpha 缩到 150px
    改图形要回到生成图重跑这两步，别直接改产物。
    注意第 1 步的 SRC 是写死的生成图文件名，换生成图时要同步改，否则会静默产出旧图。
    150px = 50px 显示尺寸的 3x，已覆盖 3x 屏，不需要再切 @2x/@3x。
    四个图形刻意各只有一个主体（靶心/铅笔/书/柱状图），50px 下多元素会糊成噪点。

  使用方式：
    <HomeIcon name="calendar" variant="blue" :size="46" />
    <HomeIcon name="target" :size="50" />
-->

<template>
  <span class="home-icon" :style="tileStyle">
    <!-- 快捷功能：底板已烤进图里，整块铺满，不留内边距 -->
    <img v-if="bitmapSrc" class="home-icon-img" :src="bitmapSrc" alt="" aria-hidden="true" />

    <!-- 待考提醒：日历，格点用 evenodd 镂空透出底板色 -->
    <svg v-else viewBox="0 0 1024 1024" aria-hidden="true">
      <g fill="currentColor">
        <path
          fill-rule="evenodd"
          d="M300 156a44 44 0 0 1 44 44v40h336v-40a44 44 0 0 1 88 0v40h36a136 136 0 0 1 136 136v416a136 136 0 0 1-136 136H220A136 136 0 0 1 84 792V376a136 136 0 0 1 136-136h36v-40a44 44 0 0 1 44-44Zm516 260H208a48 48 0 0 0-48 48v328a48 48 0 0 0 48 48h608a48 48 0 0 0 48-48V464a48 48 0 0 0-48-48Z"
        />
        <!-- 3 行 × 4 列格点 -->
        <circle v-for="p in dots" :key="`${p[0]}-${p[1]}`" :cx="p[0]" :cy="p[1]" r="38" />
      </g>
    </svg>
  </span>
</template>

<script setup>
import { computed } from 'vue'
import targetImg from '@/assets/images/home-icons/target.png'
import pencilImg from '@/assets/images/home-icons/pencil.png'
import bookImg from '@/assets/images/home-icons/book.png'
import chartImg from '@/assets/images/home-icons/chart.png'

/**
 * 快捷功能的位图图标。底板配色已在图里，variant 对这几个不起作用。
 * 显式 import 而非拼路径：Vite 需要静态路径才能做资源指纹和打包。
 */
const BITMAPS = {
  target: targetImg,
  pencil: pencilImg,
  book: bookImg,
  chart: chartImg
}

/**
 * 组件 Props 类型定义
 * @typedef {Object} Props
 * @property {'calendar'|'target'|'pencil'|'book'|'chart'} name - 图形名称
 * @property {'blue'|'orange'|'green'|'purple'} variant - 底板配色，仅对 calendar 生效
 * @property {number} size - 底板边长（px）
 */
const props = defineProps({
  name: {
    type: String,
    required: true,
    validator: (v) => ['calendar', 'target', 'pencil', 'book', 'chart'].includes(v)
  },
  variant: {
    type: String,
    default: 'blue',
    validator: (v) => ['blue', 'orange', 'green', 'purple'].includes(v)
  },
  size: {
    type: Number,
    default: 46
  }
})

/**
 * calendar 的底板配色：浅色底 + 同色系实心图形
 *
 * 只剩待考提醒在用。这里保持浅底而非跟快捷功能一样上饱和渐变：
 * 待考提醒是列表行，每行一个图标，浓色底连着排下来会把列表压得很重。
 *
 * bg 底色 / fg 图形色
 */
const TILES = {
  // 蓝色两个色值与 variables.css 的 --primary-color / --primary-light 一致，
  // 此处写死而非 var()：下面的 SVG 需要把 bg 填进 fill 属性做切口，
  // 走 CSS 变量的话拿不到具体色值，也无法在改色时立刻算出对比度
  blue: { bg: '#EEF3FE', fg: '#1171F8' },
  // 橙、绿的图形色刻意比 --unqualified-color / --success-color 更深：
  // 那两个 token 配自己的浅底只有 2.49:1 / 2.55:1，够不到图形元素 3:1 的基线
  orange: { bg: '#FFF3E8', fg: '#C2650C' },
  green: { bg: '#EAF9EF', fg: '#0A8F56' },
  purple: { bg: '#EDEBFD', fg: '#6A5CE8' }
}

// validator 只在开发环境告警，生产传入非法 variant 时需兜底，
// 否则读 tile.value.fg 会抛错中断整个渲染
const tile = computed(() => TILES[props.variant] || TILES.blue)

/** 位图图标取对应的图，calendar 走 SVG 分支返回 undefined */
const bitmapSrc = computed(() => BITMAPS[props.name])

const tileStyle = computed(() => {
  const base = {
    width: `${props.size}px`,
    height: `${props.size}px`
  }
  // 位图自带底板和圆角，再套一层底色和圆角会在图外圈露出一环
  if (bitmapSrc.value) return base

  return {
    ...base,
    // 圆角随尺寸等比缩放，保持与设计稿一致的圆润度
    borderRadius: `${Math.round(props.size * 0.28)}px`,
    backgroundColor: tile.value.bg,
    color: tile.value.fg
  }
})

/** 日历格点：3 行 × 4 列 */
const dots = [
  [332, 566], [465, 566], [598, 566], [731, 566],
  [332, 690], [465, 690], [598, 690], [731, 690],
  [332, 814], [465, 814], [598, 814], [731, 814]
]
</script>

<style scoped>
.home-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
}

/*
  浅底方案的图形与底色对比弱于白图形+浓底，
  占比维持在 60% 才有足够存在感，再缩小会显得发虚
*/
.home-icon svg {
  width: 60%;
  height: 60%;
}

/* 位图的底板就是图本身，铺满整个容器 */
.home-icon-img {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
