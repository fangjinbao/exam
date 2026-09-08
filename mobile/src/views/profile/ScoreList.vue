<!--
  页面名称：ScoreList - 我的成绩

  功能描述：
    展示考生历次已发布的考试成绩，含得分、及格判定与交卷时间
    点击可查看单次考试的作答与得分详情

  路由信息：
    路径：/profile/scores
    名称：ScoreList
    是否缓存：否
-->

<template>
  <div class="score-list-page">
    <van-nav-bar title="我的成绩" left-arrow fixed placeholder @click-left="router.back()" />

    <AppSkeleton v-if="loading" variant="split-card" />

    <van-empty v-else-if="!list.length" description="暂无成绩" />

    <div v-else class="content">
      <!--
        概览卡：三格沿用考试详情页 .stat-card 的同一套结构（圆形浅蓝图标 + 主色大数字 + 灰标签），
        两页放在一起是同一个 App。三项均由 list 现算，不额外请求接口。
      -->
      <section class="card stat-card">
        <div class="stat-row">
          <div v-for="item in stats" :key="item.label" class="stat">
            <span class="stat-icon" aria-hidden="true">
              <van-icon :name="item.icon" />
            </span>
            <span class="stat-value">
              {{ item.value }}<span v-if="item.unit" class="stat-unit">{{ item.unit }}</span>
            </span>
            <span class="stat-label">{{ item.label }}</span>
          </div>
        </div>
      </section>

      <div class="list-head">
        <h2 class="list-title">考试记录</h2>
        <span class="list-count">{{ list.length }} 条</span>
      </div>

      <ul class="score-list">
        <!-- 待阅卷记录点进去详情会被后端拒绝（成绩未发布），列表层直接给出提示 -->
        <li
          v-for="item in list"
          :key="item.sheetId"
          class="score-card"
          @click="openDetail(item)"
        >
          <!-- 上行：考试名 + 结论标签。标签不参与压缩，名字过长时先挤名字 -->
          <div class="card-head">
            <div class="head-main">
              <h3 class="exam-name">{{ item.examName }}</h3>
              <!--
                考场安排时段紧跟考试名，作为它的副标题——这是考试自身的属性，
                与下方「本人何时作答」不是一类信息，混进那组明细里会让考生
                把开考时间当成自己的进场时间。
              -->
              <p v-if="item.examStartTime" class="exam-period">
                {{ formatExamPeriod(item.examStartTime, item.examEndTime) }}
              </p>
            </div>
            <!--
              三态互斥，判定顺序不能反：不公开优先于待阅卷。
              不公开的场次永远不会有分数可看，若先判 pendingReview，
              未发布阶段会显示成「待阅卷」，等于承诺一个不会到来的结果。
              及格与否本身也是成绩信息，故不公开时一并不显示。
            -->
            <span v-if="item.scoreHidden" class="verdict verdict--pending">不公开</span>
            <span v-else-if="item.pendingReview" class="verdict verdict--pending">待阅卷</span>
            <span v-else class="verdict" :class="`verdict--${item.passed ? 'pass' : 'fail'}`">
              {{ item.passed ? '及格' : '不及格' }}
            </span>
          </div>

          <!--
            下半区：左侧时间明细逐行列出，右侧分数。以发丝线与上行隔开。

            这里原先是「及格 60 分 · 用时 2 分钟 · 2026-08-20 11:12」单行「·」拼接，
            字段一多就折行，且折行处 `·` 落在行首成了「· 2026-08-20 11:12」。
            改为「标签 + 值」的定行结构：标签定宽左对齐、值右侧顺排，
            每项各占一行不再靠折行排版，也能容下进场/交卷两个完整时间。
            （行数随 v-if 在 2~4 行间浮动，但每行的构成是定的。）
          -->
          <div class="card-body">
            <dl class="meta-list">
              <div v-if="item.startTime" class="meta-row">
                <dt class="meta-label">我的进场</dt>
                <dd class="meta-value">{{ formatDate(item.startTime, 'MM-DD HH:mm') }}</dd>
              </div>
              <div class="meta-row">
                <dt class="meta-label">我的交卷</dt>
                <dd class="meta-value">{{ formatDate(item.submitTime, 'MM-DD HH:mm') }}</dd>
              </div>
              <div v-if="item.usedMinutes != null" class="meta-row">
                <dt class="meta-label">答题用时</dt>
                <dd class="meta-value">{{ formatUsedTime(item.usedMinutes) }}</dd>
              </div>
              <div class="meta-row">
                <dt class="meta-label">及格分</dt>
                <dd class="meta-value">{{ item.passScore }} 分</dd>
              </div>
            </dl>

            <!--
              分数必须带满分：单看「20」无从判断考得如何，
              满分 60 的 20 分与满分 100 的 20 分是两回事。
              待阅卷时分数还不存在，此处不占位，由上行的标签表达状态。
            -->
            <!--
              不公开的场次这里不占分数位，改为一行说明。
              不复用上方标签了事：分数位空着会让人以为还没出分，
              而这一格恰是考生第一眼找的地方，须在此明确「不会有」。
            -->
            <p v-if="item.scoreHidden" class="score-hidden">成绩不公开</p>
            <p v-else-if="!item.pendingReview" class="score" :class="scoreClass(item)">
              <b class="score-num">{{ item.totalScore ?? '—' }}</b>
              <span class="score-total">/{{ item.fullScore }}</span>
            </p>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { formatDate } from '@/utils/format'
