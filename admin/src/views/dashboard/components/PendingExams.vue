<!--
  待处理的考试

  首页的开工入口：只列有待批阅或成绩未发布的场次，按待批阅量降序，
  最多 8 行——首页要的是「最该先动手的几场」，看全部去阅卷中心。
-->

<template>
  <ElCard shadow="never" class="list-card">
    <template #header>
      <div class="card-head">
        <span class="card-title">待处理的考试</span>
        <ElButton link type="primary" @click="emit('grading')">前往阅卷中心</ElButton>
      </div>
    </template>

    <ElTable v-if="rows.length" :data="rows" size="default">
      <ElTableColumn prop="name" label="考试名称" min-width="200" show-overflow-tooltip />
      <ElTableColumn prop="sourceName" label="来源" min-width="120" show-overflow-tooltip />
      <ElTableColumn label="状态" width="100">
        <template #default="{ row }">
          <ElTag :type="examStatusTagType(row.status)" size="small" disable-transitions>
            {{ EXAM_STATUS_TEXT[row.status] || row.status }}
          </ElTag>
        </template>
      </ElTableColumn>
      <ElTableColumn label="应考 / 已交" width="110" align="center">
        <template #default="{ row }">{{ row.candidateCount }} / {{ row.sheetCount }}</template>
      </ElTableColumn>
      <ElTableColumn label="待批阅" width="90" align="center">
        <template #default="{ row }">
          <b v-if="row.pendingCount > 0" class="num-warn">{{ row.pendingCount }}</b>
          <span v-else class="num-ok">0</span>
        </template>
      </ElTableColumn>
      <ElTableColumn label="已发布" min-width="190">
        <template #default="{ row }">
          <div class="rate-cell">
            <ElProgress
              :percentage="publishRate(row)"
              :stroke-width="6"
              :show-text="false"
              class="rate-bar"
            />
            <!--
              百分比与份数都直接写出来，不靠 title 悬停。
              阅卷常在触屏一体机上做，title 在触屏上没有触发方式，
              把份数藏进去等于这条信息在那类设备上彻底看不到。
            -->
            <span class="rate-text">{{ publishRate(row) }}%</span>
            <span class="rate-raw">{{ row.publishedCount }}/{{ row.sheetCount }}</span>
          </div>
        </template>
      </ElTableColumn>
      <ElTableColumn label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <ElButton link type="primary" @click="emit('workspace', row)">去阅卷</ElButton>
        </template>
      </ElTableColumn>
    </ElTable>
    <ElEmpty v-else-if="!loading" description="没有待处理的考试" />
  </ElCard>
</template>

<script setup lang="ts">
  import { EXAM_STATUS_TEXT, examStatusTagType } from '@/api/exam'
  import type { GradingExam } from '@/api/grading'

  defineOptions({ name: 'DashboardPendingExams' })

  defineProps<{
    rows: GradingExam[]
    loading: boolean
  }>()

  const emit = defineEmits<{
    grading: []
    workspace: [exam: GradingExam]
  }>()

  /** 该场的阅卷进度百分比，用已发布份数 / 已交份数 */
  function publishRate(e: GradingExam): number {
    if (!e.sheetCount) return 0
    return Math.round((e.publishedCount / e.sheetCount) * 100)
  }
</script>

<style lang="scss" scoped>
  .list-card {
    margin-top: 16px;
    border: none !important;
    border-radius: 12px;
    box-shadow: none !important;
  }

  .card-head {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
  }

  .card-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  // 进度条与文字同行：只给条不给数字，看不出基数多大
  .rate-cell {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .rate-bar {
    flex: 1;

    // min-width: 0 必需，否则 ElProgress 不会收缩到内容宽度以下
    min-width: 0;
  }

  .rate-text {
    flex-shrink: 0;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: var(--el-text-color-regular);
  }

  // 原始份数是核对用的次要信息，压小并弱化，不与百分比抢注意力
  .rate-raw {
    flex-shrink: 0;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: var(--el-text-color-secondary);
  }

  .num-warn {
    font-variant-numeric: tabular-nums;
    color: var(--el-color-danger);
  }

  .num-ok {
    font-variant-numeric: tabular-nums;
    color: var(--el-text-color-secondary);
  }
</style>
