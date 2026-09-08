<!--
  阅卷工作台左栏：待批阅考生名单
  头像取姓名末字，名单项用 button 保证键盘可聚焦、回车可选中。
-->

<template>
  <aside class="roster-card">
    <header class="roster-head">
      <span class="head-title">待批阅（{{ pendingCount }}）</span>
    </header>
    <div class="roster-search">
      <ElInput
        :model-value="keyword"
        placeholder="搜索考生"
        clearable
        size="small"
        :prefix-icon="Search"
        @update:model-value="emit('update:keyword', $event)"
      />
    </div>
    <div v-loading="loading" class="roster">
      <button
        v-for="c in list"
        :key="c.id"
        type="button"
        class="roster-item"
        :class="{ 'is-active': c.id === currentId }"
        @click="emit('select', c)"
      >
        <span class="avatar" aria-hidden="true">{{ avatarText(c.candidateName) }}</span>
        <span class="info">
          <span class="name" :title="c.candidateName">{{ c.candidateName }}</span>
          <span class="org" :title="c.orgName || '未设置组织'">{{ c.orgName || '-' }}</span>
        </span>
        <!-- 待批阅题数比状态文字更能说明「还剩多少活」，有待阅时优先显示 -->
        <ElTag v-if="c.pendingSubjectiveCount > 0" type="warning" size="small" disable-transitions>
          {{ c.pendingSubjectiveCount }}
        </ElTag>
        <ElIcon v-else class="done-icon"><Select /></ElIcon>
      </button>
      <ElEmpty v-if="!loading && list.length === 0" description="暂无考生" :image-size="60" />
    </div>
  </aside>
</template>

<script setup lang="ts">
  import { Search, Select } from '@element-plus/icons-vue'
  import type { GradingCandidate } from '@/api/grading'

  defineOptions({ name: 'CandidateRoster' })

  defineProps<{
    /** 已按搜索词过滤后的名单（过滤逻辑留在父页，上一份/下一份要用同一份顺序） */
    list: GradingCandidate[]
    /** 当前选中的答卷 ID */
    currentId: number | null
    /** 整场待批阅人数（表头括号内数字，不受搜索影响） */
    pendingCount: number
    keyword: string
    loading: boolean
  }>()

  const emit = defineEmits<{
    (e: 'select', candidate: GradingCandidate): void
    (e: 'update:keyword', value: string): void
  }>()

  /** 头像文字取姓名末字（中文姓名末字比首字更能区分同姓的人） */
  function avatarText(name: string): string {
    return name ? name.slice(-1) : '?'
  }
</script>

<style lang="scss" scoped>
  // 与中/右栏同款：白底 + 12px 圆角，不用 ElCard
  .roster-card {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    width: 220px;
    overflow: hidden;
    background: var(--el-bg-color);
    border-radius: 12px;
  }

  .roster-head {
    flex-shrink: 0;
    padding: 14px 14px 10px;
  }

  .head-title {
    font-size: 14px;
    font-weight: 600;
  }

  .roster-search {
    flex-shrink: 0;
    padding: 0 12px 10px;
  }

  .roster {
    flex: 1;
    min-height: 0;
    padding: 0 8px 8px;
    overflow-y: auto;
  }

  .roster-item {
    display: flex;
    gap: 10px;
    align-items: center;
    width: 100%;
    padding: 10px;
    margin-bottom: 6px;
    text-align: left;
    cursor: pointer;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 8px;

    &:hover {
      background: var(--el-fill-color-light);
    }

    // 选中态用边框 + 浅底，与截图一致；只靠底色在浅色主题下不够明确
    &.is-active {
      background: var(--el-color-primary-light-9);
      border-color: var(--el-color-primary);
    }
  }

  .avatar {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    font-size: 13px;
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-8);
    border-radius: 50%;
  }

  .info {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .name {
    overflow: hidden;
    font-size: 13px;
    color: var(--el-text-color-primary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .org {
    overflow: hidden;
    font-size: 12px;
    color: var(--el-text-color-secondary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .done-icon {
    flex-shrink: 0;
    color: var(--el-color-success);
  }
</style>
