<!--
  题库范围选择抽屉（共享业务组件：试卷组卷、练习选题库共用）
  题库数量可能远超一屏，下拉无法搜索、也受 pageSize 限制取不全，故改抽屉：
  服务端分页 + 关键词搜索，跨页勾选靠本地 Map 累积（表格 reserve-selection 只在同一数据源内生效）。
  候选列表由后端按共享可见范围过滤，此处不再做前端权限判断。
-->
<template>
  <ElDrawer v-model="visible" title="选择题库范围" size="560px" :close-on-click-modal="false">
    <div class="bank-picker">
      <ElInput
        v-model="keyword"
        placeholder="搜索题库名称"
        clearable
        :prefix-icon="Search"
        class="picker-search"
        @keyup.enter="reload"
        @clear="reload"
      />

      <!-- 已选摘要：跨页勾选时让用户随时看到已选了什么，可就地移除 -->
      <div v-if="picked.size" class="picked-bar">
        <span class="picked-label">已选 {{ picked.size }} 个</span>
        <ElButton link type="primary" class="picked-clear" @click="clearPicked">清空</ElButton>
        <div class="picked-tags">
          <ElTag v-for="b in pickedList" :key="b.id" closable size="small" @close="togglePick(b, false)">
            {{ b.name }}
          </ElTag>
        </div>
      </div>

      <ElTable
        ref="tableRef"
        v-loading="loading"
        :data="rows"
        row-key="id"
        height="100%"
        class="picker-table"
        @select="(_: unknown, row: BankRow) => togglePick(row)"
        @select-all="handleSelectAll"
      >
        <ElTableColumn type="selection" width="46" align="center" />
        <ElTableColumn prop="name" label="题库名称" min-width="180" show-overflow-tooltip />
        <ElTableColumn prop="questionCount" label="题目数" width="90" align="center" />
        <template #empty>{{ keyword ? '无匹配题库' : '暂无可用题库' }}</template>
      </ElTable>

      <ElPagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        background
        class="picker-pager"
        @current-change="fetchList"
      />
    </div>

    <!-- ElDrawer 的 footer 插槽不带按钮间距，自行包一层控制对齐与 gap -->
    <template #footer>
      <div class="picker-footer">
        <ElButton @click="visible = false">取消</ElButton>
        <ElButton type="primary" @click="handleConfirm">确定</ElButton>
      </div>
    </template>
  </ElDrawer>
</template>

