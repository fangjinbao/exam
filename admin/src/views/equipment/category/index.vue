<!-- 设备管理 - 设备分类：树形维护多级分类，支持绑定检查清单、导入导出 -->
<template>
  <div class="equipment-category">
    <!-- 筛选栏 -->
    <ElCard shadow="never" class="filter-card">
      <ElForm :model="filterForm" :inline="true" class="filter-form">
        <ElFormItem label="分类名称">
          <ElInput
            v-model="filterForm.name"
            placeholder="输入分类名称"
            clearable
            class="filter-input"
            @keyup.enter="loadTree"
          />
        </ElFormItem>
        <ElFormItem>
          <ElButton type="primary" :icon="Search" @click="loadTree">搜索</ElButton>
        </ElFormItem>
      </ElForm>
    </ElCard>

    <!-- 树表区 -->
    <ElCard shadow="never" class="table-card">
      <div class="table-header">
        <ElButton type="primary" :icon="Plus" @click="handleAdd(null)">新增</ElButton>
        <ElButton :icon="Sort" @click="toggleExpand">{{ isExpanded ? '折叠全部' : '展开全部' }}</ElButton>
        <div class="header-right">
          <ElButton plain :icon="Upload" @click="importVisible = true">导入</ElButton>
          <ElButton plain :icon="Download" @click="handleExport">导出</ElButton>
        </div>
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
        >
          <ElTableColumn prop="name" label="分类名称" min-width="220" show-overflow-tooltip />
          <ElTableColumn label="关联检查清单" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="row.checklistName">{{ row.checklistName }}</span>
              <span v-else class="text-placeholder">未绑定</span>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="deviceCount" label="关联设备数" width="120" align="center" />
          <ElTableColumn prop="createTime" label="创建时间" width="180" />
          <ElTableColumn label="操作" width="280" align="center" fixed="right">
            <template #default="{ row }">
              <ElButton link type="primary" @click="handleAdd(row)">新增子分类</ElButton>
              <ElButton link type="primary" @click="handleBind(row)">绑定清单</ElButton>
              <ElButton link type="primary" @click="handleEdit(row)">编辑</ElButton>
              <ElButton link type="danger" @click="handleDelete(row)">删除</ElButton>
            </template>
          </ElTableColumn>
          <template #empty>
            <ElEmpty description="暂无分类数据，请新增" />
          </template>
        </ElTable>
      </div>
    </ElCard>

    <!-- 新增/编辑弹窗 -->
    <CategoryFormDialog
      v-model:visible="formVisible"
      :edit-target="editTarget"
      :preset-parent-id="presetParentId"
      :tree-options="treeOptions"
      @success="loadTree"
    />

    <!-- 绑定清单弹窗 -->
    <ChecklistBindDialog
      v-model:visible="bindVisible"
      :category="bindTarget"
      @success="loadTree"
    />

    <!-- 导入弹窗 -->
    <ImportDialog v-model:visible="importVisible" @success="loadTree" />
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive, computed, onMounted } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { Search, Plus, Sort, Upload, Download } from '@element-plus/icons-vue'
  import * as XLSX from 'xlsx'
  import { saveAs } from 'file-saver'
  import {
    getCategoryTree,
    deleteCategory,
    getCategoryExportData,
    type EquipmentCategory
  } from '@/api/equipment-category'
  import CategoryFormDialog from './components/CategoryFormDialog.vue'
  import ChecklistBindDialog from './components/ChecklistBindDialog.vue'
  import ImportDialog from './components/ImportDialog.vue'

  defineOptions({ name: 'EquipmentCategory' })

  const tableRef = ref()
  const loading = ref(false)
  const tableData = ref<EquipmentCategory[]>([])
  const isExpanded = ref(true)
  const filterForm = reactive({ name: '' })

  // 弹窗状态
  const formVisible = ref(false)
  const editTarget = ref<EquipmentCategory | null>(null)
  const presetParentId = ref<number | null>(null)
  const bindVisible = ref(false)
  const bindTarget = ref<EquipmentCategory | null>(null)
  const importVisible = ref(false)

  // 编辑时父级选择需排除当前节点及其子树，避免自引用
  const treeOptions = computed(() => {
    if (editTarget.value) {
      return excludeSubtree(tableData.value, editTarget.value.id)
    }
    return tableData.value
  })

  function excludeSubtree(tree: EquipmentCategory[], excludeId: number): EquipmentCategory[] {
    return tree
      .filter((node) => node.id !== excludeId)
      .map((node) => ({
        ...node,
        children: node.children ? excludeSubtree(node.children, excludeId) : undefined
      }))
  }

  // 加载分类树
  async function loadTree() {
    loading.value = true
    try {
      const { data } = await getCategoryTree({ name: filterForm.name || undefined })
      tableData.value = data || []
    } catch (error: any) {
      ElMessage.error(error.message || '加载分类列表失败')
    } finally {
      loading.value = false
    }
  }

  // default-expand-all 仅初始化生效，动态切换需逐行设置
  function toggleExpand() {
    isExpanded.value = !isExpanded.value
    setRowsExpansion(tableData.value, isExpanded.value)
  }

  function setRowsExpansion(rows: EquipmentCategory[], expanded: boolean) {
    rows.forEach((row) => {
      if (row.children && row.children.length > 0) {
        tableRef.value?.toggleRowExpansion(row, expanded)
        setRowsExpansion(row.children, expanded)
      }
    })
  }

  // 新增：row 为空=顶级；传入 row=新增其子分类
  function handleAdd(row: any) {
    editTarget.value = null
    presetParentId.value = row ? row.id : null
    formVisible.value = true
  }

  function handleEdit(row: any) {
    editTarget.value = row
    presetParentId.value = null
    formVisible.value = true
  }

  function handleBind(row: any) {
    bindTarget.value = row
    bindVisible.value = true
  }

  async function handleDelete(row: any) {
    try {
      await ElMessageBox.confirm('确定要删除该分类吗？', '提示', { type: 'warning' })
    } catch {
      return
    }
    try {
      await deleteCategory(row.id)
      ElMessage.success('删除成功')
      loadTree()
    } catch (error: any) {
      ElMessage.error(error.message || '删除失败')
    }
  }

  // 防 Excel 公式注入：以 =/+/-/@ 等开头的单元格加前导单引号转义
  function sanitizeCell(val: unknown): string {
    const s = String(val ?? '')
    return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  }

  // 导出分类树为 Excel
  async function handleExport() {
    try {
      const { data } = await getCategoryExportData()
      const rows = data || []
      const aoa = [
        ['分类名称', '上级分类路径', '关联清单名称'],
        ...rows.map((r) => [sanitizeCell(r.name), sanitizeCell(r.parentPath), sanitizeCell(r.checklistName)])
      ]
      const ws = XLSX.utils.aoa_to_sheet(aoa)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '设备分类')
      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      const stamp = new Date()
        .toLocaleString('zh-CN', { hour12: false })
        .replace(/[/\s:]/g, '')
      saveAs(
        new Blob([buf], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }),
        `设备分类_${stamp}.xlsx`
      )
      ElMessage.success('导出成功')
    } catch (error: any) {
      ElMessage.error(error.message || '导出失败')
    }
  }

  onMounted(loadTree)
</script>

<style lang="scss" scoped>
  .equipment-category {
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
        align-items: center;

        .header-right {
          margin-left: auto;
          display: flex;
          gap: 12px;
        }
      }

      .table-container {
        flex: 1;
        overflow: hidden;
      }

      .text-placeholder {
        color: var(--el-text-color-placeholder);
      }
    }
  }
</style>
