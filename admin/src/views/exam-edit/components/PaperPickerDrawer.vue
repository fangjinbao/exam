<!--
  试卷选择抽屉（单选）
  与题库选择抽屉同构：服务端分页 + 关键词搜索，只列已发布试卷。
  下拉一次最多取 100 条且无法按类型筛，试卷积累后取不全，故改抽屉。
  候选列表由后端按共享可见范围过滤，此处不做前端权限判断。
-->
<template>
  <ElDrawer v-model="visible" title="选择试卷" size="620px" :close-on-click-modal="false">
    <div class="paper-picker">
      <div class="picker-filter">
        <ElInput
          v-model="keyword"
          placeholder="搜索试卷名称"
          clearable
          :prefix-icon="Search"
          @keyup.enter="reload"
          @clear="reload"
        />
        <ElSelect
          v-model="type"
          placeholder="全部类型"
          clearable
          class="filter-type"
          @change="reload"
        >
          <ElOption label="固定试卷" value="fixed" />
          <ElOption label="随机试卷" value="random" />
        </ElSelect>
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
        <ElTableColumn prop="name" label="试卷名称" min-width="180" show-overflow-tooltip />
        <ElTableColumn label="类型" width="88" align="center">
          <template #default="{ row }">
            <ElTag
              :type="row.type === 'random' ? 'warning' : 'primary'"
              size="small"
              disable-transitions
            >
              {{ row.type === 'random' ? '随机' : '固定' }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="questionCount" label="题数" width="70" align="center" />
        <ElTableColumn prop="totalScore" label="总分" width="70" align="center" />
        <ElTableColumn prop="suggestDuration" label="建议时长" width="90" align="center">
          <template #default="{ row }">{{ row.suggestDuration }} 分钟</template>
        </ElTableColumn>
        <template #empty>{{ activeKeyword || type ? '无匹配试卷' : '暂无已发布试卷' }}</template>
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
        <span class="footer-picked">{{ picked ? `已选：${picked.name}` : '未选择试卷' }}</span>
        <span class="footer-btns">
          <ElButton @click="visible = false">取消</ElButton>
          <ElButton type="primary" :disabled="!picked" @click="handleConfirm">确定</ElButton>
        </span>
      </div>
    </template>
  </ElDrawer>
</template>

<script setup lang="ts">
  import { ref, computed, watch } from 'vue'
  import { Search } from '@element-plus/icons-vue'
  import { ElMessage } from 'element-plus'
  import { paperApi } from '@/api/paper'

  defineOptions({ name: 'PaperPickerDrawer' })

  /** 已选试卷：父级用它回显名称与总分/建议时长参照 */
  export interface PickedPaper {
    id: number
    name: string
    type: string
    totalScore: number
    suggestDuration: number
    questionCount?: number
  }

  const props = defineProps<{
    /** 抽屉显隐 */
    modelValue: boolean
    /** 当前已选试卷（打开时作为初始选中） */
    selected?: PickedPaper | null
  }>()

  const emit = defineEmits<{
    'update:modelValue': [boolean]
    /** 点确定时提交所选试卷 */
    confirm: [PickedPaper]
  }>()

  const visible = computed({
    get: () => props.modelValue,
    set: (v) => emit('update:modelValue', v)
  })

  // 输入框实时值与已生效查询词分开：搜索靠 Enter/清空提交，
  // 否则用户打完字不回车就翻页，会拿「新词 + 旧页码」查出莫名的空页
  const keyword = ref('')
  const activeKeyword = ref('')
  const type = ref('')
  const loading = ref(false)
  const rows = ref<PickedPaper[]>([])
  const page = ref(1)
  const pageSize = 20
  const total = ref(0)
  /** 抽屉内的暂存选择，点确定才提交给父级 */
  const picked = ref<PickedPaper | null>(null)
  // 请求序号：连续翻页时慢的旧请求可能后到并覆盖新页数据，只认最后一次
  let reqSeq = 0

  /** 拉取当前页已发布试卷（后端已按共享可见范围过滤） */
  async function fetchList() {
    const seq = ++reqSeq
    loading.value = true
    try {
      const { data } = await paperApi.getList({
        keyword: activeKeyword.value || undefined,
        type: type.value || undefined,
        status: 'published',
        page: page.value,
        pageSize
      })
      if (seq !== reqSeq) return
      rows.value = data.list.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        totalScore: p.totalScore,
        suggestDuration: p.suggestDuration,
        questionCount: p.questionCount
      }))
      total.value = data.pagination.total
    } catch (error: any) {
      // api 层统一关闭了 http 错误提示（showErrorMessage: false），提示由此处负责
      if (seq === reqSeq) ElMessage.error(error.message || '加载试卷列表失败')
    } finally {
      if (seq === reqSeq) loading.value = false
    }
  }

  /** 整行点击选中；current-change 在清空当前行时会传 null，此时保留原选择 */
  function handleCurrentChange(row: PickedPaper | null) {
    if (row) picked.value = row
  }

  /** 搜索或换类型：回到第一页重查 */
  function reload() {
    activeKeyword.value = keyword.value.trim()
    page.value = 1
    void fetchList()
  }

  function handleConfirm() {
    if (!picked.value) return
    emit('confirm', picked.value)
    visible.value = false
  }

  // 每次打开：以父级当前已选为初始态，并重置搜索与分页
  watch(visible, (open) => {
    if (!open) return
    picked.value = props.selected ? { ...props.selected } : null
    keyword.value = ''
    activeKeyword.value = ''
    type.value = ''
    page.value = 1
    void fetchList()
  })
</script>

<style lang="scss" scoped>
  // 抽屉 body 已是固定高度，用 flex 让表格吃掉剩余空间、分页贴底
  .paper-picker {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 14px;

    .picker-filter {
      display: flex;
      flex-shrink: 0;
      gap: 10px;

      .filter-type {
        width: 140px;
        flex-shrink: 0;
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
