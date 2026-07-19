<!-- 外部单位管理：外部单位基础信息的查询、新增、编辑、删除与启用/停用 -->
<template>
  <div class="external-org">
    <!-- 筛选卡片 -->
    <ElCard shadow="never" class="filter-card">
      <ElForm :model="filterForm" :inline="true" class="filter-form">
        <ElFormItem label="名称/编码">
          <ElInput
            v-model="filterForm.keyword"
            placeholder="输入单位名称或编码"
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
        <ElButton v-if="canAdd" type="primary" :icon="Plus" @click="handleAdd">新增</ElButton>
        <ElButton v-if="canImport" type="primary" plain :icon="Upload" @click="handleImport">
          批量导入
        </ElButton>
        <ElButton
          v-if="canExport"
          type="primary"
          plain
          :icon="Download"
          :loading="exporting"
          @click="handleExport"
        >
          导出
        </ElButton>
        <ElButton
          v-if="canDelete"
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
          <ElTableColumn v-if="canDelete" type="selection" width="50" align="center" fixed="left" />
          <ElTableColumn prop="name" label="单位名称" min-width="180" show-overflow-tooltip fixed="left" />
          <ElTableColumn prop="code" label="单位编码" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">{{ row.code || '-' }}</template>
          </ElTableColumn>
          <ElTableColumn prop="contact" label="联系人" min-width="110" show-overflow-tooltip>
            <template #default="{ row }">{{ row.contact || '-' }}</template>
          </ElTableColumn>
          <ElTableColumn prop="phone" label="联系电话" min-width="130">
            <template #default="{ row }">{{ row.phone || '-' }}</template>
          </ElTableColumn>
          <ElTableColumn prop="address" label="单位地址" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">{{ row.address || '-' }}</template>
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
          <ElTableColumn prop="createTime" label="创建时间" min-width="170" show-overflow-tooltip />
          <ElTableColumn v-if="canOperate" label="操作" width="200" align="center" fixed="right">
            <template #default="{ row }">
              <ElButton v-if="canUpdate" link type="primary" @click="handleEdit(row)">编辑</ElButton>
              <ElButton
                v-if="canToggle"
                link
                :type="row.status === 1 ? 'warning' : 'success'"
                @click="handleToggleStatus(row)"
              >
                {{ row.status === 1 ? '停用' : '启用' }}
              </ElButton>
              <ElButton v-if="canDelete" link type="danger" @click="handleDelete(row)">删除</ElButton>
            </template>
          </ElTableColumn>
          <template #empty>暂无外部单位数据</template>
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
          @current-change="loadOrgList"
        />
      </div>
    </ElCard>
    <!-- 新增/编辑对话框 -->
    <ElDialog v-model="dialogVisible" :title="dialogTitle" width="560px" @closed="resetForm">
      <ElForm ref="formRef" :model="form" :rules="formRules" label-width="90px">
        <ElFormItem label="单位名称" prop="name">
          <ElInput
            v-model="form.name"
            placeholder="请输入单位名称"
            maxlength="100"
            show-word-limit
          />
        </ElFormItem>
        <ElFormItem label="单位编码" prop="code">
          <ElInput v-model="form.code" placeholder="请输入单位编码" maxlength="30" show-word-limit />
        </ElFormItem>
        <ElFormItem label="联系人" prop="contact">
          <ElInput v-model="form.contact" placeholder="请输入联系人" maxlength="50" show-word-limit />
        </ElFormItem>
        <ElFormItem label="联系电话" prop="phone">
          <ElInput v-model="form.phone" placeholder="请输入11位手机号" maxlength="11" />
        </ElFormItem>
        <ElFormItem label="单位地址" prop="address">
          <ElInput
            v-model="form.address"
            type="textarea"
            :rows="2"
            placeholder="请输入单位地址"
            maxlength="200"
            show-word-limit
          />
        </ElFormItem>
        <ElFormItem label="备注" prop="remark">
          <ElInput
            v-model="form.remark"
            type="textarea"
            :rows="2"
            placeholder="请输入备注"
            maxlength="200"
            show-word-limit
          />
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

    <!-- 批量导入对话框 -->
    <ImportDialog v-model="importVisible" @success="handleImportSuccess" />
  </div>
