<!-- 数据字典：按字典类型维护字典项，左侧类型列表、右侧字典项列表（原型，数据走本地 Mock） -->
<template>
  <div class="data-dict">
    <!-- 左侧：字典类型列表 -->
    <ElCard shadow="never" class="type-card">
      <div class="card-title">字典类型</div>
      <div class="table-container">
        <ElTable
          v-loading="typeLoading"
          :data="typeData"
          height="100%"
          highlight-current-row
          style="width: 100%"
          @current-change="handleTypeSelect"
        >
          <ElTableColumn prop="typeName" label="字典类型" min-width="120" show-overflow-tooltip />
          <ElTableColumn prop="itemCount" label="字典项数量" width="100" align="center" />
          <ElTableColumn label="操作" width="100" align="center">
            <template #default="{ row }">
              <ElButton link type="primary" @click="handleViewItems(row)">查看字典项</ElButton>
            </template>
          </ElTableColumn>
          <template #empty>暂无数据字典数据</template>
        </ElTable>
      </div>
      <div class="pagination-container">
        <ElPagination
          v-model:current-page="typePagination.page"
          v-model:page-size="typePagination.pageSize"
          :total="typePagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, prev, pager, next"
          @size-change="handleTypeSizeChange"
          @current-change="loadDictTypeList"
        />
      </div>
    </ElCard>

    <!-- 右侧：字典项列表 -->
    <ElCard shadow="never" class="item-card">
      <div class="table-header">
        <div class="card-title">
          {{ selectedType ? `字典项 - ${selectedType.typeName}` : '字典项' }}
        </div>
        <ElButton type="primary" :icon="Plus" :disabled="!selectedType" @click="handleAddItem">
          新增
        </ElButton>
      </div>
      <div class="table-container">
        <ElTable v-loading="itemLoading" :data="itemData" height="100%" style="width: 100%">
          <ElTableColumn prop="name" label="字典项名称" min-width="140" show-overflow-tooltip />
          <ElTableColumn prop="value" label="字典项值" min-width="140" show-overflow-tooltip />
          <ElTableColumn prop="sort" label="排序" width="80" align="center" />
          <ElTableColumn label="状态" width="90" align="center">
            <template #default="{ row }">
              <ElTag :type="row.status === 1 ? 'success' : 'info'" size="small" disable-transitions>
                {{ row.status === 1 ? '启用' : '停用' }}
              </ElTag>
            </template>
          </ElTableColumn>
          <!-- 操作按钮：无权限角色不渲染（原型阶段默认有权限） -->
          <ElTableColumn label="操作" width="140" align="center" fixed="right">
            <template #default="{ row }">
              <ElButton link type="primary" @click="handleEditItem(row)">编辑</ElButton>
              <ElButton link type="danger" @click="handleDeleteItem(row)">删除</ElButton>
            </template>
          </ElTableColumn>
          <template #empty>{{ selectedType ? '暂无字典项数据' : '请先选择左侧字典类型' }}</template>
        </ElTable>
      </div>
      <div class="pagination-container">
        <ElPagination
          v-model:current-page="itemPagination.page"
          v-model:page-size="itemPagination.pageSize"
          :total="itemPagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleItemSizeChange"
          @current-change="loadDictItemList"
        />
      </div>
    </ElCard>

    <!-- 字典项新增/编辑弹窗 -->
    <DictItemFormDialog ref="dialogRef" @success="handleItemSaved" />
  </div>
</template>
<script setup lang="ts">
  import { ref, reactive, onMounted } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { Plus } from '@element-plus/icons-vue'
  import { dataDictApi, type DictType, type DictItem } from '@/api/dataDict'
  import DictItemFormDialog from './components/DictItemFormDialog.vue'

  defineOptions({ name: 'SystemDataDict' })

  // 左侧字典类型
  const typeLoading = ref(false)
  const typeData = ref<DictType[]>([])
  const typePagination = reactive({ page: 1, pageSize: 10, total: 0 })
  const selectedType = ref<DictType | null>(null)

  // 右侧字典项
  const itemLoading = ref(false)
  const itemData = ref<DictItem[]>([])
  const itemPagination = reactive({ page: 1, pageSize: 10, total: 0 })

  const dialogRef = ref<InstanceType<typeof DictItemFormDialog>>()

  /** 加载字典类型列表 */
  async function loadDictTypeList() {
    typeLoading.value = true
    try {
      const { data } = await dataDictApi.getTypeList({
        page: typePagination.page,
        pageSize: typePagination.pageSize
      })
      typeData.value = data.list
      typePagination.total = data.pagination.total
    } catch (error: any) {
      ElMessage.error(error.message || '加载字典类型失败')
    } finally {
      typeLoading.value = false
    }
  }

  /** 加载当前选中类型的字典项列表 */
  async function loadDictItemList() {
    if (!selectedType.value) return
    itemLoading.value = true
    try {
      const { data } = await dataDictApi.getItemList({
        typeId: selectedType.value.id,
        page: itemPagination.page,
        pageSize: itemPagination.pageSize
      })
      itemData.value = data.list
      itemPagination.total = data.pagination.total
    } catch (error: any) {
      ElMessage.error(error.message || '加载字典项失败')
    } finally {
      itemLoading.value = false
    }
  }

  /** 选中字典类型行时加载右侧字典项 */
  function handleTypeSelect(row: DictType | null) {
    if (!row) return
    selectedType.value = row
    itemPagination.page = 1
    loadDictItemList()
  }

  /** 点击"查看字典项"（与选中行等效） */
  function handleViewItems(row: DictType) {
    handleTypeSelect(row)
  }

  function handleTypeSizeChange() {
    typePagination.page = 1
    loadDictTypeList()
  }

  function handleItemSizeChange() {
    itemPagination.page = 1
    loadDictItemList()
  }

  function handleAddItem() {
    if (!selectedType.value) return
    dialogRef.value?.openAdd(selectedType.value.id)
  }

  function handleEditItem(row: DictItem) {
    dialogRef.value?.openEdit(row)
  }

  /** 删除字典项；被引用时后端阻止 */
  async function handleDeleteItem(row: DictItem) {
    try {
      await ElMessageBox.confirm('确定要删除该字典项吗？删除后不可恢复', '提示', {
        type: 'warning'
      })
      await dataDictApi.deleteItem(row.id)
      ElMessage.success('字典项删除成功')
      if (itemData.value.length === 1 && itemPagination.page > 1) {
        itemPagination.page -= 1
      }
      loadDictItemList()
      loadDictTypeList()
    } catch (error: any) {
      if (error !== 'cancel') ElMessage.error(error.message || '删除失败')
    }
  }

  /** 字典项保存后刷新字典项列表与类型数量 */
  function handleItemSaved() {
    loadDictItemList()
    loadDictTypeList()
  }

  onMounted(() => loadDictTypeList())
</script>

<style lang="scss" scoped>
  .data-dict {
    height: 100%;
    display: flex;
    gap: 16px;

    // 卡片标题
    .card-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--el-text-color-primary);
    }

    // 左侧字典类型，固定宽度
    .type-card {
      width: 380px;
      flex-shrink: 0;
    }

    // 右侧字典项，撑满剩余空间
    .item-card {
      flex: 1;
      min-width: 0;
    }

    .type-card,
    .item-card {
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
        justify-content: space-between;
      }

      .card-title {
        flex-shrink: 0;
        margin-bottom: 16px;
      }

      .table-header .card-title {
        margin-bottom: 0;
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