import { getScoreListApi } from '@/api/modules/profileApi'
import AppSkeleton from '@/components/Common/AppSkeleton.vue'

const router = useRouter()

// 成绩列表
const list = ref([])

// 加载状态
const loading = ref(false)

/**
 * 打开成绩详情
 *
 * 待阅卷记录的详情接口会返回「成绩尚未发布」，与其让用户点进去看错误页，
 * 不如在此直接说明原因
 * @param {Object} item - 成绩列表项
 */
const openDetail = (item) => {
  if (item.pendingReview) {
    showToast('本场含主观题，成绩待阅卷后发布')
    return
  }
  router.push(`/profile/scores/${item.sheetId}`)
}

/*
  概览三格。全部由 list 现算，不额外请求接口。

  第三格取「最近得分」而非平均分：本页多数记录是待阅卷，
  已出分的样本可能只有一条，此时「平均分」等于把单次成绩包装成统计量，
  读者会当成长期水平。改成陈述最近一次的事实。

  「考试次数」「已出分」两格不带单位——标签已说明是次数，
  再写「6 次 / 考试次数」是同一件事说两遍。
*/
const stats = computed(() => {
  // 「已出分」计入不公开的场次：阅卷确实完成了，只是不给考生看分数
  const graded = list.value.filter((item) => !item.pendingReview)
  /*
    「最近得分」必须跳过不公开的场次，否则藏了列表里的分数、
    却在顶部统计里把它显示出来，等于没藏。
    列表按交卷时间倒序返回，故过滤后的第一条即最近一次有分可看的。
  */
  const latest = graded.find((item) => !item.scoreHidden)
  return [
    /*
      三个图标一律取 Vant 的描线版（`-o` 后缀）。此前混用了实心的 description
      与 passed，跟描线的 chart-trending-o 并排时粗细与填充都不一致。
      「已出分」用 completed-o 而非 passed：passed 只有实心版，
      completed-o 同样是圆圈打勾，形态一致且有描线版。
    */
    { icon: 'description-o', value: list.value.length, unit: '', label: '考试次数' },
    { icon: 'completed-o', value: graded.length, unit: '', label: '已出分' },
    {
      icon: 'chart-trending-o',
      // 已出分记录的 totalScore 理论上不为空，仍留 — 兜底，避免渲染出 undefined
      value: latest ? (latest.totalScore ?? '—') : '—',
      unit: latest ? '分' : '',
      label: '最近得分'
    }
  ]
})

/**
 * 考场安排时段文案
 *
 * 同一天的场次省掉结束侧重复的日期，得到「08-20 09:00 - 12:00」；
 * 跨天场次两侧都带日期，否则「08-20 09:00 - 08:00」会读成结束早于开始。
 * @param {string} start - 考试开始时间
 * @param {string|null} end - 考试结束时间
 * @returns {string} 时段文案
 */
