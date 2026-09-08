<!--
  人员选择弹窗（共享业务组件）：左候选区（类型切换 + 关键词/部门·单位筛选 + 服务端分页 + 批量全选），
  右已选区（合并展示 + 移除/清空）。v-model 绑定已选人员数组。
  「内部人员 + 外部考生」两类混选的场景通用：考试分配考生、练习指派参与人员均复用此组件，
  仅通过 title/emptyText 调整文案，跨页勾选累积等逻辑只此一份。
-->

<template>
  <ElDialog
    :model-value="modelValue"
    :title="props.title"
    width="1200px"
    top="6vh"
    :close-on-click-modal="false"
    append-to-body
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    @open="handleOpen"
  >
    <div class="picker-body">
      <!-- 左：候选区 -->
      <div class="picker-left">
        <!--
          筛选区收进一个容器：原先类型切换与搜索条是两个平级的 .filter-bar 竖排，
          「全选当前筛选」还会被挤到第三行单独占一行，三行控件浮在白底上没有分组感。
        -->
        <div class="picker-filters">
          <!--
            用 ElTabs + capsuleTabs mixin，而非 ElRadioButton 自绘：
            项目已有这套胶囊页签（考试详情/练习详情/练习列表三处在用），
            这里同样是「切换下方表格的数据源」，与那三处是同一件事，样式该走同一个出口。
            mixin 还额外处理了焦点环对比度与 nav 裁剪，自绘一套必然漏掉。
          -->
          <ElTabs
            v-if="!props.internalOnly"
            v-model="activeType"
            class="type-tabs"
            @tab-change="handleTypeChange"
          >
            <ElTabPane label="内部人员" name="internal" />
            <ElTabPane label="外部考生" name="external" />
          </ElTabs>
          <div class="filter-bar">
            <ElInput
              v-model="filter.keyword"
              :placeholder="activeType === 'internal' ? '搜索姓名/账号' : '搜索姓名'"
              clearable
              style="width: 180px"
              @keyup.enter="handleFilterChange"
              @clear="handleFilterChange"
            />
            <ElTreeSelect
              v-if="activeType === 'internal'"
              v-model="filter.departmentIds"
              :data="deptTree"
              :props="{ label: 'name', children: 'children' }"
              node-key="id"
              value-key="id"
              multiple
              check-strictly
              show-checkbox
              collapse-tags
              collapse-tags-tooltip
              clearable
              filterable
              :render-after-expand="false"
              placeholder="按部门筛选（可多选）"
              style="width: 240px"
              @change="handleFilterChange"
            />
            <ElSelect
              v-else
              v-model="filter.orgId"
              clearable
              filterable
              placeholder="按单位筛选"
              style="width: 200px"
              @change="handleFilterChange"
            >
              <ElOption v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id" />
            </ElSelect>
            <ElButton type="primary" :icon="Search" @click="handleFilterChange">搜索</ElButton>
            <!--
              「全选当前筛选」推到行尾并降为文字按钮：它是批量捷径而非主操作，
              原先用 primary plain 比真正的主操作「搜索」更抢眼，强调关系是反的。
            -->
            <ElButton link type="primary" class="select-all-btn" @click="selectAllFiltered">
              全选当前筛选
            </ElButton>
          </div>
        </div>
        <!--
          去掉 size="small"：原先行高挤成 ~34px，姓名和部门贴得很紧，
          而这是个以「逐行勾人」为主的表，行高需要足够的点击面积。
          height 同步抬到 420 保持仍是 10 行可见，不产生额外滚动。
        -->
        <ElTable
          ref="tableRef"
          v-loading="listLoading"
          :data="rows"
          height="420"
          row-key="id"
          class="candidate-table"
          @select="handleSelect"
          @select-all="handleSelectAll"
          @row-click="handleRowClick"
        >
          <ElTableColumn type="selection" width="48" reserve-selection />
          <ElTableColumn prop="name" label="姓名" min-width="90" show-overflow-tooltip />
          <!--
            账号列：内外部的账号含义不同（内部=统一身份账号，外部=账号），
            光看「账号」二字无法分辨，故表头挂问号提示说明来源，避免用户误判为同一套账号体系。
          -->
          <ElTableColumn prop="account" min-width="130" show-overflow-tooltip>
            <template #header>
              <span class="th-with-tip">
                账号
                <ElTooltip placement="top">
                  <template #content>
                    内部人员为统一身份账号<br />
                    外部考生为账号
                  </template>
                  <ElIcon class="th-tip-icon"><QuestionFilled /></ElIcon>
                </ElTooltip>
              </span>
            </template>
            <template #default="{ row }">{{ row.account || '-' }}</template>
          </ElTableColumn>
          <ElTableColumn prop="idCard" label="身份证号" min-width="150" show-overflow-tooltip>
            <template #default="{ row }">{{ row.idCard || '-' }}</template>
          </ElTableColumn>
          <ElTableColumn prop="phone" label="手机号" min-width="115" show-overflow-tooltip>
            <template #default="{ row }">{{ row.phone || '-' }}</template>
          </ElTableColumn>
          <ElTableColumn
            prop="belong"
            :label="activeType === 'internal' ? '部门' : '单位'"
            min-width="180"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ belongText(row) }}</template>
          </ElTableColumn>
        </ElTable>
        <ElPagination
          class="picker-pager"
          layout="total, sizes, prev, pager, next"
          :page-sizes="[10, 20, 50]"
          :current-page="page"
          :page-size="pageSize"
          :total="total"
          @current-change="handlePageChange"
          @size-change="handleSizeChange"
        />
      </div>

      <!-- 右：已选区 -->
      <div class="picker-right">
        <div class="right-head">
          <span>已选 {{ selectedList.length }} 人</span>
          <ElButton link type="danger" :disabled="selectedList.length === 0" @click="clearPicked"
            >清空</ElButton
          >
        </div>
        <div class="right-list">
          <ElEmpty
            v-if="selectedList.length === 0"
            :description="props.emptyText"
            :image-size="72"
          />
          <div v-for="item in selectedList" :key="`${item.type}:${item.id}`" class="picked-item">
            <ElTag
              :type="item.type === 'internal' ? 'primary' : 'warning'"
              size="small"
              disable-transitions
            >
              {{ item.type === 'internal' ? '内部' : '外部' }}
            </ElTag>
            <span
              class="picked-name"
              :title="item.belong ? `${item.name}（${item.belong}）` : item.name"
            >
              {{ item.name
              }}<span v-if="item.belong" class="picked-belong">（{{ item.belong }}）</span>
            </span>
            <ElIcon class="picked-remove" @click="removePicked(item)"><Close /></ElIcon>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <span class="picker-footer">
        <!-- 仅内部模式下无外部考生，内外部拆分计数没有意义 -->
        <span v-if="props.internalOnly" class="footer-count"
          >已选 {{ selectedList.length }} 人</span
        >
        <span v-else class="footer-count"
          >已选 {{ selectedList.length }} 人（内部 {{ internalCount }} · 外部
          {{ externalCount }}）</span
        >
        <span>
          <ElButton @click="emit('update:modelValue', false)">取消</ElButton>
          <ElButton type="primary" @click="handleConfirm">确定</ElButton>
        </span>
      </span>
    </template>
  </ElDialog>
