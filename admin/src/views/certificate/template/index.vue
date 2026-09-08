<!-- 证书模板管理：证书版式内容与编号规则的查询、新增、编辑、删除与启用/停用 -->
<template>
  <div class="certificate-template">
    <!-- 筛选卡片 -->
    <ElCard shadow="never" class="filter-card">
      <ElForm :model="filterForm" :inline="true" class="filter-form">
        <ElFormItem label="模板名称">
          <ElInput
            v-model="filterForm.keyword"
            placeholder="输入模板名称"
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
        <ElButton v-if="canAdd" type="primary" :icon="Plus" @click="handleAdd">新增模板</ElButton>
      </div>

      <div class="table-container">
        <ElTable v-loading="loading" :data="tableData" height="100%" style="width: 100%">
          <ElTableColumn prop="name" label="模板名称" min-width="180" show-overflow-tooltip fixed="left" />
          <ElTableColumn label="适用认证项目" min-width="180" show-overflow-tooltip>
            <!-- 适用认证项目由认证项目引用后自动关联，认证项目模块未建时统一显示 "-" -->
            <template #default>-</template>
          </ElTableColumn>
          <ElTableColumn prop="status" label="模板状态" width="100" align="center">
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
          <ElTableColumn v-if="canOperate" label="操作" width="260" align="left" fixed="right" class-name="table-actions">
            <template #default="{ row }">
              <ElButton v-if="canUpdate" link type="primary" @click="handleEdit(row)">编辑</ElButton>
              <ElButton v-if="canUpdate" link type="primary" @click="handleDesign(row)">设计</ElButton>
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
          <template #empty>暂无证书模板数据</template>
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
    <!-- 新增/编辑对话框 -->
    <ElDialog v-model="dialogVisible" :title="dialogTitle" width="600px" @closed="resetForm">
      <ElForm ref="formRef" :model="form" :rules="formRules" label-width="100px">
        <ElFormItem label="模板名称" prop="name">
          <ElInput v-model="form.name" placeholder="请输入模板名称" maxlength="50" show-word-limit />
        </ElFormItem>
        <ElFormItem label="证书标题" prop="title">
          <ElInput v-model="form.title" placeholder="请输入证书标题" maxlength="100" show-word-limit />
        </ElFormItem>
        <ElFormItem label="颁发机构名称" prop="issuingOrg">
          <ElInput
            v-model="form.issuingOrg"
            placeholder="请输入颁发机构名称"
            maxlength="100"
            show-word-limit
          />
        </ElFormItem>
        <ElFormItem label="编号规则" prop="numberRule">
          <ElInput
            v-model="form.numberRule"
            placeholder="请输入编号规则，如：年份+流水号"
            maxlength="50"
            show-word-limit
          />
        </ElFormItem>
        <ElFormItem label="证书说明文案" prop="description">
          <ElInput
            v-model="form.description"
            type="textarea"
            :rows="3"
            placeholder="请输入证书说明文案"
            maxlength="500"
            show-word-limit
          />
        </ElFormItem>
        <ElFormItem label="印章图片" prop="sealImage">
          <ElUpload
            class="seal-uploader"
            :show-file-list="false"
            :http-request="handleSealUpload"
            accept="image/png,image/jpeg,image/gif,image/webp"
          >
            <img v-if="sealPreview" :src="sealPreview" class="seal-image" alt="印章" />
            <div v-else class="seal-placeholder">
              <ElIcon><Plus /></ElIcon>
              <span>上传印章</span>
            </div>
          </ElUpload>
          <div v-if="sealPreview" class="seal-actions">
            <ElButton link type="danger" @click="handleRemoveSeal">移除</ElButton>
          </div>
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

    <!-- 可视化模板设计器 -->
    <TemplateDesigner
      v-model="designerVisible"
      :template="designingRow"
      :saving="designerSaving"
      @saved="handleDesignSaved"
    />
  </div>
