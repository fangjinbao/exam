<!--
  页面名称：ScoreDetail - 成绩详情

  功能描述：
    展示单次考试的得分构成与逐题作答情况
    含考生作答、正确答案与解析，客观题标注对错

  路由信息：
    路径：/profile/scores/:sheetId
    名称：ScoreDetail
    是否缓存：否
-->

<template>
  <div class="score-detail-page">
    <van-nav-bar title="成绩详情" left-arrow fixed placeholder @click-left="router.back()" />

    <AppSkeleton v-if="loading" variant="detail" :count="4" />

    <div v-else-if="detail" class="content">
      <!--
        成绩概要，一张卡讲完。
        这页用户主要是来逐题复盘的，概要占满首屏会把第一题挤出屏幕，
        故只留「哪场考试、多少分、过没过、分项构成」，不做主视觉。
      -->
      <section class="summary-card">
        <header class="summary-head">
          <!-- 考试名称必须保留：从成绩列表点进来后，这是页面上唯一标明「哪场考试」的信息 -->
          <h1 class="exam-name">{{ detail.examName }}</h1>
          <!--
            结论同时用文字与配色表达，不辨色也能读出过没过。
            本场不公开成绩时连及格与否都不显示——那本身就是成绩信息。
          -->
          <span
            v-if="!detail.scoreHidden"
            class="verdict"
            :class="`verdict--${detail.passed ? 'pass' : 'fail'}`"
          >
            {{ detail.passed ? '已及格' : '未及格' }}
          </span>
        </header>

        <!--
          不公开成绩时整块分数区换成一行说明，而不是让「-」占位：
          占位符读起来像「还没出分」，而这里是「不会给你看」，是两件事。
          满分与及格分仍保留——那是本场考试的公开属性，不是本人成绩。
        -->
        <div v-if="detail.scoreHidden" class="score-hidden-block">
          <p class="score-hidden-tip">按本场考试设置，成绩不对考生公开</p>
          <p class="score-meta">满分 {{ detail.fullScore }} · 及格 {{ detail.passScore }}</p>
        </div>
        <div v-else class="score-line">
          <p class="total-score" :class="{ 'total-score--fail': !detail.passed }">
            {{ detail.totalScore ?? '-' }}
            <span class="score-unit">分</span>
          </p>
          <p class="score-meta">满分 {{ detail.fullScore }} · 及格 {{ detail.passScore }}</p>
        </div>

        <!-- 分项构成。用时缺失（历史答卷无 startTime）时换成交卷时间，不占位显示「-」 -->
        <dl class="stat-row">
          <!-- 客观/主观分同属成绩，不公开时整项撤掉，只留用时 -->
          <div v-if="!detail.scoreHidden" class="stat-item">
            <dt class="stat-label">客观题</dt>
            <dd class="stat-value">{{ detail.objectiveScore ?? '-' }} 分</dd>
          </div>
          <div v-if="!detail.scoreHidden" class="stat-item">
            <dt class="stat-label">主观题</dt>
            <dd class="stat-value">{{ detail.subjectiveScore ?? '-' }} 分</dd>
          </div>
          <div class="stat-item">
            <dt class="stat-label">{{ detail.usedMinutes != null ? '用时' : '交卷' }}</dt>
            <dd class="stat-value">
              {{
                detail.usedMinutes != null
                  ? `${detail.usedMinutes} 分钟`
                  : formatDate(detail.submitTime, 'MM-DD HH:mm')
              }}
            </dd>
          </div>
        </dl>
      </section>

      <!-- 逐题作答 -->
      <section class="question-section">
        <header class="section-head">
          <h2 class="section-title">作答详情</h2>
          <span class="section-extra">{{ questionSummary }}</span>
        </header>

        <!--
          说明答案为何缺失，否则用户会以为数据没加载出来。
          文案按 answerHiddenReason 分流：
          retake 是「用完机会就开放」，setting 是「本场始终不开放」，
          两者都用前一句会把「不开放」说成「稍后开放」，是错误承诺。
        -->
        <van-notice-bar
          v-if="detail.answerHidden"
          wrapable
          :scrollable="false"
          type="warning"
          class="hidden-tip"
          :text="
            detail.answerHiddenReason === 'setting'
              ? '本场考试不公开正确答案与解析。'
              : '本场考试你还有作答机会，正确答案与解析将在用完全部机会后开放。'
          "
        />

        <!-- key 带下标：item.id 是 questionId，随机卷可能抽出重复题，单用 id 会撞 key -->
        <article
          v-for="(item, idx) in detail.questions"
          :key="`${item.id}-${idx}`"
          class="question-card"
          :class="`question-card--${resultOf(item)}`"
        >
          <header class="question-header">
            <span class="question-index">第 {{ idx + 1 }} 题</span>
            <span class="question-type">{{ item.typeText }}</span>
            <!--
              不公开成绩时整块撤掉，不显示「- 分」占位：
              那个占位符的既有含义是「还没阅卷」，用在这里是错的说明。
            -->
            <span v-if="!detail.scoreHidden" class="question-score">{{ scoreText(item) }}</span>
          </header>

          <!-- 逐题回顾，按 HTML 渲染完整题干（含图）；内容入库前已服务端净化 -->
          <div class="question-content rich-text" v-html="item.content"></div>

          <!--
            选择题必须列出选项全文：只给「正确答案 A,C,D」而不给选项内容，
            考生无从知道选的是什么，复盘就失去意义。
            每项右侧的文字标签同时承担无障碍职责——不能只靠红绿配色区分。
          -->
          <ul v-if="optionsOf(idx).length" class="option-list">
            <li
              v-for="(opt, optIdx) in optionsOf(idx)"
              :key="`${opt.key}-${optIdx}`"
              class="option-item"
              :class="`option-item--${opt.state}`"
            >
              <!-- 判断题的 key 与文本同为「正确/错误」，圆圈放不下且重复，故省去 -->
              <span v-if="item.type !== QUESTION_TYPE.JUDGE" class="option-key">
                {{ opt.key }}
              </span>
              <span class="option-text rich-text" v-html="opt.value"></span>
              <span v-if="opt.tag" class="option-tag">{{ opt.tag }}</span>
            </li>
          </ul>

          <!--
            文字版作答摘要。选择题有选项列表逐项标注了，这里只在两种情况下出现：
            无选项题型（填空/简答）本来就没得标；以及未作答——空白的选项列表
            看不出是「没选」还是「没标记」。
          -->
          <div
            v-if="!optionsOf(idx).length || !item.userAnswer"
            class="answer-row"
            :class="`answer-row--${resultOf(item)}`"
          >
            <span class="answer-label">你的作答</span>
            <span class="answer-value">{{ formatAnswer(item.userAnswer) }}</span>
          </div>
          <!--
            正确答案仅在答错时展示：答对时它与上一行完全相同，
            重复一遍只会增加噪音、让人多读一行才发现是一样的。
            本场仍可重考时后端不下发答案与解析，避免借复盘套答案后重考。
          -->
          <div
            v-if="
              !detail.answerHidden &&
              !optionsOf(idx).length &&
              resultOf(item) !== 'correct'
            "
            class="answer-row answer-row--correct"
          >
            <span class="answer-label">正确答案</span>
            <span class="answer-value">{{ formatAnswer(item.answer) }}</span>
          </div>

          <!--
            主观题批阅信息：分是人给的，考生有权知道是谁给的、为什么这么给。
            仅主观题且已批阅时后端才下发这几个字段（客观题为系统自动判分）。

            scoreHidden 时后端已把三个字段置 null，这里仍再判一次：评语常含
            「第二问漏答扣 3 分」这类扣分说明，等于变相透露分数，与本页其余
            分数字段（及格结论、客观/主观分、逐题得分）一样加一道前端防线。

            只给分不写评语是常态，此时块内只剩一行落款，用 --bare 去掉块状底色，
            让它退化为得分行的附属文字，不然会是个只装一行小字的孤立卡片。
          -->
          <div
            v-if="!detail.scoreHidden && (item.reviewerName || item.reviewComment)"
            class="review-block"
            :class="{ 'review-block--bare': !item.reviewComment }"
          >
            <p v-if="item.reviewComment" class="review-comment">{{ item.reviewComment }}</p>
            <p v-if="item.reviewerName" class="review-meta">
              {{ item.reviewerName }} 批阅<template v-if="item.reviewTime">
                · {{ formatDate(item.reviewTime, 'YYYY-MM-DD HH:mm') }}</template
              >
            </p>
          </div>

          <div v-if="!detail.answerHidden && item.analysis" class="analysis">
            <p class="analysis-title">解析</p>
            <div class="analysis-text rich-text" v-html="item.analysis"></div>
          </div>
        </article>
      </section>
    </div>

    <van-empty v-else description="成绩不存在或未发布" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { formatDate } from '@/utils/format'
