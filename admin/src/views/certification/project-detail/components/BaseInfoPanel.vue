<!--
  基础信息 Tab：基本信息 / 时间安排 / 名额分配三组只读展示。

  与 exam-detail、practice-detail 同构：用 InfoPanel + InfoField（字段名在上、值在下），
  不用 ElDescriptions 的带框表格——那与项目里其余详情页的观感不一致。
  名额分配是整块表格，走 InfoPanel 的 plain 变体（不套字段网格）。

  只读展示，编辑仍走列表页的弹窗：名额与项目是一体的编辑单元，不在详情页里单独改。
-->

<template>
  <div v-loading="loading" class="info-tab">
    <template v-if="project">
      <InfoPanel title="基本信息">
        <InfoField label="鉴定名称">{{ project.name }}</InfoField>
        <InfoField label="发布状态">
          <ElTag
            :type="project.publishStatus === 'published' ? 'success' : 'info'"
            size="small"
            disable-transitions
          >
            {{ project.publishStatus === 'published' ? '已发布' : '未发布' }}
          </ElTag>
        </InfoField>
        <InfoField label="鉴定工种">{{ project.occupationName || '-' }}</InfoField>
        <InfoField label="鉴定级别">{{ project.levelName || '-' }}</InfoField>
        <InfoField label="负责人">{{ project.managerName || '-' }}</InfoField>
        <InfoField label="联系电话">{{ project.contactPhone || '-' }}</InfoField>
        <InfoField label="创建人">
          {{ project.createByName || '-' }}
          <span v-if="project.createByOrgName" class="sub-note">
            {{ project.createByOrgName }}
          </span>
        </InfoField>
        <InfoField label="报考条件" full>
          <span v-if="!project.applyCondition" class="placeholder">未填写</span>
          <template v-else>{{ project.applyCondition }}</template>
        </InfoField>
        <InfoField label="鉴定说明" full>
          <span v-if="!project.description" class="placeholder">未填写</span>
          <template v-else>{{ project.description }}</template>
        </InfoField>
      </InfoPanel>

      <InfoPanel title="时间安排" :columns="3">
        <InfoField label="报名截止">{{ project.applyDeadline || '-' }}</InfoField>
        <InfoField label="鉴定开始">{{ project.startTime || '-' }}</InfoField>
        <InfoField label="鉴定结束">{{ project.endTime || '-' }}</InfoField>
        <InfoField label="发布时间">
          <span v-if="!project.publishTime" class="placeholder">未发布</span>
          <template v-else>{{ project.publishTime }}</template>
        </InfoField>
        <InfoField label="创建时间">{{ project.createTime || '-' }}</InfoField>
      </InfoPanel>

      <!-- plain：整块表格，用不上字段网格 -->
      <InfoPanel title="名额分配" :sub="quotaSub" plain>
        <ElTable :data="project.quotas || []" size="small" style="width: 100%">
          <ElTableColumn prop="orgName" label="单位" min-width="200" show-overflow-tooltip />
          <ElTableColumn label="部门" min-width="160" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="!row.deptName" class="placeholder">整个单位</span>
              <template v-else>{{ row.deptName }}</template>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="quota" label="分配名额" width="110" align="center" />
          <template #empty>
            <span class="placeholder">暂未分配名额</span>
          </template>
        </ElTable>
      </InfoPanel>
    </template>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import InfoPanel from '@/components/business/detail/InfoPanel.vue'
  import InfoField from '@/components/business/detail/InfoField.vue'
  import type { CertProject } from '@/api/certProject'

  const props = defineProps<{
    project: CertProject | null
    loading: boolean
  }>()

  /** 标题右侧的总计：一眼看到共几个单位、多少名额，不必自己加 */
  const quotaSub = computed(() => {
    const rows = props.project?.quotas || []
    if (rows.length === 0) return ''
    const total = rows.reduce((sum, r) => sum + (r.quota || 0), 0)
    return `${rows.length} 个单位 · 共 ${total} 个名额`
  })
</script>

<style lang="scss" scoped>
  // 卡片间距由容器统一给，与 exam-detail 的 .info-tab 一致
  .info-tab {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  // 附注文字：跟在主值后面的补充说明，弱化避免与主值抢视线
  .sub-note {
    margin-left: 8px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  .placeholder {
    color: var(--el-text-color-placeholder);
  }
</style>
