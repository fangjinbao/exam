<!--
  详情页只读信息卡片
  视觉与编辑页的 .panel 区块保持一致（白卡 + 标题栏 + 内容区），
  内容区是定义列表网格，配 InfoField 使用，替代 ElDescriptions 的带框表格。

  用 <dl> 而非 <div>：字段名与字段值是术语/释义关系，选用语义匹配的标签而非无语义容器。
  HTML5 允许 <div> 包裹 dt/dd 分组，故 InfoField 仍能作为独立网格项。
  注：各屏幕阅读器对 div 包裹的 dt/dd 分组播报不尽相同，实际效果未做人工验证。
-->

<template>
  <section class="info-panel">
    <div class="panel-head">
      <span class="panel-title">{{ title }}</span>
      <span v-if="sub" class="panel-sub">{{ sub }}</span>
    </div>
    <!--
      plain 变体渲染成普通 div：内容不是字段值对（如表格、列表）时，
      既用不上网格，也不该套 <dl> —— 那会给屏幕阅读器播报出一个没有 dt/dd 的空定义列表。
    -->
    <div v-if="plain" class="panel-body is-plain">
      <slot />
    </div>
    <dl v-else class="panel-body" :style="{ '--info-columns': columns }">
      <slot />
    </dl>
  </section>
</template>

<script setup lang="ts">
  defineOptions({ name: 'InfoPanel' })

  withDefaults(
    defineProps<{
      title: string
      /** 标题右侧的补充说明（可选） */
      sub?: string
      /** 每行字段数，窄屏自动降为 1 列 */
      columns?: number
      /** 内容区不走字段网格（放表格/列表等整块内容时用） */
      plain?: boolean
    }>(),
    { sub: '', columns: 2, plain: false }
  )
</script>

<style lang="scss" scoped>
  .info-panel {
    overflow: hidden;
    background: var(--el-bg-color-overlay);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 12px;
  }
  // 本组件不设外边距，卡片间距由调用方在外层容器上给（flex/grid + gap），否则相邻卡片会紧贴。
  // 不写成 .info-panel + .info-panel 的原因：容器里混入非本组件的兄弟（如空态 ElEmpty）会漏掉间距

  .panel-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 13px 20px;
    background: var(--el-fill-color-lighter);
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  .panel-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .panel-sub {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  .panel-body {
    display: grid;
    grid-template-columns: repeat(var(--info-columns, 2), minmax(0, 1fr));
    gap: 18px 36px;
    padding: 20px;
    margin: 0;
  }

  // 表格类内容自带行高与表头底色，网格的字段间距用不上，这里只给一圈留白。
  // 上留白不能压到 12px 以下：表格自己的灰表头会紧贴卡片头的灰底，两条灰带叠在一起分不清层级
  .panel-body.is-plain {
    display: block;
    padding: 14px 20px 18px;
  }

  // 窄屏下多列会把值挤成竖排断行，直接降为单列
  @media (max-width: 900px) {
    .panel-body {
      grid-template-columns: 1fr;
    }
  }
</style>
