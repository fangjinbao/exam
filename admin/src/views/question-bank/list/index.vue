<!-- 题库列表：题库的查询、新增、编辑、删除，展示题目数量统计（SRS 3.5.1.1） -->
<template>
  <div class="question-bank-list">
    <!-- 筛选卡片 -->
    <ElCard shadow="never" class="filter-card">
      <ElForm :model="filterForm" :inline="true" class="filter-form">
        <ElFormItem label="题库名称">
          <ElInput
            v-model="filterForm.keyword"
            placeholder="输入题库名称"
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
        <ElFormItem label="可见范围">
          <ElSelect
            v-model="filterForm.visibleScope"
            placeholder="全部"
            clearable
            class="filter-input"
          >
            <ElOption
              v-for="opt in VISIBLE_SCOPE_OPTIONS"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
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
        <ElButton v-auth="'add'" type="primary" :icon="Plus" @click="handleAdd">新增题库</ElButton>
        <ElButton v-auth="'import'" type="info" plain :icon="Upload" @click="importVisible = true">
          导入
        </ElButton>
        <ElButton
          v-auth="'export'"
          type="info"
          plain
          :icon="Download"
          :loading="exporting"
          @click="handleExport"
        >
          导出
        </ElButton>
        <!-- 未选中时保持中性灰，选中后才转为 danger 提示破坏性 -->
        <ElButton
          v-auth="'batch-delete'"
          :type="selectedIds.length ? 'danger' : 'info'"
          plain
          :icon="Delete"
          :disabled="!selectedIds.length"
          @click="handleBatchDelete"
        >
          批量删除{{ selectedIds.length ? `(${selectedIds.length})` : '' }}
        </ElButton>
        <!-- 「仅看我创建的」是范围开关而非筛选条件，挪到工具栏右侧，让筛选区收在一行 -->
        <ElCheckbox v-model="filterForm.onlyMine" class="only-mine" @change="handleSearch">
          仅看我创建的
        </ElCheckbox>
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
            label="题库名称"
            min-width="180"
            show-overflow-tooltip
            fixed="left"
          />
          <ElTableColumn prop="code" label="题库编码" min-width="140" show-overflow-tooltip />
          <ElTableColumn prop="questionCount" label="题目数量" width="110" align="center" />
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
          <ElTableColumn prop="createByName" label="创建人" width="110" show-overflow-tooltip>
            <template #default="{ row }">{{ row.createByName || '-' }}</template>
          </ElTableColumn>
          <!-- 所属单位取创建人部门上溯到的公司节点，后端实时派生，未挂部门的账号为空 -->
          <ElTableColumn
            prop="createByOrgName"
            label="所属单位"
            min-width="150"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ row.createByOrgName || '-' }}</template>
          </ElTableColumn>
          <!-- 共享设置是配置信息不是状态，用纯文本承载；行内颜色留给「状态」列，避免多色抢注意力 -->
          <ElTableColumn label="共享设置" width="160" align="center">
            <template #default="{ row }">
              <span class="share-text">
                {{ scopeLabel(row.visibleScope) }}
                <!-- 「仅自己」无共享对象，不展示权限级别 -->
                <template v-if="row.visibleScope !== 'self'">
                  <span class="share-sep">·</span>
                  {{ levelLabel(row.shareLevel) }}
                </template>
              </span>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="createTime" label="创建时间" width="180" />
          <ElTableColumn
            label="操作"
            width="240"
            align="left"
            fixed="right"
            class-name="table-actions"
          >
            <template #default="{ row }">
              <ElButton link type="primary" @click="handleEnter(row)">进入题库</ElButton>
              <ElTooltip
                :disabled="row.canManage !== false"
                content="该题库为只读共享，无权编辑"
                placement="top"
              >
                <span>
                  <ElButton
                    v-auth="'update'"
                    link
                    type="primary"
                    :disabled="row.canManage === false"
                    @click="handleEdit(row)"
                  >
                    编辑
                  </ElButton>
                </span>
              </ElTooltip>
              <ElTooltip
                :disabled="row.canManage !== false"
                content="该题库为只读共享，无权删除"
                placement="top"
              >
                <span>
                  <ElButton
                    v-auth="'delete'"
                    link
                    type="danger"
                    :disabled="row.canManage === false"
                    @click="handleDelete(row)"
                  >
                    删除
                  </ElButton>
                </span>
              </ElTooltip>
            </template>
          </ElTableColumn>
          <template #empty>暂无题库数据</template>
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
    <ElDialog v-model="dialogVisible" :title="dialogTitle" width="550px" @closed="resetForm">
      <ElForm ref="formRef" :model="form" :rules="formRules" label-width="90px">
        <ElFormItem label="题库名称" prop="name">
          <ElInput
            v-model="form.name"
            placeholder="请输入题库名称"
            maxlength="50"
            show-word-limit
          />
        </ElFormItem>
        <ElFormItem label="题库编码" prop="code">
          <ElInput
            v-model="form.code"
            placeholder="留空由系统自动生成"
            maxlength="30"
            show-word-limit
          />
        </ElFormItem>
        <ElFormItem label="题库描述" prop="description">
          <ElInput
            v-model="form.description"
            type="textarea"
            :rows="3"
            placeholder="请输入题库描述"
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

        <ElDivider content-position="left">
          <span class="share-divider">共享设置</span>
        </ElDivider>
        <ElAlert
          v-if="!shareEditable"
          type="info"
          :closable="false"
          show-icon
          title="仅题库创建人可修改共享设置"
          class="share-alert"
        />
        <ElFormItem label="可见范围" prop="visibleScope">
          <ElSelect
            v-model="form.visibleScope"
            :disabled="!shareEditable"
            placeholder="请选择可见范围"
            style="width: 100%"
          >
            <ElOption
              v-for="opt in VISIBLE_SCOPE_OPTIONS"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </ElSelect>
        </ElFormItem>
        <!-- 「仅自己」时题库无人共享，权限级别对任何人都不生效，故不展示 -->
        <ElFormItem v-if="form.visibleScope !== 'self'" label="权限级别" prop="shareLevel">
          <ElRadioGroup v-model="form.shareLevel" :disabled="!shareEditable">
            <ElRadio value="manage">可管理</ElRadio>
            <ElRadio value="view">可查看</ElRadio>
          </ElRadioGroup>
          <div class="share-hint">
            {{
              form.shareLevel === 'manage'
                ? '范围内成员可增删改题库与题目'
                : '范围内成员只能查看，不能增删改题库与题目'
            }}
          </div>
        </ElFormItem>
        <ElFormItem v-else label="权限级别">
          <span class="share-hint self-hint">仅自己可见时无需设置，你对该题库始终可管理</span>
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialogVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="submitLoading" @click="handleSubmit">确定</ElButton>
      </template>
    </ElDialog>

    <!-- 批量导入对话框 -->
    <ImportDialog v-model="importVisible" @success="loadList" />
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive, computed, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
  import { Search, Plus, Delete, Upload, Download } from '@element-plus/icons-vue'
  import {
    questionBankApi,
    type QuestionBank,
    type VisibleScope,
    VISIBLE_SCOPE_OPTIONS,
    SHARE_LEVEL_OPTIONS
  } from '@/api/questionBank'
  import { exportToExcel, type ExcelColumn } from '@/utils/excel'
  import ImportDialog from './components/ImportDialog.vue'

  defineOptions({ name: 'QuestionBankList' })

  const router = useRouter()
  const loading = ref(false)
  const tableData = ref<QuestionBank[]>([])
  // 表格勾选的题库 id（批量删除用）
  const selectedIds = ref<number[]>([])
  // 勾选项中无管理权限的题库名称（只读共享，不能删除）
  const noManageNames = ref<string[]>([])

  // 筛选条件
  const filterForm = reactive<{
    keyword: string
    status: number | ''
    visibleScope: VisibleScope | ''
    onlyMine: boolean
  }>({
    keyword: '',
    status: '',
    visibleScope: '',
    onlyMine: false
  })

  /** 可见范围 / 权限级别 值转中文标签 */
  const scopeLabel = (v?: string) =>
    VISIBLE_SCOPE_OPTIONS.find((o) => o.value === v)?.label || '全部组织'
  const levelLabel = (v?: string) =>
    SHARE_LEVEL_OPTIONS.find((o) => o.value === v)?.label || '可管理'

  // 分页信息
  const pagination = reactive({ page: 1, pageSize: 10, total: 0 })

  const dialogVisible = ref(false)
  const isEditing = ref(false)
  const dialogTitle = computed(() => (isEditing.value ? '编辑题库' : '新增题库'))
  const submitLoading = ref(false)
  // 导入对话框显隐与导出 loading
  const importVisible = ref(false)
  const exporting = ref(false)

  // 导出列定义（中文表头 → 字段）
  const EXPORT_COLUMNS: ExcelColumn<
    QuestionBank & { statusText: string; scopeText: string; levelText: string }
  >[] = [
    { header: '题库名称', field: 'name' },
    { header: '题库编码', field: 'code' },
    { header: '题库描述', field: 'description' as keyof QuestionBank },
    { header: '题目数量', field: 'questionCount' },
    { header: '状态', field: 'statusText' },
    { header: '创建人', field: 'createByName' },
    { header: '所属单位', field: 'createByOrgName' },
    { header: '可见范围', field: 'scopeText' },
    { header: '权限级别', field: 'levelText' }
  ]

  /** 导出：按当前筛选拉取全部题库，前端生成 xlsx 下载 */
  async function handleExport() {
    exporting.value = true
    try {
      const { data } = await questionBankApi.export({
        keyword: filterForm.keyword || undefined,
        status: filterForm.status === '' ? undefined : filterForm.status,
        visibleScope: filterForm.visibleScope || undefined,
        onlyMine: filterForm.onlyMine ? 1 : undefined
      })
      if (!data.length) {
        ElMessage.warning('当前筛选条件下没有可导出的数据')
        return
      }
      const rows = data.map((item) => ({
        ...item,
        statusText: item.status === 1 ? '启用' : '停用',
        scopeText: scopeLabel(item.visibleScope),
        levelText: levelLabel(item.shareLevel)
      }))
      exportToExcel(EXPORT_COLUMNS, rows, `题库_${Date.now()}`, '题库')
      ElMessage.success(`已导出 ${rows.length} 个题库`)
    } catch (error: any) {
      ElMessage.error(error.message || '导出失败')
    } finally {
      exporting.value = false
    }
  }

  const formRef = ref<FormInstance>()
  const createForm = (): Partial<QuestionBank> => ({
    id: undefined,
    name: '',
    code: '',
    description: '',
    status: 1,
    visibleScope: 'all',
    shareLevel: 'manage'
  })
  const form = reactive<Partial<QuestionBank>>(createForm())

  // 编辑时是否允许改共享设置（新增态恒可改；编辑态取后端下发的 canEditShare）
  const shareEditable = ref(true)

  const formRules: FormRules = {
    name: [
      { required: true, message: '请输入题库名称', trigger: 'blur' },
      { min: 2, max: 50, message: '题库名称 2-50 字', trigger: 'blur' }
    ],
    status: [{ required: true, message: '请选择状态', trigger: 'change' }]
  }

  /** 加载题库列表 */
  async function loadList() {
    loading.value = true
    try {
      const { data } = await questionBankApi.getList({
        keyword: filterForm.keyword || undefined,
        status: filterForm.status === '' ? undefined : filterForm.status,
        visibleScope: filterForm.visibleScope || undefined,
        onlyMine: filterForm.onlyMine ? 1 : undefined,
        page: pagination.page,
        pageSize: pagination.pageSize
      })
      tableData.value = data.list
      pagination.total = data.pagination.total
    } catch (error: any) {
      ElMessage.error(error.message || '加载题库列表失败')
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
    filterForm.visibleScope = ''
    filterForm.onlyMine = false
    pagination.page = 1
    loadList()
  }

  function handleSizeChange() {
    pagination.page = 1
    loadList()
  }

  /** 进入题库：跳转到该题库的题目管理页（bankId/name 走 query，后端菜单驱动模式下路由为静态 /question-bank/questions） */
  function handleEnter(row: QuestionBank) {
    router.push({ path: '/question-bank/questions', query: { bankId: row.id, name: row.name } })
  }

  function handleAdd() {
    isEditing.value = false
    // 新增即为创建人，共享设置可自由填写
    shareEditable.value = true
    dialogVisible.value = true
  }

  function handleEdit(row: QuestionBank) {
    isEditing.value = true
    dialogVisible.value = true
    // 共享设置仅创建人（与超管）可改，以后端下发的 canEditShare 为准
    shareEditable.value = row.canEditShare !== false
    Object.assign(form, {
      id: row.id,
      name: row.name,
      code: row.code ?? '',
      description: row.description ?? '',
      status: row.status,
      visibleScope: row.visibleScope ?? 'all',
      shareLevel: row.shareLevel ?? 'manage'
    })
  }

  async function handleDelete(row: QuestionBank) {
    try {
      await ElMessageBox.confirm('确定删除该题库吗？', '提示', { type: 'warning' })
      await questionBankApi.delete(row.id)
      ElMessage.success('删除题库成功')
      // 删除后当前页可能为空，回退一页
      if (tableData.value.length === 1 && pagination.page > 1) {
        pagination.page -= 1
      }
      loadList()
    } catch (error: any) {
      if (error !== 'cancel') ElMessage.error(error.message || '删除失败')
    }
  }

  /** 表格勾选变化，记录选中题库 id 与其中无管理权限的条目 */
  function handleSelectionChange(rows: QuestionBank[]) {
    selectedIds.value = rows.map((r) => r.id)
    // 只读共享的题库无法删除，提前拦住以免整批失败
    noManageNames.value = rows.filter((r) => r.canManage === false).map((r) => r.name)
  }

  /** 批量删除选中的题库 */
  async function handleBatchDelete() {
    if (!selectedIds.value.length) return
    // 后端对批量删除是「有一个无权即整体拒绝」，前端先提示，避免用户困惑
    if (noManageNames.value.length) {
      ElMessage.warning(
        `选中的【${noManageNames.value.join('、')}】为只读共享题库，无权删除，请取消勾选后重试`
      )
      return
    }
    try {
      await ElMessageBox.confirm(
        `确定要删除选中的 ${selectedIds.value.length} 个题库吗？`,
        '提示',
        { type: 'warning' }
      )
      const count = selectedIds.value.length
      await questionBankApi.batchDelete(selectedIds.value)
      ElMessage.success(`已删除 ${count} 个题库`)
      if (tableData.value.length === count && pagination.page > 1) {
        pagination.page -= 1
      }
      selectedIds.value = []
      loadList()
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
        code: form.code?.trim() || undefined,
        description: form.description?.trim() || undefined,
        status: form.status!,
        // 无权改共享设置时不提交这两个字段，避免被后端判定为越权修改
        ...(shareEditable.value
          ? {
              visibleScope: form.visibleScope,
              // 「仅自己」不共享给他人，级别归一化为 manage，避免落库出现无意义的 self+view
              shareLevel: form.visibleScope === 'self' ? 'manage' : form.shareLevel
            }
          : {})
      }
      if (isEditing.value && form.id) {
        await questionBankApi.update({ id: form.id, ...payload })
        ElMessage.success('编辑题库成功')
      } else {
        await questionBankApi.add(payload)
        ElMessage.success('新增题库成功')
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

  onMounted(() => loadList())
</script>
<style lang="scss" scoped>
  .question-bank-list {
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
        align-items: center;
        gap: 12px;

        // 推到最右，与左侧操作按钮拉开主次
        .only-mine {
          // ElCheckbox 默认 margin-right: 30px，作为最右元素需清掉
          margin-right: 0;
          margin-left: auto;

          // v-auth 无权限时会移除按钮节点，全被移除后它是唯一子元素，
          // 此时右对齐会显得孤立，回落为左对齐
          &:only-child {
            margin-left: 0;
          }
        }
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

    .share-text {
      font-size: 13px;
      color: var(--el-text-color-regular);

      .share-sep {
        margin: 0 2px;
        color: var(--el-text-color-placeholder);
      }
    }
  }

  .share-divider {
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }

  .share-alert {
    margin-bottom: 14px;
  }

  .share-hint {
    width: 100%;
    margin-top: 2px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--el-text-color-secondary);
  }
</style>
