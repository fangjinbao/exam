<!-- 操作日志：按操作人/类型/时间查询平台操作记录，仅查看（原型，数据走本地 Mock） -->
<template>
  <div class="operation-log">
    <!-- 筛选卡片 -->
    <ElCard shadow="never" class="filter-card">
      <ElForm :model="filterForm" :inline="true" class="filter-form">
        <ElFormItem label="操作人">
          <ElInput
            v-model="filterForm.operator"
            placeholder="输入操作人姓名"
            clearable
            class="filter-input"
          />
        </ElFormItem>
        <ElFormItem label="操作类型">
          <ElSelect v-model="filterForm.type" placeholder="全部" clearable class="filter-input">
            <ElOption v-for="t in typeOptions" :key="t" :label="t" :value="t" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="操作时间">
          <ElDatePicker
            v-model="filterForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            class="filter-date"
          />
        </ElFormItem>
        <ElFormItem>
          <ElButton type="primary" :icon="Search" @click="handleSearch">搜索</ElButton>
          <ElButton @click="handleReset">重置</ElButton>
        </ElFormItem>
      </ElForm>
    </ElCard>

    <!-- 表格卡片：仅查看，无操作列 -->
    <ElCard shadow="never" class="table-card">
      <div class="table-container">
        <ElTable v-loading="loading" :data="tableData" height="100%" style="width: 100%">
          <ElTableColumn prop="operator" label="操作人" min-width="100" show-overflow-tooltip />
          <ElTableColumn label="操作类型" width="100" align="center">
            <template #default="{ row }">
              <ElTag :type="typeTagType(row.type)" size="small" disable-transitions>
                {{ row.type }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="target" label="操作对象" min-width="120" show-overflow-tooltip />
          <ElTableColumn prop="content" label="操作内容" min-width="260" show-overflow-tooltip />
          <ElTableColumn prop="operateTime" label="操作时间" width="180" />
          <ElTableColumn prop="sourceIp" label="来源地址" min-width="140" show-overflow-tooltip />
          <template #empty>暂无操作日志数据</template>
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
          @current-change="loadOperationLogList"
        />
      </div>
    </ElCard>
  </div>
</template>
<script setup lang="ts">
  import { ref, reactive, onMounted } from 'vue'
  import { ElMessage } from 'element-plus'
  import { Search } from '@element-plus/icons-vue'
  import { operationLogApi, type OperationLogRecord } from '@/api/operationLog'

  defineOptions({ name: 'SystemOperationLog' })

  const typeOptions = ['新增', '编辑', '删除', '登录', '其他']

  const loading = ref(false)
  const tableData = ref<OperationLogRecord[]>([])

  // 筛选条件
  const filterForm = reactive<{ operator: string; type: string; dateRange: [string, string] | null }>(
    {
      operator: '',
      type: '',
      dateRange: null
    }
  )

  const pagination = reactive({ page: 1, pageSize: 10, total: 0 })

  /** 操作类型标签颜色 */
  function typeTagType(type: string) {
    const map: Record<string, string> = {
      新增: 'success',
      编辑: 'warning',
      删除: 'danger',
      登录: 'primary',
      其他: 'info'
    }
    return map[type] || 'info'
  }

  /** 加载操作日志列表 */
  async function loadOperationLogList() {
    loading.value = true
    try {
      const { data } = await operationLogApi.getList({
        operator: filterForm.operator || undefined,
        type: filterForm.type || undefined,
        startTime: filterForm.dateRange?.[0] || undefined,
        endTime: filterForm.dateRange?.[1] || undefined,
        page: pagination.page,
        pageSize: pagination.pageSize
      })
      tableData.value = data.list
      pagination.total = data.pagination.total
    } catch (error: any) {
      ElMessage.error(error.message || '加载操作日志失败')
    } finally {
      loading.value = false
    }
  }

  function handleSearch() {
    pagination.page = 1
    loadOperationLogList()
  }

  function handleReset() {
    filterForm.operator = ''
    filterForm.type = ''
    filterForm.dateRange = null
    pagination.page = 1
    loadOperationLogList()
  }

  function handleSizeChange() {
    pagination.page = 1
    loadOperationLogList()
  }

  onMounted(() => loadOperationLogList())
</script>

<style lang="scss" scoped>
  .operation-log {
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

      .filter-date {
        width: 260px;
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
