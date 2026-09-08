<!--
  报名抽屉：上半是本单位的名额行，下半是已报人员

  名额按行展示而非合计：一个单位可能有多个名额行（按部门分，外加一行整个单位），
  各行是独立的桶，某部门的名额不该被别的部门占掉，所以挑人必须先选定是哪一行。
-->
<template>
  <ElDrawer
    :model-value="modelValue"
    :title="project?.name || '鉴定报名'"
    size="60%"
    @update:model-value="emit('update:modelValue', $event)"
    @open="handleOpen"
  >
    <div v-if="project" class="enroll-drawer">
      <ElDescriptions :column="3" size="small" border class="meta">
        <ElDescriptionsItem label="工种">{{ project.occupationName }}</ElDescriptionsItem>
        <ElDescriptionsItem label="级别">{{ project.levelName }}</ElDescriptionsItem>
        <ElDescriptionsItem label="负责人">{{ project.managerName }}</ElDescriptionsItem>
        <ElDescriptionsItem label="联系电话">{{ project.contactPhone }}</ElDescriptionsItem>
        <ElDescriptionsItem label="报名截止">
          {{ (project.applyDeadline || '').slice(0, 16) }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="状态">
          <ElTag v-if="project.closed" type="danger" size="small">已截止</ElTag>
          <ElTag v-else type="success" size="small">报名中</ElTag>
        </ElDescriptionsItem>
      </ElDescriptions>

      <div class="section-title">本单位名额</div>
      <ElTable v-loading="quotaLoading" :data="quotas" size="small" border>
        <ElTableColumn prop="orgName" label="单位" min-width="150" show-overflow-tooltip />
        <ElTableColumn label="部门" min-width="130">
          <template #default="{ row }">
            <span v-if="row.deptName">{{ row.deptName }}</span>
            <!-- 名额行的部门为空时是「整个单位」，标出来免得看着像数据缺失 -->
            <span v-else class="muted">不分部门</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="名额" width="80" align="center">
          <template #default="{ row }">{{ row.quota }}</template>
        </ElTableColumn>
        <ElTableColumn label="已报" width="80" align="center">
          <template #default="{ row }">{{ row.used }}</template>
        </ElTableColumn>
        <ElTableColumn label="剩余" width="90" align="center">
          <template #default="{ row }">
            <ElTag :type="row.remain > 0 ? 'success' : 'info'" size="small" effect="plain">
              {{ row.remain }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="110" align="center">
          <template #default="{ row }">
            <ElButton
              link
              type="primary"
              :disabled="project.closed || row.remain <= 0"
              @click="openPicker(row)"
            >
              选择人员
            </ElButton>
          </template>
        </ElTableColumn>
        <template #empty>
          <div class="empty">本单位在该项目下没有名额</div>
        </template>
      </ElTable>

      <div class="section-title">
        已报人员
        <span class="sub">共 {{ applications.length }} 人</span>
      </div>
      <ElTable v-loading="appLoading" :data="applications" size="small" border max-height="300">
        <ElTableColumn prop="candidateName" label="姓名" width="110" show-overflow-tooltip />
        <ElTableColumn label="占用名额" min-width="120">
          <template #default="{ row }">
            <span v-if="row.deptName">{{ row.deptName }}</span>
            <span v-else class="muted">不分部门</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="审核状态" width="110" align="center">
          <template #default="{ row }">
            <ElTag :type="STATUS_TYPE[row.status]" size="small">
              {{ STATUS_TEXT[row.status] || row.status }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="驳回原因" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.rejectReason">{{ row.rejectReason }}</span>
            <span v-else class="muted">—</span>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="submitterName" label="提交人" width="100" show-overflow-tooltip />
        <ElTableColumn label="报名时间" width="160">
          <template #default="{ row }">
            <!-- 后端已格式化成「YYYY-MM-DD HH:mm:ss」，截到分钟即可 -->
            {{ (row.applyTime || '').slice(0, 16) }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="90" align="center">
          <template #default="{ row }">
            <!-- 只有待审核能撤销：已通过/已驳回是审核结果，撤掉等于抹掉审核痕迹 -->
            <ElButton v-if="row.status === 'pending'" link type="danger" @click="handleCancel(row)">
              撤销
            </ElButton>
            <span v-else class="muted">—</span>
          </template>
        </ElTableColumn>
        <template #empty>
          <div class="empty">还没有报名人员</div>
        </template>
      </ElTable>
    </div>

    <CandidatePickDialog
      v-model="pickerVisible"
      :quota="pickingQuota"
      @submitted="handleSubmitted"
    />
  </ElDrawer>
</template>

<script setup lang="ts">
  import { ref, watch } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import {
    certEnrollApi,
    type EnrollProject,
    type MyQuota,
    type MyApplication
  } from '@/api/certEnroll'
  import CandidatePickDialog from './CandidatePickDialog.vue'

  const props = defineProps<{
    modelValue: boolean
    project: EnrollProject | null
  }>()

  const emit = defineEmits<{
    'update:modelValue': [v: boolean]
    /** 报名或撤销后通知外层刷新列表上的名额数 */
    changed: []
  }>()

  const STATUS_TEXT: Record<string, string> = {
    pending: '待审核',
    approved: '已通过',
    rejected: '已驳回'
  }
  const STATUS_TYPE: Record<string, 'warning' | 'success' | 'danger'> = {
    pending: 'warning',
    approved: 'success',
    rejected: 'danger'
  }

  const quotas = ref<MyQuota[]>([])
  const applications = ref<MyApplication[]>([])
  const quotaLoading = ref(false)
  const appLoading = ref(false)

  const pickerVisible = ref(false)
  const pickingQuota = ref<MyQuota | null>(null)

  async function loadQuotas() {
    if (!props.project) return
    quotaLoading.value = true
    try {
      const { data } = await certEnrollApi.getMyQuotas(props.project.id)
      quotas.value = data || []
    } finally {
      quotaLoading.value = false
    }
  }

  async function loadApplications() {
    if (!props.project) return
    appLoading.value = true
    try {
      const { data } = await certEnrollApi.getMyApplications(props.project.id)
      applications.value = data || []
    } finally {
      appLoading.value = false
    }
  }

  function handleOpen() {
    loadQuotas()
    loadApplications()
  }

  // 抽屉靠 @open 加载，但 model 为 true 时切换项目不会再触发 open，故补一个 watch
  watch(
    () => props.project?.id,
    (id) => {
      if (id && props.modelValue) handleOpen()
    }
  )

  function openPicker(row: MyQuota) {
    pickingQuota.value = row
    pickerVisible.value = true
  }

  /** 提交成功：名额数与已报名单都变了，两处都要重拉 */
  function handleSubmitted() {
    loadQuotas()
    loadApplications()
    emit('changed')
  }

  async function handleCancel(row: MyApplication) {
    try {
      await ElMessageBox.confirm(
        `确定撤销「${row.candidateName}」的报名？撤销后该名额释放，可以另报他人。`,
        '撤销报名',
        { type: 'warning' }
      )
      await certEnrollApi.cancel(row.id)
      ElMessage.success('已撤销该报名')
      handleSubmitted()
    } catch {
      // 两种情况都在此落地，都不需要额外提示：
      // ElMessageBox 取消时 reject 字符串 'cancel'；
      // 请求失败时 http 拦截器已统一弹过错误，再弹一次就是两个提示。
    }
  }
</script>

<style lang="scss" scoped>
  .enroll-drawer {
    .meta {
      margin-bottom: 16px;
    }

    .section-title {
      margin: 18px 0 10px;
      font-size: 14px;
      font-weight: 500;

      .sub {
        margin-left: 8px;
        font-size: 12px;
        font-weight: 400;
        color: var(--art-text-gray-500);
      }
    }

    .muted {
      color: var(--art-text-gray-500);
    }

    .empty {
      padding: 14px 0;
      font-size: 13px;
      color: var(--art-text-gray-500);
    }
  }
</style>
