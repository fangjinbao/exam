<!--
  页面名称：PracticeAnswer - 在线练习作答

  功能描述：
    考生逐题练习作答，提交后即时显示对错判断与解析内容
    支持普通练习与错题再练习两种模式（由路由 query.mode 区分）

  路由信息：
    路径：/practice/answer
    名称：PracticeAnswer
    查询参数：bankId / knowledgePointId / name / mode(wrong)
    是否缓存：否
-->

<template>
  <div class="practice-answer-page">
    <van-nav-bar :title="pageTitle" left-arrow fixed placeholder @click-left="router.back()">
      <!-- 练习不限时，右上角展示本次已用时长 -->
      <template #right>
        <span class="elapsed-pill">{{ elapsedText }}</span>
      </template>
    </van-nav-bar>

    <van-loading v-if="loading" class="state-block" vertical>加载中</van-loading>

    <van-empty v-else-if="!answerable.length" :description="emptyText" />

    <template v-else-if="currentQuestion">
      <div class="content">
        <!-- 进度：当前题号 + 已答数 + 进度条 -->
        <div class="progress-head">
          <p class="progress-no">
            第 {{ currentIndex + 1 }} 题
            <span class="progress-total">/ {{ answerable.length }}</span>
          </p>
          <span class="answered-badge">已答 {{ answeredCount }}</span>
        </div>

        <div class="progress-bar">
          <div class="progress-bar__fill" :style="{ width: progressPercent }"></div>
        </div>

        <!--
          材料：当前小题属于某道材料题时，把共享材料展示在小题上方。
          练习是「一题一反馈」的节奏，故不像考试页那样一屏铺开全部小题，
          而是每道小题都带上它的材料，保证脱离上下文也能作答。
        -->
        <MaterialCard v-if="currentMaterial" :content="currentMaterial.content" />

        <!-- 题号已由上方进度区展示，不传 total 以免卡片内重复一次 -->
        <QuestionCard
          v-model="currentAnswer"
          class="question-block"
          :question="currentQuestion"
          :disabled="!!currentResult"
        >
          <template #actions>
            <button
              type="button"
              class="fav-btn"
              :class="{ 'fav-btn--on': isFavorited }"
              :disabled="favToggling"
              :aria-label="isFavorited ? '取消收藏' : '收藏本题'"
              :aria-pressed="isFavorited"
              @click="toggleFavorite"
            >
              <van-icon :name="isFavorited ? 'star' : 'star-o'" size="20" />
            </button>

          </template>
        </QuestionCard>

        <!-- 判定结果与解析：提交后展示，展示内容受练习设置控制 -->
        <section v-if="currentResult" class="result-card">
          <!-- 主观题不即时判分，correct 为 null 时只提示已记录，不显示对错 -->
          <header
            v-if="currentResult.correct !== null && currentResult.correct !== undefined"
            class="result-header"
            :class="resultHeaderClass"
          >
            <van-icon :name="currentResult.correct ? 'passed' : 'close'" size="18" />
            <span>{{ currentResult.correct ? '回答正确' : '回答错误' }}</span>
          </header>
          <header v-else class="result-header">
            <van-icon name="passed" size="18" />
            <span>作答已记录</span>
          </header>

          <div v-if="currentResult.answer" class="result-row">
            <span class="result-label">正确答案</span>
            <span class="result-value">{{ formatAnswer(currentResult.answer) }}</span>
          </div>
          <div v-if="currentResult.correct === false" class="result-row">
            <span class="result-label">您的作答</span>
            <span class="result-value">{{ formatAnswer(submittedAnswer) || '未作答' }}</span>
          </div>

          <div v-if="currentResult.analysis" class="analysis">
            <p class="analysis-title">解析</p>
            <p class="analysis-text">{{ currentResult.analysis }}</p>
          </div>

        </section>
      </div>

      <!-- 底部：答题卡 + 提交 / 下一题 -->
      <footer class="answer-footer">
        <button
          type="button"
          class="footer-icon-btn"
          aria-label="打开答题卡"
          @click="sheetVisible = true"
        >
          <van-icon name="apps-o" size="20" />
        </button>

        <van-button
          v-if="!currentResult"
          class="footer-main-btn"
          type="primary"
          block
          round
          :loading="submitting"
          @click="handleSubmit"
        >
          提交答案
        </van-button>
        <van-button
          v-else-if="currentIndex < answerable.length - 1"
          class="footer-main-btn"
          type="primary"
          block
          round
          @click="goNext"
        >
          下一题
        </van-button>
        <van-button
          v-else
          class="footer-main-btn"
          type="primary"
          block
          round
          :loading="submitting"
          @click="handleFinish"
        >
          完成练习
        </van-button>
      </footer>

      <!-- 答题卡弹层：跳题与提前结束练习 -->
      <van-popup v-model:show="sheetVisible" position="bottom" round>
        <div class="sheet-popup">
          <!--
            传 answerablePages（由 answerable 包装成答题卡的 single 形态），
            不能传原始 questions：材料项混进去会让格子下标空间与 currentQuestion
            的取值空间错开——点靠后的格子跳错题，点末尾格会超界使整页空白。
          -->
          <AnswerSheetCard
            :questions="answerablePages"
            :current-index="currentIndex"
            :is-answered="isAnswered"
            @select="goToQuestion"
          />

          <!--
            跳题后底部主按钮只在最后一题才是「完成练习」，
            停在中间题时没有结束入口，所以在此常驻一个。
          -->
          <van-button
            class="sheet-finish-btn"
            type="primary"
            block
            round
            :loading="submitting"
            @click="handleFinish"
          >
            完成练习
          </van-button>
        </div>
      </van-popup>

    </template>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import QuestionCard from '@/components/Business/QuestionCard.vue'
