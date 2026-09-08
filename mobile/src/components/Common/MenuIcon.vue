<!--
  组件名称：MenuIcon - 菜单图标

  功能描述：
    「我的」页面功能入口左侧的图标，透明底彩色图形，无底板。

  位图资源来源：
    生成图在 output/icons/profile/（1254px 白底彩色），经
    output/build_menu_icons.py 处理成产物 assets/images/menu-icons/：
      白底转透明、保留图形原色、按最长边摆成正方形。
    奖牌中间的星、问号的符号在生成图里是白色，转透明后成为镂空，透出卡片底色。
    改图形要回到生成图重跑脚本，别直接改产物。
    96px = 32px 显示尺寸的 3x，已覆盖 3x 屏。

  说明：
    图形是正方形画布内居中，各图形自身宽高比不同（如 trending 偏扁），
    因此视觉大小略有差异，这是等包围盒的正常结果。
    图形颜色沿用生成图原色，其中 trending / question 对白底对比度约 2.3~2.4:1，
    低于 WCAG 1.4.11 的 3:1；这五个图标每行都紧跟文字标签、属装饰性图形，
    语义由文字承担，故未改色。若后续要求达标，改 build 脚本里的主色映射。

  使用方式：
    <MenuIcon name="person" />
    <MenuIcon name="medal" :size="40" />
-->

<template>
  <img :src="src" class="menu-icon" :style="sizeStyle" alt="" aria-hidden="true" />
</template>

<script setup>
import { computed } from 'vue'
import personImg from '@/assets/images/menu-icons/person.png'
import trendingImg from '@/assets/images/menu-icons/trending.png'
import medalImg from '@/assets/images/menu-icons/medal.png'
import gearImg from '@/assets/images/menu-icons/gear.png'
import questionImg from '@/assets/images/menu-icons/question.png'

/**
 * 图标位图。显式 import 而非拼路径：Vite 需要静态路径才能做资源指纹和打包。
 */
const BITMAPS = {
  person: personImg,
  trending: trendingImg,
  medal: medalImg,
  gear: gearImg,
  question: questionImg
}

/**
 * 组件 Props 类型定义
 * @typedef {Object} Props
 * @property {'person'|'trending'|'medal'|'gear'|'question'} name - 图标名称
 * @property {number} [size=28] - 图标边长（px）
 */
const props = defineProps({
  // 图标名称（必填）
  name: {
    type: String,
    required: true,
    // 名单写成字面量：defineProps 在编译期提升，引用不到上面的 BITMAPS
    validator: (value) => ['person', 'trending', 'medal', 'gear', 'question'].includes(value)
  },
  // 图标边长
  size: {
    type: Number,
    default: 28
  }
})

/** validator 只在开发环境告警，生产传入非法 name 时兜底成 person，避免 img src 为空 */
const src = computed(() => BITMAPS[props.name] || BITMAPS.person)

const sizeStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`
}))
</script>

<style scoped>
.menu-icon {
  display: block;
  flex-shrink: 0;
}
</style>