import { QUESTION_TYPE } from '@/constants/exam'
import { parseQuestionOptions } from '@/utils/questionOption'
import { getScoreDetailApi } from '@/api/modules/profileApi'
import AppSkeleton from '@/components/Common/AppSkeleton.vue'

const route = useRoute()
const router = useRouter()

// 成绩详情
const detail = ref(null)

// 加载状态
const loading = ref(false)

/**
 * 格式化答案展示
 * @param {string|string[]} value - 答案值
 * @returns {string} 展示文案
 */
const formatAnswer = (value) => {
  if (Array.isArray(value)) return value.length ? value.join('、') : '未作答'
  if (value === 'true') return '正确'
  if (value === 'false') return '错误'
  return value === undefined || value === null || value === '' ? '未作答' : String(value)
}

/**
 * 该题能否判定对错
 *
 * 主观题由人工/AI 给分，不存在唯一答案；答案被隐去时无从比对。
 * 两种情况都不显示对错，只显示得分，否则会把没判过的题标成答错。
 *
 * @param {Object} item - 题目项
 * @returns {boolean} 是否可判定
 */
const isJudged = (item) => {
  // 仅问答与论述属主观题；填空是客观题，后端会自动判分，参与判定
  if (item.type === QUESTION_TYPE.QA || item.type === QUESTION_TYPE.ESSAY) return false
  return !detail.value?.answerHidden
}

