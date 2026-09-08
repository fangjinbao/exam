<!--
  鉴定工种管理：树形表格，工种为父行、其鉴定级别为可展开的子行。

  为什么用一棵树而不是「工种列表 + 点进去管级别」：
  工种本身信息很少（名称/编号/状态），级别才是要反复对照着看的内容——
  加油工有哪几级、和电工的分级是否一致，摊在一棵树里一眼能比。

  级别有两条编辑路径，各管一种场景：
  - 工种弹窗里整组维护：一次配齐某工种的整套分级（提交时全量替换）
  - 级别行上的「编辑 / 删除」+ 工种行的「加级别」：只动一级，走 level/* 单条接口
  只改一级时不能用整组替换——那会把未提交的其他级别当作已删除。

  两类行共用同一张表，靠 isLevel 区分（级别行没有 code/status）：
  父行显示编号、级别数、状态；子行只显示名称、排序与说明。
-->
<template>
  <div class="cert-occupation">
    <!-- 筛选卡片 -->
    <ElCard shadow="never" class="filter-card">
      <ElForm :model="filterForm" :inline="true" class="filter-form">
        <ElFormItem label="工种">
          <ElInput
            v-model="filterForm.keyword"
            placeholder="输入工种名称或编号"
            clearable
            class="filter-input"
            @keyup.enter="handleSearch"
          />
        </ElFormItem>
        <ElFormItem label="状态">
          <ElSelect v-model="filterForm.status" placeholder="全部" clearable class="filter-select">
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
        <ElButton v-auth="'add'" type="primary" :icon="Plus" @click="handleAdd">新增工种</ElButton>
        <ElButton
          v-auth="'batch-delete'"
          :disabled="!selectedIds.length"
          :icon="Delete"
          @click="handleBatchDelete"
        >
          批量删除
        </ElButton>
        <ElButton @click="toggleExpand">{{ isExpanded ? '折叠' : '展开' }}</ElButton>
      </div>

      <div class="table-container">
        <ElTable
          ref="tableRef"
          v-loading="loading"
          :data="tableData"
          row-key="rowKey"
          :tree-props="{ children: 'children' }"
          :default-expand-all="isExpanded"
          height="100%"
          style="width: 100%"
          @selection-change="handleSelectionChange"
        >
          <!--
            selectable：只允许勾选工种行。级别不能独立删除（它随工种走），
            勾得上却删不了会让人以为是 bug。
          -->
          <ElTableColumn
            type="selection"
            width="50"
            :selectable="(row: TableRow) => !row.isLevel"
          />
          <ElTableColumn prop="name" label="工种 / 级别" min-width="220">
            <template #default="{ row }">
              <span v-if="row.isLevel" class="level-name">
                <ElTag size="small" type="info" disable-transitions>级别</ElTag>
                {{ row.name }}
              </span>
              <span v-else class="occupation-name">{{ row.name }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="code" label="工种编号" width="130">
            <template #default="{ row }">
              <span v-if="!row.isLevel">{{ row.code }}</span>
              <span v-else class="cell-placeholder">—</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="级别数" width="90" align="center">
            <template #default="{ row }">
              <span v-if="!row.isLevel">{{ row.levelCount }}</span>
              <span v-else class="cell-placeholder">—</span>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="orderNum" label="排序" width="80" align="center" />
          <ElTableColumn prop="description" label="说明" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="row.description">{{ row.description }}</span>
              <span v-else class="cell-placeholder">—</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="状态" width="90" align="center">
            <template #default="{ row }">
              <ElSwitch
                v-if="!row.isLevel"
                v-model="row.status"
                :active-value="1"
                :inactive-value="0"
                :disabled="!hasAuth('update-status')"
                @change="handleStatusChange(row)"
              />
              <span v-else class="cell-placeholder">—</span>
            </template>
          </ElTableColumn>
          <ElTableColumn
            label="操作"
            width="190"
            align="left"
            fixed="right"
            class-name="table-actions"
          >
            <template #default="{ row }">
              <!-- 工种行：编辑工种本身、给它补一级、删整个工种 -->
              <template v-if="!row.isLevel">
                <ElButton v-auth="'update'" link type="primary" @click="handleEdit(row)">
                  编辑
                </ElButton>
                <ElButton v-auth="'update'" link type="primary" @click="handleAddLevel(row)">
                  加级别
                </ElButton>
                <ElButton v-auth="'delete'" link type="danger" @click="handleDelete(row)">
                  删除
                </ElButton>
              </template>
              <!-- 级别行：单独编辑与删除，走 level/* 单条接口，不影响同工种的其他级别 -->
              <template v-else>
                <ElButton v-auth="'update'" link type="primary" @click="handleEditLevel(row)">
                  编辑
                </ElButton>
                <ElButton v-auth="'delete'" link type="danger" @click="handleDeleteLevel(row)">
                  删除
                </ElButton>
              </template>
            </template>
          </ElTableColumn>
          <template #empty>
            <ElEmpty description="暂无鉴定工种，点击「新增工种」开始配置" />
          </template>
        </ElTable>
      </div>
    </ElCard>

    <OccupationDialog ref="dialogRef" @saved="loadTree" />
    <LevelDialog ref="levelDialogRef" @saved="loadTree" />
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive, onMounted } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { Search, Plus, Delete } from '@element-plus/icons-vue'
  import { useRoute } from 'vue-router'
  import { certOccupationApi, type CertOccupation } from '@/api/certOccupation'
  import { matchAuthMark } from '@/utils/permission/authMatch'
  import OccupationDialog from './components/OccupationDialog.vue'
  import LevelDialog from './components/LevelDialog.vue'

  defineOptions({ name: 'CertificationOccupation' })

  /**
   * 表格行：工种与级别共用一张表，isLevel 区分两类。
   *
   * rowKey 而非直接用 id 作 row-key：工种与级别的 id 各自自增、会撞号
   * （工种 1 与级别 1 同时存在），撞号会让 ElTable 的展开状态与勾选串行。
   * 故拼成 'o-1' / 'l-1' 保证全表唯一。
   */
  interface TableRow {
    rowKey: string
    isLevel: boolean
    id: number
    name: string
    code?: string
    levelCount?: number
    orderNum: number
    description?: string | null
    status?: number
    children?: TableRow[]
    /** 级别行专用：所属工种，供级别弹窗与删除确认使用 */
    occupationId?: number
    occupationName?: string
  }

  const route = useRoute()
  /*
    权限点在 setup 期一次性快照，不用 computed 跟随 route：本页 keepAlive=true，
    route 是全局响应式对象，切走后缓存组件若重渲染会拿新路由的 authList 误判本页按钮
    （与 directives/auth.ts、views/exam/index.vue 同一个坑，那两处也是挂载时快照）。
  */
  const authCodes = ((route.meta.authList as Array<{ authMark: string }> | undefined) ?? []).map(
    (item) => item.authMark
  )

  const tableRef = ref()
  const dialogRef = ref<InstanceType<typeof OccupationDialog>>()
  const levelDialogRef = ref<InstanceType<typeof LevelDialog>>()
  const loading = ref(false)
  const tableData = ref<TableRow[]>([])
  const isExpanded = ref(true)
  const selectedIds = ref<number[]>([])

  const filterForm = reactive<{ keyword: string; status: number | '' }>({
    keyword: '',
    status: ''
  })

  /** 按钮权限判断（供 ElSwitch 的 disabled 用；v-auth 只能控制显隐，控不了禁用态） */
  function hasAuth(action: string): boolean {
    return matchAuthMark(authCodes, action)
  }

  /** 工种树 → 表格行，级别转为子行 */
  function toRows(list: CertOccupation[]): TableRow[] {
    return list.map((o) => ({
      rowKey: `o-${o.id}`,
      isLevel: false,
      id: o.id,
      name: o.name,
      code: o.code,
      levelCount: o.levelCount,
      orderNum: o.orderNum,
      description: o.description,
      status: o.status,
      children: (o.children || []).map((l) => ({
        rowKey: `l-${l.id}`,
        isLevel: true,
        id: l.id!,
        name: l.name,
        orderNum: l.orderNum ?? 0,
        description: l.description,
        // 带上父工种：级别弹窗要显示所属工种，删除确认也要说清是哪个工种下的哪一级
        occupationId: o.id,
        occupationName: o.name
      }))
    }))
  }

  async function loadTree() {
    loading.value = true
    try {
      const { data } = await certOccupationApi.getTree({
        keyword: filterForm.keyword || undefined,
        status: filterForm.status
      })
      tableData.value = toRows(data || [])
    } catch (e: any) {
      ElMessage.error(e?.message || '获取鉴定工种失败')
    } finally {
      loading.value = false
    }
  }

  function handleSearch() {
    loadTree()
  }

  function handleReset() {
    filterForm.keyword = ''
    filterForm.status = ''
    loadTree()
  }

  /**
   * 展开/折叠全部。
   * ElTable 的 default-expand-all 只在初次渲染生效，改它不会重新展开已渲染的行，
   * 故逐行调 toggleRowExpansion。
   */
  function toggleExpand() {
    isExpanded.value = !isExpanded.value
    tableData.value.forEach((row) => {
      if (row.children?.length) tableRef.value?.toggleRowExpansion(row, isExpanded.value)
    })
  }

  function handleSelectionChange(rows: TableRow[]) {
    selectedIds.value = rows.filter((r) => !r.isLevel).map((r) => r.id)
  }

  function handleAdd() {
    dialogRef.value?.open()
  }

  function handleEdit(row: TableRow) {
    dialogRef.value?.open(row.id)
  }

  async function handleStatusChange(row: TableRow) {
    try {
      await certOccupationApi.updateStatus(row.id, row.status!)
      ElMessage.success(row.status === 1 ? '已启用' : '已停用')
    } catch (e: any) {
      ElMessage.error(e?.message || '状态更新失败')
      // 回滚开关：请求失败时界面不能停在成功后的样子
      row.status = row.status === 1 ? 0 : 1
    }
  }

  async function handleDelete(row: TableRow) {
    const levelHint = row.levelCount ? `及其 ${row.levelCount} 个级别` : ''
    try {
      await ElMessageBox.confirm(
        `确定删除工种「${row.name}」${levelHint}吗？删除后不可恢复。`,
        '删除确认',
        { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
      )
    } catch {
      return
    }
    try {
      await certOccupationApi.delete(row.id)
      ElMessage.success('删除成功')
      loadTree()
    } catch (e: any) {
      ElMessage.error(e?.message || '删除失败')
    }
  }

  /** 给某工种补一级 */
  function handleAddLevel(row: TableRow) {
    levelDialogRef.value?.open({
      occupationId: row.id,
      occupationName: row.name
    })
  }

  /**
   * 编辑单个级别
   *
   * 走 level/update 单条接口，不影响同工种下的其他级别；
   * 工种弹窗里的整组编辑仍然保留，两条路都通。
   */
  function handleEditLevel(row: TableRow) {
    levelDialogRef.value?.open({
      occupationId: row.occupationId!,
      occupationName: row.occupationName ?? '',
      level: {
        id: row.id,
        name: row.name,
        orderNum: row.orderNum,
        description: row.description
      }
    })
  }

  /** 删除单个级别（确认文案带上所属工种，避免同名级别删错） */
  async function handleDeleteLevel(row: TableRow) {
    try {
      await ElMessageBox.confirm(
        `确定删除「${row.occupationName}」下的级别「${row.name}」吗？删除后不可恢复。`,
        '删除确认',
        { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
      )
    } catch {
      return
    }
    try {
      await certOccupationApi.deleteLevel(row.id)
      ElMessage.success('删除成功')
      loadTree()
    } catch (e: any) {
      ElMessage.error(e?.message || '删除失败')
    }
  }

  async function handleBatchDelete() {
    try {
      await ElMessageBox.confirm(
        `确定删除选中的 ${selectedIds.value.length} 个工种吗？其下级别一并删除，删除后不可恢复。`,
        '批量删除确认',
        { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
      )
    } catch {
      return
    }
    try {
      await certOccupationApi.batchDelete(selectedIds.value)
      ElMessage.success('删除成功')
      selectedIds.value = []
      loadTree()
    } catch (e: any) {
      ElMessage.error(e?.message || '批量删除失败')
    }
  }

  onMounted(() => loadTree())
</script>

<style lang="scss" scoped>
  .cert-occupation {
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: 100%;

    .filter-card {
      flex-shrink: 0;
      border: none !important;
      border-radius: 12px;
      box-shadow: none !important;

      :deep(.el-card__body) {
        padding: 12px 20px;
      }

      .filter-form {
        @include responsiveFilterForm();
      }
    }

    .table-card {
      display: flex;
      flex: 1;
      flex-direction: column;
      overflow: hidden;
      border: none !important;
      border-radius: 12px;
      box-shadow: none !important;

      :deep(.el-card__body) {
        display: flex;
        flex-direction: column;
        height: 100%;
        padding: 20px;
      }

      .table-header {
        display: flex;
        flex-shrink: 0;
        gap: 12px;
        margin-bottom: 16px;
      }

      .table-container {
        flex: 1;
        overflow: hidden;
      }
    }

    // 工种名加重、级别名常规：树形缩进之外再给一层字重区分，
    // 免得展开后满屏同样粗细的名字分不清层级
    .occupation-name {
      font-weight: 600;
    }

    .level-name {
      display: inline-flex;
      gap: 6px;
      align-items: center;
    }

    // 级别行在「编号/级别数/状态」这些列上无值，用统一的占位符而非留空，
    // 空单元格看起来像数据没加载出来
    .cell-placeholder {
      color: var(--el-text-color-placeholder);
    }
  }
</style>