</template>
<script setup lang="ts">
  import { ref, reactive, computed, onMounted } from 'vue'
  import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
  import { Search, Plus, Upload, Download, Delete } from '@element-plus/icons-vue'
  import { externalOrgApi, type ExternalOrg } from '@/api/externalOrg'
  import { exportToExcel, type ExcelColumn } from '@/utils/excel'
  import { useAuth } from '@/composables/useAuth'
  import ImportDialog from './components/ImportDialog.vue'

  defineOptions({ name: 'ExternalOrg' })

  // 按钮级权限：只传动作名，hasAuth 按末段匹配当前模块权限点（exam:external-org:*）
  const { hasAuth } = useAuth()
  const canAdd = computed(() => hasAuth('add'))
  const canImport = computed(() => hasAuth('import'))
  const canExport = computed(() => hasAuth('export'))
  const canUpdate = computed(() => hasAuth('update'))
  const canToggle = computed(() => hasAuth('update-status'))
  const canDelete = computed(() => hasAuth('delete'))
  // 操作列：任一行内写操作有权限即显示
  const canOperate = computed(() => canUpdate.value || canToggle.value || canDelete.value)

  const loading = ref(false)
  const tableData = ref<ExternalOrg[]>([])
  // 表格勾选的单位 id（批量删除用）
  const selectedIds = ref<number[]>([])

  // 筛选条件（keyword 同时匹配单位名称/编码）
  const filterForm = reactive<{ keyword: string; status: number | '' }>({
    keyword: '',
    status: ''
  })

  // 分页信息
  const pagination = reactive({ page: 1, pageSize: 10, total: 0 })

  const dialogVisible = ref(false)
  const isEditing = ref(false)
  const dialogTitle = computed(() => (isEditing.value ? '编辑外部单位' : '新增外部单位'))
  const submitLoading = ref(false)
  const importVisible = ref(false)
  const exporting = ref(false)

  const formRef = ref<FormInstance>()
  const createForm = (): Partial<ExternalOrg> => ({
    id: undefined,
    name: '',
    code: '',
    contact: '',
    phone: '',
    address: '',
    remark: '',
    status: 1
  })
  const form = reactive<Partial<ExternalOrg>>(createForm())

  // 联系电话选填，填写时校验 11 位手机号格式
  const validatePhone = (_rule: unknown, value: string, callback: (e?: Error) => void) => {
    if (!value) return callback()
    return /^1[3-9]\d{9}$/.test(value) ? callback() : callback(new Error('请输入正确的11位手机号'))
  }

  const formRules: FormRules = {
    name: [
      { required: true, message: '请输入单位名称', trigger: 'blur' },
      { max: 100, message: '单位名称不超过 100 字', trigger: 'blur' }
    ],
    phone: [{ validator: validatePhone, trigger: 'blur' }],
    status: [{ required: true, message: '请选择状态', trigger: 'change' }]
  }

  /** 加载外部单位列表 */
  async function loadOrgList() {
    loading.value = true
    try {
      const { data } = await externalOrgApi.getList({
        keyword: filterForm.keyword || undefined,
        status: filterForm.status === '' ? undefined : filterForm.status,
        page: pagination.page,
        pageSize: pagination.pageSize
      })
      tableData.value = data.list
      pagination.total = data.pagination.total
    } catch (error: any) {
      ElMessage.error(error.message || '加载外部单位列表失败')
    } finally {
      loading.value = false
    }
  }

  function handleSearch() {
    pagination.page = 1
    loadOrgList()
  }

  function handleReset() {
    filterForm.keyword = ''
    filterForm.status = ''
    pagination.page = 1
    loadOrgList()
  }

  function handleSizeChange() {
    pagination.page = 1
    loadOrgList()
  }

  function handleAdd() {
    isEditing.value = false
    dialogVisible.value = true
  }

  function handleEdit(row: ExternalOrg) {
    isEditing.value = true
    dialogVisible.value = true
    Object.assign(form, {
      id: row.id,
      name: row.name,
      code: row.code ?? '',
      contact: row.contact ?? '',
      phone: row.phone ?? '',
      address: row.address ?? '',
      remark: row.remark ?? '',
      status: row.status
    })
  }

  /** 切换启用/停用状态 */
  async function handleToggleStatus(row: ExternalOrg) {
    const nextStatus = row.status === 1 ? 0 : 1
    try {
      await externalOrgApi.updateStatus(row.id, nextStatus)
      row.status = nextStatus
      ElMessage.success(nextStatus === 1 ? '启用成功' : '停用成功')
    } catch (error: any) {
      ElMessage.error(error.message || '状态更新失败')
    }
  }

  async function handleDelete(row: ExternalOrg) {
    try {
      await ElMessageBox.confirm('确定删除该外部单位吗？删除后不可恢复', '提示', { type: 'warning' })
      await externalOrgApi.delete(row.id)
      ElMessage.success('删除外部单位成功')
      // 删除后当前页可能为空，回退一页
      if (tableData.value.length === 1 && pagination.page > 1) {
        pagination.page -= 1
      }
      loadOrgList()
    } catch (error: any) {
      if (error !== 'cancel') ElMessage.error(error.message || '删除失败')
    }
  }

  /** 表格勾选变化，记录选中单位 id */
  function handleSelectionChange(rows: ExternalOrg[]) {
    selectedIds.value = rows.map((r) => r.id)
  }

  /** 批量删除选中的单位 */
  async function handleBatchDelete() {
    if (!selectedIds.value.length) return
    try {
      await ElMessageBox.confirm(
        `确定删除选中的 ${selectedIds.value.length} 个外部单位吗？删除后不可恢复`,
        '提示',
        { type: 'warning' }
      )
      const count = selectedIds.value.length
      await externalOrgApi.batchDelete(selectedIds.value)
      ElMessage.success(`已删除 ${count} 个外部单位`)
      // 删除后当前页可能为空，回退一页
      if (tableData.value.length === count && pagination.page > 1) {
        pagination.page -= 1
      }
      selectedIds.value = []
      loadOrgList()
    } catch (error: any) {
      if (error !== 'cancel') ElMessage.error(error.message || '批量删除失败')
    }
  }

  async function handleSubmit() {
    try {
      await formRef.value?.validate()
      submitLoading.value = true
      const payload = {
        name: form.name!.trim(),
        code: form.code?.trim() || '',
        contact: form.contact?.trim() || '',
        phone: form.phone?.trim() || '',
        address: form.address?.trim() || '',
        remark: form.remark?.trim() || '',
        status: form.status!
      }
      if (isEditing.value && form.id) {
        await externalOrgApi.update({ id: form.id, ...payload })
        ElMessage.success('编辑外部单位成功')
      } else {
        await externalOrgApi.add(payload)
        ElMessage.success('新增外部单位成功')
      }
      dialogVisible.value = false
      loadOrgList()
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

  function handleImport() {
    importVisible.value = true
  }

  function handleImportSuccess() {
    pagination.page = 1
    loadOrgList()
  }

  // 导出列定义：表头顺序即导出列顺序（状态转中文文案）
  const EXPORT_COLUMNS: ExcelColumn<Record<string, any>>[] = [
    { header: '单位名称', field: 'name' },
    { header: '单位编码', field: 'code' },
    { header: '联系人', field: 'contact' },
    { header: '联系电话', field: 'phone' },
    { header: '单位地址', field: 'address' },
    { header: '备注', field: 'remark' },
    { header: '状态', field: 'statusText' },
    { header: '创建时间', field: 'createTime' }
  ]

  /** 导出：拉取当前筛选下的全部单位，前端生成 xlsx 下载 */
  async function handleExport() {
    exporting.value = true
    try {
      const { data } = await externalOrgApi.export({
        keyword: filterForm.keyword || undefined,
        status: filterForm.status === '' ? undefined : filterForm.status
      })
      if (!data.length) {
        ElMessage.warning('当前筛选条件下没有可导出的数据')
        return
      }
      const rows = data.map((item) => ({
        ...item,
        statusText: item.status === 1 ? '启用' : '停用'
      }))
      exportToExcel(EXPORT_COLUMNS, rows, `外部单位_${Date.now()}`, '外部单位')
      ElMessage.success(`已导出 ${rows.length} 个外部单位`)
    } catch (error: any) {
      ElMessage.error(error.message || '导出失败')
    } finally {
      exporting.value = false
    }
  }

  onMounted(() => loadOrgList())
</script>

<style lang="scss" scoped>
  .external-org {
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

