<!-- 创建/编辑试卷独立页：手动组卷 / AI 组卷 / 随机试卷三种模式（type 走 query，编辑态附 id） -->
<template>
  <div class="paper-edit">
    <!-- 顶部：返回 + 标题。不套 ElCard，避免只为一行按钮多出一层卡片背景与间距 -->
    <div class="page-header">
      <ElButton link :icon="ArrowLeft" class="back-btn" @click="handleBack">返回试卷列表</ElButton>
      <span class="header-divider" />
      <span class="page-title">{{ pageTitle }}</span>
    </div>

    <!-- 表单主体 -->
    <ElCard shadow="never" class="body-card">
      <div v-loading="pageLoading" class="body-inner">
        <ElForm ref="formRef" :model="form" :rules="formRules" label-width="90px" class="edit-form">
          <ElFormItem label="试卷名称" prop="name">
            <ElInput
              v-model="form.name"
              placeholder="请输入试卷名称"
              maxlength="80"
              show-word-limit
            />
          </ElFormItem>
          <ElFormItem label="建议时长" prop="suggestDuration">
            <ElInputNumber
              v-model="form.suggestDuration"
              :min="1"
              :precision="0"
              controls-position="right"
              class="num-fill"
            />
            <span class="unit-tip">分钟</span>
          </ElFormItem>
          <!-- 题库范围：改抽屉选择器。题库多时下拉既不能搜索也受 pageSize 限制取不全 -->
          <ElFormItem label="题库范围" prop="bankIds" class="span-2">
            <!-- 随机卷要为每个题库配权重，字段整体改纵向：按钮一行、权重面板一行。
                 与按钮挤在同一行时库名会把输入框推到最右，中间留一大片空白 -->
            <div class="bank-field" :class="{ 'is-weighted': formType === 'random' }">
              <div class="bank-field-head">
                <ElButton :icon="Plus" @click="bankPickerVisible = true">选择题库</ElButton>
                <span v-if="!selectedBanks.length" class="bank-empty">未选择题库</span>
                <span v-else-if="formType === 'random'" class="bank-count">
                  已选 {{ selectedBanks.length }} 个题库，按权重分配各库抽题数量
                </span>
              </div>

              <!-- 随机卷：题库 + 抽题权重 -->
              <div v-if="selectedBanks.length && formType === 'random'" class="bank-weights">
                <div class="bw-list">
                  <div v-for="b in selectedBanks" :key="b.id" class="bw-row">
                    <span class="bw-name" :title="b.name">{{ b.name }}</span>
                    <!-- 占比条：横向空间用来把比例画出来，比让人从 0.33 反推「三成」直观 -->
                    <div class="bw-bar" :class="{ 'is-bad': !weightSumValid }">
                      <div class="bw-bar-fill" :style="{ width: weightPercent(b.id) }" />
                    </div>
                    <span class="bw-pct">{{ weightPercent(b.id) }}</span>
                    <ElInputNumber
                      v-model="bankWeights[b.id]"
                      :min="0"
                      :max="1"
                      :step="0.05"
                      :precision="2"
                      size="small"
                      controls-position="right"
                      class="bw-input"
                    />
                    <ElButton
                      link
                      type="danger"
                      size="small"
                      class="bw-del"
                      @click="removeBank(b.id)"
                    >
                      移除
                    </ElButton>
                  </div>
                </div>
                <!-- 合计行留在滚动容器外：它是保存前最该看到的校验信息，不能被滚动藏起来 -->
                <div class="bw-foot">
                  <span class="bw-sum" :class="{ 'is-bad': !weightSumValid }">
                    合计 {{ weightSum.toFixed(2) }}
                    <template v-if="!weightSumValid">，须为 1.00</template>
                  </span>
                  <ElButton link type="primary" size="small" @click="distributeWeightsEvenly"
                    >平均分配</ElButton
                  >
                </div>
              </div>

              <!-- 固定/AI 卷：无权重概念，仍用标签 -->
              <div v-else-if="selectedBanks.length" class="bank-tags">
                <ElTag
                  v-for="b in selectedBanks"
                  :key="b.id"
                  closable
                  type="info"
                  @close="removeBank(b.id)"
                >
                  {{ b.name }}
                </ElTag>
              </div>
            </div>
          </ElFormItem>

          <!-- 共享设置（可见范围/权限级别）不在此维护：已收敛到试卷列表页的「共享」入口，
               新建试卷由后端按 all + manage 兜底，编辑时不下发这两个字段以免冲掉列表页配好的值 -->

          <!-- AI 组卷：目标总分 -->
          <ElFormItem v-if="formType === 'ai'" label="目标总分" prop="totalScore">
            <ElInputNumber
              v-model="aiForm.totalScore"
              :min="1"
              :precision="0"
              controls-position="right"
              class="num-fill"
            />
          </ElFormItem>
          <!-- 知识点分布：AI 组卷录入；编辑固定试卷时也展示以便查看/修改原值 -->
          <ElFormItem
            v-if="formType === 'ai' || (formType === 'fixed' && isEditing)"
            label="知识点分布"
            class="span-2"
          >
            <ElInput
              v-model="aiForm.knowledgeDistribution"
              type="textarea"
              :rows="2"
              placeholder="可空，如：数据结构 40%，算法 60%"
            />
          </ElFormItem>
          <ElFormItem v-if="formType === 'ai'" class="span-2">
            <ElButton type="primary" :loading="aiLoading" @click="handleAiCompose"
              >生成方案</ElButton
            >
          </ElFormItem>
        </ElForm>

        <!-- 固定试卷（手动组卷）：左右均分两卡片（左选题 / 右结构预览） -->
        <template v-if="formType === 'fixed'">
          <div class="compose-layout">
            <!-- 左卡片：选题 -->
            <div class="compose-card">
              <div class="card-head">
                <span class="card-title">选择题目</span>
                <span class="card-sub">勾选题目并设置分值</span>
              </div>
              <!-- 筛选栏 -->
              <div class="filter-bar">
                <ElInput
                  v-model="poolFilter.keyword"
                  placeholder="搜索题干"
                  clearable
                  :prefix-icon="Search"
                  class="f-keyword"
                />
                <ElSelect v-model="poolFilter.bankId" placeholder="题库" clearable class="f-item">
                  <ElOption
                    v-for="b in selectedBankOptions"
                    :key="b.id"
                    :label="b.name"
                    :value="b.id"
                  />
                </ElSelect>
                <ElSelect v-model="poolFilter.type" placeholder="题型" clearable class="f-item">
                  <ElOption
                    v-for="d in dict.question_type"
                    :key="d.value"
                    :label="d.name"
                    :value="d.value"
                  />
                </ElSelect>
                <ElSelect
                  v-model="poolFilter.difficulty"
                  placeholder="难度"
                  clearable
                  class="f-item"
                >
                  <ElOption
                    v-for="d in dict.difficulty"
                    :key="d.value"
                    :label="d.name"
                    :value="d.value"
                  />
                </ElSelect>
              </div>
              <ElTable
                ref="questionTableRef"
                v-loading="questionLoading"
                :data="filteredPool"
                row-key="id"
                height="420"
                @select="handleRowSelect"
                @select-all="handleSelectAll"
              >
                <ElTableColumn type="selection" width="46" align="center" reserve-selection />
                <!-- 题干含富文本，取 stemText 纯文本镜像；缺失时前端剥离，否则表格里会显出 <p>/<ul> 标签 -->
                <ElTableColumn label="题干" min-width="200" show-overflow-tooltip>
                  <template #default="{ row }">{{ stemPlain(row) }}</template>
                </ElTableColumn>
                <ElTableColumn
                  label="题库"
                  width="110"
                  show-overflow-tooltip
                  :formatter="(r: Question) => bankName(r.questionBankId)"
                />
                <ElTableColumn
                  label="题型"
                  width="86"
                  align="center"
                  :formatter="(r: Question) => dictLabel('question_type', r.type)"
                />
                <ElTableColumn
                  label="难度"
                  width="76"
                  align="center"
                  :formatter="(r: Question) => dictLabel('difficulty', r.difficulty)"
                />
                <ElTableColumn label="分值" width="116" align="center">
                  <template #default="{ row }">
                    <!--
                      材料题分值不可改：考试下发时各小题带自己的 suggestedScore，判分按小题累计。
                      若这里允许填别的数，卷面总分就会与考生实际可得分不一致，故锁成小题之和。
                    -->
                    <ElTooltip
                      v-if="row.type === 'composite'"
                      content="材料题分值为各小题之和，请在题目管理中调整小题分值"
                      placement="top"
                    >
                      <span class="composite-score">{{ scoreMap[row.id] ?? 0 }} 分</span>
                    </ElTooltip>
                    <ElInputNumber
                      v-else
                      v-model="scoreMap[row.id]"
                      :min="0.5"
                      :precision="2"
                      :step="1"
                      controls-position="right"
                      style="width: 100px"
                    />
                  </template>
                </ElTableColumn>
                <template #empty>{{
                  form.bankIds.length ? '无符合条件的题目' : '请先选择题库范围'
                }}</template>
              </ElTable>
              <div class="summary-bar">
                当前筛选 {{ filteredPool.length }} 题 · 已选 <b>{{ fixedSelectedCount }}</b> 题 ·
                合计 <b>{{ fixedTotalScore }}</b> 分
              </div>
            </div>
            <!-- 右卡片：结构预览 -->
            <StructurePanel
              :sections="fixedSections"
              :type-label="(t: string) => dictLabel('question_type', t)"
            />
          </div>
        </template>

        <!-- AI 组卷：左侧方案表格 + 右侧实时结构预览 -->
        <template v-if="formType === 'ai' && aiItems.length">
          <div class="compose-layout">
            <div class="compose-card">
              <div class="card-head">
                <span class="card-title">组卷方案</span>
                <span class="card-sub">可调整分值或删除</span>
              </div>
              <ElTable :data="aiItems" height="420">
                <ElTableColumn type="index" label="题号" width="70" align="center" />
                <ElTableColumn label="题干" min-width="240" show-overflow-tooltip>
                  <template #default="{ row }">{{ stemPlain(row) }}</template>
                </ElTableColumn>
                <ElTableColumn
                  label="题型"
                  width="86"
                  align="center"
                  :formatter="(r: AiItem) => dictLabel('question_type', r.questionType)"
                />
                <ElTableColumn
                  label="难度"
                  width="76"
                  align="center"
                  :formatter="(r: AiItem) => dictLabel('difficulty', r.difficulty)"
                />
                <ElTableColumn label="分值" width="116" align="center">
                  <template #default="{ row }">
                    <ElInputNumber
                      v-model="row.score"
                      :min="0.5"
                      :precision="2"
                      :step="1"
                      controls-position="right"
                      style="width: 100px"
                    />
                  </template>
                </ElTableColumn>
                <ElTableColumn label="操作" width="74" align="center">
                  <template #default="{ $index }">
                    <ElButton link type="danger" @click="aiItems.splice($index, 1)">删除</ElButton>
                  </template>
                </ElTableColumn>
              </ElTable>
              <div class="summary-bar">
                共 <b>{{ aiItems.length }}</b> 题 · 总分 <b>{{ aiTotalScore }}</b>
              </div>
            </div>
            <StructurePanel
              :sections="aiSections"
              :type-label="(t: string) => dictLabel('question_type', t)"
            />
          </div>
        </template>

        <!-- 随机试卷：抽题规则表格 -->
        <template v-if="formType === 'random'">
          <div class="section-title">
            抽题规则
            <div class="title-extra">
              <!-- 总分放标题行：位置固定，规则增减都不会把它顶出视口 -->
              <!-- 规则条件有交集时逐条都够也可能整卷不够，这里提前提示 -->
              <span v-if="overlapShort" class="overlap-tip">
                规则条件重叠，去重后仅 {{ maxDistinct }} 题可用
              </span>
              <span class="title-summary">
                共 <b>{{ randomTotalCount }}</b> 题 · 总分 <b>{{ randomTotalScore }}</b>
              </span>
              <ElButton link type="primary" :icon="Plus" @click="addRule">添加规则</ElButton>
            </div>
          </div>
          <!-- max-height 而非 height：规则少时表格随内容收缩，不留大片死白 -->
          <ElTable :data="rules" max-height="360">
            <ElTableColumn label="题型" width="140">
              <template #header><span class="req">*</span>题型</template>
              <template #default="{ row }">
                <ElSelect v-model="row.questionType" placeholder="题型">
                  <ElOption
                    v-for="d in ruleTypeOptions"
                    :key="d.value"
                    :label="d.name"
                    :value="d.value"
                  />
                </ElSelect>
              </template>
            </ElTableColumn>
            <ElTableColumn label="难度" width="120">
              <template #default="{ row }">
                <ElSelect v-model="row.difficulty" placeholder="不限" clearable>
                  <ElOption
                    v-for="d in dict.difficulty"
                    :key="d.value"
                    :label="d.name"
                    :value="d.value"
                  />
                </ElSelect>
              </template>
            </ElTableColumn>
            <ElTableColumn label="知识点" min-width="180">
              <template #default="{ row }">
                <ElCascader
                  v-model="row.kpPath"
                  :options="kpTree"
                  :props="cascaderProps"
                  clearable
                  placeholder="不限"
                  style="width: 100%"
                  @change="(v) => onRuleKpChange(row, v)"
                />
              </template>
            </ElTableColumn>
            <ElTableColumn label="抽取数量" width="190" align="center">
              <template #header><span class="req">*</span>抽取数量</template>
              <template #default="{ row, $index }">
                <div class="draw-cell">
                  <!-- 填满单元格：写死宽度会超出 .cell 的内容宽，溢出后被截出省略号 -->
                  <ElInputNumber
                    v-model="row.drawCount"
                    :min="1"
                    :max="ruleCounts[$index] || 1"
                    :disabled="!ruleCounts[$index]"
                    :precision="0"
                    controls-position="right"
                    style="width: 100%"
                  />
                  <!-- 上限来自所选题库中命中该规则的正式题数，超出即不可再加 -->
                  <span class="avail-tip" :class="{ 'is-empty': !ruleCounts[$index] }">
                    {{ row.questionType ? `可用 ${ruleCounts[$index] || 0}` : '待选题型' }}
                  </span>
                </div>
              </template>
            </ElTableColumn>
            <ElTableColumn label="每题分值" width="130" align="center">
              <template #header><span class="req">*</span>每题分值</template>
              <template #default="{ row }">
                <ElInputNumber
                  v-model="row.scorePerQuestion"
                  :min="0.5"
                  :precision="2"
                  controls-position="right"
                  style="width: 100%"
                />
              </template>
            </ElTableColumn>
            <ElTableColumn label="操作" width="70" align="center">
              <template #default="{ $index }">
                <ElButton link type="danger" @click="rules.splice($index, 1)">删除</ElButton>
              </template>
            </ElTableColumn>
            <template #empty>请添加抽题规则</template>
          </ElTable>
        </template>
      </div>
    </ElCard>

    <!-- 底部操作条 -->
    <!-- 权重三级：取消纯文字、保存实心主色，与 exam-edit / practice-edit 同口径 -->
    <div class="footer-bar">
      <ElButton text :disabled="submitLoading" @click="handleBack">取消</ElButton>
      <ElButton type="primary" :loading="submitLoading" @click="handleSubmit">保存</ElButton>
    </div>

    <BankPickerDrawer
      v-model="bankPickerVisible"
      :selected="selectedBanks"
      @confirm="handleBankConfirm"
    />
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive, computed, watch, nextTick, onMounted } from 'vue'
  import { useRoute, useRouter, isNavigationFailure, NavigationFailureType } from 'vue-router'
  import { ElMessage, type FormInstance, type FormRules, type TableInstance } from 'element-plus'
  import { ArrowLeft, Plus, Search } from '@element-plus/icons-vue'
  import { paperApi, type PaperQuestionDetail } from '@/api/paper'
  import { getQuestionList, type Question } from '@/api/question'
  import { stripHtml } from '@/utils/richText'
  import { knowledgePointApi, type KnowledgePoint } from '@/api/knowledgePoint'
  import { dataDictApi, type DictDataItem } from '@/api/dataDict'
  import { groupByType, round2 } from '@/utils/paperStructure'
  import { useWorktabStore } from '@/store/modules/worktab'
  import StructurePanel from './components/StructurePanel.vue'
  import BankPickerDrawer from '@/components/business/pickers/BankPickerDrawer.vue'

  defineOptions({ name: 'PaperEdit' })

  // 组卷类型：fixed 手动组卷 / ai AI 组卷 / random 随机试卷
  type FormType = 'fixed' | 'ai' | 'random'

  const route = useRoute()
  const router = useRouter()

  // 从 query 解析：type 决定组卷模式，id 存在即编辑态
  const editingId = computed(() => {
    const v = Number(route.query.id)
    return Number.isFinite(v) && v > 0 ? v : undefined
  })
  const isEditing = computed(() => editingId.value !== undefined)
  const formType = ref<FormType>('fixed')

  const pageLoading = ref(false)
  const submitLoading = ref(false)
  const formRef = ref<FormInstance>()

  const pageTitle = computed(() => {
    // 随机卷的题目编辑模式单列：它 formType 是 fixed，但卷子本身是随机卷，
    // 标题写「手动组卷」会让人以为打开错了
    if (route.query.mode === 'questions') return '调整试卷题目 - 随机试卷'
    const map: Record<FormType, string> = { fixed: '手动组卷', ai: 'AI 组卷', random: '随机试卷' }
    return (isEditing.value ? '编辑试卷 - ' : '新增试卷 - ') + map[formType.value]
  })

  // 已选题库（id + 名称）。候选列表已移入抽屉按需分页拉取，此处只保留已选项，
  // 供标签展示、筛选栏「题库」下拉、以及表格题库列的 id→名称映射
  const selectedBanks = ref<Array<{ id: number; name: string }>>([])
  const bankPickerVisible = ref(false)
  const dict = reactive<{ question_type: DictDataItem[]; difficulty: DictDataItem[] }>({
    question_type: [],
    difficulty: []
  })
  const kpTree = ref<KnowledgePoint[]>([])
  const cascaderProps = {
    value: 'id',
    label: 'name',
    children: 'children',
    checkStrictly: true,
    emitPath: true
  }

  const createForm = () => ({
    name: '',
    suggestDuration: 60,
    bankIds: [] as number[]
  })
  const form = reactive(createForm())

  // AI 组卷专用参数
  const aiForm = reactive({ totalScore: 100, knowledgeDistribution: '' })

  // 固定试卷：题库题目池、勾选、分值映射
  const questionPool = ref<Question[]>([])
  const questionLoading = ref(false)
  // 已勾选题目 id（持久集合，跨筛选保留；配合表格 reserve-selection）
  const selectedIds = ref<Set<number>>(new Set())
  const scoreMap = reactive<Record<number, number>>({})
  const questionTableRef = ref<TableInstance>()

  // 题目池筛选条件（前端过滤，不重新请求）
  const poolFilter = reactive({
    keyword: '',
    bankId: undefined as number | undefined,
    type: '',
    difficulty: ''
  })

  // 筛选栏「题库」下拉即已选题库本身
  const selectedBankOptions = computed(() => selectedBanks.value)

  /** 题库 id → 名称（题库列显示） */
  function bankName(id?: number | null) {
    if (id == null) return '-'
    return selectedBanks.value.find((b) => b.id === id)?.name || '-'
  }

  /*
    各题库的抽题权重，键为题库 ID。

    只在随机卷用。选库后默认均分——多数场景就是要均分，
    让用户从「已经对的值」上微调，比面对一排 0 逐个填省事。
  */
  const bankWeights = ref<Record<number, number>>({})

  /** 权重合计，用于校验与展示 */
  const weightSum = computed(() =>
    selectedBanks.value.reduce((s, b) => s + (bankWeights.value[b.id] || 0), 0)
  )

  /** 浮点累加有误差，1e-6 内视为等于 1 */
  const weightSumValid = computed(() => Math.abs(weightSum.value - 1) < 1e-6)

  /** 某库权重对应的百分比展示 */
  function weightPercent(bankId: number) {
    const w = bankWeights.value[bankId] || 0
    return `${(w * 100).toFixed(0)}%`
  }

  /**
   * 平均分配权重。
   *
   * 末位吃掉舍入误差：3 个库时前两个 0.33、最后一个 0.34，合计正好 1.00。
   * 平均给 0.33 会让合计 0.99 卡住保存。
   */
  function distributeWeightsEvenly() {
    const list = selectedBanks.value
    if (!list.length) return
    const each = Math.floor((1 / list.length) * 100) / 100
    const next: Record<number, number> = {}
    list.forEach((b, i) => {
      next[b.id] =
        i === list.length - 1 ? Math.round((1 - each * (list.length - 1)) * 100) / 100 : each
    })
    bankWeights.value = next
  }

  /**
   * 抽屉确定：同步已选题库与 form.bankIds，并重载题目池
   * form.bankIds 仍是表单校验与提交的字段，故两者保持一致
   */
  async function handleBankConfirm(banks: Array<{ id: number; name: string }>) {
    const prev = { ...bankWeights.value }
    selectedBanks.value = banks
    form.bankIds = banks.map((b) => b.id)
    // 保留已调过的权重，只对新增的库补默认值；全新选择则整体均分
    const hadAny = Object.keys(prev).some((k) => banks.some((b) => b.id === Number(k)))
    if (formType.value === 'random') {
      if (!hadAny) {
        distributeWeightsEvenly()
      } else {
        const next: Record<number, number> = {}
        for (const b of banks) next[b.id] = prev[b.id] ?? 0
        bankWeights.value = next
      }
    }
    // 手工触发校验，抽屉赋值不会走 ElSelect 的 change 时机
    revalidateBankIds()
    await handleBankChange()
  }

  /** 移除单个已选题库 */
  async function removeBank(id: number) {
    selectedBanks.value = selectedBanks.value.filter((b) => b.id !== id)
    form.bankIds = selectedBanks.value.map((b) => b.id)
    // 移除后剩余权重合计不再为 1，删掉该项让用户重新分配（或点平均分配）
    const next = { ...bankWeights.value }
    delete next[id]
    bankWeights.value = next
    revalidateBankIds()
    await handleBankChange()
  }

  /**
   * 重新校验题库范围字段
   * validateField 不传 callback 时校验失败会 reject，红字提示本身是同步设置的，
   * 这里只需吞掉那个 rejection，避免清空题库时抛未处理的 promise rejection
   */
  function revalidateBankIds() {
    formRef.value?.validateField('bankIds').catch(() => undefined)
  }

  // 前端筛选后的题目池
  const filteredPool = computed(() => {
    const kw = poolFilter.keyword.trim().toLowerCase()
    return questionPool.value.filter((q) => {
      if (kw && !q.stem.toLowerCase().includes(kw)) return false
      if (poolFilter.bankId != null && q.questionBankId !== poolFilter.bankId) return false
      if (poolFilter.type && q.type !== poolFilter.type) return false
      if (poolFilter.difficulty && q.difficulty !== poolFilter.difficulty) return false
      return true
    })
  })

  // 当前已选题目对象（从持久 id 集合还原，供结构预览与保存用）
  const selectedQuestions = computed(() =>
    questionPool.value.filter((q) => selectedIds.value.has(q.id))
  )

  // AI 组卷方案项
  interface AiItem {
    questionId: number
    stem: string
    questionType: string
    difficulty: string
    score: number
  }
  const aiLoading = ref(false)
  const aiItems = ref<AiItem[]>([])

  // 随机试卷：抽题规则行
  interface RuleRow {
    questionType: string
    difficulty: string
    knowledgePointId: number
    kpPath: number[]
    drawCount: number
    scorePerQuestion: number
  }
  const rules = ref<RuleRow[]>([])

  // 各条规则在当前题库范围内的可用题量（下标与 rules 对齐）+ 去重后的整卷上限
  const ruleCounts = ref<number[]>([])
  const maxDistinct = ref(0)
  /** 探测请求自增序号：只有最后一次发出的请求可以回填，丢弃乱序返回的旧响应 */
  let availabilitySeq = 0
  /**
   * 页面初始化自增序号：同 availabilitySeq，只有最后一次 initPage 可以写表单。
   * 快速连切两份试卷时两次 initPage 并发，若旧卷详情后到会覆盖新卷已回填的数据，
   * 而 editingId 跟着 URL 始终是新卷 id —— 此时保存就会把旧卷内容提交进新卷。
   */
  let pageSeq = 0
  /** 逐条都不超上限，但去重后整卷凑不够（规则条件有交集） */
  const overlapShort = computed(
    () => maxDistinct.value > 0 && randomTotalCount.value > maxDistinct.value
  )

  // 校验规则
  const formRules: FormRules = {
    name: [{ required: true, message: '请输入试卷名称', trigger: 'blur' }],
    suggestDuration: [{ required: true, message: '请输入建议时长', trigger: 'blur' }],
    bankIds: [
      { required: true, type: 'array', min: 1, message: '请选择题库范围', trigger: 'change' }
    ]
  }

  // 统计
  const fixedSelectedCount = computed(() => selectedQuestions.value.length)
  // 分值允许两位小数，逐题累加会带出浮点尾差（如 1.05 + 1.1 = 2.1500000000000004），
  // 合计分直接渲染在页面上，故求和后统一规整
  const fixedTotalScore = computed(() =>
    round2(selectedQuestions.value.reduce((s, q) => s + (scoreMap[q.id] || 0), 0))
  )
  const aiTotalScore = computed(() => round2(aiItems.value.reduce((s, i) => s + (i.score || 0), 0)))
  const randomTotalCount = computed(() => rules.value.reduce((s, r) => s + (r.drawCount || 0), 0))
  // 「数量 × 单分」累加同样会带出浮点尾差（如 3 × 1.15 = 3.4499999999999997），
  // 统一走 round2 而非各处自写 toFixed，与服务端口径一致
  const randomTotalScore = computed(() =>
    round2(rules.value.reduce((s, r) => s + (r.drawCount || 0) * (r.scorePerQuestion || 0), 0))
  )

  // 结构预览分组：按题型（顺序随字典 question_type 的 value 顺序）
  const typeOrder = computed(() => dict.question_type.map((d) => d.value))
  // 固定组卷：用已勾选题目 + scoreMap 分值
  const fixedSections = computed(() =>
    groupByType(
      selectedQuestions.value.map((q) => ({
        stem: q.stem,
        stemText: q.stemText,
        score: scoreMap[q.id] || 0,
        type: q.type,
        // 仅材料题有小题，其余题型该值为 0/undefined，面板不显示「N 小问」
        childrenCount: q.childrenCount
      })),
      (i) => i.type,
      (i) => i.score,
      typeOrder.value
    )
  )
  // AI 组卷：用方案项 + 各自分值
  const aiSections = computed(() =>
    groupByType(
      aiItems.value.map((i) => ({ stem: i.stem, score: i.score || 0, type: i.questionType })),
      (i) => i.type,
      (i) => i.score,
      typeOrder.value
    )
  )

  /** 字典 value 转显示名 */
  function dictLabel(key: 'question_type' | 'difficulty', value: string) {
    return dict[key].find((d) => d.value === value)?.name || value
  }

  /**
   * 返回列表页，并关掉本页的工作标签
   * 先 push 再 removeTab：removeTab 关的若是当前激活标签会自动跳到邻居标签，
   * 顺序颠倒会先跳错页再被本次 push 覆盖，白闪一帧
   */
  async function handleBack() {
    const editPath = route.path
    // 必须 await：removeTab 若发现关掉的是当前激活标签，会自行跳到邻居标签。
    // 不等跳转完成，store 里的 current 仍是 /paper-edit，就会被它带去别的页面。
    let failure: unknown
    try {
      // push 对「中断/重复导航」是 resolve 出 NavigationFailure，只有守卫抛错才 reject
      failure = await router.push({ path: '/paper' })
    } catch (error) {
      failure = error
    }
    if (failure) {
      // duplicated（已经在 /paper）与 cancelled（被更新的导航取代）都意味着人已经不在编辑页，
      // 视作到位，继续关标签；只有 aborted（守卫显式拦下）和守卫抛错才是「人还留在编辑页」，
      // 那时关掉标签会造成「页面还在、标签没了」，故保留标签并如实提示，不再静默
      if (
        isNavigationFailure(
          failure,
          NavigationFailureType.duplicated | NavigationFailureType.cancelled
        )
      ) {
        useWorktabStore().removeTab(editPath)
        return
      }
      ElMessage.error('返回试卷列表失败，请重试')
      return
    }
    useWorktabStore().removeTab(editPath)
  }
  /** 加载下拉/字典/知识点等基础数据 */
  async function loadBaseData() {
    // 题库候选不再在此预加载：抽屉打开时按需分页拉取
    const [dictRes, treeRes] = await Promise.all([
      dataDictApi.getData(['question_type', 'difficulty']),
      knowledgePointApi.getTree()
    ])
    dict.question_type = dictRes.data.question_type || []
    dict.difficulty = dictRes.data.difficulty || []
    kpTree.value = treeRes.data
  }

  /** 题库范围变化：固定组卷需重新加载题目池 */
  async function handleBankChange() {
    // 题库范围变化后，若筛选栏仍指向已被移出范围的题库，题目池里已无该库题目，
    // filteredPool 会恒为空且空态文案看不出是筛选失效，故先把失效的筛选值清掉
    if (poolFilter.bankId != null && !form.bankIds.includes(poolFilter.bankId)) {
      poolFilter.bankId = undefined
    }
    if (formType.value !== 'fixed') return
    // 带上当前世代快照：改题库后请求还在飞时若切了试卷，回来必须整段丢弃，
    // 否则会把上一份试卷的题目池写进已被 resetState 清空、准备给新试卷用的状态
    await loadQuestionPool(pageSeq)
  }

  /**
   * 按已选题库加载可选题目（仅正式题）
   * @param seq initPage 流程传入的 pageSeq 快照，用于丢弃过期响应；
   *            题库范围变化等页内交互不传，表示无条件生效。
   *            注意写入发生在本函数体内，调用方 await 之后再判断已经晚了，故必须在此拦。
   */
  async function loadQuestionPool(seq?: number) {
    const stale = () => seq !== undefined && seq !== pageSeq
    if (!form.bankIds.length) {
      if (!stale()) questionPool.value = []
      return
    }
    questionLoading.value = true
    try {
      const results = await Promise.all(
        form.bankIds.map((id) =>
          getQuestionList({ questionBankId: id, status: 'formal', pageSize: 500 })
        )
      )
      if (stale()) return
      const merged = results.flatMap((r) => r.data.list)
      questionPool.value = merged
      merged.forEach((q) => {
        // 材料题分值恒等于小题之和（后端维护在 suggestedScore 上），不接受编辑态的历史值：
        // 卷里存的旧分值可能与小题现状不符，而判分只认小题分，以小题之和为准才对得上
        if (q.type === 'composite') scoreMap[q.id] = q.suggestedScore || 0
        else if (scoreMap[q.id] == null) scoreMap[q.id] = q.suggestedScore || 1
      })
    } catch (error: any) {
      if (stale()) return
      ElMessage.error(error.message || '加载题目失败')
    } finally {
      // 过期调用不要把新一次加载的 loading 关掉
      if (!stale()) questionLoading.value = false
    }
  }

  /** 勾选/取消单行：维护持久 id 集合 */
  function handleRowSelect(rows: Question[], row: Question) {
    const checked = rows.some((r) => r.id === row.id)
    const next = new Set(selectedIds.value)
    if (checked) next.add(row.id)
    else next.delete(row.id)
    selectedIds.value = next
  }

  /** 表头全选/全不选：仅影响当前筛选可见行 */
  function handleSelectAll(rows: Question[]) {
    const visibleIds = filteredPool.value.map((q) => q.id)
    const next = new Set(selectedIds.value)
    if (rows.length) visibleIds.forEach((id) => next.add(id))
    else visibleIds.forEach((id) => next.delete(id))
    selectedIds.value = next
  }

  /** AI 组卷：请求方案 */
  async function handleAiCompose() {
    if (!form.bankIds.length) return ElMessage.warning('请先选择题库范围')
    // AI 组卷是长耗时请求，等待期间用户很可能已经切走。带上 pageSeq 快照，
    // 回来发现已经不是同一次页面初始化就整段丢弃，否则会把 A 卷的方案写进 B 卷表单
    const seq = pageSeq
    aiLoading.value = true
    try {
      const { data } = await paperApi.aiCompose({
        bankIds: form.bankIds,
        totalScore: aiForm.totalScore,
        suggestDuration: form.suggestDuration,
        knowledgeDistribution: aiForm.knowledgeDistribution || undefined
      })
      if (seq !== pageSeq) return
      aiItems.value = data.items.map((i) => ({ ...i }))
      ElMessage.success(`已生成方案，共 ${data.count} 题`)
    } catch (error: any) {
      if (seq !== pageSeq) return
      ElMessage.error(error.message || '生成方案失败')
    } finally {
      // 同 loadQuestionPool：过期调用不关新一次的 loading，换页由 resetState 兜底复位
      if (seq === pageSeq) aiLoading.value = false
    }
  }

  /** 级联选择知识点后，取末级 id 存入规则行 */
  function onRuleKpChange(row: RuleRow, value: unknown) {
    const path = Array.isArray(value) ? (value as number[]) : []
    row.knowledgePointId = path.length ? path[path.length - 1] : 0
  }

  /** 按知识点 id 在树中反查从根到该节点的完整 id 路径（级联回填用），查不到返回空数组 */
  function findKpPath(targetId: number): number[] {
    if (!targetId) return []
    const dfs = (nodes: KnowledgePoint[], trail: number[]): number[] | null => {
      for (const node of nodes) {
        const next = [...trail, node.id]
        if (node.id === targetId) return next
        if (node.children?.length) {
          const hit = dfs(node.children, next)
          if (hit) return hit
        }
      }
      return null
    }
    return dfs(kpTree.value, []) ?? []
  }

  /**
   * 随机抽题规则可选的题型：排除材料题
   *
   * 规则的 scorePerQuestion 是「每题固定分」，而材料题分值为其小题之和、每道都不同，
   * 该字段表达不了。后端也会拒（paper.service 校验），这里提前从下拉里去掉，
   * 免得用户选完填好数量才报错。
   */
  const ruleTypeOptions = computed(() =>
    (dict.question_type ?? []).filter((d) => d.value !== 'composite')
  )

  /**
   * 表格里的题干纯文本
   *
   * 优先用后端的 stemText 镜像（列表接口回传原始 stem，镜像才是纯文本）；
   * 存量数据可能没有镜像，回退到前端剥离。
   */
  function stemPlain(row: { stem?: string | null; stemText?: string | null }) {
    return row.stemText || stripHtml(row.stem)
  }

  /** 把试卷已引用、但因分页未出现在题目池中的题目补入池中，避免编辑保存时静默丢题 */
  function mergeReferencedQuestions(questions: PaperQuestionDetail[]) {
    const poolIds = new Set(questionPool.value.map((p) => p.id))
    const missing = questions
      .filter((q) => !poolIds.has(q.questionId))
      .map<Question>((q) => ({
        id: q.questionId,
        stem: q.stem,
        stemText: q.stemText,
        childrenCount: q.childrenCount,
        type: q.questionType,
        options: q.options,
        answer: q.answer,
        difficulty: q.difficulty,
        knowledgePointIds: [],
        suggestedScore: q.score,
        status: 'formal'
      }))
    if (missing.length) questionPool.value = [...missing, ...questionPool.value]
  }

  /**
   * 拉取各条规则的可用题量。
   * 题型未选时该行条件不完整，直接记 0 而不发请求（后端要求 questionType 非空）。
   */
  async function refreshRuleAvailability() {
    if (formType.value !== 'random') return
    // 发请求时就固定「哪些行参与查询、各自的原始下标」，回填只认这份快照。
    // 若改成回填时重新遍历 rules，请求往返期间删行会让后面的行拿到前一行的计数。
    const ready = rules.value.map((r, idx) => ({ r, idx })).filter(({ r }) => r.questionType)
    const rowCount = rules.value.length
    if (!form.bankIds.length || !ready.length) {
      ruleCounts.value = rules.value.map(() => 0)
      maxDistinct.value = 0
      return
    }
    const seq = ++availabilitySeq
    try {
      const { data: res } = await paperApi.ruleAvailability({
        bankIds: form.bankIds,
        rules: ready.map(({ r }) => ({
          questionType: r.questionType,
          difficulty: r.difficulty || '',
          knowledgePointId: r.knowledgePointId || 0
        }))
      })
      // 已有更新的请求发出，或行数已变，本次结果作废
      if (seq !== availabilitySeq || rules.value.length !== rowCount) return
      const next = new Array(rowCount).fill(0)
      ready.forEach(({ idx }, i) => (next[idx] = res.counts[i] ?? 0))
      ruleCounts.value = next
      maxDistinct.value = res.maxDistinct
      // 题库范围缩小后可用量可能降到已填数量之下，:max 不回收已有值，这里主动收敛并告知
      const clamped: number[] = []
      rules.value.forEach((r, idx) => {
        const cap = next[idx]
        if (cap > 0 && r.drawCount > cap) {
          r.drawCount = cap
          clamped.push(idx + 1)
        }
      })
      if (clamped.length) {
        ElMessage.info(`第 ${clamped.join('、')} 条规则的抽取数量已按可用题量下调`)
      }
    } catch {
      if (seq !== availabilitySeq) return
      ruleCounts.value = rules.value.map(() => 0)
      maxDistinct.value = 0
    }
  }

  // 题库范围或任一规则条件变化后重新探测（条件字段序列化成 key，避免数量/分值改动也触发请求）
  watch(
    () => [
      form.bankIds.join(','),
      rules.value.map((r) => `${r.questionType}|${r.difficulty}|${r.knowledgePointId}`).join(';')
    ],
    () => refreshRuleAvailability(),
    { immediate: true }
  )

  /** 随机试卷：新增一行抽题规则 */
  function addRule() {
    rules.value.push({
      questionType: '',
      difficulty: '',
      knowledgePointId: 0,
      kpPath: [],
      drawCount: 1,
      scorePerQuestion: 1
    })
  }

  /**
   * 编辑态：拉取详情并回填表单
   * @param id 试卷 ID
   * @param seq 调用方的 pageSeq 快照；每个 await 之后都要确认自己仍是最新一次初始化，
   *            否则旧卷的响应会覆盖新卷已回填的表单
   */
  async function loadForEdit(id: number, seq: number) {
    const { data } = await paperApi.getDetail(id)
    if (seq !== pageSeq) return
    /*
      随机卷有两种编辑目标，用 mode 区分：

      默认（无 mode）改抽题规则；mode=questions 改已生成的卷面题目，
      此时走固定卷那套题目编辑界面——生成后题目已固化在卷上，与固定卷同构。
    */
    const editQuestions = route.query.mode === 'questions'
    formType.value = data.type === 'random' && !editQuestions ? 'random' : 'fixed'
    form.name = data.name
    form.suggestDuration = data.suggestDuration
    form.bankIds = [...data.bankIds]
    // 详情已返回与 bankIds 同序的 bankNames，直接组装已选项，无需再查题库列表
    selectedBanks.value = data.bankIds.map((id, i) => ({
      id,
      name: data.bankNames?.[i] || `题库 #${id}`
    }))
    /*
      回填抽题权重（与 bankIds 同序）。

      存量随机卷没有权重、库里是 0，合计不为 1 会卡住保存，
      故这种情况按均分兜底——等价于旧行为里「各库不作区分」的语义。
    */
    if (data.type === 'random') {
      const stored: Record<number, number> = {}
      data.bankIds.forEach((id, i) => (stored[id] = data.bankWeights?.[i] ?? 0))
      bankWeights.value = stored
      const sum = Object.values(stored).reduce((s, w) => s + w, 0)
      if (Math.abs(sum - 1) > 1e-6) distributeWeightsEvenly()
    }
    // 共享设置不回填也不提交，由列表页「共享」入口单独维护
    aiForm.knowledgeDistribution = data.knowledgeDistribution ?? ''
    // 按 formType 而非 data.type 分支：随机卷的题目编辑模式要走下面的题目回填
    if (formType.value === 'random') {
      rules.value = data.rules.map((r) => ({
        questionType: r.questionType,
        difficulty: r.difficulty,
        knowledgePointId: r.knowledgePointId,
        kpPath: findKpPath(r.knowledgePointId),
        drawCount: r.drawCount,
        scorePerQuestion: r.scorePerQuestion
      }))
    } else {
      await loadQuestionPool(seq)
      if (seq !== pageSeq) return
      // 分值回填：普通题用卷里存的值；材料题改用小题之和。
      // 卷里存的材料题分值可能与小题现状不符（判分只认小题分），照搬会把不一致的数带回来。
      // 池里已有的材料题由 loadQuestionPool 按 suggestedScore 写好，这里只补池外的（合并进来的）。
      data.questions.forEach((q) => {
        if (q.questionType !== 'composite') {
          scoreMap[q.questionId] = q.score
        } else if (scoreMap[q.questionId] == null) {
          // 小题分累加同样会带出浮点尾数，材料题分值会直接渲染到表格，故规整后再写入
          const childSum = round2((q.children ?? []).reduce((s, c) => s + c.score, 0))
          scoreMap[q.questionId] = childSum || q.score
        }
      })
      mergeReferencedQuestions(data.questions)
      // 回填勾选：写入持久集合，watcher 会同步表格勾选态
      selectedIds.value = new Set(data.questions.map((q) => q.questionId))
      await nextTick()
      if (seq !== pageSeq) return
      syncTableSelection()
    }
  }

  /** 按持久集合同步表格勾选态（reserve-selection 下表格自持状态，需主动对齐） */
  function syncTableSelection() {
    const table = questionTableRef.value
    if (!table) return
    filteredPool.value.forEach((row) => {
      table.toggleRowSelection(row, selectedIds.value.has(row.id))
    })
  }

  // 筛选变化导致可见行变化后，重新对齐表格勾选态
  watch(filteredPool, () => nextTick(syncTableSelection))

  /** 保存（按组卷类型分派） */
  async function handleSubmit() {
    // 保存也带世代快照：请求飞行期间用户可能已切到别的试卷，
    // 那时不能再按本次结果跳路由/关标签，否则会把人从正在编辑的另一份试卷里拽走
    const seq = pageSeq
    try {
      await formRef.value?.validate()
      // 不含 visibleScope/shareLevel：新增由后端兜底 self + manage（最小可见，避免新建瞬间
      // 全组织可读到答案），编辑时后端检测到字段缺失会跳过共享列不写，保住列表页配好的设置
      // bankIds 只给固定/AI 卷；随机卷改用带权重的 banks，
      // 服务端开了 forbidNonWhitelisted，多传 bankIds 会被 400 拒绝
      const base = {
        name: form.name.trim(),
        suggestDuration: form.suggestDuration
      }

      if (formType.value === 'random') {
        if (!rules.value.length) return ElMessage.warning('请至少添加一条抽题规则')
        // 难度/知识点留空即「不限」，不参与必填校验
        const invalid = rules.value.some(
          (r) => !r.questionType || !r.drawCount || !r.scorePerQuestion
        )
        if (invalid) return ElMessage.warning('请完善每条抽题规则的题型、抽取数量、每题分值')
        const emptyIdx = rules.value.findIndex((_, i) => !ruleCounts.value[i])
        if (emptyIdx >= 0) {
          return ElMessage.warning(`第 ${emptyIdx + 1} 条抽题规则在所选题库中没有可用题目`)
        }
        if (overlapShort.value) {
          return ElMessage.warning(`抽题规则条件重叠，去重后仅 ${maxDistinct.value} 题可用`)
        }
        if (!weightSumValid.value) {
          return ElMessage.warning(`题库权重合计须为 1.00，当前 ${weightSum.value.toFixed(2)}`)
        }
        if (selectedBanks.value.some((b) => !(bankWeights.value[b.id] > 0))) {
          return ElMessage.warning('每个题库的权重都必须大于 0，不参与抽题的题库请移除')
        }
        const payload = {
          ...base,
          // 权重随题库一起提交，服务端按此比例把每条规则的抽取数量拆到各库
          banks: selectedBanks.value.map((b) => ({
            bankId: b.id,
            weight: bankWeights.value[b.id] || 0
          })),
          rules: rules.value.map((r) => ({
            questionType: r.questionType,
            // clearable 清空后是 undefined，统一归成空串／0 表示「不限」
            difficulty: r.difficulty || '',
            knowledgePointId: r.knowledgePointId || 0,
            drawCount: r.drawCount,
            scorePerQuestion: r.scorePerQuestion
          }))
        }
        submitLoading.value = true
        if (isEditing.value && editingId.value) {
          await paperApi.updateRandom({ id: editingId.value, ...payload })
        } else {
          await paperApi.addRandom(payload)
        }
      } else {
        /*
          固定 / AI 组卷统一走固定试卷接口。

          不再传 sortNo：卷面顺序由服务端按题型统一重排（PaperService.sortItemsByQuestionType），
          让预览、导出与考生端答题共用一个顺序。服务端 DTO 已移除该字段，
          而全局 ValidationPipe 开了 forbidNonWhitelisted，多传会被 400 拒绝。
          题目的相对次序仍以数组顺序表达，服务端在同题型内保留它。
        */
        let items: Array<{ questionId: number; score: number }> = []
        if (formType.value === 'ai') {
          if (!aiItems.value.length) return ElMessage.warning('请先生成组卷方案')
          items = aiItems.value.map((i) => ({ questionId: i.questionId, score: i.score }))
        } else {
          if (!selectedQuestions.value.length) return ElMessage.warning('请至少选择一道题目')
          items = selectedQuestions.value.map((q) => ({
            questionId: q.id,
            score: scoreMap[q.id] || 0
          }))
        }
        const payload = {
          ...base,
          bankIds: form.bankIds,
          items,
          knowledgeDistribution: aiForm.knowledgeDistribution || undefined
        }
        submitLoading.value = true
        if (isEditing.value && editingId.value) {
          await paperApi.updateFixed({ id: editingId.value, ...payload })
        } else {
          await paperApi.addFixed(payload)
        }
      }
      // 保存结果照实提示（哪怕人已切走，也得让他知道那次保存成功了，静默更糟），
      // 但只有仍在同一次页面初始化时才跳回列表，避免打断用户在新试卷上的操作
      ElMessage.success(isEditing.value ? '编辑成功' : '新增成功')
      if (seq === pageSeq) await handleBack()
    } catch (error: any) {
      // 失败同样照实提示，不因切页而静默
      if (error !== false && error) ElMessage.error(error.message || '保存失败')
    } finally {
      // 过期的保存不要复位新一次页面的按钮态（换页时 resetState 已兜底置回 false）
      if (seq === pageSeq) submitLoading.value = false
    }
  }

  /**
   * 清空全部表单态，回到「新增」初值
   * 复用同一实例换试卷时必须先清干净：否则上一份的题库、勾选、分值、抽题规则会渗到下一份，
   * 编辑态只回填自己有的字段，漏掉的字段就会留着上一份的值
   */
  function resetState() {
    Object.assign(form, createForm())
    formRef.value?.clearValidate()
    selectedBanks.value = []
    // 抽屉开着时换试卷，它绑定的 selectedBanks 已被清空，留着会显示成另一份卷的空选择
    bankPickerVisible.value = false
    aiForm.totalScore = 100
    aiForm.knowledgeDistribution = ''
    aiItems.value = []
    questionPool.value = []
    selectedIds.value = new Set()
    // 过期的 loadQuestionPool / handleAiCompose 按设计不复位 loading（免得关掉新一次的遮罩），
    // 但换页后若新流程压根不调它们（随机卷 / 新增空白卷），就没人来关，遮罩会永久转圈。
    // 故在这里兜底，与上面清空 questionPool / aiItems 对称。
    questionLoading.value = false
    aiLoading.value = false
    submitLoading.value = false
    Object.keys(scoreMap).forEach((k) => delete scoreMap[Number(k)])
    questionTableRef.value?.clearSelection()
    Object.assign(poolFilter, { keyword: '', bankId: undefined, type: '', difficulty: '' })
    rules.value = []
    ruleCounts.value = []
    maxDistinct.value = 0
    // 作废所有在途的抽题量探测：它用的是独立的 availabilitySeq，不跟 pageSeq 联动。
    // 若不在这里自增，从随机卷切走时上一卷在途的探测响应回来仍会写 ruleCounts/maxDistinct
    // （固定卷分支提前 return 不会自增序号，拦不住它），残留值会被新随机卷的保存校验读到。
    availabilitySeq++
    formType.value = 'fixed'
  }

  /** 按当前 query 初始化页面（新增态看 type，编辑态拉详情回填） */
  async function initPage() {
    const seq = ++pageSeq
    resetState()
    pageLoading.value = true
    const editingTarget = isEditing.value && editingId.value ? editingId.value : null
    try {
      // 新增态：type 由 query 决定；编辑态：type 由详情决定
      const qType = route.query.type
      if (qType === 'fixed' || qType === 'ai' || qType === 'random') formType.value = qType
      await loadBaseData()
      if (seq !== pageSeq) return
      if (editingTarget) {
        await loadForEdit(editingTarget, seq)
      }
    } catch (error: any) {
      // 已被更新的初始化取代时不打扰用户，也不要抢跳路由
      if (seq !== pageSeq) return
      ElMessage.error(error.message || '加载数据失败')
      // 编辑态加载失败会停在「已清空但未回填」的空表单上，标题却仍写着「编辑试卷」，
      // 容易被误读成原试卷数据被清空，故直接退回列表
      if (editingTarget) await handleBack()
    } finally {
      // 过期的初始化不该把新一次的 loading 关掉
      if (seq === pageSeq) pageLoading.value = false
    }
  }

  onMounted(initPage)

  /**
   * query 变化时重新初始化
   * 布局的 <component :key="route.path"> 不含 query，且该菜单在库里配了 keepAlive，
   * 于是 /paper-edit?id=4 → ?id=7 既不换 key 也不销毁实例，onMounted 不会再跑，
   * 只能靠这里兜住，否则打开的是上一份试卷的数据
   */
  watch(
    () => route.fullPath,
    () => {
      // 组件被缓存时切到别的页也会触发，路由已不在本页就跳过
      if (route.path !== '/paper-edit') return
      initPage()
    }
  )
