<!-- 证书设计器画布：A4 底图 + 绝对定位可拖拽元素；预览模式下用示例数据渲染占位符、禁用拖拽 -->
<template>
  <div class="designer-canvas-wrap">
    <div
      ref="canvasRef"
      class="designer-canvas"
      :style="canvasStyle"
      @mousedown.self="emit('update:selectedId', '')"
    >
      <div
        v-for="el in elements"
        :key="el.id"
        class="canvas-el"
        :class="{ selected: !preview && el.id === selectedId, preview }"
        :style="elStyle(el)"
        @mousedown.stop="onElMouseDown($event, el)"
      >
        <!--
          draggable="false" 必须显式关掉：图片默认可拖，按住印章移动会触发浏览器
          原生图片拖拽，原生拖拽一启动就不再派发 mousemove，印章便不跟手。
          文字元素是 span 没这问题，故此前只有印章「拖不动」。
          user-select: none 管不了这个 —— 它只管文字选中，不管图片拖拽。
        -->
        <img
          v-if="el.type === 'seal'"
          :src="sealUrl"
          class="el-seal"
          :style="{ width: el.width + 'px' }"
          draggable="false"
          alt="印章"
        />
        <!-- 内联 span 的 offsetWidth 即文字实宽，供「适应文字」按钮收窄框宽 -->
        <span v-else :ref="(vm) => setTextRef(el.id, vm)">{{ displayText(el) }}</span>
      </div>
      <div v-if="!elements.length && !bgUrl" class="canvas-empty">从左侧添加元素开始设计</div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { ref, computed, onBeforeUnmount } from 'vue'
  import { getAssetUrl } from '@/utils/url'
  import {
    CANVAS_SIZE,
    getFieldOption,
    type DesignerElement
  } from './designer-types'

  const props = defineProps<{
    elements: DesignerElement[]
    size: number
    background?: string | null
    seal?: string | null
    selectedId: string
    preview?: boolean
  }>()

  const emit = defineEmits<{
    (e: 'update:selectedId', id: string): void
    (e: 'drag', payload: { id: string; x: number; y: number }): void
  }>()

  const canvasRef = ref<HTMLElement>()

  // 画布尺寸按 size 取横/竖版；底图铺满画布
  const dims = computed(() => CANVAS_SIZE[props.size === 1 ? 1 : 2])
  const bgUrl = computed(() => getAssetUrl(props.background || undefined))
  const sealUrl = computed(() => getAssetUrl(props.seal || undefined))

  const canvasStyle = computed(() => ({
    width: dims.value.width + 'px',
    height: dims.value.height + 'px',
    backgroundImage: bgUrl.value ? `url(${bgUrl.value})` : 'none'
  }))

  /** 单个元素定位与文字样式 */
  function elStyle(el: DesignerElement) {
    return {
      left: el.x + 'px',
      top: el.y + 'px',
      width: el.width + 'px',
      fontSize: el.fontSize + 'px',
      color: el.color,
      fontWeight: el.bold ? 700 : 400,
      textAlign: el.align,
      // 下划线：底部横线铺满元素宽度（填空线效果），留白让线落在文字下方
      borderBottom: el.underline ? `1px solid ${el.color}` : 'none',
      paddingBottom: el.underline ? '4px' : '0'
    }
  }

  // ==== 文字实宽测量：供属性面板的「适应文字」把框宽收到文字长度 ====
  // 元素 div 宽度固定（textAlign 的参照系、下划线横线的长度都依赖它），
  // 短文本配大框宽会导致「右对齐后拖不到左边」——文字被顶在框右缘，
  // 框左缘已到 x=0 却仍离左侧很远。收窄框宽即可精确定位。
  const textRefs = new Map<string, HTMLElement>()

  function setTextRef(id: string, vm: unknown) {
    // ref 回调在卸载时传入 null，需清理，否则 Map 持有已卸载节点造成泄漏
    if (vm instanceof HTMLElement) {
      textRefs.set(id, vm)
    } else {
      textRefs.delete(id)
    }
  }

  /**
   * 量出指定元素的文字渲染宽度（向上取整，含 1px 余量避免尾字被压行）
   *
   * @param id 元素 id
   * @returns 文字宽度 px；节点不存在（如印章、未渲染）时返回 0
   */
  function measureTextWidth(id: string): number {
    const node = textRefs.get(id)
    if (!node) return 0
    // 临时取消换行再量：框宽比文字窄时文字会折行，此时 offsetWidth 是折行后的
    // 行宽而非单行实宽，量出来偏小，会把框越收越窄
    const prev = node.style.whiteSpace
    node.style.whiteSpace = 'nowrap'
    const width = Math.ceil(node.offsetWidth) + 1
    node.style.whiteSpace = prev
    return width
  }

  defineExpose({ measureTextWidth })

  /** 元素展示文字：预览模式占位符用示例值，编辑模式占位符显示【标签】 */
  function displayText(el: DesignerElement): string {
    if (el.type === 'text') return el.text || '文本'
    const field = getFieldOption(el.fieldKey)
    if (!field) return '字段'
    return props.preview ? field.sample : `【${field.label}】`
  }

  // ==== 拖拽：记录起始鼠标/元素坐标及元素实际渲染尺寸，document 级监听移动/松开，坐标钳制在画布内 ====
  let dragId = ''
  let startMouseX = 0
  let startMouseY = 0
  let startElX = 0
  let startElY = 0
  // 元素实际渲染宽高（印章图片高度、多行文本高度无法用 fontSize 估算，故取 DOM 真实尺寸）
  let startElW = 0
  let startElH = 0

  function onElMouseDown(e: MouseEvent, el: DesignerElement) {
    emit('update:selectedId', el.id)
    if (props.preview) return
    // 拦掉浏览器默认的图片拖拽与文字选中：两者都会打断 mousemove，使拖动卡顿或失效
    e.preventDefault()
    dragId = el.id
    startMouseX = e.clientX
    startMouseY = e.clientY
    startElX = el.x
    startElY = el.y
    const target = e.currentTarget as HTMLElement
    startElW = target.offsetWidth
    startElH = target.offsetHeight
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  function onMouseMove(e: MouseEvent) {
    if (!dragId) return
    const maxX = dims.value.width - startElW
    const maxY = dims.value.height - startElH
    const nx = clamp(startElX + (e.clientX - startMouseX), 0, Math.max(0, maxX))
    const ny = clamp(startElY + (e.clientY - startMouseY), 0, Math.max(0, maxY))
    emit('drag', { id: dragId, x: Math.round(nx), y: Math.round(ny) })
  }

  function onMouseUp() {
    dragId = ''
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  function clamp(v: number, min: number, max: number): number {
    return Math.min(Math.max(v, min), max)
  }

  // 组件卸载兜底移除监听，防止拖拽中途卸载导致监听泄漏
  onBeforeUnmount(() => {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  })
</script>

<style lang="scss" scoped>
  .designer-canvas-wrap {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: 24px;
    overflow: auto;
    height: 100%;
    background: var(--el-fill-color-lighter);
  }

  .designer-canvas {
    position: relative;
    background-color: #fff;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    box-shadow:
      0 1px 3px rgba(0, 0, 0, 0.08),
      0 8px 28px rgba(0, 0, 0, 0.14);
    border-radius: 2px;
    flex-shrink: 0;
  }

  .canvas-el {
    position: absolute;
    cursor: move;
    user-select: none;
    line-height: 1.2;
    box-sizing: border-box;
    /*
      换行规则须与考生端 mobile/src/views/profile/CertificateDetail.vue 的
      .cert-el 一致，否则设计器所见与实际发出的证书不符：
      默认 normal 会折叠连续空格、且不断长串，考生端则保留空格并断词。
    */
    white-space: pre-wrap;
    word-break: break-word;

    &.selected {
      outline: 1.5px solid var(--el-color-primary);
      outline-offset: 2px;
      box-shadow: 0 0 0 4px var(--el-color-primary-light-8);
    }

    &.preview {
      cursor: default;
    }

    .el-seal {
      display: block;
      height: auto;
      /* 与模板上的 draggable="false" 双重保险，挡住原生图片拖拽抢走 mousemove */
      -webkit-user-drag: none;
      user-select: none;
      pointer-events: none;
    }
  }

  .canvas-empty {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: var(--el-text-color-placeholder);
    font-size: 14px;
    pointer-events: none;
  }
</style>
