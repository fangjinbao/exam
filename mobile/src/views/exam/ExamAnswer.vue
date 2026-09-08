<!--
  页面名称：ExamAnswer - 考试作答

  功能描述：
    考生在线作答页，逐题切换作答，答案变更即自动保存
    顶部显示剩余时间倒计时，作答期间检测切屏并上报告警
    按考试配置定时进行人脸抓拍上传，交卷需二次确认且交卷后不可修改

  路由信息：
    路径：/exam/answer/:id
    名称：ExamAnswer
    是否缓存：否
-->

<template>
  <div class="exam-answer-page">
    <!--
      顶部：倒计时与进度
      loading 期间同样禁用返回：取卷失败后要查一次详情才能决定落地页，
      此时若考生点返回，back 会与决策出的跳转并发，后发起者覆盖前者
    -->
    <ExamAnswerHeader
      :exam-name="paper.examName"
      :answered-count="answeredCount"
      :total-count="answerableQuestions.length"
      :remain="remain"
      :remain-text="remainText"
      :back-disabled="submitting || loading"
      :show-remaining="settings.showRemainingTime"
      @back="handleBack"
    />

    <van-loading v-if="loading" class="state-block" vertical>试卷加载中</van-loading>

    <template v-else-if="currentPage">
      <div class="content">
        <!-- 进度：当前题号 + 已答数 + 进度条 -->
        <QuestionProgress
          :current="currentIndex + 1"
          :total="pages.length"
          :answered="answeredCount"
        />

        <!-- 题号已由上方进度区展示，不传 total 以免卡片内重复一次 -->
        <!-- 交卷发起后锁定作答，避免请求往返期间新改的答案无处落盘 -->
        <QuestionCard
          v-if="currentPage.kind === 'single'"
          v-model="currentAnswer"
          class="question-block"
          :question="currentPage.question"
          :disabled="submitting || submitted"
          @change="handleAnswerChange(currentPage.question)"
        />

        <!--
          材料题组：材料在上、小题依次在下，一屏答完。
          材料卡不带作答控件；每个小题独立绑定自己的答案。
        -->
        <template v-else>
          <!-- 材料正文单独成卡，不再借 QuestionCard 渲染（那样会多出一个空的题型标签行） -->
          <MaterialCard class="material-block" :content="currentPage.parent.content" />

          <QuestionCard
            v-for="(child, childIdx) in currentPage.children"
            :key="child.id"
            :model-value="answerOf(child)"
            :question="child"
            :index="childIdx + 1"
            :total="currentPage.children.length"
            :disabled="submitting || submitted"
            class="sub-question"
            @update:model-value="setAnswerOf(child, $event)"
            @change="handleAnswerChange(child)"
          />

          <!-- 材料题未配小题时整页没有可作答内容，明确提示而不是留白 -->
          <van-empty v-if="!currentPage.children.length" description="该材料题未配置小题" />
        </template>
      </div>

      <!-- 底部：答题卡入口 + 翻页 + 交卷 -->
      <ExamAnswerFooter
        :pages="pages"
        :current-index="currentIndex"
        :is-answered="isAnswered"
        :submitting="submitting"
        :submit-disabled="submitBlock.blocked"
        :submit-tip="submitBlock.tip"
        @prev="currentIndex -= 1"
        @next="currentIndex += 1"
        @select="currentIndex = $event"
        @submit="handleSubmit"
      />
    </template>

    <van-empty v-else :description="loadError || '试卷为空'" />

    <!--
      交卷确认弹窗
      原先只有一句「还有 N 题未作答」的纯文本，考生无从判断该不该交、更找不到是哪几题。
      改为：作答概况三项 + 未答题号可点跳转，全部答完时给明确的正反馈。
    -->
    <van-dialog
      v-model:show="showSubmitConfirm"
      class="submit-dialog"
      show-cancel-button
      :confirm-button-text="allAnswered ? '确认交卷' : '仍要交卷'"
      cancel-button-text="继续作答"
      @confirm="doSubmit"
    >
      <div class="submit-panel">
        <!-- 纯装饰：状态已由下方标题文字表达，避免读屏重复念一次符号 -->
        <span class="submit-icon" :class="allAnswered ? 'is-done' : 'is-warn'" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path
              v-if="allAnswered"
              d="M4.5 12.5 10 18 20 7"
              fill="none"
              stroke="currentColor"
              stroke-width="2.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <g v-else fill="currentColor">
              <rect x="10.7" y="5" width="2.6" height="9" rx="1.3" />
              <circle cx="12" cy="18" r="1.5" />
            </g>
          </svg>
        </span>

        <p class="submit-title">
          {{ allAnswered ? '已全部作答' : `还有 ${unansweredCount} 题未作答` }}
        </p>
        <p class="submit-desc">
          {{ allAnswered ? '交卷后不可修改答案' : '未作答的题目不得分，交卷后不可修改' }}
        </p>

        <div class="submit-stats">
          <span class="stat">
            <span class="stat-num">{{ answerableQuestions.length }}</span>
            <span class="stat-label">总题数</span>
          </span>
          <span class="stat">
            <span class="stat-num is-done">{{ answeredCount }}</span>
            <span class="stat-label">已作答</span>
          </span>
          <span class="stat">
            <span class="stat-num" :class="{ 'is-warn': !allAnswered }">{{ unansweredCount }}</span>
            <span class="stat-label">未作答</span>
          </span>
        </div>

        <div v-if="unansweredPages.length" class="submit-jump">
          <p class="jump-tip">点击题号可直接跳转</p>
          <div class="jump-list">
            <button
              v-for="pageNo in unansweredPages"
              :key="pageNo"
              type="button"
              class="jump-chip"
              @click="jumpToPage(pageNo)"
            >
              {{ pageNo }}
            </button>
          </div>
        </div>
      </div>
    </van-dialog>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast, showConfirmDialog } from 'vant'
