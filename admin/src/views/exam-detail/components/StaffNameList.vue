<!--
  只读的人员姓名列表（监考 / 阅卷共用）
  名单为空时显示各自的说明文案——两类名单「未指派」的后果不同，故文案由外部传入。
-->

<template>
  <span>
    <template v-if="list && list.length">
      <ElTag
        v-for="item in list"
        :key="item.userId"
        size="small"
        disable-transitions
        class="name-tag"
      >
        {{ item.name }}
      </ElTag>
    </template>
    <span v-else class="placeholder">{{ emptyText }}</span>
  </span>
</template>

<script setup lang="ts">
  import type { ExamStaffDetail } from '@/api/exam'

  defineOptions({ name: 'StaffNameList' })

  defineProps<{
    list?: ExamStaffDetail[]
    /** 名单为空时的说明文案 */
    emptyText: string
  }>()
</script>

<style lang="scss" scoped>
  .name-tag {
    margin: 2px 6px 2px 0;
  }

  // 字号交由外层 InfoField 的值样式决定，这里只弱化颜色
  .placeholder {
    color: var(--el-text-color-placeholder);
  }
</style>
