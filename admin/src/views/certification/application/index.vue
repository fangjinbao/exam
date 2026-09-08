<!--
  报名审核：各单位按名额报上来的人员，逐条或批量审核（通过/驳回）

  原名「报考审核」，审的对象已经变了：原先设想是考生自主报考，但那条写入路径
  从未实现；现在记录来自「鉴定报名」——单位管理员按本单位名额挑人提交。
  故列表补了单位/部门/提交人三列，并支持按单位筛选与批量审核
  （一个单位一次报几十人，逐条点不现实）。
-->

<template>
  <div class="cert-application">
    <!-- 筛选卡片 -->
    <ElCard shadow="never" class="filter-card">
      <ElForm :model="filterForm" :inline="true" class="filter-form">
        <ElFormItem label="认证项目">
          <ElSelect
            v-model="filterForm.projectId"
            placeholder="全部"
            clearable
            class="filter-input"
          >
            <ElOption
              v-for="item in projectOptions"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="审核状态">
          <ElSelect v-model="filterForm.status" placeholder="全部" clearable class="filter-input">
            <ElOption label="待审核" value="pending" />
            <ElOption label="已通过" value="approved" />
            <ElOption label="已驳回" value="rejected" />
          </ElSelect>
        </ElFormItem>
        <!-- 按单位筛选：审核人通常一个单位一个单位地过 -->
        <ElFormItem label="报名单位">
          <ElTreeSelect
            v-model="filterForm.orgId"
            :data="orgTree"
            :props="orgTreeProps"
            node-key="id"
            check-strictly
            filterable
            clearable
            placeholder="全部"
            class="filter-input"
          />
        </ElFormItem>
        <ElFormItem label="考生">
          <ElInput
            v-model="filterForm.keyword"
            placeholder="输入考生姓名"
            clearable
            class="filter-input"
          />
        </ElFormItem>
        <ElFormItem>
          <ElButton type="primary" :icon="Search" @click="handleSearch">搜索</ElButton>
          <ElButton @click="handleReset">重置</ElButton>
        </ElFormItem>
      </ElForm>
    </ElCard>
    <!-- 表格卡片 -->
    <ElCard shadow="never" class="table-card">
      <!-- 批量审核工具条：仅在勾选了待审核记录时可用 -->
      <div v-if="canReview" class="batch-bar">
        <ElButton type="success" :disabled="!pendingSelected.length" @click="openBatch('approved')">
          批量通过
        </ElButton>
        <ElButton type="danger" :disabled="!pendingSelected.length" @click="openBatch('rejected')">
          批量驳回
        </ElButton>
        <span class="batch-hint">
          <template v-if="selected.length">
            已选 {{ selected.length }} 条，其中待审核 {{ pendingSelected.length }} 条
            <template v-if="selected.length > pendingSelected.length">
              （已审核的不参与批量操作）
            </template>
          </template>
          <template v-else>勾选待审核记录后可批量处理</template>
        </span>
      </div>

      <div class="table-container">
        <ElTable
          v-loading="loading"
          :data="tableData"
          height="100%"
          style="width: 100%"
          @selection-change="handleSelectionChange"
        >
          <ElTableColumn v-if="canReview" type="selection" width="46" fixed="left" />
          <ElTableColumn
            prop="candidateName"
            label="考生姓名"
            min-width="110"
            show-overflow-tooltip
            fixed="left"
          />
          <ElTableColumn
            prop="projectName"
            label="鉴定项目"
            min-width="170"
            show-overflow-tooltip
          />
          <ElTableColumn label="报名单位" min-width="150" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="row.orgName">{{ row.orgName }}</span>
              <!-- 不占单位名额的记录（存量数据）：标出来免得看着像丢了数据 -->
              <span v-else class="muted">未占单位名额</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="部门" min-width="120" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="row.deptName">{{ row.deptName }}</span>
              <span v-else class="muted">不分部门</span>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="submitterName" label="提交人" width="100" show-overflow-tooltip>
            <template #default="{ row }">{{ row.submitterName || '-' }}</template>
          </ElTableColumn>
          <ElTableColumn prop="applyTime" label="报名时间" min-width="160" show-overflow-tooltip />
          <ElTableColumn prop="status" label="审核状态" width="110" align="center">
            <template #default="{ row }">
              <ElTag :type="statusTagType(row.status)" size="small" disable-transitions>
                {{ statusText(row.status) }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="reviewerName" label="审核人" min-width="120" show-overflow-tooltip>
            <template #default="{ row }">{{ row.reviewerName || '-' }}</template>
          </ElTableColumn>
          <ElTableColumn
            v-if="canReview"
            label="操作"
            width="120"
            align="left"
            fixed="right"
            class-name="table-actions"
          >
            <template #default="{ row }">
              <ElButton
                v-if="row.status === 'pending'"
                link
                type="primary"
                @click="handleReview(row)"
              >
                审核
              </ElButton>
              <span v-else>-</span>
            </template>
          </ElTableColumn>
          <template #empty>暂无报名记录</template>
        </ElTable>
      </div>

      <!-- 分页 -->
      <div class="pagination-container">
        <ElPagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="loadList"
        />
      </div>
    </ElCard>

    <ReviewDialog
      v-model="dialogVisible"
      :row="currentRow"
      :loading="submitLoading"
      @confirm="handleSubmit"
    />

    <BatchReviewDialog
      v-model="batchVisible"
      :result="batchResult"
      :count="pendingSelected.length"
      :loading="batchLoading"
      @confirm="handleBatchSubmit"
    />
  </div>
</template>
<script setup lang="ts">
  import { ref, reactive, computed, onMounted } from 'vue'
  import { ElMessage } from 'element-plus'
  import { Search } from '@element-plus/icons-vue'
  import {
    certApplicationApi,
    type CertApplication,
    type CertApplicationStatus
  } from '@/api/certApplication'
  import { certProjectApi, type IdNameOption, type OrgTreeNode } from '@/api/certProject'
  import { useAuth } from '@/composables/useAuth'
  import ReviewDialog from './components/ReviewDialog.vue'
  import BatchReviewDialog from './components/BatchReviewDialog.vue'

  defineOptions({ name: 'CertificationApplication' })

  // 按钮级权限
  const { hasAuth } = useAuth()
  const canReview = computed(() => hasAuth('review'))

  const loading = ref(false)
  const tableData = ref<CertApplication[]>([])
  // 认证项目下拉
  const projectOptions = ref<IdNameOption[]>([])
  // 单位下拉（树形，59 个单位平铺很难找）
  const orgTree = ref<OrgTreeNode[]>([])
  const orgTreeProps = { label: 'name', children: 'children' }

  // 筛选条件
  const filterForm = reactive<{
    projectId: number | ''
    status: CertApplicationStatus | ''
    keyword: string
    orgId: number | undefined
  }>({ projectId: '', status: '', keyword: '', orgId: undefined })
  // 分页信息
  const pagination = reactive({ page: 1, pageSize: 10, total: 0 })

  const dialogVisible = ref(false)
  const submitLoading = ref(false)
  const currentRow = ref<CertApplication | null>(null)

  // ——— 批量审核 ———
  // 一个单位一次报几十人，逐条点不现实
  const selected = ref<CertApplication[]>([])
  const batchVisible = ref(false)
  const batchLoading = ref(false)
  const batchResult = ref<'approved' | 'rejected'>('approved')
  /**
   * 勾选里真正能批量处理的那些
   *
   * 已审核的记录服务端会整批拒绝，所以按钮的可用性看这个而不是 selected.length，
   * 免得点下去必然报错。
   */
  const pendingSelected = computed(() => selected.value.filter((r) => r.status === 'pending'))

  function handleSelectionChange(rows: CertApplication[]) {
    selected.value = rows
  }

  function openBatch(result: 'approved' | 'rejected') {
    if (!pendingSelected.value.length) return
    batchResult.value = result
    batchVisible.value = true
  }

  /** 由对话框回调；驳回原因已在组件内校验过 */
  async function handleBatchSubmit(rejectReason?: string) {
    const ids = pendingSelected.value.map((r) => r.id)
    if (!ids.length) return
    try {
      batchLoading.value = true
      await certApplicationApi.reviewBatch({
        ids,
        result: batchResult.value,
        rejectReason: batchResult.value === 'rejected' ? rejectReason : undefined
      })
      ElMessage.success(
        `已${batchResult.value === 'approved' ? '通过' : '驳回'} ${ids.length} 条报名`
      )
      batchVisible.value = false
      loadList()
    } catch (error: any) {
      if (error?.message) ElMessage.error(error.message)
    } finally {
      batchLoading.value = false
    }
  }

  /** 审核状态文案 */
  function statusText(status: CertApplicationStatus) {
    return { pending: '待审核', approved: '已通过', rejected: '已驳回' }[status]
  }
  /** 审核状态标签类型 */
  function statusTagType(status: CertApplicationStatus) {
    return { pending: 'warning', approved: 'success', rejected: 'danger' }[status] as
      | 'warning'
      | 'success'
      | 'danger'
  }

  /** 加载报考记录列表 */
  async function loadList() {
    loading.value = true
    try {
      const { data } = await certApplicationApi.getList({
        projectId: filterForm.projectId === '' ? undefined : filterForm.projectId,
        status: filterForm.status === '' ? undefined : filterForm.status,
        keyword: filterForm.keyword || undefined,
        orgId: filterForm.orgId,
        page: pagination.page,
        pageSize: pagination.pageSize
      })
      tableData.value = data.list
      pagination.total = data.pagination.total
      // 重新拉数据后原先的勾选已失去意义（行可能不在本页了），清掉避免误批
      selected.value = []
    } catch (error: any) {
      ElMessage.error(error.message || '加载报名记录失败')
    } finally {
      loading.value = false
    }
  }

  /** 加载单位下拉（树形） */
  async function loadOrgTree() {
    try {
      const { data } = await certProjectApi.getOrgOptions()
      orgTree.value = data || []
    } catch {
      // 单位筛选是可选功能，加载失败不阻塞整页，下拉留空即可
    }
  }

  /** 加载认证项目下拉 */
  async function loadProjectOptions() {
    try {
      const { data } = await certProjectApi.getOptions()
      projectOptions.value = data
    } catch (error: any) {
      ElMessage.error(error.message || '加载认证项目下拉失败')
    }
  }

  function handleSearch() {
    pagination.page = 1
    loadList()
  }

  function handleReset() {
    filterForm.projectId = ''
    filterForm.status = ''
    filterForm.keyword = ''
    filterForm.orgId = undefined
    pagination.page = 1
    loadList()
  }

  function handleSizeChange() {
    pagination.page = 1
    loadList()
  }

  function handleReview(row: CertApplication) {
    currentRow.value = row
    dialogVisible.value = true
  }

  /** 由对话框回调；表单已在组件内校验过 */
  async function handleSubmit(result: 'approved' | 'rejected', rejectReason?: string) {
    if (!currentRow.value) return
    try {
      submitLoading.value = true
      await certApplicationApi.review({ id: currentRow.value.id, result, rejectReason })
      ElMessage.success('审核提交成功')
      dialogVisible.value = false
      currentRow.value = null
      loadList()
    } catch (error: any) {
      ElMessage.error(error?.message || '审核提交失败')
    } finally {
      submitLoading.value = false
    }
  }

  onMounted(() => {
    loadList()
    loadProjectOptions()
    loadOrgTree()
  })
</script>

<style lang="scss" scoped>
  .cert-application {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 16px;

    .filter-card {
      flex-shrink: 0;
      border: none !important;
      box-shadow: none !important;
      border-radius: 12px;

      :deep(.el-card__body) {
        padding: 12px 20px;
      }

      .filter-form {
        @include responsiveFilterForm();
      }
    }

    // 批量审核工具条
    .batch-bar {
      display: flex;
      flex-shrink: 0;
      gap: 10px;
      align-items: center;
      margin-bottom: 12px;

      .batch-hint {
        font-size: 13px;
        color: var(--art-text-gray-500);
      }
    }

    // 单位/部门为空时的占位文案，与真实数据区分开
    .muted {
      color: var(--art-text-gray-500);
    }

    .table-card {
      flex: 1;
      border: none !important;
      box-shadow: none !important;
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      flex-direction: column;

      :deep(.el-card__body) {
        padding: 20px;
        height: 100%;
        display: flex;
        flex-direction: column;
      }

      .table-container {
        flex: 1;
        overflow: hidden;
      }

      .pagination-container {
        flex-shrink: 0;
        display: flex;
        justify-content: flex-end;
        margin-top: 16px;
      }
    }
  }
</style>