import QuestionCard from '@/components/Business/QuestionCard.vue'
import { useQuestionPages } from '@/composables/useQuestionPages'
import ExamAnswerHeader from '@/components/Business/ExamAnswerHeader.vue'
import ExamAnswerFooter from '@/components/Business/ExamAnswerFooter.vue'
import QuestionProgress from '@/components/Business/QuestionProgress.vue'
import MaterialCard from '@/components/Business/MaterialCard.vue'
import { useCountdown } from '@/composables/useCountdown'
import { useAntiCheat } from '@/composables/useAntiCheat'
import { QUESTION_TYPE } from '@/constants/exam'
import { normalizeQuestion } from '@/utils/questionOption'
import { useExamPaperLoader } from '@/composables/useExamPaperLoader'
import { saveAnswerApi, submitExamApi, reportSwitchAlarmApi } from '@/api/modules/examApi'

const route = useRoute()
const router = useRouter()

// 考试 ID
const examId = route.params.id

// 试卷数据
const paper = reactive({
  examName: '',
  questions: []
})

/**
 * 本场考试设置（全部由取卷接口下发，前端不写死任何一项）
 *
 * 默认值取「限制最松」而非最严：接口异常或字段缺失时，
 * 宁可少限制也不要把考生的交卷入口/倒计时莫名禁掉。
 * 防作弊类（切屏、操作限制）默认关闭同理——误开会骚扰正常考生。
 */
const settings = reactive({
  screenSwitchDetect: false,
  allowSwitchTimes: 0,
  operationRestrict: false,
  allowEarlySubmit: true,
  minAnswerMinutes: 0,
  showRemainingTime: true,
  // 进入本页时服务端算出的已作答秒数，配合本地计时推进
  elapsedSeconds: 0
})

// 考生作答：{ [questionId]: 作答值 }
const answers = reactive({})

// 当前题目下标
const currentIndex = ref(0)

// 交卷中
const submitting = ref(false)

// 是否已交卷（交卷后阻止再次保存与离开确认）
const submitted = ref(false)

// 各题独立的防抖定时器：Map<questionId, timerId>
// 用单个共享定时器会让切题时前一题尚未触发的保存被取消，导致作答丢失
const saveTimers = new Map()

// 各题待保存的作答快照：Map<questionId, answer>
const pendingSaves = new Map()

