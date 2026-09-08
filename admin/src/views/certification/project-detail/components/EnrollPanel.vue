<!--
  报名进展 Tab：名额总览 + 按单位对账。

  与考试/练习详情同一套卡片语言（InfoPanel + InfoField），总览走字段网格，
  明细表走 plain 变体。不自造统计卡片：项目里的详情页统计数字都用 InfoField 展示。

  为什么占用要减「待审 + 通过」而不是全部：驳回后名额释放、允许补报，
  这与服务端数名额的口径一致（见 CertApplication 的注释）。两边算法不一致
  会出现界面显示还有名额、提交却被服务端拦回的情况。
-->

<template>
  <div v-loading="loading" class="info-tab">
    <InfoPanel title="名额总览" :columns="4">
      <InfoField label="总名额">
        <span class="stat-num">{{ totalQuota }}</span>
      </InfoField>
      <InfoField label="已占用">
        <span class="stat-num">{{ totalUsed }}</span>
        <span class="sub-note">待审 + 已通过</span>
      </InfoField>
      <InfoField label="剩余名额">
        <span class="stat-num" :class="{ 'is-danger': remaining <= 0 }">{{ remaining }}</span>
      </InfoField>
      <InfoField label="报名总数">
        <span class="stat-num">{{ totalApplied }}</span>
      </InfoField>
    </InfoPanel>

    <InfoPanel title="各单位报名情况" :sub="orgSub" plain>
      <ElTable :data="rows" size="small" style="width: 100%">
        <ElTableColumn prop="orgName" label="单位" min-width="200" show-overflow-tooltip />
        <ElTableColumn label="部门" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="!row.deptName" class="placeholder">整个单位</span>
            <template v-else>{{ row.deptName }}</template>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="quota" label="名额" width="80" align="center" />
        <ElTableColumn label="已占用" width="90" align="center">
          <template #default="{ row }">{{ row.used }}</template>
        </ElTableColumn>
        <ElTableColumn label="剩余" width="80" align="center">
          <template #default="{ row }">
            <span :class="{ 'is-danger': row.quota - row.used <= 0 }">
              {{ row.quota - row.used }}
            </span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="待审" width="80" align="center">
          <template #default="{ row }">
            <span v-if="!row.pending" class="placeholder">-</span>
            <template v-else>{{ row.pending }}</template>
          </template>
        </ElTableColumn>
        <ElTableColumn label="已通过" width="90" align="center">
          <template #default="{ row }">
            <span v-if="!row.approved" class="placeholder">-</span>
            <template v-else>{{ row.approved }}</template>
          </template>
        </ElTableColumn>
        <ElTableColumn label="已驳回" width="90" align="center">
          <template #default="{ row }">
            <span v-if="!row.rejected" class="placeholder">-</span>
            <template v-else>{{ row.rejected }}</template>
          </template>
        </ElTableColumn>
        <template #empty>
          <span class="placeholder">暂未分配名额</span>
        </template>
      </ElTable>
    </InfoPanel>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import InfoPanel from '@/components/business/detail/InfoPanel.vue'
  import InfoField from '@/components/business/detail/InfoField.vue'
  import type { CertProject, CertProgressByOrg } from '@/api/certProject'

  const props = defineProps<{
    project: CertProject | null
    byOrg: CertProgressByOrg[]
    loading: boolean
  }>()

  /**
   * 以名额行为主表，左连报名统计。
   *
   * 服务端按 orgId + deptId + status 分组返回，同一名额行会有多条（每种状态一条），
   * 故按「orgId:deptId」拼 key 归并。deptId 为空的名额行（名额分给整个单位）用空串占位，
   * 与服务端存 null 的口径对齐。
   */
  const rows = computed(() => {
    const stat = new Map<string, { pending: number; approved: number; rejected: number }>()
    for (const r of props.byOrg) {
      const key = `${r.orgId ?? ''}:${r.deptId ?? ''}`
      const cur = stat.get(key) || { pending: 0, approved: 0, rejected: 0 }
      cur[r.status] += r._count._all
      stat.set(key, cur)
    }
    return (props.project?.quotas || []).map((q) => {
      const s = stat.get(`${q.orgId ?? ''}:${q.deptId ?? ''}`) || {
        pending: 0,
        approved: 0,
        rejected: 0
      }
      // 占用 = 待审 + 通过；驳回不占（名额已释放，可补报）
      return { ...q, ...s, used: s.pending + s.approved }
    })
  })

  const totalQuota = computed(() => rows.value.reduce((sum, r) => sum + (r.quota || 0), 0))
  const totalUsed = computed(() => rows.value.reduce((sum, r) => sum + r.used, 0))
  const remaining = computed(() => totalQuota.value - totalUsed.value)
  const totalApplied = computed(() => props.byOrg.reduce((sum, r) => sum + r._count._all, 0))

  const orgSub = computed(() => {
    const n = rows.value.length
    if (n === 0) return ''
    const reported = rows.value.filter((r) => r.used > 0).length
    return `${n} 个单位 · ${reported} 个已报名`
  })
</script>

<style lang="scss" scoped>
  .info-tab {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  // 统计数字放大一档：总览卡片里的值是本页重点，与普通字段值区分开
  .stat-num {
    font-size: 18px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .is-danger {
    color: var(--el-color-danger);
  }

  .sub-note {
    margin-left: 8px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  .placeholder {
    color: var(--el-text-color-placeholder);
  }
</style>