</template>

<script setup lang="ts">
  import { ref, reactive, computed } from 'vue'
  import { ElMessage } from 'element-plus'
  import type { TableColumnCtx } from 'element-plus'
  import { Search, Close, QuestionFilled } from '@element-plus/icons-vue'
  import { getUserList, getDepartmentTree } from '@/api/organization'
  import { getExternalCandidateList } from '@/api/externalCandidate'
  import { getExternalOrgList } from '@/api/externalOrg'

  /** 已选考生项（内外部合并的统一结构） */
  export interface PickedCandidate {
    type: 'internal' | 'external'
    id: number
    name: string
    belong: string // 内部=部门名，外部=单位名
    /** 登录账号：内部=统一身份账号，外部考生以手机号登录 */
    account?: string | null
    /** 身份证号：内部人员表无此字段，恒为空 */
    idCard?: string | null
    phone?: string | null
  }

  const props = withDefaults(
    defineProps<{
      modelValue: boolean
      /** 当前已选考生（受控） */
      selected: PickedCandidate[]
      /** 弹窗标题。练习模块复用时传「选择参与人员」，默认保持考试场景文案 */
      title?: string
      /** 空态文案，随 title 一并调整 */
      emptyText?: string
      /**
       * 仅选内部人员：隐藏「内部/外部」类型切换，锁定在内部人员。
       * 监考/阅卷人员只能是内部员工，不存在外部考生充当的情形。
       */
      internalOnly?: boolean
    }>(),
    { title: '选择考生', emptyText: '尚未选择考生', internalOnly: false }
  )

  const emit = defineEmits<{
    (e: 'update:modelValue', v: boolean): void
    (e: 'confirm', list: PickedCandidate[]): void
  }>()

  // 已选 Map：key=`${type}:${id}`，跨翻页/筛选/类型切换保持不丢
  const pickedMap = reactive(new Map<string, PickedCandidate>())
  const keyOf = (type: 'internal' | 'external', id: number) => `${type}:${id}`

  const selectedList = computed(() => Array.from(pickedMap.values()))
  const internalCount = computed(
    () => selectedList.value.filter((i) => i.type === 'internal').length
  )
  const externalCount = computed(
    () => selectedList.value.filter((i) => i.type === 'external').length
  )

  // 打开时用传入的 selected 初始化 Map（快照，取消不影响外部）
  function handleOpen() {
    pickedMap.clear()
    props.selected.forEach((it) => pickedMap.set(keyOf(it.type, it.id), { ...it }))
    activeType.value = 'internal'
    void resetFilterAndReload()
  }

  function handleConfirm() {
    emit(
      'confirm',
      selectedList.value.map((it) => ({ ...it }))
    )
    emit('update:modelValue', false)
  }

  // ===== 候选区：类型切换 + 筛选 + 服务端分页 =====
  const activeType = ref<'internal' | 'external'>('internal')

  /** 候选行统一结构 */
  interface CandidateRow {
    id: number
    name: string
    belong: string
    /** 内部人员的部门 ID，用于查全路径；外部考生无此字段 */
    departmentId?: number
    /** 登录账号：内部=统一身份账号，外部=手机号 */
    account?: string | null
    /** 身份证号：仅外部考生库维护该字段 */
    idCard?: string | null
    phone?: string | null
  }

  const filter = reactive({
    keyword: '',
    /** 部门多选（存选中节点自身 ID，提交时再展开子树） */
    departmentIds: [] as number[],
    orgId: undefined as number | undefined
  })
  const rows = ref<CandidateRow[]>([])
  const listLoading = ref(false)
  const page = ref(1)
  const pageSize = ref(10)
  const total = ref(0)

  /** 部门树节点（后端 /department/tree 返回的层级结构） */
  interface DeptNode {
    id: number
    name: string
    children?: DeptNode[]
  }

  // 部门树 / 单位下拉数据源
  const deptTree = ref<DeptNode[]>([])
  const orgOptions = ref<{ id: number; name: string }[]>([])

  /**
   * 部门 ID → 全路径（如「宁波石油分公司/油库管理科」）与子树 ID。
   * 部门层级里同名科室很多（各分公司都有「财务科」），只显示叶子名无法区分归属，故展开为全路径。
   * 用 computed 而非在行映射时算：部门树与候选人列表并发加载，树后到时路径能自动补上。
   */
  const deptIndex = computed(() => {
    const path = new Map<number, string>()
    const descendants = new Map<number, number[]>()
    const walk = (nodes: DeptNode[], prefix: string): number[] => {
      const collected: number[] = []
      nodes.forEach((n) => {
        const full = prefix ? `${prefix}/${n.name}` : n.name
        path.set(n.id, full)
        const sub = n.children?.length ? walk(n.children, full) : []
        descendants.set(n.id, sub)
        collected.push(n.id, ...sub)
      })
      return collected
    }
    walk(deptTree.value, '')
    return { path, descendants }
  })

  const tableRef = ref()

  /** 内部人员：映射一行为统一结构（部门名取嵌套 department.name） */
  function mapInternal(u: any): CandidateRow {
    return {
      id: u.id,
      name: u.name || u.username || `用户${u.id}`,
      belong: u.department?.name ?? '',
      departmentId: u.departmentId ?? u.department?.id ?? undefined,
      account: u.username ?? null,
      // 内部人员表无身份证号字段
      idCard: null,
      phone: u.phone ?? null
    }
  }
  /**
   * 选中部门展开为查询参数：父节点连带其所有下级。
   * 选「宁波石油分公司」时期望筛出其下各科室的人，故把子树 ID 一并下发，
   * 服务端只做 `departmentId in (...)`，不必递归。
   */
  const departmentIdsParam = computed(() => {
    if (!filter.departmentIds.length) return undefined
    const ids = new Set<number>()
    filter.departmentIds.forEach((id) => {
      ids.add(id)
      deptIndex.value.descendants.get(id)?.forEach((sub) => ids.add(sub))
    })
    return Array.from(ids).join(',')
  })

  /** 归属展示：内部人员优先显示部门全路径，树未加载完或查不到时退回叶子名 */
  function belongText(row: CandidateRow) {
    if (row.departmentId) {
      const full = deptIndex.value.path.get(row.departmentId)
      if (full) return full
    }
    return row.belong || '-'
  }

  /** 外部考生：映射一行为统一结构（单位名取扁平 orgName，以手机号作登录账号） */
  function mapExternal(c: any): CandidateRow {
    return {
      id: c.id,
      name: c.name,
      belong: c.orgName ?? '',
      account: c.phone ?? null,
      idCard: c.idCard ?? null,
      phone: c.phone ?? null
    }
  }

  /** 按当前类型 + 筛选 + 分页查询候选表 */
  async function loadCandidates() {
    listLoading.value = true
    try {
      if (activeType.value === 'internal') {
        const { data } = await getUserList({
          keyword: filter.keyword || undefined,
          departmentIds: departmentIdsParam.value,
          page: page.value,
          pageSize: pageSize.value
        })
        rows.value = (data.list || []).map(mapInternal)
        total.value = data.pagination?.total ?? 0
      } else {
        const { data } = await getExternalCandidateList({
          name: filter.keyword || undefined,
          orgId: filter.orgId,
          status: 1,
          page: page.value,
          pageSize: pageSize.value
        })
        rows.value = (data.list || []).map(mapExternal)
        total.value = data.pagination?.total ?? 0
      }
      syncTableChecked()
    } catch (e: any) {
      ElMessage.error(e.message || '加载考生列表失败')
    } finally {
      listLoading.value = false
    }
  }

  /** 表格勾选态与 pickedMap 同步（翻页/切类型后回显已选行的勾选） */
  function syncTableChecked() {
    const t = tableRef.value
    if (!t) return
    // 等 DOM 渲染后再设置行选中。
    // 第 3 个参数 emitChange=false：程序性同步不得触发 select 事件，
    // 否则会与 handleSelect 形成回环，把「清空/移除/回填」静默撤销。
    requestAnimationFrame(() => {
      rows.value.forEach((r) => {
        const checked = pickedMap.has(keyOf(activeType.value, r.id))
        t.toggleRowSelection(r, checked, false)
      })
    })
  }

  /**
   * 勾选变化：以事件真实传入的选中数组为准判定该行是否被选中，
   * 不能反查 pickedMap 做「盲翻转」——那样会因程序性同步而反向撤销用户操作。
   */
  /**
   * 候选行 → 已选项。belong 存部门全路径而非叶子名，
   * 右侧已选区与提交后的回显才能区分各分公司下的同名科室。
   */
  function toPicked(row: CandidateRow): PickedCandidate {
    return {
      type: activeType.value,
      id: row.id,
      name: row.name,
      belong: belongText(row),
      account: row.account ?? null,
      idCard: row.idCard ?? null,
      phone: row.phone ?? null
    }
  }

  function handleSelect(sel: CandidateRow[], row: CandidateRow) {
    const k = keyOf(activeType.value, row.id)
    const isChecked = sel.some((r) => r.id === row.id)
    if (isChecked) {
      pickedMap.set(k, toPicked(row))
    } else {
      pickedMap.delete(k)
    }
  }

  /**
   * 点击整行切换勾选：这个表的唯一用途就是勾人，只让 44px 宽的复选框可点太苛刻。
   *
   * 两个关键点：
   * 1. 必须跳过 selection 列。点复选框时 ElTable 自身已翻转一次并触发 select，
   *    row-click 紧随其后再翻一次，净效果为零——复选框会变成点不动。
   * 2. 用 emitChange=true 让 ElTable 触发 select 事件，由 handleSelect 落库 pickedMap，
   *    而不是在这里直接写 pickedMap。否则勾选态与 pickedMap 各写一路，容易分叉。
   */
  function handleRowClick(row: CandidateRow, column?: TableColumnCtx<CandidateRow>) {
    if (column?.type === 'selection') return
    const t = tableRef.value
    if (!t) return
    const checked = pickedMap.has(keyOf(activeType.value, row.id))
    t.toggleRowSelection(row, !checked, true)
  }

  /** 当前页全选/取消全选 */
  function handleSelectAll(sel: CandidateRow[]) {
    if (sel.length > 0) {
      rows.value.forEach((r) => pickedMap.set(keyOf(activeType.value, r.id), toPicked(r)))
    } else {
      rows.value.forEach((r) => pickedMap.delete(keyOf(activeType.value, r.id)))
    }
  }

  // 服务端分页硬上限（base.service.ts 将 pageSize 夹在 1..100，超出静默截断）
  const MAX_PAGE_SIZE = 100
  // 批量拉取的页数上限，防止异常 total 导致无限请求
  const MAX_FETCH_PAGES = 100

  /** 全选「当前筛选结果」：按服务端上限逐页拉满全部匹配项后加入已选 */
  async function selectAllFiltered() {
    listLoading.value = true
    try {
      const all: CandidateRow[] = []
      let p = 1
      let totalCount = Infinity
      while (all.length < totalCount && p <= MAX_FETCH_PAGES) {
        if (activeType.value === 'internal') {
          const { data } = await getUserList({
            keyword: filter.keyword || undefined,
            departmentIds: departmentIdsParam.value,
            page: p,
            pageSize: MAX_PAGE_SIZE
          })
          const batch = (data.list || []).map(mapInternal)
          all.push(...batch)
          totalCount = data.pagination?.total ?? all.length
          if (batch.length === 0) break
        } else {
          const { data } = await getExternalCandidateList({
            name: filter.keyword || undefined,
            orgId: filter.orgId,
            status: 1,
            page: p,
            pageSize: MAX_PAGE_SIZE
          })
          const batch = (data.list || []).map(mapExternal)
          all.push(...batch)
          totalCount = data.pagination?.total ?? all.length
          if (batch.length === 0) break
        }
        p++
      }
      all.forEach((r) => pickedMap.set(keyOf(activeType.value, r.id), toPicked(r)))
      ElMessage.success(`已加入当前筛选的 ${all.length} 名考生`)
      syncTableChecked()
    } catch (e: any) {
      ElMessage.error(e.message || '批量选择失败')
    } finally {
      listLoading.value = false
    }
  }

  /** 从已选区移除单个 / 清空 */
  function removePicked(item: PickedCandidate) {
    pickedMap.delete(keyOf(item.type, item.id))
    syncTableChecked()
  }
  function clearPicked() {
    pickedMap.clear()
    syncTableChecked()
  }

  /** 切换考生类型：重置筛选与分页并重载 */
  function handleTypeChange() {
    void resetFilterAndReload()
  }
  /** 搜索/筛选变化：回第 1 页重载 */
  function handleFilterChange() {
    page.value = 1
    loadCandidates()
  }
  function handlePageChange(p: number) {
    page.value = p
    loadCandidates()
  }
  function handleSizeChange(s: number) {
    pageSize.value = s
    page.value = 1
    loadCandidates()
  }

  /** 重置筛选与分页并重载当前类型（含首次拉部门树/单位下拉） */
  async function resetFilterAndReload() {
    filter.keyword = ''
    filter.departmentIds = []
    filter.orgId = undefined
    page.value = 1
    // 部门树须先到位：勾选时会把部门全路径固化进已选区，树未加载完会存成叶子名。
    // 树只在首次打开拉一次（有 length 守卫），后续切换类型无额外等待。
    if (activeType.value === 'internal' && deptTree.value.length === 0) await loadDeptTree()
    if (activeType.value === 'external' && orgOptions.value.length === 0) loadOrgOptions()
    loadCandidates()
  }

  /** 部门树（内部人员筛选用） */
  async function loadDeptTree() {
    try {
      // 必须用 tree 接口：list 接口返回平铺分页数据，无 children，树选择器会退化成一层平铺
      const { data } = await getDepartmentTree()
      deptTree.value = (data || []) as DeptNode[]
    } catch {
      deptTree.value = []
    }
  }
  /** 单位下拉（外部考生筛选用，仅启用单位） */
  async function loadOrgOptions() {
    try {
      const { data } = await getExternalOrgList({ status: 1, pageSize: 999 })
      orgOptions.value = (data.list || []).map((o: any) => ({ id: o.id, name: o.name }))
    } catch {
      orgOptions.value = []
    }
  }
