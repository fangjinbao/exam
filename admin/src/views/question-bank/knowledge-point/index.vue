<template>
  <div class="knowledge-point">
    <ElCard shadow="never" class="table-card">
      <div class="table-header">
        <ElButton v-auth="'add'" type="primary" :icon="Plus" @click="handleAdd()">
          新增知识点
        </ElButton>
        <ElButton @click="toggleExpand">{{ isExpanded ? '折叠' : '展开' }}</ElButton>
      </div>

      <div class="table-container">
        <ElTable
          ref="tableRef"
          v-loading="loading"
          :data="tableData"
          row-key="id"
          :tree-props="{ children: 'children' }"
          :default-expand-all="isExpanded"
          height="100%"
          style="width: 100%"
          empty-text="暂无知识点数据"
        >
          <ElTableColumn prop="name" label="知识点名称" min-width="240" show-overflow-tooltip />
          <ElTableColumn prop="orderNum" label="排序" width="100" align="center" />
          <ElTableColumn prop="remark" label="备注" min-width="200" show-overflow-tooltip />
          <ElTableColumn prop="createTime" label="创建时间" width="180" />
          <ElTableColumn label="操作" width="220" align="center" fixed="right">
            <template #default="{ row }">
              <ElButton v-auth="'add'" link type="primary" @click="handleAdd(row.id)">
                新增子级
              </ElButton>
              <ElButton v-auth="'update'" link type="primary" @click="handleEdit(row)">
                编辑
              </ElButton>
              <ElButton v-auth="'delete'" link type="danger" @click="handleDelete(row)">
                删除
              </ElButton>
            </template>
          </ElTableColumn>
        </ElTable>
      </div>
    </ElCard>

    <!-- 新增/编辑对话框 -->
    <ElDialog v-model="dialogVisible" :title="dialogTitle" width="600px" @closed="resetForm">
      <ElForm ref="formRef" :model="form" :rules="formRules" label-width="100px">
        <ElFormItem v-if="parentName" label="上级知识点">
          <ElInput :model-value="parentName" disabled />
        </ElFormItem>
        <ElFormItem label="知识点名称" prop="name">
          <ElInput
            v-model="form.name"
            placeholder="请输入知识点名称"
            maxlength="100"
            show-word-limit
          />
        </ElFormItem>
        <ElFormItem label="排序">
          <ElInputNumber v-model="form.orderNum" :min="0" :step="1" style="width: 100%" />
        </ElFormItem>
        <ElFormItem label="备注">
          <ElInput
            v-model="form.remark"
            type="textarea"
            :rows="3"
            placeholder="请输入备注"
            maxlength="200"
            show-word-limit
          />
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
  import { Plus } from '@element-plus/icons-vue'
  import { knowledgePointApi, type KnowledgePoint } from '@/api/knowledgePoint'

  defineOptions({ name: 'QuestionBankKnowledgePoint' })

  const tableRef = ref()
  const loading = ref(false)
  const tableData = ref<KnowledgePoint[]>([])
  const isExpanded = ref(true)

  const dialogVisible = ref(false)
  const isEditing = ref(false)
  const dialogTitle = computed(() => (isEditing.value ? '编辑知识点' : '新增知识点'))
  const submitLoading = ref(false)
  // 新增子级时展示的上级名称（顶级新增/编辑时为空，不展示该行）
  const parentName = ref('')

  const formRef = ref<FormInstance>()
  const form = reactive<{
    id?: number
    parentId: number | null
    name: string
    orderNum: number
    remark: string
  }>({
    id: undefined,
    parentId: null,
    name: '',
    orderNum: 0,
    remark: ''
  })

  const formRules: FormRules = {
    name: [
      { required: true, message: '请输入知识点名称', trigger: 'blur' },
      { max: 100, message: '知识点名称不超过 100 字', trigger: 'blur' }
    ]
  }

  // 在树中按 id 查找节点名称，用于新增子级时回显上级
  function findNodeName(nodes: KnowledgePoint[], id: number): string {
    for (const node of nodes) {
      if (node.id === id) return node.name
      if (node.children?.length) {
        const name = findNodeName(node.children, id)
        if (name) return name
      }
    }
    return ''
  }

  async function loadTree() {
    loading.value = true
    try {
      const { data } = await knowledgePointApi.getTree()
      tableData.value = data || []
    } catch (error: any) {
      ElMessage.error(error.message || '加载知识点列表失败')
    } finally {
      loading.value = false
    }
  }

  // default-expand-all 仅初始化生效，动态折叠/展开需通过 tableRef 逐行设置
  function toggleExpand() {
    isExpanded.value = !isExpanded.value
    setRowsExpansion(tableData.value, isExpanded.value)
  }

  // 递归遍历树形数据，对每个含子节点的行设置展开状态
  function setRowsExpansion(rows: KnowledgePoint[], expanded: boolean) {
    rows.forEach((row) => {
      const children = row.children
      if (children && children.length > 0) {
        tableRef.value?.toggleRowExpansion(row, expanded)
        setRowsExpansion(children, expanded)
      }
    })
  }

  function handleAdd(parentId?: number) {
    isEditing.value = false
    if (parentId) {
      form.parentId = parentId
      parentName.value = findNodeName(tableData.value, parentId)
    }
    dialogVisible.value = true
  }

  function handleEdit(row: KnowledgePoint) {
    isEditing.value = true
    Object.assign(form, {
      id: row.id,
      parentId: row.parentId,
      name: row.name,
      orderNum: row.orderNum ?? 0,
      remark: row.remark ?? ''
    })
    dialogVisible.value = true
  }

  async function handleDelete(row: KnowledgePoint) {
    try {
      await ElMessageBox.confirm(`确定要删除知识点"${row.name}"吗？`, '提示', { type: 'warning' })
      await knowledgePointApi.delete(row.id)
      ElMessage.success('删除知识点分类成功')
      loadTree()
    } catch (error: any) {
      if (error !== 'cancel') ElMessage.error(error.message || '删除失败')
    }
  }

  async function handleSubmit() {
    try {
      await formRef.value?.validate()
      submitLoading.value = true
      const payload = {
        name: form.name,
        orderNum: form.orderNum,
        remark: form.remark || undefined
      }
      if (isEditing.value && form.id) {
        await knowledgePointApi.update({ id: form.id, ...payload })
        ElMessage.success('编辑知识点分类成功')
      } else {
        await knowledgePointApi.add({ parentId: form.parentId ?? undefined, ...payload })
        ElMessage.success('新增知识点分类成功')
      }
      dialogVisible.value = false
      loadTree()
    } catch (error: any) {
      if (error !== false) ElMessage.error(error.message || '操作失败')
    } finally {
      submitLoading.value = false
    }
  }

  function resetForm() {
    formRef.value?.resetFields()
    parentName.value = ''
    Object.assign(form, {
      id: undefined,
      parentId: null,
      name: '',
      orderNum: 0,
      remark: ''
    })
  }

  onMounted(() => loadTree())
</script>

<style lang="scss" scoped>
  .knowledge-point {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 16px;

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
    }
  }
</style>