// 按材料题分组的翻页单位：材料题与其小题合成一页，一屏答完
const { pages, answerableQuestions } = useQuestionPages(() => paper.questions)

/** 当前页（普通题或「材料题 + 小题」组） */
const currentPage = computed(() => pages.value[currentIndex.value] || null)

/**
 * 当前页的单题（普通题时为该题，材料题组时为 null）
 *
 * 材料题组的作答由 currentPage.children 逐题渲染，不走这个单题通道。
 */
const currentQuestion = computed(() =>
  currentPage.value?.kind === 'single' ? currentPage.value.question : null
)

/**
 * 已作答题数
 *
 * 分母口径以可作答题为准（排除材料题本身），否则含材料题的卷子会永远答不满。
 */
const answeredCount = computed(
  () => answerableQuestions.value.filter((item) => isAnswered(item.id)).length
)

/**
 * 判断某题是否已作答
 * @param {number} questionId - 题目 ID
 * @returns {boolean} 是否已作答
 */
function isAnswered(questionId) {
  const value = answers[questionId]
  if (Array.isArray(value)) return value.length > 0
  return value !== undefined && value !== null && String(value).trim() !== ''
}

/**
 * 读取某题的作答值（材料题组内的小题用，各自独立绑定）
 * @param {Object} question - 题目对象
 * @returns {string|string[]} 作答值，未答时多选返回空数组、其余返回空串
 */
function answerOf(question) {
  const value = answers[question.id]
  if (value !== undefined) return value
  return question.type === QUESTION_TYPE.MULTIPLE ? [] : ''
}

/**
 * 写入某题的作答值（材料题组内的小题用）
 * @param {Object} question - 题目对象
 * @param {string|string[]} value - 新的作答值
 */
function setAnswerOf(question, value) {
  answers[question.id] = value
}

/** 当前题目的作答值（多选默认空数组，其余默认空串） */
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

// 倒计时：归零自动交卷
const { remain, remainText, start: startCountdown, stop: stopCountdown } = useCountdown(() => {
  showToast('考试时间已结束，正在自动交卷')
  doSubmit(true)
})

/**
 * 交卷是否被考试设置挡住，以及挡住的原因
 *
 * 两条规则，都只在「时间还没到」时生效——到点后 remain 归 0，
 * 自动交卷必须放行，否则考生既交不了卷也不能继续答，卡死在答题页。
 * 服务端 assertSubmitAllowed 是同一套判据（且是权威），此处算一遍
 * 只为把按钮状态和提示做出来，避免考生点下去才吃一个 403。
 *
 * 已作答时长 = 服务端下发的 elapsedSeconds + 本页停留时长。
 * 不用本地时钟直接算开考到现在：考生改系统时间就能绕过，
 * 而 elapsedSeconds 是服务端按答卷 startTime 算的，只有增量来自本地。
 */
const pageEnterAt = Date.now()

const elapsedSeconds = computed(() => {
  // 依赖 remain 让它每秒重算：倒计时始终在跑（即使设置里不显示剩余时间），
  // 不必另起一个定时器
  void remain.value
  return settings.elapsedSeconds + Math.floor((Date.now() - pageEnterAt) / 1000)
})

const submitBlock = computed(() => {
  // 到点/超时：无条件允许交卷
  if (remain.value <= 0) return { blocked: false, tip: '' }

  if (!settings.allowEarlySubmit) {
    return {
      blocked: true,
      tip: '本场考试不允许提前交卷，请答完等待时间结束后自动交卷'
    }
  }

  const needSec = settings.minAnswerMinutes * 60
  if (needSec > 0 && elapsedSeconds.value < needSec) {
    const leftMin = Math.ceil((needSec - elapsedSeconds.value) / 60)
    return {
      blocked: true,
      tip: `本场考试最短作答 ${settings.minAnswerMinutes} 分钟，还需 ${leftMin} 分钟后可交卷`
    }
  }

  return { blocked: false, tip: '' }
})