/**
 * 把答案拆成选项键数组
 *
 * 只用于「哪些选项该标记」，不参与对错判定——判定走 normalizeAnswer，
 * 那里必须严格照抄后端口径，而本函数为了匹配选项键做了额外归一：
 * 判断题选项键是中文「正确/错误」，历史数据里答案可能存成 true/false，
 * 不映射就匹配不上，选项会一个标记都不显示。
 *
 * @param {string|string[]} value - 答案值
 * @returns {string[]} 用于与选项 key 比对的数组
 */
const answerKeys = (value) => {
  const raw = Array.isArray(value) ? value.join(',') : String(value ?? '')
  return raw
    .split(/[,;\n、，；]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      const lower = s.toLowerCase()
      if (lower === 'true') return '正确'
      if (lower === 'false') return '错误'
      return s
    })
}

/**
 * 归一化答案为可比较的字符串
 *
 * 必须按题型分支，口径与服务端 objective-judge.util.ts 逐条对应，
 * 否则会出现「卡片标绿但得 0 分」这种自相矛盾的展示：
 * - multiple 多选：按分隔符集合拆分后排序，无序比对（漏选/错选即错）；
 * - blank 填空：只按换行拆分、保序逐空比对，不排序也不按逗号拆——
 *   答案本身可能含逗号（如坐标「A,B」），拆了会把一个空拆成两个；
 *   多空顺序填反也必须判错，排序会把它误判为对；
 * - single/judge：整行严格相等。
 *
 * @param {string|string[]} value - 答案值
 * @param {string} type - 题型（字典 question_type 的 value）
 * @returns {string} 归一化结果
 */
