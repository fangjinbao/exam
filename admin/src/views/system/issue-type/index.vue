<!-- 系统配置 - 问题类型：维护整改工单的问题类型，配置默认审核人与显示顺序，支持启用/停用 -->
<template>
  <div class="system-issue-type">
    <!-- 筛选栏：按类型名称模糊搜索 -->
    <ElCard shadow="never" class="filter-card">
      <ElForm :model="filterForm" :inline="true" class="filter-form">
        <ElFormItem label="类型名称">
          <ElInput
            v-model="filterForm.name"
            placeholder="输入类型名称"
            clearable
            class="filter-input annot-issuetype-filter-name-search"
            @keyup.enter="handleSearch"
          />
        </ElFormItem>
        <ElFormItem>
          <ElButton type="primary" :icon="Search" @click="handleSearch">搜索</ElButton>
        </ElFormItem>
      </ElForm>
    </ElCard>

    <!-- 列表区 -->
    <ElCard shadow="never" class="table-card">
      <div class="table-header">
        <ElButton type="primary" :icon="Plus" @click="handleAdd" class="annot-issuetype-add-open-btn">新增</ElButton>
      </div>

      <div class="table-container">
        <ElTable v-loading="loading" :data="tableData" height="100%" style="width: 100%">
          <ElTableColumn prop="name" label="类型名称" min-width="160" show-overflow-tooltip header-class-name="annot-issuetype-list-col-name" />
          <ElTableColumn label="默认审核人" width="150" header-class-name="annot-issuetype-list-col-auditor">
            <template #default="{ row }">{{ row.auditorName || '-' }}</template>
          </ElTableColumn>
          <ElTableColumn prop="orderNum" label="排序" width="90" align="center" header-class-name="annot-issuetype-list-col-order" />
          <ElTableColumn label="状态" width="110" align="center">
            <template #default="{ row }">
              <ElSwitch
                class="annot-issuetype-list-status-switch"
                v-model="row.status"
                :active-value="1"
                :inactive-value="0"
                :loading="row._statusLoading"
                @change="(val) => handleStatusChange(row as IssueTypeRow, val as number)"
              />
            </template>
          </ElTableColumn>
          <ElTableColumn prop="createTime" label="创建时间" width="180" header-class-name="annot-issuetype-list-col-createtime" />
          <ElTableColumn label="操作" width="140" align="center" fixed="right" header-class-name="annot-issuetype-list-col-actions">
            <template #default="{ row }">
              <ElButton link type="primary" @click="handleEdit(row as IssueTypeRow)" class="annot-issuetype-edit-open-btn">编辑</ElButton>
              <ElButton link type="danger" @click="handleDelete(row as IssueTypeRow)" class="annot-issuetype-delete-btn">删除</ElButton>
            </template>
          </ElTableColumn>
          <template #empty>
            <ElEmpty description="暂无问题类型" class="annot-issuetype-list-empty" />
          </template>
        </ElTable>
      </div>

      <div class="pagination-container">
        <ElPagination
          class="annot-issuetype-list-pagination"
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

    <!-- 新增/编辑弹窗 -->
    <ElDialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="500px"
      @closed="resetForm"
    >
      <ElForm ref="formRef" :model="form" :rules="formRules" label-width="110px">
        <!-- 类型名称：必填，最多50字 -->
        <ElFormItem label="类型名称" prop="name" class="annot-issuetype-form-field-name">
          <ElInput
            v-model="form.name"
            placeholder="请输入类型名称"
            maxlength="50"
            show-word-limit
            clearable
          />
        </ElFormItem>
        <!-- 默认审核人：非必填，来源业务主管人员 -->
        <ElFormItem label="默认审核人" class="annot-issuetype-form-field-auditor">
          <ElSelect
            v-model="form.auditorId"
            placeholder="请选择默认审核人"
            clearable
            style="width: 100%"
          >
            <ElOption
              v-for="item in auditorOptions"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </ElSelect>
        </ElFormItem>
        <!-- 排序：非必填，默认0 -->
        <ElFormItem label="排序" class="annot-issuetype-form-field-order">
          <ElInputNumber
            v-model="form.orderNum"
            :min="0"
            :max="9999"
            controls-position="right"
            style="width: 100%"
          />
        </ElFormItem>
        <!-- 状态：非必填，默认启用 -->
        <ElFormItem label="状态" class="annot-issuetype-form-field-status">
          <ElRadioGroup v-model="form.status">
            <ElRadio :value="1">启用</ElRadio>
            <ElRadio :value="0">停用</ElRadio>
          </ElRadioGroup>
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialogVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="submitLoading" @click="handleSubmit" class="annot-issuetype-form-submit-btn">确定</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive, computed, onMounted } from 'vue'
  import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
  import { Search, Plus } from '@element-plus/icons-vue'
  import {
    getIssueTypeList,
    addIssueType,
    updateIssueType,
    deleteIssueType,
    updateIssueTypeStatus,
    type IssueType
  } from '@/api/issue-type'
  import { getUserList } from '@/api/organization'

  defineOptions({ name: 'SystemIssueType' })

  // 审核人候选项（id + 显示名），数据源为人员管理的用户列表
  interface AuditorOption {
    id: number
    name: string
  }

  // 列表内部使用类型：附加状态切换 loading 标记
  type IssueTypeRow = IssueType & { _statusLoading?: boolean }

  // 列表与筛选状态
  const loading = ref(false)
  const tableData = ref<IssueTypeRow[]>([])
  const filterForm = reactive({ name: '' })
  const pagination = reactive({ page: 1, pageSize: 10, total: 0 })

  // 弹窗与表单状态
  const dialogVisible = ref(false)
  const submitLoading = ref(false)
  const formRef = ref<FormInstance>()
  const form = reactive({
    id: undefined as number | undefined,
    name: '',
    auditorId: undefined as number | undefined,
    orderNum: 0,
    status: 1
  })
  const dialogTitle = computed(() => (form.id ? '编辑问题类型' : '新增问题类型'))

  const formRules: FormRules = {
    name: [
      { required: true, message: '请输入类型名称', trigger: 'blur' },
      { max: 50, message: '类型名称不超过50个字符', trigger: 'blur' }
    ]
  }

  // 审核人候选项
  const auditorOptions = ref<AuditorOption[]>([])

  // 加载列表
  async function loadList() {
    loading.value = true
    try {
      const { data } = await getIssueTypeList({
        name: filterForm.name || undefined,
        page: pagination.page,
        pageSize: pagination.pageSize
      })
      tableData.value = data?.list || []
      pagination.total = data?.pagination?.total || 0
    } catch (error: any) {
      ElMessage.error(error.message || '加载问题类型列表失败')
    } finally {
      loading.value = false
    }
  }

  // 加载审核人候选项（来源：人员管理中已启用的用户）
  async function loadAuditorOptions() {
    try {
      const { data } = await getUserList({ status: 1, pageSize: 100 })
      auditorOptions.value = (data?.list || []).map((u: { id: number; name?: string; username: string }) => ({
        id: u.id,
        name: u.name || u.username
      }))
    } catch {
      // 候选项加载失败不阻塞页面，下拉为空即可
    }
  }

  function handleSearch() {
    pagination.page = 1
    loadList()
  }

  function handleSizeChange() {
    pagination.page = 1
    loadList()
  }

  function handleAdd() {
    dialogVisible.value = true
  }

  function handleEdit(row: IssueTypeRow) {
    Object.assign(form, {
      id: row.id,
      name: row.name,
      auditorId: row.auditorId ?? undefined,
      orderNum: row.orderNum,
      status: row.status
    })
    dialogVisible.value = true
  }

  async function handleDelete(row: IssueTypeRow) {
    try {
      await ElMessageBox.confirm('确定要删除该问题类型吗？', '提示', { type: 'warning' })
    } catch {
      return
    }
    try {
      await deleteIssueType(row.id)
      ElMessage.success('删除成功')
      // 删除后若当前页空了，回退一页
      if (tableData.value.length === 1 && pagination.page > 1) {
        pagination.page -= 1
      }
      loadList()
    } catch (error: any) {
      ElMessage.error(error.message || '删除失败')
    }
  }

  // 状态切换：失败时回滚到切换前的值
  async function handleStatusChange(row: IssueTypeRow, val: number) {
    // 切换前的状态值（用于失败回滚，避免并发反推出错）
    const originalStatus = val === 1 ? 0 : 1
    row._statusLoading = true
    try {
      await updateIssueTypeStatus(row.id, val)
      ElMessage.success('状态更新成功')
    } catch (error: any) {
      row.status = originalStatus
      ElMessage.error(error.message || '状态更新失败')
    } finally {
      row._statusLoading = false
    }
  }

  async function handleSubmit() {
    try {
      await formRef.value?.validate()
    } catch {
      return
    }
    submitLoading.value = true
    try {
      const payload = {
        name: form.name,
        auditorId: form.auditorId ?? null,
        orderNum: form.orderNum,
        status: form.status
      }
      if (form.id) {
        await updateIssueType({ id: form.id, ...payload })
        ElMessage.success('更新成功')
      } else {
        await addIssueType(payload)
        ElMessage.success('新增成功')
      }
      dialogVisible.value = false
      loadList()
    } catch (error: any) {
      ElMessage.error(error.message || '操作失败')
    } finally {
      submitLoading.value = false
    }
  }

  function resetForm() {
    formRef.value?.resetFields()
    Object.assign(form, {
      id: undefined,
      name: '',
      auditorId: undefined,
      orderNum: 0,
      status: 1
    })
  }

  onMounted(() => {
    loadList()
    loadAuditorOptions()
  })
</script>

<style lang="scss" scoped>
  .system-issue-type {
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

    .table-card {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border: none !important;
      box-shadow: none !important;
      border-radius: 12px;

      :deep(.el-card__body) {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        padding: 16px;
      }

      .table-header {
        display: flex;
        align-items: center;
        margin-bottom: 16px;
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