/**
 * 操作限制：禁复制/剪切/粘贴、右键菜单与长按选择
 *
 * 监听绑在 document 上（答题页存续期间有效），但按「是否在作答框内」分档，
 * 具体分法见 enableOperationRestrict 内的注释——无差别全拦会把考生自己
 * 输入框里的文本选择也禁掉，填空题连改错字都做不了。
 * 用捕获阶段：题目内容里若有元素自己 stopPropagation，冒泡阶段会漏掉。
 *
 * 句柄存在 restrictHandlers 里供卸载时逐个摘除；该数组在 <script setup> 内，
 * 每个组件实例独立，不会跨实例累积。
 *
 * 这只是提高门槛，不是真的防得住——考生仍可截图或用外部设备。
 * 真正的约束靠监考，此处对齐管理端「禁复制粘贴」这个设置的字面语义即可。
 */
const restrictHandlers = []

/**
 * 事件是否发生在考生自己的作答输入框内
 *
 * 作答框必须豁免大部分限制：在 document 上无差别禁掉 selectstart 会连
 * input/textarea 里的文本选择一起禁掉，考生填空题拖选光标、改错字都做不了。
 * 用 closest 而非直接看 target.tagName：van-field 的实际焦点元素是内部的
 * input，但事件可能冒泡自其包裹层。
 */
const isInAnswerField = (e) => {
  const el = e.target
  if (!el || typeof el.closest !== 'function') return false
  return !!el.closest('input, textarea, [contenteditable="true"]')
}

const enableOperationRestrict = () => {
  /*
    按语义分档，不是一律拦掉：
    - selectstart / copy / cut：只拦作答框外（题干、选项）。目的是不让考生
      整段复制题目拿去搜或外传；他在自己答案里选中、复制自己写的内容无害，
      拦了反而妨碍作答。
    - paste：作答框内外都拦。这是「禁粘贴」的核心——防的就是把预先准备好的
      答案粘进来，只拦框外等于没拦。
    - contextmenu：一律拦。右键/长按菜单同时提供复制与「搜索这段文字」，
      在作答框内也没有必须用它的场景（输入法自带的操作条不走这个事件）。
  */
  const blockOutsideField = (e) => {
    if (isInAnswerField(e)) return
    e.preventDefault()
  }
  const blockAlways = (e) => {
    e.preventDefault()
  }

  const bindings = [
    ['selectstart', blockOutsideField],
    ['copy', blockOutsideField],
    ['cut', blockOutsideField],
    ['paste', blockAlways],
    ['contextmenu', blockAlways]
  ]

  bindings.forEach(([name, fn]) => {
    // 捕获阶段：题目内容里若有元素自己 stopPropagation，冒泡阶段会漏掉
    document.addEventListener(name, fn, true)
    restrictHandlers.push([name, fn])
  })
}

const disableOperationRestrict = () => {
  restrictHandlers.forEach(([name, fn]) => {
    document.removeEventListener(name, fn, true)
  })
  restrictHandlers.length = 0
}

/*
  切屏检测：上报告警，超出允许次数则强制交卷。

  仅在 settings.screenSwitchDetect 为真时才 startWatch（见 loadPaper 末尾），
  所以这个回调进来就意味着本场确实开了防切屏。

  告警文案带上次数与上限，只说「已记录告警」考生不知道还剩几次、
  也就不知道下一次会被强制交卷。
*/
const { startWatch, stopWatch } = useAntiCheat(async () => {
  if (submitted.value) return
  try {
    // 拦截器返回的是整个信封 {code,message,data}，实际载荷在 res.data
    const payload = (await reportSwitchAlarmApi({ examId }))?.data
    const count = payload?.switchCount
    const allow = settings.allowSwitchTimes

    if (payload?.exceeded) {
      // 先停监听：强制交卷过程中页面仍会隐藏（弹窗/跳转），不该再累计
      stopWatch()
      showToast('切屏次数已超出限制，正在强制交卷')
      doSubmit(true)
      return
    }

    showToast(
      allow > 0 && count
        ? `检测到切屏行为（第 ${count} 次，超过 ${allow} 次将强制交卷）`
        : '检测到切屏行为，已记录告警'
    )
  } catch {
    // 告警上报失败不影响考生继续作答
  }
})

