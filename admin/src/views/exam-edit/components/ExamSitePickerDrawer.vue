<!--
  考点选择抽屉（单选）
  与试卷选择抽屉同构：服务端分页 + 关键词搜索，只列启用考点。
  下拉一次取不全（考点会随分公司/年份累积），且需同时看到地址与容量才能判断选哪个，故用抽屉。
  考点为线下考试选填项，抽屉底部提供「不使用考点」以清空已选。
-->
<template>
  <ElDrawer v-model="visible" title="选择考点" size="620px" :close-on-click-modal="false">
    <div class="site-picker">
      <div class="picker-filter">
        <ElInput
          v-model="keyword"
          placeholder="搜索考点名称或地址"
          clearable
          :prefix-icon="Search"
          @keyup.enter="reload"
          @clear="reload"
        />
      </div>

      <!-- 单选：整行可点，选中行高亮，避免用户只盯着窄窄的单选框点 -->
      <ElTable
        v-loading="loading"
        :data="rows"
        row-key="id"
        height="100%"
        highlight-current-row
        :current-row-key="picked?.id"
        class="picker-table"
        @current-change="handleCurrentChange"
      >
        <ElTableColumn width="46" align="center">
          <template #default="{ row }">
            <ElRadio :model-value="picked?.id" :value="row.id" @change="picked = row">
              <span class="radio-blank" />
            </ElRadio>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="name" label="考点名称" min-width="150" show-overflow-tooltip />
        <ElTableColumn prop="address" label="地址" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.address || '-' }}</template>
        </ElTableColumn>
        <ElTableColumn label="可容纳" width="110" align="center">
          <template #default="{ row }">
            <span v-if="!row.capacity" class="cap-unset">未设置</span>
            <span v-else :class="{ 'cap-over': candidateCount > row.capacity }">
              {{ row.capacity }} 人
            </span>
          </template>
        </ElTableColumn>
        <template #empty>{{ activeKeyword ? '无匹配考点' : '暂无启用考点' }}</template>
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

    <template #footer>
      <div class="picker-footer">
        <span class="footer-picked">{{ footerText }}</span>
        <span class="footer-btns">
          <ElButton v-if="picked" link type="danger" @click="picked = null">不使用考点</ElButton>
          <ElButton @click="visible = false">取消</ElButton>
          <ElButton type="primary" @click="handleConfirm">确定</ElButton>
        </span>
      </div>
    </template>
  </ElDrawer>
</template>

<script setup lang="ts">
  import { ref, computed, watch } from 'vue'
  import { Search } from '@element-plus/icons-vue'
  import { ElMessage } from 'element-plus'
  import { getExamSiteList } from '@/api/examSite'

  defineOptions({ name: 'ExamSitePickerDrawer' })

  /** 已选考点：父级用它回显名称与容量参照 */
  export interface PickedSite {
    id: number
    name: string
    address: string
    capacity: number | null
  }

  const props = defineProps<{
    /** 抽屉显隐 */
    modelValue: boolean
    /** 当前已选考点（打开时作为初始选中） */
    selected?: PickedSite | null
    /** 已选考生数，用于高亮容量不足的考点 */
    candidateCount?: number
  }>()

  const emit = defineEmits<{
    'update:modelValue': [boolean]
    /** 点确定时提交所选考点，null 表示不使用考点 */
    confirm: [PickedSite | null]
  }>()

  const visible = computed({
    get: () => props.modelValue,
    set: (v) => emit('update:modelValue', v)
  })

  const candidateCount = computed(() => props.candidateCount ?? 0)

  // 输入框实时值与已生效查询词分开：搜索靠 Enter/清空提交，
  // 否则用户打完字不回车就翻页，会拿「新词 + 旧页码」查出莫名的空页
  const keyword = ref('')
  const activeKeyword = ref('')
  const loading = ref(false)
  const rows = ref<PickedSite[]>([])
  const page = ref(1)
  const pageSize = 20
  const total = ref(0)
  /** 抽屉内的暂存选择，点确定才提交给父级 */
  const picked = ref<PickedSite | null>(null)
  // 请求序号：连续翻页时慢的旧请求可能后到并覆盖新页数据，只认最后一次
  let reqSeq = 0

  /** 底部已选说明，超容量时附带提示 */
  const footerText = computed(() => {
    if (!picked.value) return '不使用考点（线上考试）'
    const cap = picked.value.capacity
    const over = cap && candidateCount.value > cap
    return over
      ? `已选：${picked.value.name}（容量 ${cap} 人，当前已选 ${candidateCount.value} 人）`
      : `已选：${picked.value.name}`
  })

  /** 拉取当前页启用考点 */
  async function fetchList() {
    const seq = ++reqSeq
    loading.value = true
    try {
      const { data } = await getExamSiteList({
        keyword: activeKeyword.value || undefined,
        status: 1,
        page: page.value,
        pageSize
      })
      if (seq !== reqSeq) return
      rows.value = (data.list || []).map((s) => ({
        id: s.id,
        name: s.name,
        address: s.address ?? '',
        capacity: s.capacity ?? null
      }))
      total.value = data.pagination?.total ?? 0
    } catch (error: any) {
      // api 层统一关闭了 http 错误提示（showErrorMessage: false），提示由此处负责
      if (seq === reqSeq) ElMessage.error(error.message || '加载考点列表失败')
    } finally {
      if (seq === reqSeq) loading.value = false
    }
  }

  /** 整行点击选中；current-change 在清空当前行时会传 null，此时保留原选择 */
  function handleCurrentChange(row: PickedSite | null) {
    if (row) picked.value = row
  }

  /** 搜索：回到第一页重查 */
  function reload() {
    activeKeyword.value = keyword.value.trim()
    page.value = 1
    void fetchList()
  }

  /** 确定：允许提交 null（不使用考点），故不禁用按钮 */
  function handleConfirm() {
    emit('confirm', picked.value)
    visible.value = false
  }

  // 每次打开：以父级当前已选为初始态，并重置搜索与分页
  watch(visible, (open) => {
    if (!open) return
    picked.value = props.selected ? { ...props.selected } : null
    keyword.value = ''
    activeKeyword.value = ''
    page.value = 1
    void fetchList()
  })
</script>

<style lang="scss" scoped>
  // 抽屉 body 已是固定高度，用 flex 让表格吃掉剩余空间、分页贴底
  .site-picker {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 14px;

    .picker-filter {
      display: flex;
      flex-shrink: 0;
      gap: 10px;
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

  .cap-unset {
    color: var(--el-text-color-placeholder);
  }

  // 容量小于已选考生数时标红，选之前就能看出坐不下
  .cap-over {
    color: var(--el-color-danger);
  }

  // 单选框只作选中指示，label 文本清空后需去掉预留的右间距
  .radio-blank {
    display: none;
  }

  :deep(.el-radio__label) {
    padding-left: 0;
  }

  .picker-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;

    .footer-picked {
      overflow: hidden;
      font-size: 13px;
      color: var(--el-text-color-secondary);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .footer-btns {
      display: flex;
      flex-shrink: 0;
      gap: 12px;
    }
  }
</style>