</script>

<style lang="scss" scoped>
  .paper-edit {
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: 100%;

    // 顶部标题行：裸行不带卡片背景，省掉一层 12px 内边距
    .page-header {
      display: flex;
      flex-shrink: 0;
      gap: 12px;
      align-items: center;
      padding: 0 4px;

      .back-btn {
        font-size: 14px;
        color: var(--el-text-color-regular);

        &:hover {
          color: var(--el-color-primary);
        }
      }

      // 返回与标题之间的竖线，替代原先靠间距硬分隔
      .header-divider {
        width: 1px;
        height: 14px;
        background: var(--el-border-color);
      }

      .page-title {
        font-size: 16px;
        font-weight: 600;
      }
    }

    .body-card {
      flex: 1;
      overflow: hidden;
      border: none !important;
      border-radius: 12px;
      box-shadow: none !important;

      :deep(.el-card__body) {
        height: 100%;
        padding: 20px;
        overflow-y: auto;
      }

      // 表单两列网格：原先单列纵向堆叠，右侧留大片空白且把选题区推到折叠线以下。
      // 窄屏(<1100px)自动退回单列，避免两列各自过窄。
      .edit-form {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0 24px;

        @media (width <= 1100px) {
          grid-template-columns: minmax(0, 1fr);
        }

        // 题库范围/知识点分布/按钮行占满整行
        .span-2 {
          grid-column: 1 / -1;
        }

        // 数字输入在网格列内自适应，替代原先的固定 200px
        .num-fill {
          flex: 1 1 auto;
          min-width: 0;
        }

        // 题库范围：选择按钮 + 已选标签流式排列
        .bank-field {
          display: flex;
          flex-wrap: nowrap;
          gap: 12px;
          align-items: center;
          width: 100%;

          // 按钮定宽不参与压缩，标签区吃掉剩余宽度
          > .el-button {
            flex-shrink: 0;
          }

          // 随机卷：改纵向排布，按钮与权重面板分两行
          &.is-weighted {
            flex-direction: column;
            gap: 8px;
            align-items: stretch;
          }

          .bank-field-head {
            display: flex;
            gap: 12px;
            align-items: center;
            min-width: 0;

            > .el-button {
              flex-shrink: 0;
            }
          }

          .bank-count {
            font-size: 12px;
            color: var(--el-text-color-secondary);
          }

          .bank-tags {
            display: flex;
            flex: 1 1 0;
            flex-wrap: wrap;
            gap: 8px;
            align-items: center;
            min-width: 0;
            // 选得多时限高滚动，避免表单被标签撑高
            max-height: 72px;
            overflow-y: auto;
          }

          .bank-empty {
            font-size: 13px;
            color: var(--el-text-color-placeholder);
          }

          /*
            随机卷的权重面板。

            铺满整行而非限宽：多出来的横向空间给占比条用，
            比例直接画出来，不必让人从 0.33 反推「三成」。
            库名定宽，各行的占比条起点因此对齐——这是这块看起来齐整的关键。
          */
          .bank-weights {
            width: 100%;
            overflow: hidden;
            background: var(--el-fill-color-blank);
            border: 1px solid var(--el-border-color-lighter);
            border-radius: 4px;

            .bw-list {
              // 库多时只让列表滚动，合计行留在外面始终可见
              max-height: 148px;
              overflow-y: auto;
            }

            .bw-row {
              display: flex;
              gap: 10px;
              align-items: center;
              height: 40px;
              padding: 0 10px;

              & + .bw-row {
                border-top: 1px solid var(--el-border-color-lighter);
              }

              &:hover {
                background: var(--el-fill-color-light);
              }
            }

            // 定宽而非 flex：各行占比条的起点要落在同一竖线上
            .bw-name {
              flex: 0 0 160px;
              min-width: 0;
              // 库名过长时截断，不挤掉后面的占比条
              overflow: hidden;
              font-size: 13px;
              color: var(--el-text-color-primary);
              text-overflow: ellipsis;
              white-space: nowrap;
            }

            // 占比条吃掉剩余宽度，把权重比例可视化
            .bw-bar {
              flex: 1 1 0;
              min-width: 0;
              height: 6px;
              overflow: hidden;
              background: var(--el-fill-color);
              border-radius: 3px;

              // 合计不为 1 时整组条变灰，暗示当前比例不可用
              &.is-bad .bw-bar-fill {
                background: var(--el-color-danger-light-5);
              }
            }

            .bw-bar-fill {
              height: 100%;
              background: var(--el-color-primary);
              border-radius: 3px;
              transition: width 0.2s ease;
            }

            .bw-pct {
              flex: 0 0 34px;
              font-size: 12px;
              // 数字等宽，多行百分比右缘才齐
              font-variant-numeric: tabular-nums;
              color: var(--el-text-color-regular);
              text-align: right;
            }

            .bw-input {
              flex: 0 0 96px;
            }

            .bw-del {
              flex-shrink: 0;
            }

            .bw-foot {
              display: flex;
              align-items: center;
              justify-content: space-between;
              height: 34px;
              padding: 0 10px;
              font-size: 12px;
              background: var(--el-fill-color-lighter);
              border-top: 1px solid var(--el-border-color-lighter);
            }

            .bw-sum {
              color: var(--el-text-color-secondary);

              // 合计不为 1 时标红，保存前就能看出问题
              &.is-bad {
                font-weight: 500;
                color: var(--el-color-danger);
              }
            }
          }
        }

        // 栅格已提供列间距，去掉 ElFormItem 默认底部外边距造成的行距不均
        :deep(.el-form-item) {
          margin-bottom: 18px;
        }
      }
    }

    /*
      与 exam-edit / practice-edit 同观感：按钮靠右、整圈边框 + 投影。
      但不改结构、也不加 sticky——本页主体是 .body-card 内部滚动（内含两层
      嵌套滚动的选题区），底部条被 flex:1 的卡片顶在底部，本来就一直可见，
      且已有 20px 下间距（来自 .art-page-view 的 padding-bottom）。
    */
    .footer-bar {
      display: flex;
      flex-shrink: 0;
      gap: 12px;
      justify-content: flex-end;
      padding: 12px 20px;
      background: var(--el-bg-color);
      border: 1px solid var(--art-border-color);
      border-radius: 12px;
      box-shadow: 0 2px 16px rgb(0 0 0 / 10%);
    }
  }

  .section-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 16px 0 10px;
    font-size: 14px;
    font-weight: 600;

    // 标题行右侧：题量总分 + 操作按钮同行
    .title-extra {
      display: flex;
      gap: 16px;
      align-items: center;
    }

    .title-summary {
      font-size: 13px;
      font-weight: 400;
      color: var(--el-text-color-regular);

      b {
        margin: 0 2px;
        color: var(--el-color-primary);
      }
    }
  }

  // 组卷两列布局：左选题卡片 + 右结构预览卡片，左右均分；窄屏换行
  .compose-layout {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: stretch;

    // 左选题卡片：不与右侧预览均分。左侧需容纳题干+题库/题型/难度/分值四列，
    // 原先 1:1 会把题干列压到只剩十来个字符（靠 tooltip 才能看全），故给 1.4 倍权重。
    .compose-card {
      display: flex;
      flex: 1.4 1 0;
      flex-direction: column;
      min-width: 480px;
      overflow: hidden;
      background: var(--el-fill-color-light);
      border-radius: 12px;

      .card-head {
        display: flex;
        gap: 10px;
        align-items: baseline;
        padding: 16px 16px 12px;

        .card-title {
          font-size: 15px;
          font-weight: 600;
        }

        .card-sub {
          font-size: 12px;
          color: var(--el-text-color-secondary);
        }
      }

      // 筛选栏：原先 4 项固定宽度不可收缩，容器变窄时最后一项「难度」被裁出可视区。
      // 改为允许换行 + 可收缩，三个下拉在窄屏整体折到第二行而非被切断。
      .filter-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        padding: 0 16px 12px;

        .f-keyword {
          flex: 1 1 180px;
          min-width: 0;
        }

        .f-item {
          flex: 1 1 120px;
          min-width: 0;
          max-width: 150px;
        }
      }

      .summary-bar {
        padding: 12px 16px 16px;
      }

      // 表格背景透明，融入填充卡片；圆角内收
      :deep(.el-table) {
        width: calc(100% - 24px);
        // ElTable 默认 width:100% 按父容器算，若只写 margin 会让总占用变成「父宽 + 24px」，
        // 右侧固定溢出一截把最后一列（分值）裁掉，故宽度同步减去左右外边距
        margin: 0 12px;
        background: transparent;
        border-radius: 8px;

        tr,
        th.el-table__cell {
          background: transparent;
        }
      }

      // 材料题的分值为派生只读值：做成灰色文本，与可编辑的数字输入框区分开
      .composite-score {
        display: inline-block;
        color: var(--el-text-color-secondary);
        cursor: default;
      }
    }
  }

  .overlap-tip {
    font-size: 12px;
    font-weight: 400;
    color: var(--el-color-danger);
  }

  // 抽取数量单元格：输入框 + 右侧可用题量提示
  .draw-cell {
    display: flex;
    gap: 8px;
    align-items: center;

    :deep(.el-input-number) {
      flex: 1;
      min-width: 0;
    }
  }

  .avail-tip {
    flex: none;
    font-size: 12px;
    color: var(--el-text-color-secondary);
    white-space: nowrap;

    // 可用为 0 时标红，提示这条规则抽不出题
    &.is-empty {
      color: var(--el-color-danger);
    }
  }

  // 表头必填星号：与 ElFormItem 自带的必填标记同色同间距
  .req {
    margin-right: 4px;
    color: var(--el-color-danger);
  }

  .summary-bar {
    margin-top: 10px;
    font-size: 13px;
    color: var(--el-text-color-regular);
    text-align: right;

    b {
      margin: 0 2px;
      color: var(--el-color-primary);
    }
  }

  .unit-tip {
    margin-left: 8px;
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }
</style>