/**
 * 作答变更处理：延迟 600ms 保存，避免连续输入频繁请求
 *
 * 必须显式传入题目：材料题组一屏有多个小题，不能再从「当前题」推断是哪道题变了。
 * 模板绑定务必写成 `@change="handleAnswerChange(题目)"`，不能写 `@change="handleAnswerChange"`
 * ——后者会被 QuestionCard 的 change 载荷（作答值）顶掉参数，导致题目 ID 取不到。
 *
 * @param {Object} [question] - 变更的题目；省略时取当前单题（普通题页）
 */
const handleAnswerChange = (question) => {
  const target = question || currentQuestion.value
  // 交卷发起后不再接受作答变更；与 QuestionCard 的 disabled 构成双重防护
  if (submitted.value || submitting.value || !target) return

  const questionId = target.id
  // 取不到题目 ID 说明调用方传错了参数。此时请求必被后端校验拒绝，
  // 与其静默发出去只留一个 400，不如在此拦住并报出来。
  if (questionId === undefined || questionId === null) {
    console.error('[ExamAnswer] 作答变更缺少题目 ID，已跳过保存', target)
    return
  }
  pendingSaves.set(questionId, answers[questionId])

  // 仅重置该题自己的定时器，不影响其他题待保存的作答
  const existing = saveTimers.get(questionId)
  if (existing) clearTimeout(existing)

  saveTimers.set(
    questionId,
    setTimeout(() => {
      flushSave(questionId).catch(() => showToast('答案保存失败，请检查网络'))
    }, 600)
  )
}

/**
 * 立即保存指定题目待提交的作答
 * @param {number} questionId - 题目 ID
 */
const flushSave = async (questionId) => {
  const timer = saveTimers.get(questionId)
  if (timer) {
    clearTimeout(timer)
    saveTimers.delete(questionId)
  }
  if (!pendingSaves.has(questionId)) return

  // 多选题在本地存数组（便于 checkbox 绑定），但接口只收字符串，
  // 直接发数组会被后端校验拒成 400。在出网这一层拼成逗号串，
  // 分隔符与服务端判分拆分逻辑（objective-judge.util.ts）一致。
  const raw = pendingSaves.get(questionId)
  const answer = Array.isArray(raw) ? raw.join(',') : (raw ?? '')

  await saveAnswerApi({ examId, questionId, answer })
  // 成功后才移除，失败时保留在 pendingSaves 中，交卷前的 flush 会自然重试
  pendingSaves.delete(questionId)
}

/**
 * 立即保存所有待提交的作答
 * 交卷与退出作答前调用，避免防抖窗口内的作答丢失
 * @returns {Promise<boolean>} 是否全部保存成功，存在失败时调用方不应继续交卷
 */
const flushAllSaves = async () => {
  const ids = [...pendingSaves.keys()]
  const results = await Promise.all(
    ids.map((id) =>
      flushSave(id)
        .then(() => true)
        .catch(() => false)
    )
  )
  return results.every(Boolean)
}

/**
 * 执行交卷
 * @param {boolean} [auto=false] - 是否为倒计时归零的自动交卷
 */
