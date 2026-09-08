<!--
  人员选择：从名额行允许的范围里挑人

  可选范围由名额行决定（部门指定则限该部门，否则本单位范围内），
  已在本项目占名额的人不出现在列表里——同一人在一个项目里报两次没有意义。
  这两条都由服务端算，前端只展示与提交。
-->
<template>
  <ElDialog
    :model-value="modelValue"
    title="选择报名人员"
    width="720px"
    @update:model-value="emit('update:modelValue', $event)"
    @open="handleOpen"
    @closed="handleClosed"
  >
    <div v-if="quota" class="pick-body">
      <ElAlert type="info" :closable="false" class="quota-tip">
        <template #title>
          <span class="tip-line">
            {{ quota.orgName }}
            <template v-if="quota.deptName"> / {{ quota.deptName }}</template>
            <template v-else> / 不分部门</template>
            ，名额 {{ quota.quota }}，已报 {{ quota.used }}，
            <b>还可报 {{ quota.remain }} 人</b>
          </span>
        </template>
      </ElAlert>

      <div class="toolbar">
        <ElInput
          v-model="keyword"
          placeholder="按姓名或工号搜索"
          clearable
          class="search"
          @keyup.enter="loadCandidates"
          @clear="loadCandidates"
        >
          <template #append>
            <ElButton @click="loadCandidates">搜索</ElButton>
          </template>
        </ElInput>
        <!-- 选够了就该提示，而不是等提交才被服务端拦回来 -->
        <span :class="['count', { over: overLimit }]">
          已选 {{ selected.length }} / 可报 {{ quota.remain }}
        </span>
      </div>

      <ElTable
        ref="tableRef"
        v-loading="loading"
        :data="candidates"
        height="340"
        size="small"
        border
        @selection-change="handleSelectionChange"
      >
        <ElTableColumn type="selection" width="46" />
        <ElTableColumn prop="name" label="姓名" width="110" show-overflow-tooltip />
        <ElTableColumn prop="workId" label="工号" width="120" show-overflow-tooltip />
        <ElTableColumn prop="deptName" label="所属部门" min-width="150" show-overflow-tooltip />
        <ElTableColumn prop="phone" label="手机号" width="130" show-overflow-tooltip />
        <template #empty>
          <div class="empty">
            {{ keyword ? '没有匹配的人员' : '该范围内没有可报名的人员（或都已报过）' }}
          </div>
        </template>
      </ElTable>
    </div>

    <template #footer>
      <ElButton @click="emit('update:modelValue', false)">取消</ElButton>
      <ElButton type="primary" :loading="submitting" :disabled="!canSubmit" @click="handleSubmit">
        提交报名
      </ElButton>
    </template>
  </ElDialog>
</template>

<script setup lang="ts">
  import { ref, computed } from 'vue'
  import { ElMessage } from 'element-plus'
  import type { TableInstance } from 'element-plus'
  import { certEnrollApi, type MyQuota, type EnrollCandidate } from '@/api/certEnroll'

  const props = defineProps<{
    modelValue: boolean
    quota: MyQuota | null
  }>()

  const emit = defineEmits<{
    'update:modelValue': [v: boolean]
    submitted: []
  }>()

  const tableRef = ref<TableInstance>()
  const loading = ref(false)
  const submitting = ref(false)
  const keyword = ref('')
  const candidates = ref<EnrollCandidate[]>([])
  const selected = ref<EnrollCandidate[]>([])

  /** 选超了：服务端会整批拒绝，先在按钮上拦住 */
  const overLimit = computed(() => !!props.quota && selected.value.length > props.quota.remain)

  const canSubmit = computed(() => selected.value.length > 0 && !overLimit.value)

  async function loadCandidates() {
    if (!props.quota) return
    loading.value = true
    try {
      const { data } = await certEnrollApi.getCandidates(props.quota.quotaId, keyword.value.trim())
      candidates.value = data || []
    } finally {
      loading.value = false
    }
  }

  function handleOpen() {
    keyword.value = ''
    selected.value = []
    loadCandidates()
  }

  function handleClosed() {
    // 清掉勾选，否则下次打开别的名额行还残留上次的选择
    candidates.value = []
    selected.value = []
    tableRef.value?.clearSelection()
  }

  function handleSelectionChange(rows: EnrollCandidate[]) {
    selected.value = rows
  }

  async function handleSubmit() {
    if (!props.quota || !canSubmit.value) return
    submitting.value = true
    try {
      await certEnrollApi.submit({
        quotaId: props.quota.quotaId,
        userIds: selected.value.map((s) => s.id)
      })
      ElMessage.success(`已提交 ${selected.value.length} 人报名，等待审核`)
      emit('submitted')
      emit('update:modelValue', false)
    } catch {
      // 失败提示由 http 拦截器统一弹出（名额被别人抢先占满、项目已截止等），
      // 这里只需把可选人员与名额重新拉一遍，让页面回到真实状态
      loadCandidates()
      emit('submitted')
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .pick-body {
    .quota-tip {
      margin-bottom: 12px;
    }

    .tip-line b {
      font-weight: 600;
    }

    .toolbar {
      display: flex;
      gap: 12px;
      align-items: center;
      margin-bottom: 10px;

      .search {
        width: 280px;
      }

      .count {
        margin-left: auto;
        font-size: 13px;
        color: var(--art-text-gray-600);

        &.over {
          font-weight: 600;
          color: var(--el-color-danger);
        }
      }
    }

    .empty {
      padding: 16px 0;
      font-size: 13px;
      color: var(--art-text-gray-500);
    }
  }
</style>
