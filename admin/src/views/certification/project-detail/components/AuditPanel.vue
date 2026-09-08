<!--
  审核进展 Tab：状态分布 + 前往审核的入口。

  与考试/练习详情同一套卡片语言，不自造彩色统计卡片。

  这里只看不审：审核要选人、填驳回原因、批量操作，已有「报名审核」页完整实现，
  在详情页再做一套是重复。故本 Tab 给出分布与入口，实际操作跳过去做。
-->

<template>
  <div v-loading="loading" class="info-tab">
    <InfoPanel title="审核状态分布" :columns="4">
      <InfoField label="待审核">
        <span class="stat-num" :class="{ 'is-warning': pending > 0 }">{{ pending }}</span>
      </InfoField>
      <InfoField label="已通过">
        <span class="stat-num" :class="{ 'is-success': approved > 0 }">{{ approved }}</span>
      </InfoField>
      <InfoField label="已驳回">
        <span class="stat-num" :class="{ 'is-danger': rejected > 0 }">{{ rejected }}</span>
      </InfoField>
      <InfoField label="报名总数">
        <span class="stat-num">{{ total }}</span>
      </InfoField>
    </InfoPanel>

    <InfoPanel title="审核操作" plain>
      <div class="audit-action">
        <span class="hint">
          <template v-if="total === 0"
            >尚无报名记录，各单位在「鉴定报名」中按名额上报后可在此审核。</template
          >
          <template v-else-if="pending > 0">有 {{ pending }} 条报名待审核。</template>
          <template v-else>全部报名已审核完毕。</template>
        </span>
        <ElButton v-if="total > 0" type="primary" @click="goAudit">前往报名审核</ElButton>
      </div>
    </InfoPanel>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useRouter } from 'vue-router'
  import InfoPanel from '@/components/business/detail/InfoPanel.vue'
  import InfoField from '@/components/business/detail/InfoField.vue'
  import type { CertProjectProgress } from '@/api/certProject'

  const props = defineProps<{
    projectId: number
    byStatus: CertProjectProgress['byStatus']
    loading: boolean
  }>()

  const router = useRouter()

  const countOf = (key: 'pending' | 'approved' | 'rejected') =>
    props.byStatus.find((s) => s.status === key)?._count._all ?? 0

  const pending = computed(() => countOf('pending'))
  const approved = computed(() => countOf('approved'))
  const rejected = computed(() => countOf('rejected'))
  const total = computed(() => props.byStatus.reduce((sum, s) => sum + s._count._all, 0))

  /**
   * 带项目 id 过去，审核页可据此预筛（该页未接收此参数时不影响正常打开）。
   * 按 path 跳：后端菜单驱动下路由名由 router 派生，与静态路由的 name 不一定一致。
   */
  function goAudit() {
    router.push({ path: '/certification/application', query: { projectId: props.projectId } })
  }
</script>

<style lang="scss" scoped>
  .info-tab {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .stat-num {
    font-size: 18px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .is-warning {
    color: var(--el-color-warning);
  }

  .is-success {
    color: var(--el-color-success);
  }

  .is-danger {
    color: var(--el-color-danger);
  }

  .audit-action {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;

    .hint {
      font-size: 13px;
      color: var(--el-text-color-secondary);
    }
  }
</style>
