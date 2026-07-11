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
          <ElInput
            v-model="filterForm.company"
            placeholder="输入所属单位"
            clearable
            class="filter-input"
          />
        </ElFormItem>
        <ElFormItem label="准考证号">
          <ElInput
            v-model="filterForm.admissionNo"
            placeholder="输入准考证号"
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
        <ElButton v-if="canEdit" type="primary" :icon="Plus" @click="handleAdd">新增</ElButton>
        <ElButton v-if="canEdit" type="primary" plain :icon="Upload" @click="handleImport">
          批量导入
        </ElButton>
      </div>

      <div class="table-container">
        <ElTable v-loading="loading" :data="tableData" height="100%" style="width: 100%">
          <ElTableColumn prop="name" label="姓名" min-width="110" show-overflow-tooltip />
          <ElTableColumn
            prop="admissionNo"
            label="准考证号"
            min-width="140"
            show-overflow-tooltip
          />
          <ElTableColumn prop="company" label="所属单位" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ row.company || '-' }}</template>
          </ElTableColumn>
          <ElTableColumn prop="idCard" label="证件号" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ row.idCard || '-' }}</template>
          </ElTableColumn>
          <ElTableColumn prop="phone" label="联系电话" min-width="130" />
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
          <ElTableColumn v-if="canEdit" label="操作" width="240" align="center" fixed="right">
            <template #default="{ row }">
              <ElButton link type="primary" @click="handleEdit(row)">编辑</ElButton>
              <ElButton
                link
                :type="row.status === 1 ? 'warning' : 'success'"
                @click="handleToggleStatus(row)"
              >
                {{ row.status === 1 ? '停用' : '启用' }}
              </ElButton>
              <ElButton link type="primary" @click="handleResetPassword(row)">重置密码</ElButton>
              <ElButton link type="danger" @click="handleDelete(row)">删除</ElButton>
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
        <ElFormItem label="准考证号" prop="admissionNo">
          <ElInput
            v-model="form.admissionNo"
            placeholder="请输入准考证号"
            maxlength="30"
            show-word-limit
            :disabled="isEditing"
          />
        </ElFormItem>
        <ElFormItem label="所属单位" prop="company">
          <ElInput
            v-model="form.company"
            placeholder="请输入所属单位"
            maxlength="50"
            show-word-limit
          />
        </ElFormItem>
        <ElFormItem label="证件号" prop="idCard">
          <ElInput
            v-model="form.idCard"
            placeholder="请输入证件号"
            maxlength="30"
            show-word-limit
          />
        </ElFormItem>
        <ElFormItem label="联系电话" prop="phone">
          <ElInput v-model="form.phone" placeholder="请输入11位手机号" maxlength="11" />
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
  import { Search, Plus, Upload } from '@element-plus/icons-vue'
  import { useAuth } from '@/composables/useAuth'
  import { validatePhone, validateEmail } from '@/utils/validation/formValidator'
  import { externalCandidateApi, type ExternalCandidate } from '@/api/externalCandidate'
  import ImportDialog from './components/ImportDialog.vue'

  defineOptions({ name: 'ExternalCandidate' })

  const { hasAuth } = useAuth()
  // 全部操作按钮受同一权限控制，无权限时完全不渲染
  const canEdit = computed(() => hasAuth('externalCandidate:manage'))

  const loading = ref(false)
  const tableData = ref<ExternalCandidate[]>([])

  // 筛选条件
  const filterForm = reactive<{
    name: string
    company: string
    admissionNo: string
    status: number | ''
  }>({
    name: '',
    company: '',
    admissionNo: '',
    status: ''
  })

  // 分页信息
  const pagination = reactive({ page: 1, pageSize: 10, total: 0 })

  const dialogVisible = ref(false)
  const isEditing = ref(false)
  const dialogTitle = computed(() => (isEditing.value ? '编辑外部考生' : '新增外部考生'))
  const submitLoading = ref(false)
  const importVisible = ref(false)

  const formRef = ref<FormInstance>()
  const createForm = (): Partial<ExternalCandidate> => ({
    id: undefined,
    name: '',
    admissionNo: '',
    company: '',
    idCard: '',
    phone: '',
    email: ''
  })
  const form = reactive<Partial<ExternalCandidate>>(createForm())

  // 联系电话必填，需符合手机号格式
  const phoneValidator = (_rule: unknown, value: string, callback: (e?: Error) => void) => {
    if (!value) return callback(new Error('请输入联系电话'))
    return validatePhone(value) ? callback() : callback(new Error('请输入正确的联系电话'))
  }

  // 电子邮箱选填，填写时校验格式
  const emailValidator = (_rule: unknown, value: string, callback: (e?: Error) => void) => {
    if (!value) return callback()
    return validateEmail(value) ? callback() : callback(new Error('请输入正确的电子邮箱'))
  }

  const formRules: FormRules = {
    name: [
      { required: true, message: '请输入姓名', trigger: 'blur' },
      { min: 2, max: 20, message: '姓名长度为 2-20 字', trigger: 'blur' }
    ],
    admissionNo: [{ required: true, message: '请输入准考证号', trigger: 'blur' }],
    phone: [{ validator: phoneValidator, trigger: 'blur' }],
    email: [{ validator: emailValidator, trigger: 'blur' }]
  }

  /** 加载外部考生列表 */
  async function loadCandidateList() {
    loading.value = true
    try {
      const { data } = await externalCandidateApi.getList({
        name: filterForm.name || undefined,
        company: filterForm.company || undefined,
        admissionNo: filterForm.admissionNo || undefined,
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
    filterForm.company = ''
    filterForm.admissionNo = ''
    filterForm.status = ''
    pagination.page = 1
    loadCandidateList()
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
      admissionNo: row.admissionNo,
      company: row.company ?? '',
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

  async function handleSubmit() {
    try {
      await formRef.value?.validate()
      submitLoading.value = true
      const payload = {
        name: form.name!.trim(),
        admissionNo: form.admissionNo!.trim(),
        company: form.company?.trim() || '',
        idCard: form.idCard?.trim() || '',
        phone: form.phone!.trim(),
        email: form.email?.trim() || ''
      }
      if (isEditing.value && form.id) {
        await externalCandidateApi.update({ id: form.id, ...payload })
        ElMessage.success('编辑外部考生成功')
      } else {
        await externalCandidateApi.add(payload)
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

  function resetForm() {
    formRef.value?.resetFields()
    Object.assign(form, createForm())
  }

  onMounted(() => loadCandidateList())
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