import AnswerSheetCard from '@/components/Business/AnswerSheetCard.vue'
import MaterialCard from '@/components/Business/MaterialCard.vue'
import { QUESTION_TYPE } from '@/constants/exam'
import {
  getPracticeQuestionsApi,
  submitPracticeAnswerApi,
  finishPracticeApi,
  toggleFavoriteApi,
  getFavoriteIdsApi
} from '@/api/modules/practiceApi'

const route = useRoute()
const router = useRouter()

// 是否为错题再练习模式
const isWrongMode = computed(() => route.query.mode === 'wrong')

// 练习记录 ID（后端取题时创建或复用，提交作答与结束练习都要带上）
const recordId = ref(null)

// 练习名称（后端下发，岗位练兵为练习名，自主练习为题库或知识点名）
const practiceName = ref('')

// 题目列表
const questions = ref([])

// 考生作答：{ [questionId]: 作答值 }
const answers = reactive({})

// 各题判定结果：{ [questionId]: { correct, answer, analysis } }
const results = reactive({})

/**
 * 往轮次已作答的题目 ID。
 * 断点续练回填的题目没有本轮判定结果，不能塞进 results
 *（results 还兼作「已提交、锁定作答、展示解析」的判据），
 * 因此单独记一份，只用于已答题数统计。
 */
const resumedAnsweredIds = ref(new Set())

/**
 * 练习设置：由后端按岗位练兵的 PracticeSetting 或题库的 SelfPracticeConfig 下发。
 * 关闭 showResultPerQuestion 时不做即时反馈，答案与解析也不会下发，
 * 前端不能自行放开——答案是否可见由服务端决定。
 */
const setting = reactive({
  showResultPerQuestion: true,
  showAnswer: true,
  showAnalysis: true
})

// 当前题目下标
const currentIndex = ref(0)

// 答题卡弹层是否展开
const sheetVisible = ref(false)

// 已收藏的题目 ID 集合
const favoriteIds = ref(new Set())

// 收藏请求进行中，避免连点产生反复 toggle
const favToggling = ref(false)

// 加载与提交状态
const loading = ref(false)
const submitting = ref(false)

// 本次练习已用秒数。练习不限时，此处是正计时用时，不是倒计时
const elapsed = ref(0)

// 计时起点的绝对时间戳，用于抗后台节流
let startedAt = 0
let elapsedTimer = null