const normalizeAnswer = (value, type) => {
  const raw = (Array.isArray(value) ? value.join('\n') : String(value ?? '')).trim()

  if (type === QUESTION_TYPE.BLANK) {
    return raw
      .split('\n')
      .map((s) => s.trim().toLowerCase())
      .join('\n')
  }

  if (type === QUESTION_TYPE.MULTIPLE) {
    return raw
      .split(/[,;\n、，；]/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0)
      .sort()
      .join(',')
  }

  // single / judge：整串严格相等，不拆分也不做 true/false 映射，与后端一致
  return raw.toLowerCase()
}

/**
 * 该题的判定结果，用于卡片描边与徽标
 * @param {Object} item - 题目项
 * @returns {string} correct 答对 / wrong 答错 / neutral 不判定
 */
const resultOf = (item) => {
  if (!isJudged(item)) return 'neutral'
  return normalizeAnswer(item.userAnswer, item.type) === normalizeAnswer(item.answer, item.type)
    ? 'correct'
    : 'wrong'
}

/**
 * 作答文字样式
 * @param {Object} item - 题目项
 * @returns {Object} 样式类对象
 */
const answerClass = (item) => {
  const result = resultOf(item)
  return {
    'answer-value--correct': result === 'correct',
    'answer-value--wrong': result === 'wrong'
  }
}

/**
 * 逐题选项表（题目 id → 带状态的选项列表）
 *
 * 做成 computed 缓存而非在模板里现算：模板中 optionsOf 会被 v-if 与 v-for
 * 各调一次，现算等于每次渲染都重复解析一遍全卷选项。
 *
 * 每项的 state / tag 用于标注「这是正确答案」「你选了这个」，
 * tag 是文字而非纯色块——对错不能只靠红绿区分，色盲用户读不出来。
 */
const optionMap = computed(() => {
  const map = new Map()
  const list = detail.value?.questions ?? []
  for (let idx = 0; idx < list.length; idx += 1) {
    const item = list[idx]
    const options = parseQuestionOptions(item.options, item.type)
    if (!options.length) {
      map.set(idx, [])
      continue
    }

    const picked = answerKeys(item.userAnswer)
    // 答案被隐去时不标正确项，否则等于把答案透给还能重考的考生
    const right = detail.value?.answerHidden ? [] : answerKeys(item.answer)

    map.set(
      idx,
      options.map((opt) => {
        const isRight = right.includes(opt.key)
        const isPicked = picked.includes(opt.key)

        let state = 'plain'
        let tag = ''
        if (isRight && isPicked) {
          state = 'correct'
          tag = '答对'
        } else if (isRight) {
          state = 'correct'
          tag = '正确答案'
        } else if (isPicked) {
          // 选了但不在正确答案里：主观题与答案隐去态不做此判定
          state = isJudged(item) ? 'wrong' : 'picked'
          tag = isJudged(item) ? '你选错了' : '你的选择'
        }

        return { ...opt, state, tag }
      })
    )
  }
  return map
})

/**
 * 取某题的选项列表（含标注状态）
 *
 * 按下标而非 item.id 取：id 是 questionId，随机卷的多条抽题规则若命中同一道题
 * 会抽出重复项（AnswerItem 表无 (answerSheetId, questionId) 唯一约束，
 * createMany 的 skipDuplicates 拦不住），用 id 作键会互相覆盖导致选项串题。
 *
 * @param {number} idx - 题目在列表中的下标
 * @returns {Array} 选项列表，无选项题型返回空数组
 */
const optionsOf = (idx) => optionMap.value.get(idx) ?? []

/**
 * 本题得分文案
 * 答对时加 + 号，让「拿到分」比单看数字更直观；未阅卷显示占位符
 * @param {Object} item - 题目项
 * @returns {string} 展示文案
 */
