<!-- 题目管理：某题库下题目的查询、增删改查与批量删除（SRS 3.5.1）
     只读共享题库（canManage=false）仅可查看，写操作按钮禁用 -->
<template>
  <div class="question-manage">
    <!-- 顶部：所属题库标题 + 返回 -->
    <ElCard shadow="never" class="filter-card">
      <div class="page-header">
        <div class="title-wrap">
          <ElButton link class="back-btn" :icon="ArrowLeft" @click="handleBack">返回</ElButton>
          <ElDivider direction="vertical" />
          <span class="bank-name">{{ bankName || '—' }}</span>
        </div>
      </div>
      <!-- 只读共享提示：仅当后端返回 canManage=false（题库以「可查看」级别共享给当前用户）时出现 -->
      <ElAlert
        v-if="canManage === false"
        class="readonly-alert"
        type="info"
        show-icon
        :closable="false"
        title="当前题库为只读共享，你只能查看题目，无法新增、编辑或删除"
      />
      <ElForm :model="filterForm" :inline="true" class="filter-form">
        <ElFormItem label="题干">
          <ElInput v-model="filterForm.keyword" placeholder="输入题干关键词" clearable class="filter-input" />
        </ElFormItem>
        <ElFormItem label="题型">
          <ElSelect v-model="filterForm.type" placeholder="全部" clearable class="filter-select">
            <ElOption v-for="it in typeOptions" :key="it.value" :label="it.name" :value="it.value" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="难度">
          <ElSelect v-model="filterForm.difficulty" placeholder="全部" clearable class="filter-select">
            <ElOption v-for="it in difficultyOptions" :key="it.value" :label="it.name" :value="it.value" />
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
        <!-- 写操作按钮统一按 canManage 禁用；用 span 包裹是因为禁用态的 ElButton 不派发鼠标事件，ElTooltip 需靠外层元素触发 -->
        <ElTooltip :disabled="canManage !== false" :content="readonlyTip" placement="top">
          <span>
            <ElButton
              v-auth="'add'"
              type="primary"
              :icon="Plus"
              :disabled="canManage === false"
              @click="handleAdd"
            >
              新增题目
            </ElButton>
          </span>
        </ElTooltip>
        <ElTooltip :disabled="canManage !== false" :content="readonlyTip" placement="top">
          <span>
            <ElButton
              v-auth="'import'"
              type="info"
              plain
              :icon="Upload"
              :disabled="canManage === false"
              @click="importVisible = true"
            >
              导入
            </ElButton>
          </span>
        </ElTooltip>
        <ElButton
          v-auth="'export'"
          type="info"
          plain
          :icon="Download"
          :loading="exporting"
          @click="handleExport"
        >
          导出
        </ElButton>
        <ElTooltip :disabled="canManage !== false" :content="readonlyTip" placement="top">
          <span>
            <!-- 未选中时保持中性灰，选中后才转为 danger 提示破坏性 -->
            <ElButton
              v-auth="'batch-delete'"
              :type="selectedIds.length ? 'danger' : 'info'"
              plain
              :icon="Delete"
              :disabled="canManage === false || !selectedIds.length"
              @click="handleBatchDelete"
            >
              批量删除{{ selectedIds.length ? `(${selectedIds.length})` : '' }}
            </ElButton>
          </span>
        </ElTooltip>
      </div>

      <div class="table-container">
        <ElTable
          v-loading="loading"
          :data="tableData"
          height="100%"
          style="width: 100%"
          @selection-change="handleSelectionChange"
        >
          <ElTableColumn type="selection" width="50" align="center" fixed="left" />
          <!-- 题干含富文本，列表按纯文本展示，否则单元格里会出现 <p>/<img> 标签 -->
          <ElTableColumn prop="stem" label="题干" min-width="240" show-overflow-tooltip fixed="left">
            <template #default="{ row }">
              <span>{{ row.stemText || htmlToText(row.stem) }}</span>
              <ElTag v-if="row.type === 'composite'" size="small" type="info" class="stem-tag">
                共 {{ row.childrenCount ?? 0 }} 小问
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn label="题型" width="100" align="center">
            <template #default="{ row }">{{ dictLabel(typeOptions, row.type) }}</template>
          </ElTableColumn>
          <ElTableColumn label="难度" width="90" align="center">
            <template #default="{ row }">
              <ElTag :type="difficultyTagType(row.difficulty)" size="small" disable-transitions>
                {{ dictLabel(difficultyOptions, row.difficulty) }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="knowledgePointNames" label="知识点" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">{{ row.knowledgePointNames || '—' }}</template>
          </ElTableColumn>
          <ElTableColumn prop="suggestedScore" label="分值" width="90" align="center" />
          <ElTableColumn prop="createTime" label="创建时间" width="170" />
          <ElTableColumn label="操作" width="190" align="left" fixed="right" class-name="table-actions">
            <template #default="{ row }">
              <ElButton link type="primary" @click="handleDetail(row)">详情</ElButton>
              <ElTooltip :disabled="canManage !== false" :content="readonlyTip" placement="top">
                <span>
                  <ElButton
                    v-auth="'update'"
                    link
                    type="primary"
                    :disabled="canManage === false"
                    @click="handleEdit(row)"
                  >
                    编辑
                  </ElButton>
                </span>
              </ElTooltip>
              <ElTooltip :disabled="canManage !== false" :content="readonlyTip" placement="top">
                <span>
                  <ElButton
                    v-auth="'delete'"
                    link
                    type="danger"
                    :disabled="canManage === false"
                    @click="handleDelete(row)"
                  >
                    删除
                  </ElButton>
                </span>
              </ElTooltip>
            </template>
          </ElTableColumn>
          <template #empty>暂无题目数据</template>
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
    <!-- 新增/编辑对话框 -->
    <ElDrawer
      v-model="dialogVisible"
      :title="dialogTitle"
      size="680px"
      class="question-form-drawer"
      @closed="resetForm"
    >
      <!--
        :validate-on-rule-change="false" 是必需的，不是可选优化。

        formRules 是 computed（题型不同则必填项不同，见 formRules 定义），
        切换题型会重算出一个新的 rules 对象。而 ElForm 的 validate-on-rule-change
        默认 true：规则一变就自动跑全量校验，于是刚打开的空表单会立刻满屏红字。
        提交时的校验走 formRef.validate()，不受这个开关影响。
      -->
      <ElForm
        ref="formRef"
        :model="form"
        :rules="formRules"
        :validate-on-rule-change="false"
        label-width="90px"
      >
        <ElFormItem label="题型" prop="type">
          <ElSelect v-model="form.type" placeholder="请选择题型" style="width: 100%">
            <ElOption v-for="it in typeOptions" :key="it.value" :label="it.name" :value="it.value" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem :label="questionKind === 'composite' ? '材料' : '题干'" prop="stem">
          <div class="stem-wrap">
            <ArtRichEditor
              v-model="form.stem"
              :placeholder="stemPlaceholder"
              :min-height="questionKind === 'composite' ? 120 : 100"
            />
            <div v-if="questionKind === 'blank'" class="stem-hint">
              用连续下划线（≥3 个，如 ___）标出每一个空；已识别到 {{ blankCount }} 个空
            </div>
            <div v-else-if="questionKind === 'composite'" class="stem-hint">
              材料为该材料题下所有小题共用；小题各自的题干在下方逐个填写
            </div>
          </div>
        </ElFormItem>
        <!-- 材料题：维护其下小题（允许混合题型），材料题自身无选项无答案 -->
        <ElFormItem v-if="questionKind === 'composite'" label="小题" required>
          <CompositeChildren v-model="childList" :type-options="typeOptions" />
        </ElFormItem>
        <!-- 单选/多选：动态选项 + 直接勾选正确答案 -->
        <ElFormItem v-else-if="questionKind === 'choice'" label="选项" required>
          <ElRadioGroup
            v-if="form.type === 'single'"
            v-model="singleAnswer"
            class="option-editor"
          >
            <div v-for="(opt, idx) in optionList" :key="opt.id" class="option-row">
              <span class="option-label">{{ optionLabel(idx) }}</span>
              <ElInput
                v-model="opt.content"
                :placeholder="`选项 ${optionLabel(idx)} 内容`"
                maxlength="500"
                class="option-input"
              />
              <ElRadio :value="idx" class="option-mark">正确答案</ElRadio>
              <ElButton
                link
                type="danger"
                :icon="Delete"
                :disabled="optionList.length <= 2"
                @click="removeOption(idx)"
              />
            </div>
            <ElButton
              link
              type="primary"
              :icon="Plus"
              :disabled="optionList.length >= 8"
              @click="addOption"
            >
              添加选项
            </ElButton>
          </ElRadioGroup>
          <div v-else class="option-editor">
            <div v-for="(opt, idx) in optionList" :key="opt.id" class="option-row">
              <span class="option-label">{{ optionLabel(idx) }}</span>
              <ElInput
                v-model="opt.content"
                :placeholder="`选项 ${optionLabel(idx)} 内容`"
                maxlength="500"
                class="option-input"
              />
              <ElCheckbox
                :model-value="multipleAnswer.includes(idx)"
                class="option-mark"
                @change="toggleMultiple(idx)"
              >
                正确答案
              </ElCheckbox>
              <ElButton
                link
                type="danger"
                :icon="Delete"
                :disabled="optionList.length <= 2"
                @click="removeOption(idx)"
              />
            </div>
            <ElButton
              link
              type="primary"
              :icon="Plus"
              :disabled="optionList.length >= 8"
              @click="addOption"
            >
              添加选项
            </ElButton>
          </div>
        </ElFormItem>
        <!-- 判断题：固定正确/错误 -->
        <ElFormItem v-else-if="questionKind === 'judge'" label="答案" required>
          <ElRadioGroup v-model="judgeAnswer">
            <ElRadio value="正确">正确</ElRadio>
            <ElRadio value="错误">错误</ElRadio>
          </ElRadioGroup>
        </ElFormItem>
        <!-- 填空题：按题干空位顺序逐空填写答案 -->
        <ElFormItem v-else-if="questionKind === 'blank'" label="填空答案" required>
          <div v-if="blankCount > 0" class="blank-editor">
            <div v-for="(_, idx) in blankAnswers" :key="idx" class="blank-row">
              <span class="blank-label">第 {{ idx + 1 }} 空</span>
              <ElInput
                v-model="blankAnswers[idx]"
                :placeholder="`第 ${idx + 1} 空的标准答案`"
                maxlength="200"
                class="blank-input"
              />
            </div>
          </div>
          <div v-else class="blank-empty-hint">请先在题干中用连续下划线（如 ___）标出空位</div>
        </ElFormItem>
        <!-- 问答/论述：文本答案 -->
        <ElFormItem v-else-if="questionKind === 'text'" label="标准答案" required>
          <ElInput
            v-model="form.answer"
            type="textarea"
            :rows="3"
            placeholder="请输入标准答案"
            maxlength="2000"
            show-word-limit
          />
        </ElFormItem>
        <ElFormItem label="答案解析" prop="analysis">
          <!-- 解析是选填项，工具栏聚焦时再出现，减少表单的视觉噪音 -->
          <ArtRichEditor
            v-model="form.analysis"
            compact
            placeholder="请输入答案解析（选填），可插入图片"
            :min-height="80"
          />
        </ElFormItem>
        <!-- 难度仅 3 个选项，平铺省去「展开-点选」两步；选中色沿用表格 tag 的语义色，避免同字段两套配色 -->
        <ElFormItem label="难度" prop="difficulty">
          <ElRadioGroup v-model="form.difficulty" class="difficulty-group">
            <ElRadio
              v-for="it in difficultyOptions"
              :key="it.value"
              :value="it.value"
              border
              :class="`is-${difficultyTagType(it.value)}`"
            >
              {{ it.name }}
            </ElRadio>
          </ElRadioGroup>
          <!-- 字典与列表并发加载，字典慢一步时按钮渲染不出，占位说明避免误读成「漏选」 -->
          <span v-if="!difficultyOptions.length" class="difficulty-loading">加载中…</span>
        </ElFormItem>
        <ElFormItem label="知识点" prop="knowledgePointIds">
          <ElTreeSelect
            v-model="form.knowledgePointIds"
            :data="knowledgeTree"
            node-key="id"
            :props="{ label: 'name', children: 'children' }"
            multiple
            check-strictly
            show-checkbox
            collapse-tags
            collapse-tags-tooltip
            clearable
            :render-after-expand="false"
            placeholder="请选择知识点（可多选，选填）"
            style="width: 100%"
          />
        </ElFormItem>
        <!-- 材料题分值 = 各小题之和，由后端派生，故不提供输入 -->
        <ElFormItem v-if="questionKind !== 'composite'" label="分值" prop="suggestedScore">
          <ElInputNumber
            v-model="form.suggestedScore"
            :min="0.01"
            :step="1"
            :precision="2"
            controls-position="right"
            placeholder="请输入分值"
            style="width: 100%"
          />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <div class="drawer-footer">
          <ElButton @click="dialogVisible = false">取消</ElButton>
          <ElButton type="primary" :loading="submitLoading" @click="handleSubmit">确定</ElButton>
        </div>
      </template>
    </ElDrawer>

    <!-- 详情抽屉：按考生答题版式预览，标准答案高亮 -->
    <ElDrawer v-model="detailVisible" title="题目预览" size="600px" destroy-on-close>
      <QuestionPreview
        :data="detailData"
        :type-options="typeOptions"
        :difficulty-options="difficultyOptions"
      />
    </ElDrawer>

    <!-- 批量导入对话框（导入到当前题库） -->
    <ImportDialog
      v-if="bankId"
      v-model="importVisible"
      :bank-id="bankId"
      :bank-name="bankName"
      :type-options="typeOptions"
      :difficulty-options="difficultyOptions"
      @success="loadList"
    />
  </div>
</template>
<script setup lang="ts">
  import { ref, reactive, computed, watch, onMounted } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
  import { ArrowLeft, Search, Plus, Delete, Upload, Download } from '@element-plus/icons-vue'
  import { questionApi, type Question, type QuestionPayload } from '@/api/question'
  import { questionBankApi } from '@/api/questionBank'
  import { getDictData, type DictDataItem } from '@/api/dataDict'
  import { knowledgePointApi, type KnowledgePoint } from '@/api/knowledgePoint'
  import { exportToExcel, type ExcelColumn } from '@/utils/excel'
  import ImportDialog from './components/ImportDialog.vue'
  import QuestionPreview from './components/QuestionPreview.vue'
  import CompositeChildren from './components/CompositeChildren.vue'
  import type { CompositeChild } from './components/types'
  import { stripHtml, isRichTextEmpty } from '@/utils/richText'
  import ArtRichEditor from '@/components/core/forms/art-rich-editor/index.vue'

  defineOptions({ name: 'QuestionBankQuestions' })

  const route = useRoute()
  const router = useRouter()

  // 所属题库：从 query 带入（进入题库时传 bankId + name）
  const bankId = computed(() => {
    const v = Number(route.query.bankId)
    return Number.isFinite(v) && v > 0 ? v : undefined
  })
  const bankName = computed(() => (route.query.name as string) || '')

  // 当前用户对该题库是否可管理（含题目增删改）。默认 true：详情未返回前不禁用按钮，避免闪烁误禁用
  const canManage = ref(true)
  const readonlyTip = '该题库为只读共享，无权修改题目'

  /**
   * 拉取题库详情以获取 canManage。
   * bankId 为空时（页面被直接打开）不请求、保持默认可操作，与原有行为一致；
   * 请求失败同样保持可操作，最终写操作仍由后端 403 兜底。
   */
  const loadBankPermission = async () => {
    if (!bankId.value) return
    try {
      const { data } = await questionBankApi.detail(bankId.value)
      canManage.value = data?.canManage !== false
    } catch {
      canManage.value = true
    }
  }

  const loading = ref(false)
  const tableData = ref<Question[]>([])
  const selectedIds = ref<number[]>([])

  // 字典下拉数据
  const typeOptions = ref<DictDataItem[]>([])
  const difficultyOptions = ref<DictDataItem[]>([])
  // 知识点树（选择器）
  const knowledgeTree = ref<KnowledgePoint[]>([])

  const filterForm = reactive<{
    keyword: string
    type: string
    difficulty: string
  }>({ keyword: '', type: '', difficulty: '' })

  const pagination = reactive({ page: 1, pageSize: 10, total: 0 })

  // 弹窗状态
  const dialogVisible = ref(false)
  const isEditing = ref(false)
  const dialogTitle = computed(() => (isEditing.value ? '编辑题目' : '新增题目'))
  const submitLoading = ref(false)
  const detailVisible = ref(false)
  const detailData = ref<Question | null>(null)
  // 导入对话框显隐与导出 loading
  const importVisible = ref(false)
  const exporting = ref(false)

  const formRef = ref<FormInstance>()
  const createForm = (): QuestionPayload & { id?: number } => ({
    id: undefined,
    stem: '',
    type: '',
    options: '',
    answer: '',
    analysis: '',
    difficulty: '',
    knowledgePointIds: [],
    suggestedScore: undefined as unknown as number
  })
  const form = reactive<QuestionPayload & { id?: number }>(createForm())

  // 选择题动态选项与答案（choice 用 optionList + single/multipleAnswer；judge 用 judgeAnswer）
  // 每项带稳定 id 作 v-for key，避免 splice 删除中间项后输入框焦点错位
  let optionUid = 0
  const makeOption = (content = ''): { id: number; content: string } => ({ id: ++optionUid, content })
  const optionList = ref<{ id: number; content: string }[]>([makeOption(), makeOption()])
  const singleAnswer = ref<number | undefined>(undefined) // 单选：正确选项索引
  const multipleAnswer = ref<number[]>([]) // 多选：正确选项索引集合
  const judgeAnswer = ref<string>('') // 判断题：正确/错误
  const blankAnswers = ref<string[]>([]) // 填空题：按空位顺序的各空答案
  // 材料题：其下小题列表。既有小题带 id（后端原地更新以保住作答记录），新增的不带
  const childList = ref<CompositeChild[]>([])

  /**
   * 题型分类：
   * - none：尚未选择题型，不展示任何答案编辑区
   * - choice：单选/多选，动态选项 + 勾选答案
   * - judge：判断题，固定正确/错误
   * - blank：填空题，题干挖空 + 按空位顺序的多空答案
   * - text：问答/论述，纯文本答案
   */
  const questionKind = computed<'none' | 'choice' | 'judge' | 'blank' | 'text' | 'composite'>(
    () => {
      if (!form.type) return 'none'
      if (form.type === 'single' || form.type === 'multiple') return 'choice'
      if (form.type === 'judge') return 'judge'
      if (form.type === 'blank') return 'blank'
      // 材料题：题干存共享材料，自身无选项无答案，作答位由其小题产生
      if (form.type === 'composite') return 'composite'
      return 'text'
    }
  )

  /** 题干输入框的占位文案（按题型给出对应提示） */
  const stemPlaceholder = computed(() => {
    if (questionKind.value === 'blank') {
      return '请输入题干，用连续下划线（如 ___）表示每一个空'
    }
    if (questionKind.value === 'composite') {
      return '请输入所有小题共用的材料，可插入图片与表格'
    }
    return '请输入题干，可插入图片与表格'
  })

  /** 填空题空位标记：连续 ≥3 个下划线记为一个空 */
  const BLANK_MARKER_REGEX = /_{3,}/g

  /**
   * 把富文本 HTML 转为纯文本（用于数空位、生成摘要、判空）
   *
   * 复用 utils/richText 的实现：它用 DOMParser 而非 innerHTML 赋值——
   * innerHTML 虽不执行 script，但会触发 <img onerror> 去真实加载资源。
   */
  const htmlToText = stripHtml

  /** 题干中的填空空位数（随题干实时变化，按纯文本统计） */
  const blankCount = computed(() => (htmlToText(form.stem).match(BLANK_MARKER_REGEX) || []).length)

  /** 把 blankAnswers 数组长度同步为当前题干空位数（保留已填内容，多删少补） */
  function syncBlankAnswers() {
    const count = blankCount.value
    const next = blankAnswers.value.slice(0, count)
    while (next.length < count) next.push('')
    blankAnswers.value = next
  }

  // 填空题：题干空位数或题型变化时同步答案框数量。
  // 同时监听 form.type，覆盖「先写带下划线的题干、后切到填空题」的场景
  // （此时 blankCount 值未变、仅 type 变，只 watch blankCount 不会触发）。
  watch([blankCount, () => form.type], () => {
    if (form.type !== 'blank') return
    syncBlankAnswers()
  })

  /*
   * 切题型时清掉旧的校验红字。
   *
   * 不同题型的必填项不同（如答案、分值），上一次提交失败留下的提示
   * 会残留在切换后已经不适用的字段上。nextTick 是为了等条件渲染的
   * ElFormItem 换完再清，否则清的是旧的那批。
   */
  watch(
    () => form.type,
    async () => {
      await nextTick()
      formRef.value?.clearValidate()
    }
  )

  /** 选项索引 → 字母标签（0→A, 1→B …） */
  function optionLabel(idx: number): string {
    return String.fromCharCode(65 + idx)
  }

  /** 新增一个空选项（上限 8） */
  function addOption() {
    if (optionList.value.length >= 8) return
    optionList.value.push(makeOption())
  }

  /** 删除选项并同步维护答案索引（下限 2） */
  function removeOption(idx: number) {
    if (optionList.value.length <= 2) return
    optionList.value.splice(idx, 1)
    // 单选：清除或前移答案索引
    if (singleAnswer.value === idx) singleAnswer.value = undefined
    else if (singleAnswer.value !== undefined && singleAnswer.value > idx) singleAnswer.value -= 1
    // 多选：移除该索引并将更大的索引前移
    multipleAnswer.value = multipleAnswer.value
      .filter((i) => i !== idx)
      .map((i) => (i > idx ? i - 1 : i))
  }

  /** 多选答案勾选切换 */
  function toggleMultiple(idx: number) {
    const set = new Set(multipleAnswer.value)
    if (set.has(idx)) set.delete(idx)
    else set.add(idx)
    multipleAnswer.value = Array.from(set).sort((a, b) => a - b)
  }

  const formRules = computed<FormRules>(() => ({
    type: [{ required: true, message: '请选择题型', trigger: 'change' }],
    stem: [
      {
        required: true,
        // 用一个不会被交互触发的 trigger：富文本没有可靠的 blur 时机，
        // 挂 change 会在编辑过程中反复弹红字（清空重写时尤其烦人）。
        // ElFormItem 只按 trigger 决定何时自动校验，而 formRef.validate()
        // 会跑全部规则，所以提交时的必填校验不受影响。
        trigger: 'submit',
        validator: (_rule, value, callback) => {
          // 题干是富文本：空内容可能是 '' 也可能是 '<p></p>'，直接判空串会漏掉后者。
          // isRichTextEmpty 会把「只有图片没有文字」视为非空——纯图片题干是合法的。
          if (isRichTextEmpty(String(value ?? ''))) {
            return callback(
              new Error(questionKind.value === 'composite' ? '请输入材料内容' : '请输入题干')
            )
          }
          callback()
        }
      }
    ],
    difficulty: [{ required: true, message: '请选择难度', trigger: 'change' }],
    // 知识点非必填（多选）
    suggestedScore: [
      {
        // 材料题分值由小题之和派生，不参与校验
        required: questionKind.value !== 'composite',
        trigger: 'change',
        validator: (_rule, value, callback) => {
          if (questionKind.value === 'composite') return callback()
          if (value === undefined || value === null)
            return callback(new Error('请输入分值'))
          if (typeof value !== 'number' || Number.isNaN(value) || value <= 0)
            return callback(new Error('分值必须大于 0'))
          callback()
        }
      }
    ]
  }))

  /** 由字典 value 取显示名 */
  function dictLabel(opts: DictDataItem[], value?: string | null): string {
    if (!value) return '—'
    return opts.find((o) => o.value === value)?.name ?? value
  }

  /** 难度标签色 */
  function difficultyTagType(value: string): 'success' | 'warning' | 'danger' | 'info' {
    return value === 'easy' ? 'success' : value === 'medium' ? 'warning' : value === 'hard' ? 'danger' : 'info'
  }

  // 导出列定义（题型/难度后端已转中文名称）
  const EXPORT_COLUMNS: ExcelColumn<Record<string, any>>[] = [
    { header: '题干', field: 'stem' },
    { header: '题型', field: 'typeName' },
    { header: '选项', field: 'options' },
    { header: '标准答案', field: 'answer' },
    { header: '答案解析', field: 'analysis' },
    { header: '难度', field: 'difficultyName' },
    { header: '分值', field: 'suggestedScore' },
    { header: '知识点', field: 'knowledgePointNames' }
  ]

  /** 导出：拉取当前题库全部题目，前端生成 xlsx 下载 */
  async function handleExport() {
    if (!bankId.value) {
      ElMessage.warning('未指定题库，无法导出')
      return
    }
    exporting.value = true
    try {
      const { data } = await questionApi.export(bankId.value)
      if (!data.length) {
        ElMessage.warning('当前题库暂无题目可导出')
        return
      }
      exportToExcel(EXPORT_COLUMNS, data, `${bankName.value || '题目'}_${Date.now()}`, '题目')
      ElMessage.success(`已导出 ${data.length} 道题目`)
    } catch (error: any) {
      ElMessage.error(error.message || '导出失败')
    } finally {
      exporting.value = false
    }
  }

  /** 加载题型/难度字典（仅启用项） */
  async function loadDict() {
    try {
      const { data } = await getDictData(['question_type', 'difficulty'])
      typeOptions.value = (data.question_type ?? []).filter((i) => i.status === 1)
      difficultyOptions.value = (data.difficulty ?? []).filter((i) => i.status === 1)
    } catch (error: any) {
      ElMessage.error(error.message || '加载字典失败')
    }
  }

  /** 加载知识点树 */
  async function loadKnowledgeTree() {
    try {
      const { data } = await knowledgePointApi.getTree()
      knowledgeTree.value = data || []
    } catch {
      knowledgeTree.value = []
    }
  }

  /** 加载题目列表（按当前题库过滤） */
  async function loadList() {
    loading.value = true
    try {
      const { data } = await questionApi.getList({
        questionBankId: bankId.value,
        keyword: filterForm.keyword || undefined,
        type: filterForm.type || undefined,
        difficulty: filterForm.difficulty || undefined,
        page: pagination.page,
        pageSize: pagination.pageSize
      })
      tableData.value = data.list
      pagination.total = data.pagination.total
    } catch (error: any) {
      ElMessage.error(error.message || '加载题目列表失败')
    } finally {
      loading.value = false
    }
  }

  function handleBack() {
    router.push({ path: '/question-bank/list' })
  }

  function handleSearch() {
    pagination.page = 1
    loadList()
  }

  function handleReset() {
    filterForm.keyword = ''
    filterForm.type = ''
    filterForm.difficulty = ''
    pagination.page = 1
    loadList()
  }

  function handleSizeChange() {
    pagination.page = 1
    loadList()
  }

  function handleSelectionChange(rows: Question[]) {
    selectedIds.value = rows.map((r) => r.id)
  }

  function handleAdd() {
    isEditing.value = false
    form.type = 'single' // 新增默认选中单选题
    dialogVisible.value = true
  }

  /** 解析已存选项文本为选项内容数组（去掉「A. 」前缀） */
  function parseOptions(text?: string | null): string[] {
    if (!text) return []
    return text
      .split('\n')
      .map((line) => line.replace(/^\s*[A-Za-z]\s*[.．、:：]\s*/, '').trim())
      .filter((line) => line.length > 0)
  }

  /**
   * 答案字母 → 选项索引数组（去重、按出现顺序）。
   * 直接提取所有 A-Z 字母，兼容历史自由文本的各种写法：
   * "A,C" / "A，C" / "A、C" / "AC" / "A C" 均可正确回填。
   */
  function answerLettersToIndexes(answer?: string | null): number[] {
    if (!answer) return []
    const letters = answer.toUpperCase().match(/[A-Z]/g) ?? []
    const seen = new Set<number>()
    const result: number[] = []
    for (const ch of letters) {
      const idx = ch.charCodeAt(0) - 65
      if (!seen.has(idx)) {
        seen.add(idx)
        result.push(idx)
      }
    }
    return result
  }

  async function handleEdit(row: Question) {
    isEditing.value = true
    resetOptionState()
    Object.assign(form, {
      id: row.id,
      stem: row.stem,
      type: row.type,
      options: row.options ?? '',
      answer: row.answer,
      analysis: row.analysis ?? '',
      difficulty: row.difficulty,
      knowledgePointIds: Array.isArray(row.knowledgePointIds) ? [...row.knowledgePointIds] : [],
      suggestedScore: row.suggestedScore ?? undefined
    })
    // 按题型回填结构化编辑器
    if (row.type === 'single' || row.type === 'multiple') {
      // 保留已解析出的选项内容，不足 2 条时补齐空选项（避免历史脏数据整体丢弃原内容）
      const contents = parseOptions(row.options)
      const opts = contents.map((c) => makeOption(c))
      while (opts.length < 2) opts.push(makeOption())
      optionList.value = opts
      // 过滤越界字母索引（历史脏数据里答案字母可能超出实际选项数量，如只有 A/B/C 却存了 D）
      const idxes = answerLettersToIndexes(row.answer).filter((i) => i < opts.length)
      if (row.type === 'single') singleAnswer.value = idxes[0]
      else multipleAnswer.value = idxes
    } else if (row.type === 'judge') {
      judgeAnswer.value = row.answer === '正确' || row.answer === '错误' ? row.answer : ''
    } else if (row.type === 'blank') {
      // 按空位顺序回填各空答案（旧数据可能为单行文本，按空位数补齐）
      const stored = (row.answer ?? '').split('\n').map((s) => s.trim())
      const count = (row.stem.match(BLANK_MARKER_REGEX) || []).length
      const answers = stored.slice(0, count || stored.length)
      while (count && answers.length < count) answers.push('')
      blankAnswers.value = answers
    } else if (row.type === 'composite') {
      // 材料题的小题只在详情接口带出（列表行不含 children），需单独取一次
      try {
        const { data } = await questionApi.getDetail(row.id)
        childList.value = (data?.children ?? []).map((c: any) => ({
          id: c.id,
          type: c.type,
          stem: c.stem ?? '',
          options: parseChildOptions(c.options, c.type),
          answer: c.answer ?? '',
          analysis: c.analysis ?? '',
          difficulty: c.difficulty || row.difficulty,
          suggestedScore: c.suggestedScore ?? 5
        }))
      } catch (error: any) {
        ElMessage.error(error.message || '加载小题失败')
        return
      }
    }
    dialogVisible.value = true
  }

  /**
   * 解析小题选项为 { key, value } 列表（兼容新 JSON 与旧「一行一个」两种存法）
   *
   * 与后端 parseQuestionOptions 同口径：首字符为 [ 时按 JSON 解析并带失败回退，
   * 否则按行解析。历史脏数据可能有 `[A] 内容` 这类方括号前缀，
   * 直接 JSON.parse 会抛错，故必须兜住。
   *
   * @param raw 库中存储的 options 原文
   * @param type 小题题型
   */
  function parseChildOptions(raw: string | null | undefined, type: string) {
    if (!raw) return []
    if (type === 'judge') {
      return [
        { key: '正确', value: '正确' },
        { key: '错误', value: '错误' }
      ]
    }
    const trimmed = raw.trim()
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) {
          const ok = parsed.every((o) => o && typeof o.key === 'string')
          if (ok) {
            return parsed.map((o: any) => ({
              key: o.key,
              value: stripHtml(String(o.value ?? ''))
            }))
          }
        }
      } catch {
        // 落回旧格式解析
      }
    }
    return trimmed
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, i) => {
        const matched = /^([A-Za-z])\s*[.、．)）:：]\s*(.*)$/.exec(line)
        if (!matched) return { key: String.fromCharCode(65 + i), value: stripHtml(line) }
        return { key: matched[1].toUpperCase(), value: stripHtml(matched[2].trim()) }
      })
  }

  async function handleDetail(row: Question) {
    try {
      const { data } = await questionApi.getDetail(row.id)
      detailData.value = data
      detailVisible.value = true
    } catch (error: any) {
      ElMessage.error(error.message || '加载详情失败')
    }
  }

  async function handleDelete(row: Question) {
    try {
      await ElMessageBox.confirm('确定删除该题目吗？', '提示', { type: 'warning' })
      await questionApi.delete(row.id)
      ElMessage.success('删除题目成功')
      if (tableData.value.length === 1 && pagination.page > 1) pagination.page -= 1
      loadList()
    } catch (error: any) {
      if (error !== 'cancel') ElMessage.error(error.message || '删除失败')
    }
  }

  async function handleBatchDelete() {
    if (!selectedIds.value.length) return
    try {
      const count = selectedIds.value.length
      await ElMessageBox.confirm(`确定要删除选中的 ${count} 道题目吗？`, '提示', { type: 'warning' })
      await questionApi.batchDelete(selectedIds.value)
      ElMessage.success(`已删除 ${count} 道题目`)
      if (tableData.value.length === count && pagination.page > 1) pagination.page -= 1
      selectedIds.value = []
      loadList()
    } catch (error: any) {
      if (error !== 'cancel') ElMessage.error(error.message || '批量删除失败')
    }
  }

  /**
   * 按题型组装 options/answer 文本并校验：
   * - choice：选项非空、单选选一项/多选至少一项，options 存「A. 内容」多行，answer 存字母（A 或 A,C）
   * - judge：answer 为 正确/错误，options 存「正确\n错误」满足后端客观题选项非空约束
   * - text：answer 为文本，options 置空（后端 blank 视为客观题但此处 blank 归 text，用答案兜底选项非空）
   * @returns { options, answer } 或 null（校验不通过，已弹提示）
   */
  function buildOptionsAndAnswer(): { options?: string; answer: string } | null {
    if (questionKind.value === 'choice') {
      const contents = optionList.value.map((o) => o.content.trim())
      if (contents.some((c) => !c)) {
        ElMessage.warning('选项内容不能为空')
        return null
      }
      const options = contents.map((c, i) => `${optionLabel(i)}. ${c}`).join('\n')
      if (form.type === 'single') {
        if (singleAnswer.value === undefined) {
          ElMessage.warning('请勾选正确答案')
          return null
        }
        return { options, answer: optionLabel(singleAnswer.value) }
      }
      // multiple
      if (!multipleAnswer.value.length) {
        ElMessage.warning('多选题请至少勾选一个正确答案')
        return null
      }
      return { options, answer: multipleAnswer.value.map((i) => optionLabel(i)).join(',') }
    }
    if (questionKind.value === 'judge') {
      if (!judgeAnswer.value) {
        ElMessage.warning('请选择判断题答案')
        return null
      }
      return { options: '正确\n错误', answer: judgeAnswer.value }
    }
    if (questionKind.value === 'blank') {
      if (blankCount.value < 1) {
        ElMessage.warning('请先在题干中用连续下划线（如 ___）标出空位')
        return null
      }
      // 兜底同步一次，避免答案框数量与题干空位数不一致（如先写题干后切题型的边界）
      if (blankAnswers.value.length !== blankCount.value) syncBlankAnswers()
      const answers = blankAnswers.value.map((a) => a.trim())
      if (answers.length !== blankCount.value || answers.some((a) => !a)) {
        ElMessage.warning('填空题每个空的答案均不能为空')
        return null
      }
      // 多空答案按空位顺序每空一行；填空题不需要选项
      return { options: undefined, answer: answers.join('\n') }
    }
    // text：问答/论述，纯文本答案（免填选项）
    const ans = form.answer?.trim()
    if (!ans) {
      ElMessage.warning('请输入标准答案')
      return null
    }
    return { options: undefined, answer: ans }
  }

  async function handleSubmit() {
    // 材料题走独立入口：它无选项无答案，分值由小题之和派生
    if (questionKind.value === 'composite') {
      await submitComposite()
      return
    }
    try {
      await formRef.value?.validate()
      const built = buildOptionsAndAnswer()
      if (!built) return
      submitLoading.value = true
      const payload: QuestionPayload = {
        stem: form.stem.trim(),
        type: form.type,
        options: built.options,
        answer: built.answer,
        analysis: form.analysis?.trim() || undefined,
        difficulty: form.difficulty,
        knowledgePointIds: form.knowledgePointIds ?? [],
        questionBankId: bankId.value,
        suggestedScore: form.suggestedScore
      }
      if (isEditing.value && form.id) {
        await questionApi.update({ id: form.id, ...payload })
        ElMessage.success('编辑题目成功')
      } else {
        await questionApi.add(payload)
        ElMessage.success('新增题目成功')
      }
      dialogVisible.value = false
      loadList()
    } catch (error: any) {
      if (error !== false && error) ElMessage.error(error.message || '操作失败')
    } finally {
      submitLoading.value = false
    }
  }

  /**
   * 提交材料题
   *
   * 小题带 id 表示保留（后端原地更新，保住其已有作答记录），不带 id 表示新增。
   * 逐项校验小题必填，错误定位到具体第几小题——一次报一条，避免堆叠提示。
   */
  async function submitComposite() {
    try {
      await formRef.value?.validate()

      if (childList.value.length === 0) {
        ElMessage.warning('材料题至少需要一个小题')
        return
      }

      for (let i = 0; i < childList.value.length; i++) {
        const child = childList.value[i]
        const at = `第 ${i + 1} 小题`
        if (!child.type) {
          ElMessage.warning(`${at}：请选择题型`)
          return
        }
        // 题干是富文本且纯图片题干合法，故用 isRichTextEmpty 而非纯文本判空
        if (isRichTextEmpty(child.stem)) {
          ElMessage.warning(`${at}：请输入题干`)
          return
        }
        const isChoice = child.type === 'single' || child.type === 'multiple'
        if (isChoice) {
          // 选项是纯文本输入，直接 trim 判空（不能用 isRichTextEmpty：
          // 那个函数按 HTML 解析，纯文本里的 < > 会被误当标签剥掉）
          const empty = child.options.findIndex((o) => !o.value.trim())
          if (empty >= 0) {
            ElMessage.warning(`${at}：选项 ${child.options[empty].key} 内容不能为空`)
            return
          }
          // 多选至少两项，与普通多选题的既有校验口径一致
          if (child.type === 'multiple' && child.answer.split(',').filter(Boolean).length < 2) {
            ElMessage.warning(`${at}：多选题至少勾选两个正确答案`)
            return
          }
        }
        if (child.type === 'judge' && child.answer !== '正确' && child.answer !== '错误') {
          ElMessage.warning(`${at}：请选择正确或错误`)
          return
        }
        if (child.type === 'blank') {
          // 填空题答案按行对应题干空位，行数不符会导致逐空比对错位
          const blanks = (stripHtml(child.stem).match(BLANK_MARKER_REGEX) || []).length
          const lines = child.answer.split('\n').filter((s) => s.trim()).length
          if (blanks === 0) {
            ElMessage.warning(`${at}：请在题干中用连续下划线（如 ___）标出空位`)
            return
          }
          if (lines !== blanks) {
            ElMessage.warning(`${at}：题干有 ${blanks} 个空，请填写 ${blanks} 行答案`)
            return
          }
        }
        if (!child.answer || !child.answer.trim()) {
          ElMessage.warning(isChoice ? `${at}：请勾选正确答案` : `${at}：请输入标准答案`)
          return
        }
        if (!child.suggestedScore || child.suggestedScore <= 0) {
          ElMessage.warning(`${at}：请填写分值`)
          return
        }
      }

      submitLoading.value = true
      await questionApi.saveComposite({
        id: isEditing.value && form.id ? form.id : undefined,
        stem: form.stem,
        analysis: form.analysis?.trim() || undefined,
        difficulty: form.difficulty,
        knowledgePointIds: form.knowledgePointIds ?? [],
        questionBankId: bankId.value,
        children: childList.value.map((c) => ({
          id: c.id,
          type: c.type,
          stem: c.stem,
          // 判断题选项保持纯文本（其 answer 直接存选项文本）；其余序列化为 JSON
          options:
            c.options.length > 0
              ? c.type === 'judge'
                ? c.options.map((o) => o.key).join('\n')
                : JSON.stringify(c.options)
              : undefined,
          answer: c.answer,
          analysis: c.analysis?.trim() || undefined,
          difficulty: c.difficulty || form.difficulty,
          suggestedScore: c.suggestedScore
        }))
      })
      ElMessage.success(isEditing.value ? '编辑材料题成功' : '新增材料题成功')
      dialogVisible.value = false
      loadList()
    } catch (error: any) {
      if (error !== false && error) ElMessage.error(error.message || '操作失败')
    } finally {
      submitLoading.value = false
    }
  }

  /** 重置动态选项/答案编辑器状态 */
  function resetOptionState() {
    optionList.value = [makeOption(), makeOption()]
    singleAnswer.value = undefined
    multipleAnswer.value = []
    judgeAnswer.value = ''
    blankAnswers.value = []
    childList.value = []
  }

  function resetForm() {
    formRef.value?.resetFields()
    Object.assign(form, createForm())
    resetOptionState()
  }

  onMounted(() => {
    loadDict()
    loadKnowledgeTree()
    loadList()
    loadBankPermission()
  })