const doSubmit = async (auto = false) => {
  // 同时挡住 submitting，避免倒计时自动交卷与手动交卷并发发出两次请求
  if (submitted.value || submitting.value) return

  submitting.value = true
  try {
    // 先落盘防抖窗口内未保存的作答
    const allSaved = await flushAllSaves()
    // 手动交卷时阻断，让考生检查网络后重试，避免丢答案却提示交卷成功
    if (!allSaved && !auto) {
      showToast(`还有 ${pendingSaves.size} 题未保存成功，请检查网络后重新交卷`)
      return
    }
    // 返回值不再使用：交卷提示已去掉（见下方说明），成绩一律由结果页拉取
    await submitExamApi({ examId })
    submitted.value = true
    stopCountdown()
    stopWatch()

    /*
      交卷成功不再弹提示。

      下一行就 replace 到结果页，那页把分数、及格线、客观/主观分项、
      交卷时间全列全了，Toast 只是把同样的话再说一遍，还会浮在新页面上
      糊住「客观题得分」那一行。

      另一层原因：原提示会报出「客观题得分 N 分」，而本场若设置了不公开成绩，
      这就成了绕过该设置的泄漏点——后端已把 objectiveScore 置 null，
      前端也不该再有任何报分的通路。

      只保留两种确实需要打断的情况：
      - 有题未同步成功：结果页看不出这件事，且需考生联系监考老师
      - 自动交卷：非考生主动触发，得说明卷是被系统收走的
    */
    // 未保存题数在提示前才读取实时值，避免用交卷请求发出前的旧值误报为 0
    const unsavedCount = pendingSaves.size
    if (unsavedCount > 0) {
      showToast(`已收到交卷，但其中 ${unsavedCount} 题的最新作答未同步成功，请联系监考老师核实`)
    } else if (auto) {
      showToast('已自动交卷')
    }
    // 交卷后进结果页；用 replace 断掉返回作答页的路径。
    // 交卷期间考生可能用手势或物理键返回（submitting 只能禁用页内返回按钮），
    // 此时卷已交完、数据已落库，不跳转不影响正确性，跳转反而会把人拽回来。
    if (isStillOnPage()) {
      router.replace(`/exam/result/${examId}`)
    }
  } catch {
    // 交卷失败的原因由响应拦截器提示，保持作答态供考生重试
  } finally {
    submitting.value = false
  }
}

/** 交卷确认弹窗的显示状态 */
const showSubmitConfirm = ref(false)

/** 未答题数：按可作答题算，材料题本身不占作答位，计入会虚报 */
const unansweredCount = computed(() => answerableQuestions.value.length - answeredCount.value)

/** 是否已全部作答 */
const allAnswered = computed(() => unansweredCount.value === 0)

/**
 * 未答题目所在的页码（从 1 开始，供弹窗内跳转）
 *
 * 索引空间用 pages 而非 answerableQuestions：题号在页头与答题卡里都是按页计的，
 * 这里必须同一套口径，否则弹窗给的题号跳过去是另一道题。
 * 材料题一页含多个小题，只要有一个没答就把该页列出来一次——
 * 因此含材料题的卷子上，页码个数会少于上面的未答题数，这是页与题的固有差异，
 * 未答题数按题算才是对考生诚实的口径，不为了和页码个数一致而改小。
 */
const unansweredPages = computed(() =>
  pages.value.reduce((acc, page, i) => {
    const hasUnanswered =
      page.kind === 'group'
        ? page.children.some((child) => !isAnswered(child.id))
        : !isAnswered(page.question.id)
    if (hasUnanswered) acc.push(i + 1)
    return acc
  }, [])
)

/**
 * 点击交卷：打开确认弹窗
 *
 * 原先用 showConfirmDialog 只给一句文案，考生看不到究竟哪几题没答；
 * 改为自定义弹窗后可列出未答题号并直接跳转。
 */
const handleSubmit = () => {
  showSubmitConfirm.value = true
}

/**
 * 从弹窗跳到指定页并关闭弹窗
 * @param {number} pageNo - 页码（从 1 开始）
 */
const jumpToPage = (pageNo) => {
  showSubmitConfirm.value = false
  currentIndex.value = pageNo - 1
}

/**
 * 返回：作答中离开需确认，答案已自动保存
 */
const handleBack = async () => {
  if (submitted.value) {
    router.back()
    return
  }
  // 交卷进行中禁止返回，避免与交卷成功后的跳转互相覆盖
  if (submitting.value) return

  try {
    await showConfirmDialog({
      title: '退出作答',
      message: '答案已自动保存，退出后可在考试时间内继续作答。确定退出吗？'
    })
    // 退出前落盘未保存的作答；有失败则留在本页，避免带着未保存的答案离开
    const allSaved = await flushAllSaves()
    if (!allSaved) {
      showToast(`还有 ${pendingSaves.size} 题未保存成功，请检查网络后重试`)
      return
    }
    router.back()
  } catch {
    // 考生取消退出
  }
}

/**
 * 取卷成功后回填试卷并启动倒计时与切屏监听
 * @param {Object} data - 取卷接口返回的试卷数据
 */