const scoreText = (item) => {
  if (item.score === null || item.score === undefined) return '- 分'
  const sign = resultOf(item) === 'correct' && item.score > 0 ? '+' : ''
  return `${sign}${item.score} 分`
}

/**
 * 作答详情小节的右侧统计
 * 答案被隐去时无法判对错，只报题数
 */
const questionSummary = computed(() => {
  const list = detail.value?.questions ?? []
  if (!list.length) return ''
  if (detail.value?.answerHidden) return `共 ${list.length} 题`
  const wrong = list.filter((item) => resultOf(item) === 'wrong').length
  return wrong ? `共 ${list.length} 题，错 ${wrong} 题` : `共 ${list.length} 题，全对`
})

/**
 * 加载成绩详情
 */
const loadDetail = async () => {
  loading.value = true
  try {
    const res = await getScoreDetailApi(route.params.sheetId)
    detail.value = res.data
  } catch {
    detail.value = null
  } finally {
    loading.value = false
  }
}

onMounted(loadDetail)
</script>

<style scoped>
.score-detail-page {
  min-height: 100vh;
  background-color: var(--bg-page);
}

.content {
  padding: var(--spacing-md) 0;
}

/* 成绩概要卡。与下方题目卡同一套白底圆角，不再做渐变主视觉 */
.summary-card {
  margin: 0 var(--spacing-md) var(--spacing-md);
  padding: var(--spacing-md);
  background-color: var(--bg-card);
  border-radius: var(--radius-lg);
  box-shadow: 0 4px 16px rgb(31 37 51 / 4%);
}

.summary-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
}

/* 考试名称：标明场次但不与分数争视觉重心 */
.exam-name {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--text-primary);
}

/* 结论标签：浅色底药丸，文字与配色一同表达过没过 */
.verdict {
  flex-shrink: 0;
  padding: 3px 10px;
  font-size: 12px;
  font-weight: 600;
  border-radius: var(--radius-sm);
}

.verdict--pass {
  color: var(--success-color);
  background-color: var(--success-light);
}

.verdict--fail {
  color: var(--unqualified-color);
  background-color: var(--unqualified-light);
}

/* 分数与满分/及格说明同行：分数占视觉重心，说明退到基线右侧 */
.score-line {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-md);
}

.total-score {
  font-size: 40px;
  font-weight: 800;
  /* 等宽数字：分数变化时宽度不跳 */
  font-variant-numeric: tabular-nums;
  line-height: 1;
  color: var(--primary-color);
}

/* 不及格取 --unqualified-color，不用 danger 红，理由见变量定义 */
.total-score--fail {
  color: var(--unqualified-color);
}

/*
  顶替分数区的说明块。不复用 .score-line 的单行 flex：
  说明文案有十八个字，与「满分 100 · 及格 60」并排在窄屏上必然折行，
  折行处还会被 baseline 对齐拉歪。改为上下两行各占一行。
*/
.score-hidden-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: var(--spacing-md);
}

/*
  说明文案不套 .total-score 的 40px：那个字号是为两三位数字定的视觉重心，
  压在一句话上会挤满整行，也会让「不公开」显得比考试名更重要。
  取正文字号，只作陈述。
*/
.score-hidden-tip {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--text-secondary);
}

.score-unit {
  margin-left: 2px;
  font-size: 14px;
  font-weight: 500;
}

.score-meta {
  font-size: 13px;
  color: var(--text-secondary);
}

/*
  分项构成：三列等宽，与上方分数用细线分隔。
  分隔线用 --divider-color 而非 --border-color：后者是控件描边色，压在卡内偏重。
*/
.stat-row {
  display: flex;
  /* dl/dd 浏览器默认带 margin，会顶开三列并破坏与分隔线的间距 */
  margin: var(--spacing-md) 0 0;
  padding-top: var(--spacing-md);
  border-top: 1px solid var(--divider-color);
}

.stat-item {
  flex: 1;
  text-align: center;
}