</script>
<style lang="scss" scoped>
  .question-manage {
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

      .page-header {
        display: flex;
        align-items: center;
        margin-bottom: 12px;

        .title-wrap {
          display: flex;
          align-items: center;
          gap: 4px;

          // 返回是导航而非操作，压低视觉重量，避免与「搜索」「新增题目」抢注意力
          .back-btn {
            font-size: 14px;
            font-weight: 400;
            color: var(--el-text-color-secondary);

            &:hover {
              color: var(--el-color-primary);
            }
          }

          :deep(.el-divider--vertical) {
            height: 14px;
            margin: 0 8px;
          }

          .bank-name {
            font-size: 16px;
            font-weight: 600;
            color: var(--el-text-color-primary);
          }
        }
      }

      // 只读共享提示：夹在返回行与筛选表单之间，与筛选表单保持同样的纵向节奏
      .readonly-alert {
        margin-bottom: 12px;
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

    .option-editor {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 10px;

      .option-row {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;

        .option-label {
          flex-shrink: 0;
          width: 22px;
          height: 22px;
          line-height: 22px;
          text-align: center;
          font-size: var(--el-font-size-base);
          font-weight: 600;
          border-radius: 50%;
          background: var(--el-fill-color-light);
        }

        .option-input {
          flex: 1;
        }

        .option-mark {
          flex-shrink: 0;
          margin-right: 0;
        }
      }
    }

    .stem-wrap {
      width: 100%;

      .stem-hint {
        margin-top: 4px;
        font-size: 12px;
        color: var(--el-text-color-secondary);
        line-height: 1.5;
      }
    }

    /* 列表题干列的「共 N 小问」标记，与题干文本留出间距 */
    .stem-tag {
      margin-left: 6px;
    }

    .blank-editor {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 10px;

      .blank-row {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;

        .blank-label {
          flex-shrink: 0;
          min-width: 48px;
          font-weight: 600;
          color: var(--el-text-color-regular);
        }

        .blank-input {
          flex: 1;
        }
      }
    }

    .blank-empty-hint {
      font-size: 13px;
      color: var(--el-text-color-secondary);
    }
  }
</style>

<!-- 抽屉挂载到 body，scoped 无法命中，故单独用非 scoped 段限定在自定义 class 下 -->
<style lang="scss">
  .question-form-drawer {
    .drawer-footer {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    }

    .difficulty-loading {
      font-size: 13px;
      color: var(--el-text-color-placeholder);
    }

    // 难度选择：chip 样式，选中色对齐表格 difficultyTagType 的语义色
    .difficulty-group {
      display: flex;
      gap: 10px;

      .el-radio {
        height: 32px;
        margin-right: 0;
        padding: 0 14px;
        border-radius: 8px;
        border-color: var(--el-border-color);
        transition: all 0.2s;

        // 去掉单选圆点，只留文字，视觉上等同可点的标签
        .el-radio__input {
          display: none;
        }

        .el-radio__label {
          padding-left: 0;
          font-size: 13px;
          color: var(--el-text-color-regular);
        }

        &:hover {
          border-color: var(--el-border-color-darker);
        }

        // 选中态：按难度取对应语义色的淡底 + 同色描边文字
        @each $c in (success, warning, danger) {
          &.is-#{$c}.is-checked {
            background-color: var(--el-color-#{$c}-light-9);
            border-color: var(--el-color-#{$c}-light-5);

            .el-radio__label {
              font-weight: 600;
              color: var(--el-color-#{$c});
            }
          }
        }
      }
    }
  }
</style>
