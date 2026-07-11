<!-- AI模型配置：维护平台对接的AI模型服务，支持新增/编辑/删除/切换启用/连接测试（原型，数据走本地 Mock） -->
<template>
  <div class="ai-model">
    <!-- 表格卡片 -->
    <ElCard shadow="never" class="table-card">
      <div class="table-header">
        <ElButton type="primary" :icon="Plus" @click="handleAdd">新增</ElButton>
      </div>

      <div class="table-container">
        <ElTable v-loading="loading" :data="tableData" height="100%" style="width: 100%">
          <ElTableColumn prop="name" label="配置名称" min-width="160" show-overflow-tooltip />
          <ElTableColumn prop="provider" label="模型服务商" min-width="120" />
          <ElTableColumn prop="model" label="模型名称" min-width="140" show-overflow-tooltip />
          <ElTableColumn label="启用状态" width="100" align="center">
            <template #default="{ row }">
              <ElTag :type="row.status === 1 ? 'success' : 'info'" size="small" disable-transitions>
                {{ row.status === 1 ? '启用' : '停用' }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn label="连接状态" width="100" align="center">
            <template #default="{ row }">
              <ElTag :type="connTagType(row.connStatus)" size="small" disable-transitions>
                {{ connText(row.connStatus) }}
              </ElTag>
            </template>
          </ElTableColumn>
          <!-- 操作按钮：无权限角色不渲染（原型阶段默认有权限） -->
          <ElTableColumn label="操作" width="280" align="center" fixed="right">
            <template #default="{ row }">
              <ElButton link type="primary" @click="handleEdit(row)">编辑</ElButton>
              <ElButton
                v-if="row.status !== 1"
                link
                type="success"
                @click="handleEnable(row)"
              >
                启用
              </ElButton>
              <ElButton link type="primary" @click="handleTest(row)">连接测试</ElButton>
              <ElButton link type="danger" @click="handleDelete(row)">删除</ElButton>
            </template>
          </ElTableColumn>
          <template #empty>暂无AI模型配置数据</template>
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
          @current-change="loadAiModelList"
        />
      </div>
    </ElCard>

    <!-- 新增/编辑弹窗 -->
    <AiModelFormDialog ref="dialogRef" @success="loadAiModelList" />
  </div>
</template>
<script setup lang="ts">
  import { ref, reactive, onMounted } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { Plus } from '@element-plus/icons-vue'
  import { aiModelApi, type AiModel, type AiModelConnStatus } from '@/api/aiModel'
  import AiModelFormDialog from './components/AiModelFormDialog.vue'

  defineOptions({ name: 'SystemAiModel' })

  const loading = ref(false)
  const tableData = ref<AiModel[]>([])
  const pagination = reactive({ page: 1, pageSize: 10, total: 0 })
  const dialogRef = ref<InstanceType<typeof AiModelFormDialog>>()

  /** 连接状态标签类型 */
  function connTagType(status: AiModelConnStatus) {
    if (status === 'normal') return 'success'
    if (status === 'error') return 'danger'
    return 'info'
  }

  /** 连接状态文案 */
  function connText(status: AiModelConnStatus) {
    if (status === 'normal') return '正常'
    if (status === 'error') return '异常'
    return '未测试'
  }

  /** 加载AI模型配置列表 */
  async function loadAiModelList() {
    loading.value = true
    try {
      const { data } = await aiModelApi.getList({
        page: pagination.page,
        pageSize: pagination.pageSize
      })
      tableData.value = data.list
      pagination.total = data.pagination.total
    } catch (error: any) {
      ElMessage.error(error.message || '加载AI模型配置失败')
    } finally {
      loading.value = false
    }
  }

  function handleSizeChange() {
    pagination.page = 1
    loadAiModelList()
  }

  function handleAdd() {
    dialogRef.value?.openAdd()
  }

  function handleEdit(row: AiModel) {
    dialogRef.value?.openEdit(row)
  }

  /** 切换启用：全局互斥，切换后原启用项自动停用 */
  async function handleEnable(row: AiModel) {
    try {
      await ElMessageBox.confirm(
        '启用该配置后，当前已启用的模型将自动停用，确定切换？',
        '提示',
        { type: 'warning' }
      )
      await aiModelApi.enable(row.id)
      ElMessage.success('已切换为当前启用模型')
      loadAiModelList()
    } catch (error: any) {
      if (error !== 'cancel') ElMessage.error(error.message || '切换失败')
    }
  }

  /** 连接测试：更新连接状态列 */
  async function handleTest(row: AiModel) {
    try {
      const { data } = await aiModelApi.test(row.id)
      if (data.success) {
        ElMessage.success('连接测试成功')
      } else {
        ElMessage.error('连接测试失败，请检查配置')
      }
      loadAiModelList()
    } catch (error: any) {
      ElMessage.error(error.message || '连接测试失败，请检查配置')
    }
  }

  /** 删除：当前启用项禁止删除 */
  async function handleDelete(row: AiModel) {
    try {
      await ElMessageBox.confirm('确定要删除该配置吗？删除后不可恢复', '提示', { type: 'warning' })
      await aiModelApi.delete(row.id)
      ElMessage.success('AI模型配置删除成功')
      if (tableData.value.length === 1 && pagination.page > 1) {
        pagination.page -= 1
      }
      loadAiModelList()
    } catch (error: any) {
      if (error !== 'cancel') ElMessage.error(error.message || '删除失败')
    }
  }

  onMounted(() => loadAiModelList())
</script>

<style lang="scss" scoped>
  .ai-model {
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

      .pagination-container {
        flex-shrink: 0;
        display: flex;
        justify-content: flex-end;
        margin-top: 16px;
      }
    }
  }
</style>