</template>
<script setup lang="ts">
  import { ref, reactive, computed, onMounted } from 'vue'
  import { ElMessage, ElMessageBox, type FormInstance, type FormRules, type UploadRequestOptions } from 'element-plus'
  import { Search, Plus } from '@element-plus/icons-vue'
  import request from '@/utils/http'
  import { certificateTemplateApi, type CertificateTemplate } from '@/api/certificateTemplate'
  import TemplateDesigner from './components/TemplateDesigner.vue'
  import { getAssetUrl } from '@/utils/url'
  import { useAuth } from '@/composables/useAuth'

  defineOptions({ name: 'CertificateTemplate' })

  // 按钮级权限：只传动作名，hasAuth 按末段匹配当前模块权限点（exam:certificate-template:*）
  const { hasAuth } = useAuth()
  const canAdd = computed(() => hasAuth('add'))
  const canUpdate = computed(() => hasAuth('update'))
  const canToggle = computed(() => hasAuth('update-status'))
  const canDelete = computed(() => hasAuth('delete'))
  // 操作列：任一行内写操作有权限即显示
  const canOperate = computed(() => canUpdate.value || canToggle.value || canDelete.value)

  const loading = ref(false)
  const tableData = ref<CertificateTemplate[]>([])

  // 筛选条件（keyword 模糊匹配名称/标题/颁发机构）
  const filterForm = reactive<{ keyword: string; status: number | '' }>({
    keyword: '',
    status: ''
  })

  // 分页信息
  const pagination = reactive({ page: 1, pageSize: 10, total: 0 })

  const dialogVisible = ref(false)
  const isEditing = ref(false)
  const dialogTitle = computed(() => (isEditing.value ? '编辑证书模板' : '新增证书模板'))
  const submitLoading = ref(false)

  const formRef = ref<FormInstance>()
  const createForm = (): Partial<CertificateTemplate> => ({
    id: undefined,
    name: '',
    title: '',
    issuingOrg: '',
    description: '',
    sealImage: '',
    numberRule: '',
    status: 1
  })
  const form = reactive<Partial<CertificateTemplate>>(createForm())

  // 印章图片预览地址（相对路径经 getAssetUrl 拼完整地址）
  const sealPreview = computed(() => getAssetUrl(form.sealImage || undefined))

  const formRules: FormRules = {
    name: [
      { required: true, message: '请输入模板名称', trigger: 'blur' },
      { max: 50, message: '模板名称不超过 50 字', trigger: 'blur' }
    ],
    title: [
      { required: true, message: '请输入证书标题', trigger: 'blur' },
      { max: 100, message: '证书标题不超过 100 字', trigger: 'blur' }
    ],
    issuingOrg: [
      { required: true, message: '请输入颁发机构名称', trigger: 'blur' },
      { max: 100, message: '颁发机构名称不超过 100 字', trigger: 'blur' }
    ],
    numberRule: [
      { required: true, message: '请输入编号规则', trigger: 'blur' },
      { max: 50, message: '编号规则不超过 50 字', trigger: 'blur' }
    ],
    status: [{ required: true, message: '请选择状态', trigger: 'change' }]
  }

  /** 加载证书模板列表 */
  async function loadList() {
    loading.value = true
    try {
      const { data } = await certificateTemplateApi.getList({
        keyword: filterForm.keyword || undefined,
        status: filterForm.status === '' ? undefined : filterForm.status,
        page: pagination.page,
        pageSize: pagination.pageSize
      })
      tableData.value = data.list
      pagination.total = data.pagination.total
    } catch (error: any) {
      ElMessage.error(error.message || '加载证书模板列表失败')
    } finally {
      loading.value = false
    }
  }

  function handleSearch() {
    pagination.page = 1
    loadList()
  }

  function handleReset() {
    filterForm.keyword = ''
    filterForm.status = ''
    pagination.page = 1
    loadList()
  }

  function handleSizeChange() {
    pagination.page = 1
    loadList()
  }

  function handleAdd() {
    isEditing.value = false
    dialogVisible.value = true
  }

  function handleEdit(row: CertificateTemplate) {
    isEditing.value = true
    dialogVisible.value = true
    Object.assign(form, {
      id: row.id,
      name: row.name,
      title: row.title,
      issuingOrg: row.issuingOrg,
      description: row.description ?? '',
      sealImage: row.sealImage ?? '',
      numberRule: row.numberRule,
      status: row.status
    })
  }

  /** 切换启用/停用状态 */
  async function handleToggleStatus(row: CertificateTemplate) {
    const nextStatus = row.status === 1 ? 0 : 1
    // 停用需二次确认（停用后不可用于新的认证项目配置）
    if (nextStatus === 0) {
      try {
        await ElMessageBox.confirm(
          '停用后该模板将无法用于新的认证项目配置，确定停用吗？',
          '提示',
          { type: 'warning' }
        )
      } catch {
        return
      }
    }
    try {
      await certificateTemplateApi.updateStatus(row.id, nextStatus)
      row.status = nextStatus
      ElMessage.success(nextStatus === 1 ? '证书模板已启用' : '证书模板已停用')
    } catch (error: any) {
      ElMessage.error(error.message || '状态更新失败')
    }
  }

  async function handleDelete(row: CertificateTemplate) {
    try {
      await ElMessageBox.confirm('确定要删除该证书模板吗？删除后不可恢复。', '提示', {
        type: 'warning'
      })
      await certificateTemplateApi.delete(row.id)
      ElMessage.success('删除证书模板成功')
      // 删除后当前页可能为空，回退一页
      if (tableData.value.length === 1 && pagination.page > 1) {
        pagination.page -= 1
      }
      loadList()
    } catch (error: any) {
      if (error !== 'cancel') ElMessage.error(error.message || '删除失败')
    }
  }

  /** 印章图片上传：自定义请求，上传成功后回填 sealImage 相对路径 */
  async function handleSealUpload(options: UploadRequestOptions) {
    const formData = new FormData()
    formData.append('file', options.file)
    try {
      // Content-Type 不手动指定：axios 会为 FormData 自动带上含 boundary 的 multipart 头
      const { data } = await request.post<{ url: string }>({
        url: '/admin/space/info/upload',
        data: formData,
        showErrorMessage: false
      })
      form.sealImage = data.url
      ElMessage.success('印章上传成功')
    } catch (error: any) {
      ElMessage.error(error.message || '印章上传失败')
    }
  }

  /** 移除已上传的印章图片 */
  function handleRemoveSeal() {
    form.sealImage = ''
  }

  async function handleSubmit() {
    try {
      await formRef.value?.validate()
      submitLoading.value = true
      const payload = {
        name: form.name!.trim(),
        title: form.title!.trim(),
        issuingOrg: form.issuingOrg!.trim(),
        description: form.description?.trim() || '',
        sealImage: form.sealImage?.trim() || '',
        numberRule: form.numberRule!.trim(),
        status: form.status!
      }
      if (isEditing.value && form.id) {
        await certificateTemplateApi.update({ id: form.id, ...payload })
        ElMessage.success('编辑证书模板成功')
      } else {
        await certificateTemplateApi.add(payload)
        ElMessage.success('新增证书模板成功')
      }
      dialogVisible.value = false
      loadList()
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

  // ==== 可视化设计器 ====
  const designerVisible = ref(false)
  const designingRow = ref<CertificateTemplate | null>(null)
  const designerSaving = ref(false)

  /** 打开设计器 */
  function handleDesign(row: CertificateTemplate) {
    designingRow.value = row
    designerVisible.value = true
  }

  /** 设计器保存：连同该行原有字段一起提交 update，仅覆盖 size/backgroundImage/content */
  async function handleDesignSaved(payload: {
    size: number
    backgroundImage: string
    content: string
  }) {
    const row = designingRow.value
    if (!row) return
    designerSaving.value = true
    try {
      await certificateTemplateApi.update({
        id: row.id,
        name: row.name,
        title: row.title,
        issuingOrg: row.issuingOrg,
        description: row.description ?? '',
        sealImage: row.sealImage ?? '',
        numberRule: row.numberRule,
        status: row.status,
        size: payload.size,
        backgroundImage: payload.backgroundImage,
        content: payload.content
      })
      ElMessage.success('证书版式已保存')
      designerVisible.value = false
      loadList()
    } catch (error: any) {
      ElMessage.error(error.message || '保存失败')
    } finally {
      designerSaving.value = false
    }
  }

  onMounted(() => loadList())
</script>

<style lang="scss" scoped>
  .certificate-template {
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

    // 印章上传框：虚线边框占位，上传后展示图片预览
    .seal-uploader {
      :deep(.el-upload) {
        width: 120px;
        height: 120px;
        border: 1px dashed var(--el-border-color);
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: border-color 0.2s;

        &:hover {
          border-color: var(--el-color-primary);
        }
      }

      .seal-image {
        width: 120px;
        height: 120px;
        object-fit: contain;
      }

      .seal-placeholder {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        color: var(--el-text-color-secondary);
        font-size: 13px;
      }
    }

    .seal-actions {
      margin-top: 4px;
    }
  }
</style>
