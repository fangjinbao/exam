<!-- 考点管理：考点基础信息的查询、新增、编辑、删除与启用/停用（原型，数据走本地 Mock） -->
<template>
  <div class="exam-site">
    <!-- 筛选卡片 -->
    <ElCard shadow="never" class="filter-card">
      <ElForm :model="filterForm" :inline="true" class="filter-form">
        <ElFormItem label="考点名称">
          <ElInput
            v-model="filterForm.keyword"
            placeholder="输入考点名称"
            clearable
            class="filter-input"
          />
        </ElFormItem>
        <ElFormItem label="状态">
          <ElSelect v-model="filterForm.status" placeholder="全部" clearable class="filter-input">
            <ElOption label="启用" :value="1" />
            <ElOption label="停用" :value="0" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem>
          <ElButton type="primary" :icon="Search" @click="handleSearch">搜索</ElButton>
          <ElButton @click="handleReset">重置</ElButton>
        </ElFormItem>
      </ElForm>
    </ElCard>

    <!-- 表格卡片 -->
    <ElCard shadow="never" class="table-card">
      <div class="table-header">
        <ElButton v-auth="'add'" type="primary" :icon="Plus" @click="handleAdd">新增</ElButton>
        <ElButton
          v-auth="'batch-delete'"
          type="danger"
          plain
          :icon="Delete"
          :disabled="!selectedIds.length"
          @click="handleBatchDelete"
        >
          批量删除{{ selectedIds.length ? `(${selectedIds.length})` : '' }}
        </ElButton>
      </div>

      <div class="table-container">
        <ElTable
          v-loading="loading"
          :data="tableData"
          height="100%"
          style="width: 100%"
          @selection-change="handleSelectionChange"
        >
          <ElTableColumn type="selection" width="50" align="center" fixed="left" />
          <ElTableColumn
            prop="name"
            label="考点名称"
            min-width="180"
            show-overflow-tooltip
            fixed="left"
          />
          <ElTableColumn prop="address" label="考点地址" min-width="220" show-overflow-tooltip>
            <template #default="{ row }">{{ row.address || '-' }}</template>
          </ElTableColumn>
          <ElTableColumn prop="capacity" label="容纳人数" width="120" align="center">
            <template #default="{ row }">{{ row.capacity ?? '-' }}</template>
          </ElTableColumn>
          <ElTableColumn prop="status" label="状态" width="100" align="center">
            <template #default="{ row }">
              <ElTag
                :type="row.status === 1 ? 'success' : 'danger'"
                size="small"
                disable-transitions
              >
                {{ row.status === 1 ? '启用' : '停用' }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn label="操作" width="220" align="center" fixed="right">
            <template #default="{ row }">
              <ElButton v-auth="'update'" link type="primary" @click="handleEdit(row)">编辑</ElButton>
              <ElButton v-auth="'delete'" link type="danger" @click="handleDelete(row)">删除</ElButton>
              <ElButton
                v-auth="'update-status'"
                link
                :type="row.status === 1 ? 'warning' : 'success'"
                @click="handleToggleStatus(row)"
              >
                {{ row.status === 1 ? '停用' : '启用' }}
              </ElButton>
            </template>
          </ElTableColumn>
          <template #empty>暂无考点数据</template>
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
          @current-change="loadExamSiteList"
        />
      </div>
    </ElCard>

    <!-- 新增/编辑对话框 -->
    <ElDialog v-model="dialogVisible" :title="dialogTitle" width="550px" @closed="resetForm">
      <ElForm ref="formRef" :model="form" :rules="formRules" label-width="90px">
        <ElFormItem label="考点名称" prop="name">
          <ElInput
            v-model="form.name"
            placeholder="请输入考点名称"
            maxlength="50"
            show-word-limit
          />
        </ElFormItem>
        <ElFormItem label="考点地址" prop="address">
          <ElInput
            v-model="form.address"
            type="textarea"
            :rows="2"
            placeholder="请输入考点地址"
            maxlength="200"
            show-word-limit
          />
        </ElFormItem>
        <ElFormItem label="容纳人数" prop="capacity">
          <ElInputNumber
            v-model="form.capacity"
            :min="1"
            :precision="0"
            controls-position="right"
            placeholder="请输入容纳人数"
            style="width: 100%"
          />
        </ElFormItem>
        <ElFormItem label="联系人" prop="contact">
          <ElInput v-model="form.contact" placeholder="请输入联系人" maxlength="50" />
        </ElFormItem>
        <ElFormItem label="联系电话" prop="phone">
          <ElInput v-model="form.phone" placeholder="请输入联系电话" maxlength="11" />
        </ElFormItem>
        <ElFormItem label="状态" prop="status">
          <ElRadioGroup v-model="form.status">
            <ElRadio :value="1">启用</ElRadio>
            <ElRadio :value="0">停用</ElRadio>
          </ElRadioGroup>
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialogVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="submitLoading" @click="handleSubmit">确定</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive, computed, onMounted } from 'vue'
  import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
  import { Search, Plus, Delete } from '@element-plus/icons-vue'
  import { examSiteApi, type ExamSite } from '@/api/examSite'

  defineOptions({ name: 'ExamSite' })

  const loading = ref(false)
  const tableData = ref<ExamSite[]>([])
  // 表格勾选的考点 id（批量删除用）
  const selectedIds = ref<number[]>([])

  // 筛选条件
  const filterForm = reactive<{ keyword: string; status: number | '' }>({
    keyword: '',
    status: ''
  })

  // 分页信息
  const pagination = reactive({ page: 1, pageSize: 10, total: 0 })

  const dialogVisible = ref(false)
  const isEditing = ref(false)
  const dialogTitle = computed(() => (isEditing.value ? '编辑考点' : '新增考点'))
  const submitLoading = ref(false)

  const formRef = ref<FormInstance>()
  const createForm = (): Partial<ExamSite> => ({
    id: undefined,
    name: '',
    address: '',
    capacity: undefined,
    contact: '',
    phone: '',
    status: 1
  })
  const form = reactive<Partial<ExamSite>>(createForm())

  // 联系电话选填，填写时校验 11 位手机号格式
  const validatePhone = (_rule: unknown, value: string, callback: (e?: Error) => void) => {
    if (!value) return callback()
    return /^1[3-9]\d{9}$/.test(value) ? callback() : callback(new Error('请输入正确的11位手机号'))
  }

  const formRules: FormRules = {
    name: [{ required: true, message: '请输入考点名称', trigger: 'blur' }],
    address: [{ required: true, message: '请输入考点地址', trigger: 'blur' }],
    phone: [{ validator: validatePhone, trigger: 'blur' }],
    status: [{ required: true, message: '请选择状态', trigger: 'change' }]
  }

  /** 加载考点列表 */
  async function loadExamSiteList() {
    loading.value = true
    try {
      const { data } = await examSiteApi.getList({
        keyword: filterForm.keyword || undefined,
        status: filterForm.status === '' ? undefined : filterForm.status,
        page: pagination.page,
        pageSize: pagination.pageSize
      })
      tableData.value = data.list
      pagination.total = data.pagination.total
    } catch (error: any) {
      ElMessage.error(error.message || '加载考点列表失败')
    } finally {
      loading.value = false
    }
  }

  function handleSearch() {
    pagination.page = 1
    loadExamSiteList()
  }

  function handleReset() {
    filterForm.keyword = ''
    filterForm.status = ''
    pagination.page = 1
    loadExamSiteList()
  }

  function handleSizeChange() {
    pagination.page = 1
    loadExamSiteList()
  }

  function handleAdd() {
    isEditing.value = false
    dialogVisible.value = true
  }

  function handleEdit(row: ExamSite) {
    isEditing.value = true
    dialogVisible.value = true
    Object.assign(form, {
      id: row.id,
      name: row.name,
      address: row.address ?? '',
      capacity: row.capacity ?? undefined,
      contact: row.contact ?? '',
      phone: row.phone ?? '',
      status: row.status
    })
  }

  async function handleDelete(row: ExamSite) {
    try {
      await ElMessageBox.confirm('确定要删除该考点吗？删除后不可恢复', '提示', { type: 'warning' })
      await examSiteApi.delete(row.id)
      ElMessage.success('删除考点成功')
      // 删除后当前页可能为空，回退一页
      if (tableData.value.length === 1 && pagination.page > 1) {
        pagination.page -= 1
      }
      loadExamSiteList()
    } catch (error: any) {
      if (error !== 'cancel') ElMessage.error(error.message || '删除失败')
    }
  }

  /** 表格勾选变化，记录选中考点 id */
  function handleSelectionChange(rows: ExamSite[]) {
    selectedIds.value = rows.map((r) => r.id)
  }

  /** 批量删除选中的考点 */
  async function handleBatchDelete() {
    if (!selectedIds.value.length) return
    try {
      await ElMessageBox.confirm(
        `确定要删除选中的 ${selectedIds.value.length} 个考点吗？删除后不可恢复`,
        '提示',
        { type: 'warning' }
      )
      const count = selectedIds.value.length
      await examSiteApi.batchDelete(selectedIds.value)
      ElMessage.success(`已删除 ${count} 个考点`)
      // 删除后当前页可能为空，回退一页
      if (tableData.value.length === count && pagination.page > 1) {
        pagination.page -= 1
      }
      selectedIds.value = []
      loadExamSiteList()
    } catch (error: any) {
      if (error !== 'cancel') ElMessage.error(error.message || '批量删除失败')
    }
  }

  /** 切换启用/停用状态 */
  async function handleToggleStatus(row: ExamSite) {
    const nextStatus = row.status === 1 ? 0 : 1
    try {
      await examSiteApi.updateStatus(row.id, nextStatus)
      row.status = nextStatus
      ElMessage.success(nextStatus === 1 ? '启用成功' : '停用成功')
    } catch (error: any) {
      ElMessage.error(error.message || '状态更新失败')
    }
  }

  async function handleSubmit() {
    try {
      await formRef.value?.validate()
      submitLoading.value = true
      const payload = {
        name: form.name!.trim(),
        address: form.address!.trim(),
        capacity: form.capacity ?? null,
        contact: form.contact?.trim() || '',
        phone: form.phone?.trim() || '',
        status: form.status!
      }
      if (isEditing.value && form.id) {
        await examSiteApi.update({ id: form.id, ...payload })
        ElMessage.success('编辑考点成功')
      } else {
        await examSiteApi.add(payload)
        ElMessage.success('新增考点成功')
      }
      dialogVisible.value = false
      loadExamSiteList()
    } catch (error: any) {
      // 校验失败时 validate 抛 false，不提示
      if (error !== false && error) ElMessage.error(error.message || '操作失败')
    } finally {
      submitLoading.value = false
    }
  }

  function resetForm() {
    formRef.value?.resetFields()
    Object.assign(form, createForm())
  }

  onMounted(() => loadExamSiteList())
</script>

<style lang="scss" scoped>
  .exam-site {
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

      .table-header {
        flex-shrink: 0;
        margin-bottom: 16px;
        display: flex;
        gap: 12px;
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
