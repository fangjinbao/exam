<!-- 外部考生管理：外部单位考生信息的查询、新增、编辑、删除、启停、重置密码与批量导入（原型，数据走本地 Mock） -->
<template>
  <div class="external-candidate">
    <!-- 筛选卡片 -->
    <ElCard shadow="never" class="filter-card">
      <ElForm :model="filterForm" :inline="true" class="filter-form">
        <ElFormItem label="姓名">
          <ElInput
            v-model="filterForm.name"
            placeholder="输入姓名"
            clearable
            class="filter-input"
          />
        </ElFormItem>
        <ElFormItem label="所属单位">
          <ElSelect
            v-model="filterForm.orgId"
            placeholder="全部"
            clearable
            filterable
            class="filter-input"
          >
            <ElOption
              v-for="item in orgOptions"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="手机号">
          <ElInput
            v-model="filterForm.phone"
            placeholder="输入手机号"
            clearable
            class="filter-input"
          />
        </ElFormItem>
        <ElFormItem label="账号状态">
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
          <ElTableColumn prop="name" label="姓名" min-width="110" show-overflow-tooltip fixed="left" />
          <ElTableColumn prop="phone" label="手机号" min-width="130" />
          <ElTableColumn prop="orgName" label="所属单位" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ row.orgName || '-' }}</template>
          </ElTableColumn>
          <ElTableColumn prop="idCard" label="证件号" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ row.idCard || '-' }}</template>
          </ElTableColumn>
          <ElTableColumn prop="email" label="电子邮箱" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ row.email || '-' }}</template>
          </ElTableColumn>
          <ElTableColumn prop="status" label="账号状态" width="100" align="center">
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
          <ElTableColumn v-if="canOperate" label="操作" width="240" align="center" fixed="right">
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
              <ElButton v-if="canResetPwd" link type="primary" @click="handleResetPassword(row)">
                重置密码
              </ElButton>
              <ElButton v-if="canDelete" link type="danger" @click="handleDelete(row)">删除</ElButton>
            </template>
          </ElTableColumn>
          <template #empty>暂无外部考生数据</template>
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
          @current-change="loadCandidateList"
        />
      </div>
    </ElCard>

    <!-- 新增/编辑对话框 -->
    <ElDialog v-model="dialogVisible" :title="dialogTitle" width="560px" @closed="resetForm">
      <ElForm ref="formRef" :model="form" :rules="formRules" label-width="90px">
        <ElFormItem label="姓名" prop="name">
          <ElInput v-model="form.name" placeholder="请输入姓名" maxlength="20" show-word-limit />
        </ElFormItem>
        <ElFormItem label="手机号" prop="phone">
          <ElInput v-model="form.phone" placeholder="请输入11位手机号（登录账号）" maxlength="11" />
        </ElFormItem>
        <ElFormItem label="所属单位" prop="orgId">
          <ElSelect
            v-model="form.orgId"
            placeholder="请选择所属单位"
            filterable
            style="width: 100%"
          >
            <ElOption
              v-for="item in orgOptions"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="证件号" prop="idCard">
          <ElInput
            v-model="form.idCard"
            placeholder="请输入身份证号"
            maxlength="30"
            show-word-limit
          />
        </ElFormItem>
        <ElFormItem v-if="!isEditing" label="密码" prop="password">
          <ElInput
            v-model="form.password"
            type="password"
            placeholder="留空则默认使用手机号后 6 位"
            maxlength="20"
            show-password
            autocomplete="new-password"
          />
        </ElFormItem>
        <ElFormItem label="电子邮箱" prop="email">
          <ElInput v-model="form.email" placeholder="请输入电子邮箱" maxlength="50" />
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
  import { validatePhone, validateEmail } from '@/utils/validation/formValidator'
  import { externalCandidateApi, type ExternalCandidate } from '@/api/externalCandidate'
  import { getExternalOrgOptions, type ExternalOrgOption } from '@/api/externalOrg'
  import { exportToExcel, type ExcelColumn } from '@/utils/excel'
  import { useAuth } from '@/composables/useAuth'
  import ImportDialog from './components/ImportDialog.vue'

  defineOptions({ name: 'ExternalCandidate' })

  // 按钮级权限：只传动作名，hasAuth 按末段匹配当前模块权限点（exam:external-candidate:*）
  const { hasAuth } = useAuth()
  const canAdd = computed(() => hasAuth('add'))
  const canImport = computed(() => hasAuth('import'))
  const canExport = computed(() => hasAuth('export'))
  const canUpdate = computed(() => hasAuth('update'))
  const canToggle = computed(() => hasAuth('update-status'))
  const canResetPwd = computed(() => hasAuth('reset-password'))
  const canDelete = computed(() => hasAuth('delete'))
  // 操作列：任一行内写操作有权限即显示
  const canOperate = computed(
    () => canUpdate.value || canToggle.value || canResetPwd.value || canDelete.value
  )

  const loading = ref(false)
  const tableData = ref<ExternalCandidate[]>([])
  // 所属单位下拉选项（仅启用单位）
  const orgOptions = ref<ExternalOrgOption[]>([])
  // 表格勾选的考生 id（批量删除用）
  const selectedIds = ref<number[]>([])

  // 筛选条件
  const filterForm = reactive<{
    name: string
    orgId: number | ''
    phone: string
    status: number | ''
  }>({
    name: '',
    orgId: '',
    phone: '',
    status: ''
  })

  // 分页信息
  const pagination = reactive({ page: 1, pageSize: 10, total: 0 })

  const dialogVisible = ref(false)
  const isEditing = ref(false)
  const dialogTitle = computed(() => (isEditing.value ? '编辑外部考生' : '新增外部考生'))
  const submitLoading = ref(false)
  const importVisible = ref(false)
  const exporting = ref(false)

  const formRef = ref<FormInstance>()
  // 表单类型：在考生实体基础上附带仅新增使用的 password 字段
  type CandidateForm = Partial<ExternalCandidate> & { password?: string }
  const createForm = (): CandidateForm => ({
    id: undefined,
    name: '',
    orgId: undefined,
    idCard: '',
    phone: '',
    email: '',
    password: ''
  })
  const form = reactive<CandidateForm>(createForm())

  // 手机号必填（登录账号），需符合手机号格式
  const phoneValidator = (_rule: unknown, value: string, callback: (e?: Error) => void) => {
    if (!value) return callback(new Error('请输入手机号'))
    return validatePhone(value) ? callback() : callback(new Error('请输入正确的手机号'))
  }

  // 电子邮箱选填，填写时校验格式
  const emailValidator = (_rule: unknown, value: string, callback: (e?: Error) => void) => {
    if (!value) return callback()
    return validateEmail(value) ? callback() : callback(new Error('请输入正确的电子邮箱'))
  }

  // 密码选填，填写时校验 6-20 位
  const passwordValidator = (_rule: unknown, value: string, callback: (e?: Error) => void) => {
    if (!value) return callback()
    return value.length >= 6 && value.length <= 20
      ? callback()
      : callback(new Error('密码长度为 6-20 位'))
  }

  const formRules: FormRules = {
    name: [
      { required: true, message: '请输入姓名', trigger: 'blur' },
      { min: 2, max: 20, message: '姓名长度为 2-20 字', trigger: 'blur' }
    ],
    phone: [{ required: true, validator: phoneValidator, trigger: 'blur' }],
    orgId: [{ required: true, message: '请选择所属单位', trigger: 'change' }],
    idCard: [{ required: true, message: '请输入身份证号', trigger: 'blur' }],
    email: [{ validator: emailValidator, trigger: 'blur' }],
    password: [{ validator: passwordValidator, trigger: 'blur' }]
  }

  /** 加载外部考生列表 */
  async function loadCandidateList() {
    loading.value = true
    try {
      const { data } = await externalCandidateApi.getList({
        name: filterForm.name || undefined,
        orgId: filterForm.orgId === '' ? undefined : filterForm.orgId,
        phone: filterForm.phone || undefined,
        status: filterForm.status === '' ? undefined : filterForm.status,
        page: pagination.page,
        pageSize: pagination.pageSize
      })
      tableData.value = data.list
      pagination.total = data.pagination.total
    } catch (error: any) {
      ElMessage.error(error.message || '加载外部考生列表失败')
    } finally {
      loading.value = false
    }
  }

  function handleSearch() {
    pagination.page = 1
    loadCandidateList()
  }

  function handleReset() {
    filterForm.name = ''
    filterForm.orgId = ''
    filterForm.phone = ''
    filterForm.status = ''
    pagination.page = 1
    loadCandidateList()
  }

  /** 加载所属单位下拉选项（仅启用单位） */
  async function loadOrgOptions() {
    try {
      const { data } = await getExternalOrgOptions()
      orgOptions.value = data
    } catch (error: any) {
      ElMessage.error(error.message || '加载所属单位列表失败')
    }
  }

  function handleSizeChange() {
    pagination.page = 1
    loadCandidateList()
  }

  function handleAdd() {
    isEditing.value = false
    dialogVisible.value = true
  }

  function handleEdit(row: ExternalCandidate) {
    isEditing.value = true
    dialogVisible.value = true
    Object.assign(form, {
      id: row.id,
      name: row.name,
      orgId: row.orgId,
      idCard: row.idCard ?? '',
      phone: row.phone ?? '',
      email: row.email ?? ''
    })
  }

  /** 切换启用/停用状态 */
  async function handleToggleStatus(row: ExternalCandidate) {
    const nextStatus = row.status === 1 ? 0 : 1
    try {
      await externalCandidateApi.updateStatus(row.id, nextStatus)
      row.status = nextStatus
      ElMessage.success(nextStatus === 1 ? '启用成功' : '停用成功')
    } catch (error: any) {
      ElMessage.error(error.message || '状态更新失败')
    }
  }

  /** 重置考试账号密码 */
  async function handleResetPassword(row: ExternalCandidate) {
    try {
      await ElMessageBox.confirm(`确定重置【${row.name}】的考试账号密码吗？`, '提示', {
        type: 'warning'
      })
      const { data } = await externalCandidateApi.resetPassword(row.id)
      ElMessage.success(`密码已重置为：${data.password}`)
    } catch (error: any) {
      if (error !== 'cancel') ElMessage.error(error.message || '重置密码失败')
    }
  }

  async function handleDelete(row: ExternalCandidate) {
    try {
      await ElMessageBox.confirm('确定删除该外部考生吗？删除后其考试账号一并失效', '提示', {
        type: 'warning'
      })
      await externalCandidateApi.delete(row.id)
      ElMessage.success('删除外部考生成功')
      // 删除后当前页可能为空，回退一页
      if (tableData.value.length === 1 && pagination.page > 1) {
        pagination.page -= 1
      }
      loadCandidateList()
    } catch (error: any) {
      if (error !== 'cancel') ElMessage.error(error.message || '删除失败')
    }
  }

  /** 表格勾选变化，记录选中考生 id */
  function handleSelectionChange(rows: ExternalCandidate[]) {
    selectedIds.value = rows.map((r) => r.id)
  }

  /** 批量删除选中的考生 */
  async function handleBatchDelete() {
    if (!selectedIds.value.length) return
    try {
      await ElMessageBox.confirm(
        `确定删除选中的 ${selectedIds.value.length} 名外部考生吗？删除后其考试账号一并失效`,
        '提示',
        { type: 'warning' }
      )
      const count = selectedIds.value.length
      await externalCandidateApi.batchDelete(selectedIds.value)
      ElMessage.success(`已删除 ${count} 名外部考生`)
      // 删除后当前页可能为空，回退一页
      if (tableData.value.length === count && pagination.page > 1) {
        pagination.page -= 1
      }
      selectedIds.value = []
      loadCandidateList()
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
        orgId: form.orgId!,
        idCard: form.idCard?.trim() || '',
        phone: form.phone!.trim(),
        email: form.email?.trim() || ''
      }
      if (isEditing.value && form.id) {
        await externalCandidateApi.update({ id: form.id, ...payload })
        ElMessage.success('编辑外部考生成功')
      } else {
        // 密码留空则由后端默认取手机号后 6 位
        const password = form.password?.trim()
        await externalCandidateApi.add({ ...payload, ...(password ? { password } : {}) })
        ElMessage.success('新增成功，考试账号已生成')
      }
      dialogVisible.value = false
      loadCandidateList()
    } catch (error: any) {
      // 校验失败时 validate 抛 false，不提示
      if (error !== false && error) ElMessage.error(error.message || '操作失败')
    } finally {
      submitLoading.value = false
    }
  }

  function handleImport() {
    importVisible.value = true
  }

  function handleImportSuccess() {
    pagination.page = 1
    loadCandidateList()
  }

  // 导出列定义：表头顺序即导出列顺序（状态转中文文案）
  const EXPORT_COLUMNS: ExcelColumn<Record<string, any>>[] = [
    { header: '姓名', field: 'name' },
    { header: '手机号', field: 'phone' },
    { header: '所属单位', field: 'orgName' },
    { header: '证件号', field: 'idCard' },
    { header: '电子邮箱', field: 'email' },
    { header: '账号状态', field: 'statusText' },
    { header: '创建时间', field: 'createTime' }
  ]

  /** 导出：拉取当前筛选下的全部考生，前端生成 xlsx 下载 */
  async function handleExport() {
    exporting.value = true
    try {
      const { data } = await externalCandidateApi.export({
        name: filterForm.name || undefined,
        orgId: filterForm.orgId === '' ? undefined : filterForm.orgId,
        phone: filterForm.phone || undefined,
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
      exportToExcel(EXPORT_COLUMNS, rows, `外部考生_${Date.now()}`, '外部考生')
      ElMessage.success(`已导出 ${rows.length} 名外部考生`)
    } catch (error: any) {
      ElMessage.error(error.message || '导出失败')
    } finally {
      exporting.value = false
    }
  }

  function resetForm() {
    formRef.value?.resetFields()
    Object.assign(form, createForm())
  }

  onMounted(() => {
    loadOrgOptions()
    loadCandidateList()
  })
</script>

<style lang="scss" scoped>
  .external-candidate {
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