const applyPaper = (data) => {
  paper.examName = data.examName
  // 归一化：考试取卷接口下发 stem + 选项原文，QuestionCard 读 content + 选项数组
  paper.questions = (data.questions || []).map(normalizeQuestion)

  /*
    回填已保存的作答，支持中断后继续。

    接口下发的是字符串（多选存成 "A,C"），但多选题在本地要用数组绑定 checkbox，
    直接塞字符串会让已选项显示成一个都没选，考生会以为作答丢了。
    故按题型拆回数组；题型要从 paper.questions 查，所以必须在上面赋值之后做。
  */
  const typeById = new Map(paper.questions.map((q) => [String(q.id), q.type]))
  Object.entries(data.answers || {}).forEach(([key, value]) => {
    if (typeById.get(key) === QUESTION_TYPE.MULTIPLE) {
      answers[key] = String(value ?? '')
        .split(/[,;、，；]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
      return
    }
    answers[key] = value
  })

  // 考试设置：答题页的开关与限制，全部以服务端下发为准，不在前端写死
  settings.screenSwitchDetect = data.screenSwitchDetect === true
  settings.allowSwitchTimes = Number(data.allowSwitchTimes ?? 0)
  settings.operationRestrict = data.operationRestrict === true
  // 下面两项缺字段时按「限制最松」兜底，与服务端 schema 默认值一致：
  // 老接口没有这些字段时不该突然禁掉交卷入口
  settings.allowEarlySubmit = data.allowEarlySubmit !== false
  settings.minAnswerMinutes = Number(data.minAnswerMinutes ?? 0)
  settings.showRemainingTime = data.showRemainingTime !== false
  settings.elapsedSeconds = Number(data.elapsedSeconds ?? 0)

  startCountdown(data.remainSeconds)

  /*
    只在开启防切屏时才监听。

    这是之前的 bug：无条件 startWatch() 会让没开防切屏的考试也累计切屏次数、
    弹「检测到切屏行为」告警，并把次数带到结果页与管理端阅卷页。
    服务端 reportSwitchAlarm 也补了同样的闸门，两处都挡是因为
    该接口对考生端公开，前端不调不等于没人调。
  */
  if (settings.screenSwitchDetect) startWatch()

  if (settings.operationRestrict) enableOperationRestrict()
}

/**
 * 考生是否仍停在本场考试的作答页
 *
 * 异步回调（取卷失败落地、交卷成功跳转）resolve 时考生可能已用手势或物理键返回离开，
 * 此时再 replace 会把人从新页面硬拽回来。查实时路由而非记录「点过返回」：
 * router.back() 在无会话历史（深链直达、页面刷新）时会静默失败，人并未离开，
 * 用标志会与真实位置脱钩、把兜底跳转永久拦死，让考生卡在失败页。
 *
 * 注意这是缓解而非根治：currentRoute 只在导航 finalize 后更新，手势返回正在进行
 * 而异步请求恰好此刻 resolve 的极窄窗口内，判据仍会误判为「在本页」。
 * 点击返回按钮那条路径已由 back-disabled 纳入 loading 堵住入口，不受此窗口影响。
 * @returns {boolean} 仍在本页返回 true
 */
const isStillOnPage = () => {
  const current = router.currentRoute.value
  return current.name === 'ExamAnswer' && String(current.params.id) === String(examId)
}

// 取卷与失败落地由 composable 承担
const { loading, loadError, loadPaper } = useExamPaperLoader(examId, {
  onLoaded: applyPaper,
  isStillOnPage
})

onMounted(loadPaper)

onUnmounted(() => {
  // 卸载时无法等待请求完成，仍尽力把待保存的作答发出去
  if (!submitted.value && pendingSaves.size) {
    flushAllSaves()
  }
  saveTimers.forEach((timer) => clearTimeout(timer))
  saveTimers.clear()
  // 操作限制挂在 document 上，必须随页面卸载摘掉，
  // 否则离开考试后整个应用都不能复制粘贴、右键失效
  disableOperationRestrict()
})



</script>

<style scoped>
/* 整页白底：作答内容与页面同底，不做卡片分层（与练习页一致） */
.exam-answer-page {
  min-height: 100vh;
  background-color: var(--bg-card);
}

.content {
  padding: 0 16px;
  /* 上下为固定头尾栏留白：顶栏 52px + 呼吸位，底栏按钮 48px + 内边距 */
  padding-top: 72px;
  padding-bottom: 96px;
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

/* 材料卡与上方进度区留出间距 */
.material-block {
  margin-top: 24px;
}

/*
 * 材料题下的小题：左侧描边 + 缩进，表明从属于上方材料。
 * 不做整卡缩进是为了保住小题内部选项的可点宽度。
 */
.sub-question {
  margin-top: var(--spacing-md);
  padding-left: var(--spacing-md);
  border-left: 3px solid var(--primary-light);
}

.state-block {
  padding-top: 120px;
}

/* ── 交卷确认弹窗 ─────────────────────────── */

/* 底部留 16px：原先 8px 时题号胶囊几乎贴上弹窗按钮，挤在一起容易误触 */
.submit-panel {
  padding: 24px 20px 16px;
  text-align: center;
}

/* 状态图标：圆形浅底 + 同色系图形 */
.submit-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
}

.submit-icon svg {
  width: 26px;
  height: 26px;
}

.submit-icon.is-done {
  background-color: var(--success-light);
  color: var(--success-color);
}

/*
  未答完用橙而非红：红色读作「操作失败/系统出错」，
  而没答完只是提醒，考生仍可正常交卷，语义上是警示不是错误
*/
.submit-icon.is-warn {
  background-color: #fff3e8;
  color: var(--warning-color);
}

.submit-title {
  margin-top: 12px;
  font-size: 17px;
  font-weight: 600;
  line-height: 24px;
  color: var(--text-primary);
}

.submit-desc {
  margin-top: 6px;
  font-size: 13px;
  line-height: 18px;
  color: var(--text-secondary);
}

/* 作答概况：三项等分，中间用竖线分隔 */
.submit-stats {
  display: flex;
  margin-top: 18px;
  padding: 14px 0;
  border-radius: var(--radius-md);
  background-color: var(--bg-page);
}

.stat {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
}

.stat + .stat {
  border-left: 1px solid var(--border-color);
}

.stat-num {
  font-size: 20px;
  font-weight: 600;
  line-height: 26px;
  color: var(--text-primary);
}

.stat-num.is-done {
  color: var(--success-color);
}

.stat-num.is-warn {
  color: var(--warning-color);
}

.stat-label {
  margin-top: 2px;
  font-size: 12px;
  line-height: 16px;
  color: var(--text-secondary);
}

.submit-jump {
  margin-top: 16px;
  text-align: left;
}

.jump-tip {
  font-size: 12px;
  line-height: 16px;
  color: var(--text-secondary);
}

/*
  未答题号列表限高滚动：未答很多时（如整卷未做）不限高会把弹窗顶出屏幕，
  底部的取消/确认按钮被挤到视口外，考生就卡住了
*/
/*
  高度按「整行数」算，不能随手取整。
  行高 30px、行距 8px，故 N 行为 38N - 8：两行 68、三行 106、四行 144。
  原先写 104px 比三行少 2px，第三行永远被削掉一截，看着像题号被切。

  再加 2px 上下内边距：胶囊有 1px 描边，容器高度与内容等高时描边正好压在
  overflow 的裁切边界上，单行也会被削掉一像素。
*/
.jump-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 110px; /* 三行 106 + 上下内边距 4 */
  margin-top: 8px;
  padding: 2px 0;
  overflow-y: auto;
}

/* 题号胶囊：橙色描边浅底，与上方「未作答」的橙统一 */
.jump-chip {
  /* 显式居中而非依赖 button 默认的文本居中：两位数题号在部分安卓 WebView 下会偏上 */
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 30px;
  padding: 0 8px;
  line-height: 1;
  border: 1px solid #ffd0a6;
  border-radius: 8px;
  background-color: #fff3e8;
  font-size: 14px;
  font-weight: 500;
  color: #d25f00;
  cursor: pointer;
}

.jump-chip:active {
  background-color: #ffe4cc;
}

</style>
