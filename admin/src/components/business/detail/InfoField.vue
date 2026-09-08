<!--
  详情页单个字段：字段名在上、值在下。
  只能放在 InfoPanel 内使用（依赖其网格布局）。
-->

<template>
  <div class="info-field" :class="{ 'is-full': full }">
    <dt class="field-label">{{ label }}</dt>
    <dd class="field-value"><slot>-</slot></dd>
  </div>
</template>

<script setup lang="ts">
  defineOptions({ name: 'InfoField' })

  withDefaults(
    defineProps<{
      label: string
      /** 占满整行（长文本字段用，如说明） */
      full?: boolean
    }>(),
    { full: false }
  )
</script>

<style lang="scss" scoped>
  .info-field.is-full {
    grid-column: 1 / -1;
  }

  .field-label {
    margin-bottom: 6px;
    font-size: 12px;
    line-height: 1.4;
    color: var(--el-text-color-secondary);
  }

  .field-value {
    // dd 默认带左缩进，须清掉
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
    color: var(--el-text-color-primary);
    word-break: break-word;
  }
</style>
