<!-- 参数配置：查看与修改系统运行参数（原型，数据走本地 Mock） -->
<template>
  <div class="param-config">
    <!-- 表格卡片 -->
    <ElCard shadow="never" class="table-card">
      <div class="table-container">
        <ElTable v-loading="loading" :data="tableData" height="100%" style="width: 100%">
          <ElTableColumn prop="name" label="参数名称" min-width="240" show-overflow-tooltip />
          <ElTableColumn prop="value" label="参数值" min-width="140" show-overflow-tooltip />
          <ElTableColumn
            prop="description"
            label="参数说明"
            min-width="300"
            show-overflow-tooltip
          />
          <!-- 编辑按钮：无权限角色不渲染（原型阶段默认有权限） -->
          <ElTableColumn label="操作" width="100" align="center" fixed="right">
            <template #default="{ row }">
              <ElButton link type="primary" @click="handleEdit(row)">编辑</ElButton>
            </template>
          </ElTableColumn>
          <template #empty>暂无参数配置数据</template>
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
          @current-change="loadParamConfigList"
        />
      </div>
    </ElCard>

    <!-- 编辑对话框：仅"参数值"为可编辑表单项，参数名称/说明只读展示 -->
    <ElDialog v-model="dialogVisible" title="编辑参数" width="500px" @closed="resetForm">
      <ElForm ref="formRef" :model="form" :rules="formRules" label-width="90px">
        <ElFormItem label="参数名称">
          <span class="readonly-text">{{ current?.name }}</span>
        </ElFormItem>
        <ElFormItem label="参数说明">
          <span class="readonly-text">{{ current?.description || '-' }}</span>
        </ElFormItem>
        <ElFormItem label="参数值" prop="value">
          <ElInput v-model="form.value" placeholder="请输入参数值" clearable />
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
  import { ref, reactive, onMounted } from 'vue'
  import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
  import { paramConfigApi, type ParamConfig } from '@/api/paramConfig'

  defineOptions({ name: 'SystemParamConfig' })

  const loading = ref(false)
  const tableData = ref<ParamConfig[]>([])

  // 分页信息
  const pagination = reactive({ page: 1, pageSize: 10, total: 0 })

  const dialogVisible = ref(false)
  const submitLoading = ref(false)
  // 当前正在编辑的参数（用于展示名称/说明）
  const current = ref<ParamConfig | null>(null)

  const formRef = ref<FormInstance>()
  const form = reactive<{ value: string }>({ value: '' })

  const formRules: FormRules = {
    value: [{ required: true, message: '请输入参数值', trigger: 'blur' }]
  }

  /** 加载参数配置列表 */
  async function loadParamConfigList() {
    loading.value = true
    try {
      const { data } = await paramConfigApi.getList({
        page: pagination.page,
        pageSize: pagination.pageSize
      })
      tableData.value = data.list
      pagination.total = data.pagination.total
    } catch (error: any) {
      ElMessage.error(error.message || '加载参数配置失败')
    } finally {
      loading.value = false
    }
  }

  function handleSizeChange() {
    pagination.page = 1
    loadParamConfigList()
  }

  function handleEdit(row: ParamConfig) {
    current.value = row
    form.value = row.value
    dialogVisible.value = true
  }

  async function handleSubmit() {
    if (!current.value) return
    try {
      await formRef.value?.validate()
      submitLoading.value = true
      await paramConfigApi.update(current.value.id, form.value.trim())
      ElMessage.success('参数配置已更新')
      dialogVisible.value = false
      loadParamConfigList()
    } catch (error: any) {
      // 校验失败时 validate 抛 false，不提示
      if (error !== false && error) ElMessage.error(error.message || '操作失败')
    } finally {
      submitLoading.value = false
    }
  }

  function resetForm() {
    formRef.value?.resetFields()
    form.value = ''
    current.value = null
  }

  onMounted(() => loadParamConfigList())
</script>

<style lang="scss" scoped>
  .param-config {
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

    // 编辑弹窗中只读字段的文本样式
    .readonly-text {
      color: var(--el-text-color-regular);
      line-height: 1.5;
    }
  }
</style>