/** 已用时长展示文案（mm:ss，超过一小时进位为 HH:mm:ss） */
const elapsedText = computed(() => {
  const total = elapsed.value
  const hours = Math.floor(total / 3600)
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const seconds = String(total % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`
})

/** 页面标题 */
const pageTitle = computed(() => (isWrongMode.value ? '错题练习' : '在线练习'))

/** 空数据提示文案 */
const emptyText = computed(() => (isWrongMode.value ? '暂无错题' : '该范围下暂无题目'))

/**
 * 材料索引：材料题 id → 材料条目
 *
 * 后端在每组小题前插入了一条 type=composite 的材料项（材料题不产生作答记录，
 * 材料不在小题查询结果里，不补出来小题就会脱离材料）。
 * 材料本身不可作答，故从题序中剔除、单独索引起来供展示。
 */
const materialMap = computed(() => {
  const map = new Map()
  for (const q of questions.value) {
    if (q.type === QUESTION_TYPE.COMPOSITE) map.set(q.id, q)
  }
  return map
})

/**
 * 可作答题列表（剔除材料项）
 *
 * 翻页、题号、已答统计一律基于此列表——材料项若留在其中，
 * 会出现一道无选项无答案的「空题」挡在中间，且题数与后端 totalCount 不符。
 */
const answerable = computed(() =>
  questions.value.filter((q) => q.type !== QUESTION_TYPE.COMPOSITE)
)

/** 当前题目 */
const currentQuestion = computed(() => answerable.value[currentIndex.value] || null)

/** 当前题目所属的材料；独立题为 null */
const currentMaterial = computed(() => {
  const parentId = currentQuestion.value?.parentId
  return parentId ? materialMap.value.get(parentId) || null : null
})

/**
 * 包装成答题卡要求的翻页单位形态
 *
 * 答题卡统一只接受 { kind } 标记的形态（考试页那边是 useQuestionPages 的产出）。
 * 练习按「一题一反馈」推进、不做材料题分组，故每道可答题都包成 single。
 * 下标空间不变，仍是 answerable 的下标，goToQuestion 可直接使用。
 */
const answerablePages = computed(() =>
  answerable.value.map((question) => ({ kind: 'single', question }))
)

/** 当前题目的判定结果，未提交时为空 */
const currentResult = computed(() =>
  currentQuestion.value ? results[currentQuestion.value.id] : null
)

/** 答对题数 */
const correctCount = computed(
  () => Object.values(results).filter((item) => item.correct).length
)

/**
 * 已答题数：往轮次回填的已答题 + 本轮已提交的题，两者取并集去重。
 * 不能直接数 answers——里面有「选了但还没点提交」的草稿，会让已答数虚高；
 * 也不能只数 results——续练进来时它是空的，会把之前答过的题全漏掉。
 */
const answeredCount = computed(() => {
  const ids = new Set(resumedAnsweredIds.value)
  for (const id of Object.keys(results)) ids.add(Number(id))
  return ids.size
})

/**
 * 判断某题是否已作答（答题卡填色用）
 * 判据与 answeredCount 一致：往轮次回填的 + 本轮已提交的
 * @param {number} questionId - 题目 ID
 * @returns {boolean} 是否已作答
 */
const isAnswered = (questionId) => {
  return resumedAnsweredIds.value.has(questionId) || questionId in results
}

/**
 * 拉取本卷题目的收藏态。
 * 只查当前这批题，不拉全量收藏列表；失败按未收藏渲染，不打断作答。
 */
const loadFavoriteIds = async () => {
  const ids = questions.value.map((q) => q.id)
  if (!ids.length) return

  try {
    const res = await getFavoriteIdsApi({ questionIds: ids.join(',') })
    favoriteIds.value = new Set(res.data || [])
  } catch {
    favoriteIds.value = new Set()
  }
}

/** 当前题是否已收藏 */
const isFavorited = computed(() => {
  return !!currentQuestion.value && favoriteIds.value.has(currentQuestion.value.id)
})

/**
 * 从答题卡跳到指定题目
 * @param {number} index - 目标题目下标
 */
const goToQuestion = (index) => {
  currentIndex.value = index
  sheetVisible.value = false
}

/** 进度条宽度：按当前题号占总题数的比例 */
const progressPercent = computed(() => {
  if (!answerable.value.length) return '0%'
  return `${((currentIndex.value + 1) / answerable.value.length) * 100}%`
})

/** 结果头部样式类 */
const resultHeaderClass = computed(() => ({
  'result-header--correct': currentResult.value?.correct,
  'result-header--wrong': currentResult.value && !currentResult.value.correct
}))

/** 当前题目的作答值 */
const currentAnswer = computed({
  get() {
    if (!currentQuestion.value) return ''
    const value = answers[currentQuestion.value.id]
    if (value !== undefined) return value
    return currentQuestion.value.type === QUESTION_TYPE.MULTIPLE ? [] : ''
  },
  set(value) {
    if (!currentQuestion.value) return
    answers[currentQuestion.value.id] = value
  }
})

/** 提交时保存的作答快照，用于结果区展示 */
const submittedAnswer = computed(() =>
  currentQuestion.value ? answers[currentQuestion.value.id] : ''
)

/**
 * 格式化答案展示（多选拼接为逗号分隔）
 * @param {string|string[]} value - 答案值
 * @returns {string} 展示文案
 */
const formatAnswer = (value) => {
  if (Array.isArray(value)) return value.join('、')
  if (value === 'true') return '正确'
  if (value === 'false') return '错误'
  return value === undefined || value === null ? '' : String(value)
}

/**
 * 加载练习题目
 * 错题模式取错题本题目，普通模式按题库或知识点取题
 */
const loadQuestions = async () => {
  loading.value = true
  try {
    // 三条路径共用一个取题接口，由参数区分：岗位练兵传 practiceId，
    // 错题重练传 mode=wrong，自主练习传 bankId/knowledgePointId
    const res = await getPracticeQuestionsApi({
      practiceId: route.query.practiceId,
      bankId: route.query.bankId,
      knowledgePointId: route.query.knowledgePointId,
      mode: isWrongMode.value ? 'wrong' : undefined
    })

    const data = res.data || {}
    recordId.value = data.recordId ?? null
    practiceName.value = data.name || ''
    questions.value = data.questions || []
    Object.assign(setting, data.setting || {})

    // 断点续练：回填已作答内容，并跳到第一道未答题
    const resumedIds = new Set()
    for (const q of questions.value) {
      if (q.userAnswer) {
        answers[q.id] =
          q.type === QUESTION_TYPE.MULTIPLE ? q.userAnswer.split(',') : q.userAnswer
        // 计入已答数；判定结果不补，往轮次的对错前端无从得知
        resumedIds.add(q.id)
      }
    }
    resumedAnsweredIds.value = resumedIds

    // 收藏态单独查一次，不 await：只影响图标呈现，
    // 等它回来才渲染题目会让首屏无谓变慢
    loadFavoriteIds()
    // 在可作答题列表里定位断点，不能用原始 questions：
    // 材料项与其首个小题共享 questionNo 且排在前面，会被先命中；
    // 且材料项占位会让下标整体偏移。
    const resumeIndex = answerable.value.findIndex((q) => q.questionNo === data.resumeNo)
    currentIndex.value = resumeIndex >= 0 ? resumeIndex : 0
  } catch {
    // 错误提示由响应拦截器统一给出，此处仅保持空列表
    questions.value = []
  } finally {
    loading.value = false
  }
}

/**
 * 提交当前题作答，获取对错判断与解析
 */
const handleSubmit = async () => {
  if (!currentQuestion.value) return

  const value = answers[currentQuestion.value.id]
  const isEmpty = Array.isArray(value)
    ? value.length === 0
    : value === undefined || String(value || '').trim() === ''

  if (isEmpty) {
    showToast('请先作答')
    return
  }

  submitting.value = true
  try {
    // 多选作答以逗号拼接，与后端判分拆分口径一致
    const res = await submitPracticeAnswerApi({
      recordId: recordId.value,
      questionNo: currentQuestion.value.questionNo,
      answer: Array.isArray(value) ? value.join(',') : String(value)
    })

    // 答案与解析随取题下发（受练习设置控制），判定结论来自本次提交
    results[currentQuestion.value.id] = {
      correct: res.data?.isCorrect,
      answer: currentQuestion.value.answer,
      analysis: currentQuestion.value.analysis
    }
  } catch {
    // 提交失败的原因由响应拦截器提示，保持未提交态供考生重试
  } finally {
    submitting.value = false
  }
}

/**
 * 进入下一题
 */
const goNext = () => {
  if (currentIndex.value < answerable.value.length - 1) {
    currentIndex.value += 1
  }
}

/**
 * 完成练习，返回上一页
 */
const handleFinish = async () => {
  if (!recordId.value) {
    router.back()
    return
  }

  submitting.value = true
  try {
    const res = await finishPracticeApi({ recordId: recordId.value })
    const stat = res.data || {}
    // 统计以服务端为准：跳过未答的题也计入分母，前端本地计数会偏高
    showToast(
      `本次练习共 ${stat.totalCount ?? answerable.value.length} 题，` +
        `答对 ${stat.correctCount ?? correctCount.value} 题，正确率 ${stat.accuracy ?? 0}%`
    )
    router.back()
  } catch {
    // 结束失败时留在页面，避免作答进度看起来像丢了
  } finally {
    submitting.value = false
  }
}

/**
 * 收藏 / 取消收藏当前题目
 * 收藏态以服务端返回的 favorited 为准，不做乐观更新——
 * 本地先翻转再被接口驳回会让星标和实际状态不一致。
 */
const toggleFavorite = async () => {
  if (!currentQuestion.value || favToggling.value) return

  favToggling.value = true
  try {
    const res = await toggleFavoriteApi({ questionId: currentQuestion.value.id })
    const next = new Set(favoriteIds.value)
    if (res.data?.favorited) {
      next.add(currentQuestion.value.id)
      showToast('已收藏')
    } else {
      next.delete(currentQuestion.value.id)
      showToast('已取消收藏')
    }
    favoriteIds.value = next
  } catch {
    // 失败原因由响应拦截器提示，收藏态保持不变
  } finally {
    favToggling.value = false
  }
}

onMounted(() => {
  loadQuestions()

  // 每秒按绝对时间戳重算，页面切到后台再回来不会少计时
  startedAt = Date.now()
  elapsedTimer = setInterval(() => {
    elapsed.value = Math.floor((Date.now() - startedAt) / 1000)
  }, 1000)
})

onUnmounted(() => {
  if (elapsedTimer) {
    clearInterval(elapsedTimer)
    elapsedTimer = null
  }
})

</script>

<style scoped>
/* 整页白底：作答内容与页面同底，不做卡片分层 */
.practice-answer-page {
  min-height: 100vh;
  background-color: var(--bg-card);
}

.content {
  padding: 20px 16px 0;
  padding-bottom: 96px;
}

.state-block {
  padding: var(--spacing-xl) 0;
}

/* 顶栏已用时长：主色浅底胶囊 */
.elapsed-pill {
  padding: 4px 10px;
  font-size: 13px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--primary-color);
  background-color: var(--primary-light);
  border-radius: 8px;
}

/* 进度区：题号 + 已答数 */
.progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.progress-no {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.progress-total {
  margin-left: 2px;
  font-size: 14px;
  font-weight: 400;
  color: var(--text-disabled);
}

.answered-badge {
  padding: 5px 12px;
  font-size: 13px;
  color: #fff;
  background-color: var(--primary-color);
  border-radius: 20px;
}

/* 进度条 */
.progress-bar {
  height: 6px;
  margin-top: 12px;
  background-color: var(--bg-fill);
  border-radius: 3px;
  overflow: hidden;
}

.progress-bar__fill {
  height: 100%;
  background-color: var(--primary-color);
  border-radius: 3px;
  transition: width 0.3s;
}

/*
 * 题目区与页面同底，去掉卡片自身的内边距与圆角。
 * 加 .content 前缀提高优先级，否则与子组件里同为单类名的
 * .question-card 打平，胜负取决于样式表顺序。
 */
.content > .question-block {
  margin-top: 24px;
  padding: 0;
  border-radius: 0;
}

/* 判定结果卡片：页面已是白底，改用浅灰填充区分 */
.result-card {
  margin-top: 20px;
  padding: var(--spacing-md);
  background-color: var(--bg-fill);
  border-radius: 12px;
}

.result-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  font-weight: 600;
}

.result-header--correct {
  color: var(--success-color);
}

.result-header--wrong {
  color: var(--danger-color);
}

.result-row {
  display: flex;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-sm);
  font-size: 14px;
}

.result-label {
  flex-shrink: 0;
  color: var(--text-disabled);
}

.result-value {
  color: var(--text-primary);
  word-break: break-all;
}

/* 解析区 */
.analysis {
  margin-top: var(--spacing-md);
  padding-top: var(--spacing-sm);
  border-top: 1px solid var(--border-color);
}

.analysis-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.analysis-text {
  margin-top: var(--spacing-xs);
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.7;
  /* 解析含换行时保留排版 */
  white-space: pre-wrap;
}

/* 底部操作区：图标按钮 + 主按钮，无分隔线 */
.answer-footer {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
  background-color: var(--bg-card);
}

/*
 * 操作位有收藏与纠错两个图标按钮，两者紧邻会连成一片、难分辨点到了哪个。
 * 样式挂在子组件的 .question-actions 上，故用 :deep 穿透。
 */
.content > .question-block :deep(.question-actions) {
  gap: 4px;
}

/* 方形图标按钮，尺寸与主按钮等高 */
/* 收藏星标：未收藏灰描边，收藏后主色实心 */
.fav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  color: var(--text-secondary);
  background: none;
  border: none;
  cursor: pointer;
}

.fav-btn--on {
  color: var(--primary-color);
}

.fav-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.footer-icon-btn {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  color: var(--text-secondary);
  background-color: var(--bg-fill);
  border: none;
  border-radius: 12px;
  cursor: pointer;
}

.footer-icon-btn:disabled {
  color: #c2c6cf;
  cursor: not-allowed;
}

/*
 * block 按钮自带 width:100%，放进 flex 后靠 flex:1 占满剩余宽度；
 * min-width:0 防止其 100% 宽度把图标按钮挤出容器。
 */
.footer-main-btn {
  flex: 1;
  min-width: 0;
  height: 48px;
  font-size: 16px;
  font-weight: 500;
}
</style>