</script>

<style lang="scss" scoped>
  .picker-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;

    .footer-count {
      font-size: 13px;
      color: var(--el-text-color-regular);
    }
  }

  .picker-body {
    display: flex;
    gap: 16px;

    .picker-left {
      flex: 1;
      min-width: 0;

      /*
        筛选区容器：浅底 + 圆角把类型切换与搜索条收成一块，
        与表格的白底区分开，避免控件散浮在白底上。
      */
      .picker-filters {
        padding: 12px;
        margin-bottom: 12px;
        background: var(--el-fill-color-lighter);
        border-radius: 8px;

        .filter-bar {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;

          /* 最后一行不留下边距，否则容器底部会多出一截空白 */
          &:last-child {
            margin-bottom: 0;
          }
        }

        /*
          复用项目既有的胶囊页签，与考试详情/练习详情/练习列表三处保持一致。
          外层是 flex 列，mixin 里的 align-self: flex-start 生效，轨道按内容宽度靠左收窄。
        */
        .type-tabs {
          @include capsuleTabs(34px);

          /* 页签下方紧跟搜索条，10px 就够，不用 mixin 默认的 16px */
          :deep(.el-tabs__header) {
            margin-bottom: 10px;
          }

          /* 只借页签做切换，内容由下方表格承载；空 content 会白占一段高度 */
          :deep(.el-tabs__content) {
            display: none;
          }
        }

        /* 批量捷径推到行尾，与左侧筛选控件拉开 */
        .select-all-btn {
          margin-left: auto;
        }
      }

      /* 整行可点，用手型光标把这件事说出来，否则用户只会去找那个小复选框 */
      .candidate-table {
        :deep(.el-table__body tr) {
          cursor: pointer;
        }

        @include tableHeaderTip();
      }

      .picker-pager {
        justify-content: flex-end;
        margin-top: 10px;
      }
    }

    .picker-right {
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      width: 280px;
      border: 1px solid var(--el-border-color-lighter);
      border-radius: 8px;

      .right-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        font-size: 13px;
        color: var(--el-text-color-regular);
        border-bottom: 1px solid var(--el-border-color-lighter);
      }

      .right-list {
        flex: 1;
        height: 412px;
        padding: 6px;
        overflow-y: auto;

        .picked-item {
          display: flex;
          gap: 6px;
          align-items: center;
          padding: 5px 8px;
          border-radius: 6px;

          &:hover {
            background: var(--el-fill-color-light);
          }

          .picked-name {
            flex: 1;
            min-width: 0;
            overflow: hidden;
            font-size: 13px;
            text-overflow: ellipsis;
            white-space: nowrap;

            .picked-belong {
              color: var(--el-text-color-secondary);
            }
          }

          .picked-remove {
            color: var(--el-text-color-secondary);
            cursor: pointer;

            &:hover {
              color: var(--el-color-danger);
            }
          }
        }
      }
    }
  }
</style>
