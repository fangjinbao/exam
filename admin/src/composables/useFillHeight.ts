/**
 * 文件名称：composables/useFillHeight.ts - 容器填充剩余视口高度
 *
 * 功能描述：
 *   实测容器距滚动区顶部的偏移，算出「填满剩余视口」的高度并返回，
 *   供页面以内联 style 绑定。用于需要内部分区独立滚动的页面
 *   （如左右分栏 + 底部固定操作栏的工作台式布局）。
 *
 * 为什么必须实测而不能用 CSS：
 *   外层 .art-page-view 是 flex:1 但没有 min-height:0（见 views/index/style.scss），
 *   再外层 .el-scrollbar__view 是 min-height:100%（允许超出视口），
 *   于是父级高度等于内容高度，子级写 height:100% 会落空、被内容一路撑开。
 *   也不能写 calc(100vh - Npx)：顶栏占用随布局模式（框架一/框架二）、
 *   页签显隐、tabStyle 边距变化，固定值必然在某些模式下留白或溢出。
 *
 * 使用方式：
 *   const rootRef = ref<HTMLElement>()
 *   const { height } = useFillHeight(rootRef)
 *   <div ref="rootRef" :style="{ height }">
 *
 * 待迁移：views/organization/user/index.vue:246-265 有一份同算法的独立实现，
 *   本 composable 即由它抽出。抽出时未一并改造该页（它在正常工作，改动有回归风险），
 *   故算法目前存在两份副本。若要修改下方实测逻辑（offsetInWrap 的 scrollTop 补偿、
 *   窄屏阈值等），必须同步那一处，否则两页行为会静默分叉。
 */

import { ref, onMounted, onBeforeUnmount, type Ref } from 'vue'

/**
 * 窄屏阈值（px）：此宽度以下布局改为整页滚动，不再锁高度
 *
 * 必须与 assets/styles/variables.scss 的 $device-ipad 保持一致——使用方页面的
 * media query 按该变量切换样式，两值不等会出现「脚本已放开高度但样式仍按宽屏渲染」
 * 的错位区间。TS 无法直接读 scss 变量，只能靠此注释约束同步。
 */
const NARROW_WIDTH = 800

export interface UseFillHeightOptions {
  /** 底部呼吸位（px），默认 20，与 .art-page-view 的 padding-bottom 对齐 */
  gap?: number
  /** 最小高度（px），默认 420，避免小窗口下压成一条 */
  minHeight?: number
}

/**
 * 让容器填满滚动区内的剩余高度
 *
 * @param elRef - 目标容器的模板 ref
 * @param options - 呼吸位与最小高度
 * @returns height 为可直接绑定到 style 的高度字符串；窄屏时为 undefined（不锁高度）
 */
export function useFillHeight(
  elRef: Ref<HTMLElement | undefined>,
  options: UseFillHeightOptions = {}
) {
  const { gap = 20, minHeight = 420 } = options

  const height = ref<string | undefined>(undefined)
  const isNarrow = ref(false)

  const measure = () => {
    isNarrow.value = window.innerWidth <= NARROW_WIDTH
    const el = elRef.value
    if (!el) return
    // 窄屏交回整页滚动，锁高度会让内容被裁掉
    if (isNarrow.value) {
      height.value = undefined
      return
    }

    const wrap = el.closest('.el-scrollbar__wrap') as HTMLElement | null
    if (wrap) {
      // 加回 scrollTop 抵消滚动位移，否则已滚动时算出的高度会偏大
      const offsetInWrap =
        el.getBoundingClientRect().top - wrap.getBoundingClientRect().top + wrap.scrollTop
      height.value = `${Math.max(wrap.clientHeight - offsetInWrap - gap, minHeight)}px`
    } else {
      height.value = `${Math.max(window.innerHeight - el.getBoundingClientRect().top - gap, minHeight)}px`
    }
  }

  let observer: ResizeObserver | null = null

  onMounted(() => {
    measure()
    window.addEventListener('resize', measure)
    // 顶栏/页签显隐、布局模式切换都会改变容器起始位置，
    // 这些场景不触发 window.resize，故观察 body 尺寸变化跟随重算
    observer = new ResizeObserver(measure)
    observer.observe(document.body)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', measure)
    observer?.disconnect()
    observer = null
  })

  return { height, isNarrow, measure }
}
