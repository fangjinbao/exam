<!-- 设备管理 - 厂商信息：维护设备供应商，支持批量删除、导入导出 -->
<template>
  <div class="equipment-vendor">
    <!-- 筛选栏 -->
    <ElCard shadow="never" class="filter-card">
      <ElForm :model="filterForm" :inline="true" class="filter-form">
        <ElFormItem label="厂商名称">
          <ElInput
            v-model="filterForm.name"
            placeholder="输入厂商名称"
            clearable
            class="filter-input"
            @keyup.enter="handleSearch"
          />
        </ElFormItem>
        <ElFormItem>
          <ElButton type="primary" :icon="Search" @click="handleSearch">搜索</ElButton>
        </ElFormItem>
      </ElForm>
    </ElCard>

    <!-- 列表区 -->
    <ElCard shadow="never" class="table-card">
      <div class="table-header">
        <ElButton type="primary" :icon="Plus" @click="handleAdd">新增</ElButton>
        <ElButton
          v-if="selectedIds.length > 0"
          type="danger"
          plain
          :icon="Delete"
          @click="handleBatchDelete"
        >
          批量删除（{{ selectedIds.length }}）
        </ElButton>
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
          height="100%"
          style="width: 100%"
          @selection-change="handleSelectionChange"
        >
          <ElTableColumn type="selection" width="50" reserve-selection />
          <ElTableColumn prop="name" label="厂商名称" min-width="200" show-overflow-tooltip />
          <ElTableColumn prop="contact" label="联系人" width="110" />
          <ElTableColumn prop="phone" label="联系电话" width="140" />
          <ElTableColumn prop="email" label="邮箱" min-width="180" show-overflow-tooltip />
          <ElTableColumn label="地址" min-width="220" show-overflow-tooltip>
            <template #default="{ row }">{{ row.address || '-' }}</template>
          </ElTableColumn>
          <ElTableColumn label="操作" width="130" align="center" fixed="right">
            <template #default="{ row: _row }">
              <ElButton link type="primary" @click="handleEdit(_row as Vendor)">编辑</ElButton>
              <ElButton link type="danger" @click="handleDelete(_row as Vendor)">删除</ElButton>
            </template>
          </ElTableColumn>
          <template #empty>
            <ElEmpty description="暂无厂商数据" />
          </template>
        </ElTable>
      </div>

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

    <!-- 新增/编辑弹窗 -->
    <VendorFormDialog v-model:visible="formVisible" :edit-target="editTarget" @success="loadList" />

    <!-- 导入弹窗 -->
    <VendorImportDialog v-model:visible="importVisible" @success="handleImported" />
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive, onMounted } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { Search, Plus, Delete, Upload, Download } from '@element-plus/icons-vue'
  import * as XLSX from 'xlsx'
  import { saveAs } from 'file-saver'
  import {
    getVendorList,
    deleteVendor,
    batchDeleteVendors,
    getVendorExportData,
    type Vendor
  } from '@/api/equipment-vendor'
  import VendorFormDialog from './components/VendorFormDialog.vue'
  import VendorImportDialog from './components/VendorImportDialog.vue'

  defineOptions({ name: 'EquipmentVendor' })

  const tableRef = ref()
  const loading = ref(false)
  const tableData = ref<Vendor[]>([])
  const filterForm = reactive({ name: '' })
  const pagination = reactive({ page: 1, pageSize: 10, total: 0 })
  const selectedIds = ref<number[]>([])

  // 弹窗状态
  const formVisible = ref(false)
  const editTarget = ref<Vendor | null>(null)
  const importVisible = ref(false)

  // 加载列表
  async function loadList() {
    loading.value = true
    try {
      const { data } = await getVendorList({
        name: filterForm.name || undefined,
        page: pagination.page,
        pageSize: pagination.pageSize
      })
      tableData.value = data?.list || []
      pagination.total = data?.pagination?.total || 0
    } catch (error: any) {
      ElMessage.error(error.message || '加载厂商列表失败')
    } finally {
      loading.value = false
    }
  }

  function handleSearch() {
    pagination.page = 1
    loadList()
  }

  function handleSizeChange() {
    pagination.page = 1
    loadList()
  }

  function handleSelectionChange(rows: unknown[]) {
    selectedIds.value = (rows as Vendor[]).map((r) => r.id)
  }

  function handleAdd() {
    editTarget.value = null
    formVisible.value = true
  }

  function handleEdit(row: Vendor) {
    // 浅拷贝切断引用，避免弹窗操作意外污染表格行数据
    editTarget.value = { ...row }
    formVisible.value = true
  }

  async function handleDelete(row: Vendor) {
    try {
      await ElMessageBox.confirm('确定要删除该厂商吗？', '提示', { type: 'warning' })
    } catch {
      return
    }
    try {
      await deleteVendor(row.id)
      ElMessage.success('删除成功')
      loadList()
    } catch (error: any) {
      ElMessage.error(error.message || '删除失败')
    }
  }

  async function handleBatchDelete() {
    try {
      await ElMessageBox.confirm(
        `确定要删除选中的 ${selectedIds.value.length} 个厂商吗？`,
        '提示',
        { type: 'warning' }
      )
    } catch {
      return
    }
    try {
      await batchDeleteVendors(selectedIds.value)
      ElMessage.success('删除成功')
      tableRef.value?.clearSelection()
      selectedIds.value = []
      loadList()
    } catch (error: any) {
      ElMessage.error(error.message || '批量删除失败')
    }
  }

  // 导出当前筛选结果为 Excel
  async function handleExport() {
    try {
      const { data } = await getVendorExportData({ name: filterForm.name || undefined })
      const rows = data || []
      const aoa = [
        ['厂商名称', '联系人', '联系电话', '邮箱', '地址', '备注'],
        ...rows.map((r) => [
          sanitizeCell(r.name),
          sanitizeCell(r.contact),
          sanitizeCell(r.phone),
          sanitizeCell(r.email),
          sanitizeCell(r.address),
          sanitizeCell(r.remark)
        ])
      ]
      const ws = XLSX.utils.aoa_to_sheet(aoa)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '厂商信息')
      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      const stamp = new Date().toLocaleString('zh-CN', { hour12: false }).replace(/[/\s:]/g, '')
      saveAs(
        new Blob([buf], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }),
        `厂商信息_${stamp}.xlsx`
      )
      ElMessage.success('导出成功')
    } catch (error: any) {
      ElMessage.error(error.message || '导出失败')
    }
  }

  // 导入成功后回到第一页刷新
  function handleImported() {
    pagination.page = 1
    loadList()
  }

  // 防 Excel 公式注入：以 =/+/-/@ 等开头的单元格加前导单引号转义
  function sanitizeCell(val: unknown): string {
    const s = String(val ?? '')
    return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  }

  onMounted(loadList)
</script>

<style lang="scss" scoped>
  .equipment-vendor {
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

      .pagination-container {
        flex-shrink: 0;
        display: flex;
        justify-content: flex-end;
        margin-top: 16px;
      }
    }
  }
</style>