/* 列与列之间用竖线分隔，比留白更能界定三段数据 */
.stat-item + .stat-item {
  border-left: 1px solid var(--divider-color);
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.stat-value {
  /* dd 默认有 margin-inline-start: 40px，不清掉三列会整体右偏 */
  margin: 4px 0 0;
  /* 交卷时间那列是「08-01 21:50」这样的长串，15px 才放得下不换行 */
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  color: var(--text-primary);
}

/* 作答详情区。概要卡已带下外边距，此处不再叠加上边距 */
.question-section {
  margin: 0 var(--spacing-md);
}

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: var(--spacing-sm);
}

.section-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.section-extra {
  font-size: 12px;
  color: var(--text-disabled);
}

/* 答案隐去提示：圆角对齐卡片，与首张题卡留出间距 */
.hidden-tip {
  margin-bottom: var(--spacing-sm);
  border-radius: var(--radius-md);
}

/*
  题目卡片。对错只由右上角得分的颜色承载——竖着扫一列即可找到错题，
  卡内不再重复标记，避免同一结论被说三遍。
  --result-color 由修饰类赋值，供得分文字取色。
*/
.question-card {
  padding: var(--spacing-md);
  background-color: var(--bg-card);
  border-radius: var(--radius-lg);
  box-shadow: 0 4px 16px rgb(31 37 51 / 4%);
}

.question-card--correct {
  --result-color: var(--success-color);
}

.question-card--wrong {
  --result-color: var(--danger-color);
}

/* 主观题与答案隐去态不判对错，用中性灰，不暗示任何结论 */
.question-card--neutral {
  --result-color: var(--text-secondary);
}

.question-card + .question-card {
  margin-top: var(--spacing-sm);
}

.question-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

/* 题号是定位用的主信息，故比题型标签更重 */
.question-index {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.question-type {
  padding: 2px 8px;
  font-size: 11px;
  color: var(--primary-color);
  background-color: var(--primary-light);
  border-radius: var(--radius-sm);
}

/* 得分跟随对错着色：原先一律橙色，答对答错看不出差别 */
.question-score {
  margin-left: auto;
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--result-color);
}

.question-content {
  /* 作答行之间只隔 6px，故题干与作答区要拉开，否则三行会糊成一坨 */
  margin: var(--spacing-sm) 0 var(--spacing-md);
  font-size: 15px;
  color: var(--text-primary);
  line-height: 1.6;
}

/*
 * 富文本内容（题干与解析共用）。
 * 图片必须限宽——题库图片尺寸不可控，不限会横向撑破手机屏。
 * v-html 插入的节点不带 scoped 属性，故用 :deep。
 */
.rich-text :deep(img) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 8px 0;
  border-radius: 6px;
}

.rich-text :deep(p) {
  margin: 0 0 6px;
}

.rich-text :deep(p:last-child) {
  margin-bottom: 0;
}

.rich-text :deep(table) {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
}

.rich-text :deep(td),
.rich-text :deep(th) {
  padding: 6px 10px;
  border: 1px solid var(--border-color, #e5e5e5);
}

/*
  选项列表。只有被标注的项（正确答案 / 考生所选）着色，
  其余保持中性灰——一道四选题里通常只有一两项需要引起注意。
*/
.option-list {
  margin-bottom: var(--spacing-md);
  list-style: none;
}

.option-item {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-sm);
  padding: 7px 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-primary);
}

/* 选项字母：圆形描边，被标注时填充为实心 */
.option-key {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  /* 与 .option-text 的 line-height 对齐，避免字母偏上 */
  margin-top: 1px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  background-color: var(--bg-fill);
  border-radius: 50%;
}

.option-text {
  flex: 1;
  /* 判断题的 key 与文本相同，重复显示无意义，但仍需占位对齐，故不隐藏 */
  word-break: break-word;
}

