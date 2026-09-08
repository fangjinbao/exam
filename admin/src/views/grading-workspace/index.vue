<!--
  阅卷工作台：左「待批阅」考生名单 + 中卷面逐题批阅 + 右答题卡
  从阅卷中心某场考试进入（考试 id 走 query）。只做主观题人工阅卷，客观题只读展示自动判分结果。
-->

<template>
  <!-- 高度实测注入：不锁高度则长卷面会把底部「提交批阅」推出视口，详见 useFillHeight -->
  <div ref="rootRef" class="workspace" :style="{ height: fillHeight }">
    <!-- 页头：与 exam-detail / exam-edit 一致，不套卡片 -->
    <div class="page-header">
      <ElButton link :icon="ArrowLeft" class="back-btn" @click="handleBack">返回阅卷中心</ElButton>
      <span class="header-divider" />
      <span class="page-title">{{ headerTitle }}</span>
      <span class="head-progress">
        待批阅 <b :class="pendingTotal > 0 ? 'num-warn' : 'num-ok'">{{ pendingTotal }}</b> / 共
        {{ candidates.length }} 人
      </span>
    </div>

    <div class="body">
      <!-- 左：待批阅考生名单 -->
      <CandidateRoster
        v-model:keyword="keyword"
        :list="filteredCandidates"
        :current-id="currentSheetId"
        :pending-count="pendingTotal"
        :loading="rosterLoading"
        @select="handleSelect"
      />

      <!-- 中：当前考生卷面 -->
      <div class="center-card">
        <template v-if="currentSheetId !== null">
          <SheetHeader
            :detail="detail"
            :exam-name="examName"
            :fallback-name="current?.candidateName || ''"
            :has-prev="hasPrev"
            :has-next="hasNext"
            :unlocked="unlocked"
            :can-unlock="canUnlock"
            @publish="handlePublish"
            @withdraw="handleWithdraw"
            @step="handleStep"
            @toggle-unlock="handleToggleUnlock"
          />
          <ElTabs v-model="activeTab" class="sheet-tabs">
            <ElTabPane name="pending">
              <template #label>待批阅（{{ pendingItemCount }}）</template>
            </ElTabPane>
            <ElTabPane label="全部" name="all" />
          </ElTabs>

          <!-- 卷面独立滚动，页头与页签保持可见 -->
          <div class="paper-scroll">
            <SheetPaper
              :sections="visibleSections"
              :loading="detailLoading"
              :readonly="detail?.scorePublished ?? false"
              :unlocked="unlocked"
              :type-label="typeLabel"
              :empty-text="activeTab === 'pending' ? '主观题已全部批阅完' : '本卷暂无题目'"
              @score="handleScore"
              @comment="handleComment"
            />
          </div>

          <div class="foot-bar">
            <span class="foot-hint">
              本卷主观题 {{ subjectiveTotal }} 题，已填 {{ draftFilledCount }} 题
            </span>
            <!-- 不用 v-auth：本页菜单节点存在但不带 perms（isShow=0），authList 结构性恒为空
                 会隐藏按钮，权限由后端 @Perms('review') 兜底。完整原因见 SheetHeader.vue 顶部 -->
            <ElButton
              type="primary"
              size="large"
              :icon="Check"
              :loading="reviewLoading"
              :disabled="detail?.scorePublished || !draftFilledCount"
              @click="handleSubmitReview"
            >
              提交批阅
            </ElButton>
          </div>
        </template>
        <ElEmpty v-else description="请从左侧选择考生" />
      </div>

      <!-- 右：答题卡 -->
      <AnswerCardPanel
        v-if="currentSheetId !== null"
        :sections="allSections"
        :type-label="typeLabel"
        @locate="handleLocate"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, onMounted, nextTick } from 'vue'
  import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { ArrowLeft, Check } from '@element-plus/icons-vue'
  import {
    gradingApi,
    type GradingCandidate,
    type SheetDetail,
    type ReviewItemPayload
  } from '@/api/grading'
  import { dataDictApi } from '@/api/dataDict'
  import { groupByType } from '@/utils/paperStructure'
  import type { GradingRow, GradingSection } from './types'
  import CandidateRoster from './components/CandidateRoster.vue'
  import SheetHeader from './components/SheetHeader.vue'
  import SheetPaper from './components/SheetPaper.vue'
  import AnswerCardPanel from './components/AnswerCardPanel.vue'
  import { useFillHeight } from '@/composables/useFillHeight'

  defineOptions({ name: 'GradingWorkspace' })

  const route = useRoute()
  const router = useRouter()

  // 根容器高度实测：不锁高度则底部操作栏会被长卷面推出视口
  const rootRef = ref<HTMLElement>()
  const { height: fillHeight } = useFillHeight(rootRef)

  const examId = Number(route.query.id)
  /** 考试名从列表页带过来，避免为一个标题再拉一次考试详情 */
  const examName = String(route.query.name || '')
  /** mode=quick 由「快速批阅」带入：优先落到第一个待批阅的考生；「查看详情」进来则按名单顺序 */
  const quickMode = route.query.mode === 'quick'

  const rosterLoading = ref(false)
  const candidates = ref<GradingCandidate[]>([])
  const keyword = ref('')
  const currentSheetId = ref<number | null>(null)
  const activeTab = ref<'pending' | 'all'>('pending')

  const detailLoading = ref(false)
  const detail = ref<SheetDetail | null>(null)
  /** 卷面各题（含本次未提交的草稿分与草稿评语） */
  const rows = ref<GradingRow[]>([])
  const reviewLoading = ref(false)
  /**
   * 是否已解锁改分（仅本次会话有效，换卷即复位）
   *
   * 已批阅的主观题默认只读展示，避免误触改掉已确认的分。
   * 要纠正打错的分须显式解锁；成绩已发布时不给解锁入口，得先撤回成绩。
   */
  const unlocked = ref(false)

  /** 题型字典：分大题顺序与中文名都取自它 */
  const questionTypes = ref<{ value: string; name: string }[]>([])

  const current = computed(() => candidates.value.find((c) => c.id === currentSheetId.value))
  const headerTitle = computed(() => detail.value?.examName || examName || '阅卷工作台')

  /** 整场未阅完人数（页头进度 + 左栏表头括号内数字） */
  const pendingTotal = computed(
    () => candidates.value.filter((c) => c.pendingSubjectiveCount > 0).length
  )

  const filteredCandidates = computed(() => {
    const kw = keyword.value.trim()
    if (!kw) return candidates.value
    return candidates.value.filter(
      (c) => c.candidateName.includes(kw) || (c.orgName || '').includes(kw)
    )
  })
  /** 当前考生在筛选后名单中的位置，决定上一份/下一份是否可用 */
  const currentIndex = computed(() =>
    filteredCandidates.value.findIndex((c) => c.id === currentSheetId.value)
  )
  const hasPrev = computed(() => currentIndex.value > 0)
  const hasNext = computed(
    () => currentIndex.value >= 0 && currentIndex.value < filteredCandidates.value.length - 1
  )

  /** 题型 value → 中文名，字典缺失时回落 value，不显示空白 */
  function typeLabel(type: string): string {
    return questionTypes.value.find((t) => t.value === type)?.name || type || '其他'
  }

  /**
   * 按题型分大题
   * 组内题号从 1 重编（大题内序号），与答题卡按钮口径一致。
   */
  function buildSections(list: GradingRow[]): GradingSection[] {
    const order = questionTypes.value.map((t) => t.value)
    return groupByType(
      list,
      (item) => item.questionType,
      (item) => item.fullScore,
      order
    ).map((section) => ({
      ...section,
      items: section.items.map((item, i) => ({ ...item, indexInSection: i + 1 }))
    }))
  }

  /** 全卷大题（右侧答题卡与「全部」页签共用） */
  const allSections = computed(() => buildSections(rows.value))

  /** 待批阅：只留未评分的主观题 */
  const pendingSections = computed(() =>
    buildSections(rows.value.filter((r) => r.questionCategory === 'subjective' && r.score === null))
  )

  const visibleSections = computed(() =>
    activeTab.value === 'pending' ? pendingSections.value : allSections.value
  )

  const subjectiveRows = computed(() =>
    rows.value.filter((r) => r.questionCategory === 'subjective')
  )
  const subjectiveTotal = computed(() => subjectiveRows.value.length)
  const pendingItemCount = computed(
    () => subjectiveRows.value.filter((r) => r.score === null).length
  )
  /**
   * 本次有改动待提交的题
   *
   * 两类都算改动：打了分（draftScore 有值），以及只改了评语——
   * 后者若不算，解锁后光改评语点提交会静默什么也不发生。
   * 只改评语时沿用该题已存的分数作为 scoreAfter，故要求 score 非空。
   */
  const dirtyRows = computed(() =>
    subjectiveRows.value.filter(
      (r) => r.draftScore !== null || (r.score !== null && r.draftComment !== r.reviewComment)
    )
  )
  /** 本次已填但未提交的题数，决定提交按钮是否可用 */
  const draftFilledCount = computed(() => dirtyRows.value.length)

  /**
   * 是否给出解锁入口
   *
   * 两个条件：成绩未发布（已发布须先撤回，这是发布的意义所在），
   * 且本卷确有已批阅的主观题（一道都没评时全卷本就可编辑，给个解锁按钮只会让人困惑）。
   */
  const canUnlock = computed(
    () => !detail.value?.scorePublished && subjectiveRows.value.some((r) => r.score !== null)
  )

  /** 解锁 / 收起改分。解锁前若有未提交草稿，收起会丢弃，故先确认 */
  async function handleToggleUnlock() {
    if (unlocked.value) {
      if (!(await confirmDiscardDraft())) return
      // 收起时丢弃本次草稿，回到已存分数与评语的只读展示
      rows.value.forEach((r) => {
        r.draftScore = null
        r.draftComment = r.reviewComment ?? ''
      })
      unlocked.value = false
      return
    }
    unlocked.value = true
  }

  /** 打分：记到草稿，提交后才落库 */
  function handleScore({ id, score }: { id: number; score: number | null }) {
    const row = rows.value.find((r) => r.id === id)
    if (row) row.draftScore = score
  }

  function handleComment({ id, comment }: { id: number; comment: string }) {
    const row = rows.value.find((r) => r.id === id)
    if (row) row.draftComment = comment
  }

  /** 答题卡点题号：滚动到卷面对应题；若该题不在当前页签则先切到「全部」 */
  async function handleLocate(itemId: number) {
    const inView = visibleSections.value.some((s) => s.items.some((i) => i.id === itemId))
    if (!inView) {
      activeTab.value = 'all'
      await nextTick()
    }
    const el = document.getElementById(`q-${itemId}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  /** 加载题型字典（分大题顺序的唯一来源） */
  async function loadDict() {
    try {
      const { data } = await dataDictApi.getData(['question_type'])
      questionTypes.value = data.question_type || []
    } catch {
      // 字典失败不阻断阅卷：typeLabel 回落 value，分组退化为出现顺序
      questionTypes.value = []
    }
  }

  /** 加载考生名单，默认选中第一个待批阅的人（都阅完就选第一个） */
  async function loadRoster(keepCurrent = false) {
    if (!examId) {
      ElMessage.error('缺少考试参数')
      return
    }
    rosterLoading.value = true
    try {
      const { data } = await gradingApi.getExamCandidates(examId)
      candidates.value = data
      if (keepCurrent && currentSheetId.value !== null) return
      const firstPending = data.find((c) => c.pendingSubjectiveCount > 0)
      // 快速批阅优先落到待批阅的人；查看详情按名单顺序，不越过已阅完的卷
      const target = (quickMode ? (firstPending ?? data[0]) : data[0]) ?? null
      if (target) selectSheet(target.id)
    } catch (error: any) {
      ElMessage.error(error.message || '加载考生名单失败')
    } finally {
      rosterLoading.value = false
    }
  }

  /**
   * 加载整卷详情，已评过的题带出原分数，草稿清空
   *
   * @param isInitial 是否首次打开这份卷。只有首次才决定初始页签——
   * 提交评分/发布/撤回后也会调用本函数刷新，此时若重设页签会把阅卷员
   * 当前停留的页签抢走（在「全部」下打完分点提交，视图会跳回「待批阅」）。
   */
  async function loadSheetDetail(isInitial = false) {
    if (currentSheetId.value === null) return
    detailLoading.value = true
    try {
      const { data } = await gradingApi.getSheetDetail(currentSheetId.value)
      detail.value = data
      // 草稿评语用已存评语打底：不回填则改分时评语框空着，
      // 提交后会把原评语覆盖成空串（提交总是带 reviewComment 字段）
      rows.value = data.items.map((item) => ({
        ...item,
        draftScore: null,
        draftComment: item.reviewComment ?? ''
      }))
      if (isInitial) {
        // 快速批阅落到「待批阅」直接开工；查看详情落到「全部」看全卷。
        // 没有待批阅主观题时一律落「全部」，免得开局就是空页签。
        const preferPending = quickMode && pendingItemCount.value > 0
        activeTab.value = preferPending ? 'pending' : 'all'
      }
    } catch (error: any) {
      ElMessage.error(error.message || '加载答卷失败')
    } finally {
      detailLoading.value = false
    }
  }

  /** 切换到某份答卷（换人算首次打开，页签按 mode 重新决定） */
  function selectSheet(sheetId: number) {
    currentSheetId.value = sheetId
    detail.value = null
    rows.value = []
    // 解锁只对当前这份卷生效，换人必须复位，否则下一份卷开局就是可改状态
    unlocked.value = false
    loadSheetDetail(true)
  }

  async function handleSelect(c: GradingCandidate) {
    if (c.id === currentSheetId.value) return
    if (!(await confirmDiscardDraft())) return
    selectSheet(c.id)
  }

  /** 上一份 / 下一份，按左侧筛选后的顺序走 */
  async function handleStep(step: number) {
    const next = filteredCandidates.value[currentIndex.value + step]
    if (!next) return
    if (!(await confirmDiscardDraft())) return
    selectSheet(next.id)
  }

  /**
   * 有未提交草稿时先征求确认
   *
   * 打的分只存在本地 draftScore，不点「提交批阅」不落库。返回、切换考生、
   * 上/下一份都会丢弃草稿，静默丢失等于阅卷员白干一遍，故离开前必须拦一下。
   *
   * @returns true 表示可以继续离开
   */
  async function confirmDiscardDraft(): Promise<boolean> {
    if (!draftFilledCount.value) return true
    try {
      // 文案说「评分或评语」：dirtyRows 也含「只改评语、分数未变」的题，
      // 只说「已打分」会让只改了评语的阅卷员以为提示错了、放心离开
      await ElMessageBox.confirm(
        `有 ${draftFilledCount.value} 题的评分或评语尚未提交，离开将丢失这些改动。`,
        '未提交的改动',
        { type: 'warning', confirmButtonText: '放弃并离开', cancelButtonText: '留下继续' }
      )
      return true
    } catch {
      return false
    }
  }

  async function handleBack() {
    if (!(await confirmDiscardDraft())) return
    router.push('/grading')
  }
  /**
   * 提交批阅
   * 只提交本次填了分的题，允许分多次阅完一份卷；评语选填。
   */
  async function handleSubmitReview() {
    if (currentSheetId.value === null) return
    const scored = dirtyRows.value
    if (!scored.length) {
      ElMessage.warning('请先给至少一道题打分')
      return
    }
    for (const item of scored) {
      // 只改评语的题没有 draftScore，沿用已存分数（dirtyRows 已保证此时 score 非空）
      const score = item.draftScore ?? (item.score as number)
      if (score < 0 || score > item.fullScore) {
        ElMessage.warning(`第 ${item.questionNo} 题的得分需在 0~${item.fullScore} 之间`)
        return
      }
    }
    const payload: ReviewItemPayload[] = scored.map((r) => ({
      answerItemId: r.id,
      scoreAfter: r.draftScore ?? (r.score as number),
      reviewComment: r.draftComment.trim()
    }))
    try {
      reviewLoading.value = true
      await gradingApi.submitReview(currentSheetId.value, payload)
      // 只数「本次提交后仍未评」的题：scored 里可能含已评过的题（改分或只改评语），
      // 直接减 scored.length 会把剩余题数算少甚至算成负数
      const submitted = new Set(payload.map((p) => p.answerItemId))
      const remain = subjectiveRows.value.filter(
        (r) => r.score === null && !submitted.has(r.id)
      ).length
      // 提交即视为已确认，重新锁回只读；要再改须再次解锁
      unlocked.value = false
      ElMessage.success(remain > 0 ? `已保存，还有 ${remain} 题未评` : '本卷主观题已全部评完')
      // 评分改变了该考生的阅卷状态与待阅题数，卷面与名单一并刷新（保持当前选中的人不变）
      await Promise.all([loadSheetDetail(), loadRoster(true)])
    } catch (error: any) {
      ElMessage.error(error.message || '保存评分失败')
    } finally {
      reviewLoading.value = false
    }
  }

  /** 发布当前考生成绩 */
  async function handlePublish() {
    if (currentSheetId.value === null) return
    /*
      有任何未提交改动时直接拒绝发布，不给「放弃并继续」的选项。

      发布走的是服务端已存分数与评语，本地草稿不参与；发布后 loadSheetDetail()
      会用服务端数据覆盖 rows，草稿被静默抹掉。最坏情形是改分：发出去的正是
      阅卷员刚认定打错、正在改的那个旧分数，考生看到错成绩且无人知情。

      判据用 draftFilledCount（含「只改评语、分数未动」的题）而非只看 draftScore，
      是刻意从宽：纯改评语时发布的分数确实没争议，但「有未提交的改动就不许发布」
      这条规则对阅卷员只需解释一次，且代价仅是多点一次提交；若按改动类型分别处理，
      就得让人理解「改分会拦、改评语不拦」——规则复杂了，却没换来实际收益。

      其它离开路径（返回/切考生/后退）用 confirmDiscardDraft 让人二选一是合理的，
      那里丢的只是「还没干完的活」；这里可能丢的是「已知错误的分被当成正确结果发出去」，
      性质不同，故不给放弃选项，直接要求先提交。
    */
    if (draftFilledCount.value > 0) {
      ElMessage.warning(
        `有 ${draftFilledCount.value} 题的评分或评语尚未提交，请先点「提交批阅」再发布成绩`
      )
      return
    }
    try {
      await ElMessageBox.confirm('确认发布该考生成绩？发布后考生可查看。', '发布成绩', {
        type: 'warning'
      })
    } catch {
      return
    }
    try {
      await gradingApi.publishScore(currentSheetId.value)
      ElMessage.success('发布成绩成功')
      // 发布后一律锁回只读：此时解锁入口已隐去（canUnlock 依赖未发布），
      // 不复位会让卷面停在「输入框但全部禁用」的中间态，读起来像坏了
      unlocked.value = false
      await Promise.all([loadSheetDetail(), loadRoster(true)])
    } catch (error: any) {
      ElMessage.error(error.message || '发布成绩失败')
    }
  }

  /** 撤回当前考生成绩 */
  async function handleWithdraw() {
    if (currentSheetId.value === null) return
    try {
      await ElMessageBox.confirm('确认撤回该考生成绩？撤回后考生将无法查看。', '撤回成绩', {
        type: 'warning'
      })
    } catch {
      return
    }
    try {
      await gradingApi.withdrawScore(currentSheetId.value)
      ElMessage.success('撤回成绩成功')
      await Promise.all([loadSheetDetail(), loadRoster(true)])
    } catch (error: any) {
      ElMessage.error(error.message || '撤回成绩失败')
    }
  }

  // 浏览器后退、顶部页签关闭不走 handleBack，需在路由层再拦一次
  onBeforeRouteLeave(async () => (await confirmDiscardDraft()) || false)

  onMounted(async () => {
    // 字典先到位再分大题，否则首屏分组顺序会退化为出现顺序
    await loadDict()
    await loadRoster()
  })
</script>

<style lang="scss" scoped>
  @use './style';
</style>