const formatExamPeriod = (start, end) => {
  const startText = formatDate(start, 'MM-DD HH:mm')
  if (!end) return startText
  const sameDay = formatDate(start, 'YYYY-MM-DD') === formatDate(end, 'YYYY-MM-DD')
  return `${startText} - ${formatDate(end, sameDay ? 'HH:mm' : 'MM-DD HH:mm')}`
}

/**
 * 答题用时文案
 *
 * 后端给的是分钟总数，超过一小时直接显示会得到「336 分钟」，
 * 读者得自己换算。满 60 分钟进位成「5 小时 36 分钟」，整小时省掉尾部的「0 分钟」。
 * @param {number} minutes - 用时分钟数
 * @returns {string} 如「36 分钟」「5 小时 36 分钟」「5 小时」
 */
const formatUsedTime = (minutes) => {
  if (minutes < 60) return `${minutes} 分钟`
  const hour = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hour} 小时 ${rest} 分钟` : `${hour} 小时`
}

// 待阅卷时没有及格与否，分数占位符保持中性色，不能标红成「不及格」。
// 不公开的场次压根不走这里（模板里另有分支），仍纳入判断以防将来改动漏掉
const scoreClass = (item) => ({
  'score--pass': !item.pendingReview && !item.scoreHidden && item.passed,
  'score--fail': !item.pendingReview && !item.scoreHidden && !item.passed
})

/**
 * 加载成绩列表
 */
const loadList = async () => {
  loading.value = true
  try {
    const res = await getScoreListApi()
    list.value = res.data || []
  } catch {
    // 错误提示由响应拦截器统一给出，此处仅保持空列表
    list.value = []
  } finally {
    loading.value = false
  }
}

onMounted(loadList)
</script>

<style scoped>
.score-list-page {
  min-height: 100vh;
  background-color: var(--bg-page);
}

.content {
  padding: var(--spacing-md);
}

/* 卡片基底与考试详情页同一套：白底、16px 圆角、16px 内距 */
.card {
  padding: var(--spacing-md);
  background-color: var(--bg-card);
  border-radius: var(--radius-lg);
}

/* ── 概览三格 ─────────────────────────────── */
/*
  必须是纯白底。此前这张卡带 #eef4ff 起点的浅蓝渐变，而格内图标圆底是
  --primary-light (#eef3fe)——两色几乎相同，圆底在背景上没有对比度，
  图标看着糊在一片浅蓝里。考试详情页的同款三格本就放在白卡上。

  纵向比通用卡片宽松：三格是本卡唯一内容，挤在 16px 内会显局促（与详情页一致）。
*/
.stat-card {
  padding-top: 18px;
  padding-bottom: 18px;
}

.stat-row {
  display: flex;
  align-items: stretch;
}

.stat {
  display: flex;
  flex: 1;
  /* 三格等分且允许收缩，防止某格内容偏长时挤窄另两格 */
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  overflow: hidden;
}

/* 竖分隔线用 border 而非独立元素，避免多出空节点 */
.stat + .stat {
  border-left: 1px solid var(--divider-color);
}

.stat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background-color: var(--primary-light);
  font-size: 18px;
  color: var(--primary-color);
}

/* 数字与单位共用基线：居中会让「分」浮在数字腰部 */
.stat-value {
  display: flex;
  align-items: baseline;
  gap: 2px;
  font-size: 23px;
  font-weight: 600;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
  color: var(--primary-color);
  white-space: nowrap;
}

/*
  单位不跟数字共用 --primary-color：#1171F8 对白底 4.43:1，
  23px 粗体按大号文字算（阈值 3.0）够，12px 的单位要 4.5:1，
  故换深一档的 #0c66f2（5.00:1），同色系看不出差别。与详情页一致。
*/
.stat-unit {
  font-size: 12px;
  font-weight: 500;
  color: #0c66f2;
}

.stat-label {
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-disabled);
}

/* ── 列表标题行 ───────────────────────────── */
.list-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  /* 上间距略大于卡间距，让标题归属下方列表而非黏在概览卡上 */
  margin: 20px 0 10px;
}

.list-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.list-count {
  font-size: 12px;
  color: var(--text-disabled);
}

/* ── 成绩卡片 ─────────────────────────────── */
.score-card {
  padding: var(--spacing-md);
  background-color: var(--bg-card);
  border-radius: var(--radius-lg);
  cursor: pointer;
}

/*
  待阅卷记录不可进入详情。此前整卡 opacity:.7 会把考试名一起冲淡成禁用态，
  但记录本身是有效的、只是分数没出——改为仅由「待阅卷」标签表达，
  考试名保持与已出分记录同样的深色。
*/
.score-card + .score-card {
  margin-top: var(--spacing-md);
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-sm);
}

/* 考试名与其副标题成一组，整组与右侧标签分列 */
.head-main {
  flex: 1;
  min-width: 0;
}

/* overflow-wrap 兜住拼接 ID 一类无断点长串，默认不换行会溢出挨上右侧标签 */
.exam-name {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--text-primary);
  overflow-wrap: break-word;
}

/*
  考场时段：字号与下方明细同为 13px 但取更浅的灰，
  读起来是考试名的附注而非又一条明细。等宽数字与明细列对齐。
*/
.exam-period {
  margin-top: 4px;
  font-size: 13px;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
  color: var(--text-disabled);
}

/*
  下半区：与上行以发丝线分隔。左侧多行明细、右侧单个分数，
  故用 flex-start 让分数与明细首行顶齐，baseline 会把分数拉到第一行基线上、
  22px 的数字看着往下坠。
*/
.card-body {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-md);
  margin-top: 11px;
  padding-top: 11px;
  border-top: 1px solid var(--divider-color);
}

/*
  时间明细：每行「标签 + 值」。dt 定宽让四行的值左缘对齐成一列，
  不定宽则「及格分」比「我的进场」窄，值会参差不齐。
*/
.meta-list {
  flex: 1;
  min-width: 0;
}

.meta-row {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-sm);
}

.meta-row + .meta-row {
  margin-top: 5px;
}

.meta-label {
  flex-shrink: 0;
  /* 四字标签在 13px 下约 52px，留 56px 含字间余量 */
  width: 56px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-disabled);
}

/*
  时间值用等宽数字：各行位数相同，比例数字下 08-20 与 11-11 的字宽有细微差，
  逐行看会觉得没对齐。
*/
.meta-value {
  min-width: 0;
  font-size: 13px;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
}

/*
  分数与左侧明细首行对齐：margin-top 抵掉 13px 明细行（line-height 1.5 ≈ 19.5px）
  与 22px 数字（line-height 1.1 ≈ 24px）的高度差，让数字视觉上压在首行上。
*/
.score {
  flex-shrink: 0;
  display: flex;
  align-items: baseline;
  margin-top: -2px;
  /* 及格与否由本色与上行标签共同表达，默认取中性色 */
  color: var(--text-disabled);
}

/*
  不公开成绩时占用分数位的说明文字。
  不用 .score 的字号：那是为两位数字调的视觉重心，套在四个汉字上会过重、
  抢掉考试名的位置。此处只需说明状态，取与「及格分」同级的正文字号。
*/
.score-hidden {
  flex-shrink: 0;
  align-self: flex-end;
  font-size: 13px;
  color: var(--text-disabled);
  white-space: nowrap;
}

.score-num {
  font-size: 22px;
  font-weight: 600;
  /* 等宽数字：各行分数位数不同时右缘仍对齐 */
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

/* 满分是参照量，不与得分争视觉重心 */
.score-total {
  margin-left: 1px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-disabled);
}

.score--pass {
  color: var(--success-color);
}

/* 不及格取 --unqualified-color，不用 danger 红，理由见变量定义 */
.score--fail {
  color: var(--unqualified-color);
}

/* 结论标签：文字与配色一同表达，不辨色也能读出结果 */
/*
  结论标签：文字与配色一同表达，不辨色也能读出结果。
  flex-shrink:0 防止考试名过长时把「不及格」压成两行。
  margin-top 让标签与考试名首行视觉居中（16px 行高下标签比字矮一截）。
*/
.verdict {
  flex-shrink: 0;
  margin-top: 2px;
  padding: 3px 8px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  border-radius: var(--radius-md);
}

.verdict--pass {
  color: var(--success-color);
  background-color: var(--success-light);
}

.verdict--fail {
  color: var(--unqualified-color);
  background-color: var(--unqualified-light);
}

.verdict--pending {
  color: var(--text-secondary);
  background-color: var(--bg-fill);
}
</style>