/* 标签文字，与配色一同表达状态，供无法辨色时阅读 */
.option-tag {
  flex-shrink: 0;
  margin-top: 2px;
  padding: 1px 7px;
  font-size: 11px;
  font-weight: 600;
  color: var(--option-fg);
  background-color: var(--option-bg);
  border-radius: var(--radius-sm);
}

.option-item--correct {
  --option-fg: var(--success-color);
  --option-bg: var(--success-light);
}

.option-item--correct .option-key {
  color: #fff;
  background-color: var(--success-color);
}

.option-item--wrong {
  --option-fg: var(--danger-color);
  --option-bg: var(--danger-light);
}

.option-item--wrong .option-key {
  color: #fff;
  background-color: var(--danger-color);
}

/* 主观题与答案隐去态：标出选了哪项，但不判对错 */
.option-item--picked {
  --option-fg: var(--primary-color);
  --option-bg: var(--primary-light);
}

.option-item--picked .option-key {
  color: #fff;
  background-color: var(--primary-color);
}

/*
  作答行只用文字着色，不铺底色块。
  一页十几道错题时，成对的红绿色块会连成一片噪音；
  对错已由右上角得分的颜色表达，这里只需标出答案本身。
*/
.answer-row {
  display: flex;
  gap: var(--spacing-sm);
  margin-top: 6px;
  font-size: 14px;
}

.answer-row--correct {
  --row-fg: var(--success-color);
}

.answer-row--wrong {
  --row-fg: var(--danger-color);
}

/* 主观题与答案隐去态：不判对错，答案用常规文字色 */
.answer-row--neutral {
  --row-fg: var(--text-primary);
}

/*
  定宽让「你的作答」与「正确答案」两行的答案值左缘对齐，便于逐字比对。
  4 个中文字在 14px 下约 56px，须留出余量并禁止换行，否则会折成两行。
*/
.answer-label {
  flex-shrink: 0;
  width: 64px;
  white-space: nowrap;
  font-size: 13px;
  color: var(--text-disabled);
}

.answer-value {
  flex: 1;
  font-weight: 600;
  color: var(--row-fg, var(--text-primary));
  word-break: break-all;
}

/*
  批阅信息成块，与解析同一套视觉语言（浅底圆角），但排布不同：
  解析是「标题 + 正文」左右分栏，批阅是「评语 + 署名」上下两行，
  署名右对齐并压小压灰，读起来是一段话下面的落款，而不是又一条属性行
*/
.review-block {
  margin-top: var(--spacing-md);
  padding: var(--spacing-sm) 10px;
  background-color: var(--bg-fill);
  border-radius: 10px;
}

.review-comment {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-primary);
  /* 评语含换行时保留排版 */
  white-space: pre-wrap;
  word-break: break-word;
}

/*
  署名用 secondary 而非 disabled：这是「谁给你判的分」，属于要能读清的信息。
  disabled 在浅底上对比度不足 4.5:1，达不到 WCAG AA
*/
.review-meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  text-align: right;
}

/*
  只有落款没有评语时：撤掉底色与内边距，退化成一行附属文字。
  留着块状样式会是个只装一行小字的孤立卡片，比不加这个块更碍眼。
  margin-top 也一并收窄——没有正文要承托，不需要那么多上方留白
*/
.review-block--bare {
  padding: 0;
  margin-top: var(--spacing-xs, 4px);
  background-color: transparent;
}

/* 落款自身的 margin-top 是给「正文之后」用的，退化态没有正文，去掉 */
.review-block--bare .review-meta {
  margin-top: 0;
}

/* 解析给浅底成块，原先只有一条分隔线，读起来像被随手附在末尾 */
.analysis {
  display: flex;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-sm) var(--spacing-sm) 10px;
  background-color: var(--bg-fill);
  border-radius: 10px;
}

/* 「解析」二字用主色，与正文区分，省一条分隔线 */
.analysis-title {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.7;
  color: var(--primary-color);
}

.analysis-text {
  flex: 1;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.7;
  /* 解析含换行时保留排版 */
  white-space: pre-wrap;
}
</style>