<script setup lang="ts">
  import { ref, computed, watch, nextTick } from 'vue'
  import { Search } from '@element-plus/icons-vue'
  import { ElMessage, type TableInstance } from 'element-plus'
  import { questionBankApi } from '@/api/questionBank'

  defineOptions({ name: 'BankPickerDrawer' })

  /**
   * 已选题库项：父级用它渲染标签并派生 bankIds。
   * questionCount 随勾选一并带出，供调用方展示「共 N 题」而无需再查一次题量。
   */
  export interface PickedBank {
    id: number
    name: string
    questionCount?: number
  }

  /** 抽屉表格行（列表接口返回的子集） */
  interface BankRow extends PickedBank {}

  const props = defineProps<{
    /** 抽屉显隐 */
    modelValue: boolean
    /** 当前已选题库（打开时作为初始勾选） */
    selected: PickedBank[]
  }>()

  const emit = defineEmits<{
    'update:modelValue': [boolean]
    /** 点确定时提交最终已选集合 */
    confirm: [PickedBank[]]
  }>()

  const visible = computed({
    get: () => props.modelValue,
    set: (v) => emit('update:modelValue', v)
  })

  // 输入框实时值与已生效的查询词分开：搜索靠 Enter/清空提交，
  // 若查询直接读输入框，用户打完字不回车就翻页会拿「新词 + 旧页码」去查，翻出莫名的空页
  const keyword = ref('')
  const activeKeyword = ref('')
  const loading = ref(false)
  const rows = ref<BankRow[]>([])
  const page = ref(1)
  const pageSize = 20
  const total = ref(0)
  const tableRef = ref<TableInstance>()
  // 请求序号：快速连续翻页时慢的旧请求可能后到并覆盖新页数据，只认最后一次
  let reqSeq = 0

  // 跨页已选集合：表格 reserve-selection 仅在同一份 data 内保留勾选，
  // 换页/搜索会重建 data，故用 Map 自行累积，id → 题库项
  const picked = ref<Map<number, PickedBank>>(new Map())
  const pickedList = computed(() => [...picked.value.values()])

  /** 拉取当前页题库（后端已按共享可见范围过滤） */
  async function fetchList() {
    const seq = ++reqSeq
    loading.value = true
    try {
      const res = await questionBankApi.getList({
        keyword: activeKeyword.value || undefined,
        status: 1,
        page: page.value,
        pageSize
      })
      // 已有更新的请求发出，本次结果作废，避免旧页数据覆盖新页
      if (seq !== reqSeq) return
      rows.value = res.data.list.map((b) => ({ id: b.id, name: b.name, questionCount: b.questionCount }))
      total.value = res.data.pagination.total
      await syncSelection()
    } catch (error: any) {
      // api 层统一关闭了 http 错误提示（showErrorMessage: false），提示由页面负责
      if (seq === reqSeq) ElMessage.error(error.message || '加载题库列表失败')
    } finally {
      if (seq === reqSeq) loading.value = false
    }
  }

  /** 把 picked 中的项回显为当前页的勾选态 */
  async function syncSelection() {
    await nextTick()
    const table = tableRef.value
    if (!table) return
    // 先清空再逐行置位，避免上一页残留勾选
    table.clearSelection()
    rows.value.forEach((row) => {
      if (picked.value.has(row.id)) table.toggleRowSelection(row, true)
    })
  }

  /**
   * 勾选/取消单个题库
   * @param row 目标行
   * @param force 显式指定目标状态（标签上的 × 传 false），缺省则按当前是否已选取反
   */
  function togglePick(row: PickedBank, force?: boolean) {
    const next = force ?? !picked.value.has(row.id)
    const map = picked.value
    if (next) map.set(row.id, { id: row.id, name: row.name, questionCount: row.questionCount })
    else map.delete(row.id)
    // Map 原地改动不触发响应式，重建引用
    picked.value = new Map(map)
    if (force === false) void syncSelection()
  }

  /** 表头全选：只影响当前页的行 */
  function handleSelectAll(selection: BankRow[]) {
    const on = selection.length > 0
    const map = new Map(picked.value)
    rows.value.forEach((row) => {
      if (on) map.set(row.id, { id: row.id, name: row.name, questionCount: row.questionCount })
      else map.delete(row.id)
    })
    picked.value = map
  }

  function clearPicked() {
    picked.value = new Map()
    void syncSelection()
  }

  /** 搜索或清空关键词：回到第一页重查 */
  /** 提交搜索：把输入框内容作为生效查询词并回到第一页 */
  function reload() {
    activeKeyword.value = keyword.value.trim()
    page.value = 1
    void fetchList()
  }

  function handleConfirm() {
    emit('confirm', pickedList.value)
    visible.value = false
  }

  // 每次打开：以父级当前已选为初始态，并重置搜索与分页
  watch(visible, (open) => {
    if (!open) return
    picked.value = new Map(props.selected.map((b) => [b.id, { id: b.id, name: b.name }]))
    keyword.value = ''
    activeKeyword.value = ''
    page.value = 1
    void fetchList()
  })
</script>

<style lang="scss" scoped>
  // 抽屉 body 已是固定高度，这里用 flex 让表格吃掉剩余空间、分页贴底
  .bank-picker {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 14px;

    .picker-search {
      flex-shrink: 0;
    }

    .picked-bar {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      padding: 8px 10px;
      border-radius: 8px;
      background: var(--el-fill-color-light);

      .picked-label {
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }

      .picked-clear {
        font-size: 12px;
      }

      // 已选较多时限高滚动，避免把表格挤没
      .picked-tags {
        flex: 1 1 100%;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        max-height: 84px;
        overflow-y: auto;
      }
    }

    .picker-table {
      flex: 1 1 0;
      min-height: 0;
    }

    .picker-pager {
      flex-shrink: 0;
      justify-content: flex-end;
    }
  }

  .picker-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }
</style>
