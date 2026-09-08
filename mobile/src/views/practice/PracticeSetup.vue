<!--
  页面名称：PracticeSetup - 在线练习范围选择

  功能描述：
    练习入口只有两类，与管理端「练习管理」的两个 Tab 一一对应，
    页内也用一组胶囊 Tab 互斥展示（默认岗位练兵，可由 ?tab= 指定）：
    - 岗位练兵：管理员建好并指派给我的，进度与可练状态由后端判定
    - 自主练习：管理员开放给我的题库，自选一个开始练
    考核点在管理端是题库设置内的范围限定项，不是并列入口，故此处不单列。

  路由信息：
    路径：/practice/setup
    名称：PracticeSetup
    是否缓存：否
-->

<template>
  <div class="practice-setup-page">
    <!-- 蓝色品牌顶区：与首页 .hero 同款渐变与装饰圆，两页视觉归为一套 -->
    <header class="hero">
      <span class="hero-blob hero-blob--lg" aria-hidden="true"></span>
      <span class="hero-blob hero-blob--sm" aria-hidden="true"></span>

      <div class="hero-bar">
        <button type="button" class="hero-back" aria-label="返回" @click="router.back()">
          <van-icon name="arrow-left" />
        </button>
        <h1 class="hero-title">在线练习</h1>
      </div>

      <p class="hero-slogan">练一练，把要点记牢</p>
      <p class="hero-sub">
        可练 {{ banks.length }} 个题库 · 累计 {{ stats.answeredCount }} 题
      </p>
    </header>

    <AppSkeleton v-if="loading" variant="form" />

    <div v-else class="content">
      <!-- 数据概览：四等分，上移压住渐变底边 -->
      <section class="overview" aria-label="练习概览">
        <div v-for="item in overviewItems" :key="item.key" class="overview-item">
          <p class="overview-value">{{ item.value }}</p>
          <p class="overview-label">{{ item.label }}</p>
        </div>
      </section>

      <!-- 类型切换：两类入口改为互斥展示，标签自带条目数，省去两个区块标题 -->
      <div class="tabs" role="tablist">
        <button
          v-for="tab in tabItems"
          :key="tab.key"
          type="button"
          class="tab"
          :class="{ 'tab--active': activeTab === tab.key }"
          role="tab"
          :aria-selected="activeTab === tab.key"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
          <span class="tab-count">{{ tab.count }}</span>
        </button>
      </div>

      <!--
        岗位练兵：一个练习一张卡。原先是一张大卡内用发丝线分隔多条，
        练习之间的边界弱于卡片本身，读起来是「一坨」而非「几件事」；
        且每条要放标题、状态、时间、进度四组信息，挤在分隔线里层次压不开。

        副标题不再列题库名：题库名是管理端的组织方式，对练习的人没有决策价值
        （"信息安全题库/安全教育题库/施工安全题库" 占满一行还会被截断），
        换成截止时间与上次练习时间——决定「现在练还是待会儿练」靠这两个。
      -->
      <section
        v-if="activeTab === 'assigned'"
        class="assigned-wrap"
        :class="{ 'assigned-wrap--empty': !assigned.length }"
      >
        <van-empty v-if="!assigned.length" description="暂无指派给你的岗位练兵" />
        <ul v-else class="assigned-list">
          <li v-for="item in assigned" :key="item.id">
            <button
              type="button"
              class="pcard"
              :class="{ 'pcard--disabled': !item.canPractice }"
              :aria-label="item.ariaLabel"
              @click="startAssigned(item)"
            >
              <span class="pcard-head">
                <span class="pcard-name">{{ item.name }}</span>
                <!-- 四态用不同底色区分：已练完灰绿、进行中主色实心、未答题/未开放浅灰 -->
                <span class="status-pill" :class="`status-pill--${item.stateType}`">
                  {{ item.stateText }}
                </span>
              </span>

              <!--
                信息行：截止时间靠左、题数靠右，各自成列不用「·」拼接。
                单行「·」拼接在字段变长时会折行，且折行处 `·` 落在行首。
              -->
              <span class="pcard-info">
                <span class="pcard-due" :class="{ 'pcard-due--urgent': item.timeUrgent }">
                  {{ item.timeText }}
                </span>
                <span class="pcard-total">共 {{ item.totalCount }} 题</span>
              </span>

              <!-- 进度条只在开练后出现：一条 0% 的空槽传达不了信息，反而占位 -->
              <span v-if="item.answeredCount > 0" class="progress-row">
                <span class="progress-track">
                  <span
                    class="progress-fill"
                    :style="{ width: item.progressPercent + '%' }"
                  ></span>
                </span>
                <span class="progress-text">{{ item.answeredText }}/{{ item.totalCount }}</span>
              </span>

              <!-- 上次练习时间：只在练过之后才有意义，没练过的不占这行 -->
              <span v-if="item.lastText" class="pcard-last">{{ item.lastText }}</span>

              <span v-if="!item.canPractice" class="pcard-block">{{ item.blockReason }}</span>
            </button>
          </li>
        </ul>
      </section>

      <!-- 自主练习：管理员开放给我的题库，题数已按开放范围与单轮上限算过 -->
      <section v-else class="card">
        <van-empty v-if="!banks.length" description="暂无开放给你的题库" />
        <ul v-else class="option-list">
          <li
            v-for="(bank, index) in banks"
            :key="bank.id"
            class="option-item"
            :class="{ 'option-item--disabled': bank.canPractice === false }"
            @click="startPractice(bank)"
          >
            <!-- 图标底色按序号轮转：后端没有题库配色字段，按 id 取模会因题库增删跳色，
                 按列表序号取则同一份列表内配色稳定，纯装饰不承载语义 -->
            <span class="bank-icon" :class="`bank-icon--${index % 3}`" aria-hidden="true">
              <van-icon :name="BANK_ICONS[index % 3]" />
            </span>
            <span class="option-text">
              <span class="option-name">{{ bank.name }}</span>
              <span class="option-count">{{ bank.questionCount }} 题</span>
            </span>
            <!-- 置灰原因用标签而非替换题数：完整文案十余字，塞进这行会把题库名挤没，
                 与岗位练兵块的「已练完」标签同款；完整原因在点击时由 toast 给出 -->
            <span v-if="bank.canPractice === false" class="status-pill status-pill--done">
              已练完
            </span>
            <van-icon name="arrow" size="14" class="option-arrow" aria-hidden="true" />
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { showToast } from 'vant'
import { formatDate, diffNaturalDays } from '@/utils/format'
import {
  getPracticeOptionsApi,
  getAssignedPracticeListApi,
  getPracticeStatsApi
} from '@/api/modules/practiceApi'
import AppSkeleton from '@/components/Common/AppSkeleton.vue'

const router = useRouter()
const route = useRoute()

// 自主练习题库的图标，按列表序号轮转取用
const BANK_ICONS = ['shield-o', 'bookmark-o', 'certificate']

// 当前 tab：首页两个快捷入口分别带 ?tab=assigned / ?tab=bank 进来，
// 直接读 query 而不做跳转后再切，避免进页面先闪一下另一个 tab
const activeTab = ref(route.query.tab === 'bank' ? 'bank' : 'assigned')

// 岗位练兵列表
const assigned = ref([])

// 自主练习可选题库
const banks = ref([])

// 练习概览：题库数不在其中，由 banks 直接派生，避免两个接口各报一个数
const stats = ref({ answeredCount: 0, accuracy: 0, ongoingCount: 0 })

// 加载状态
const loading = ref(false)

// 四格数据条
const overviewItems = computed(() => [
  { key: 'bank', label: '题库', value: banks.value.length },
  { key: 'answered', label: '已练题数', value: stats.value.answeredCount },
  { key: 'accuracy', label: '正确率', value: `${stats.value.accuracy}%` },
  { key: 'ongoing', label: '进行中', value: stats.value.ongoingCount }
])

// 两个 tab 的标签与条目数
const tabItems = computed(() => [
  { key: 'assigned', label: '岗位练兵', count: assigned.value.length },
  { key: 'bank', label: '自主练习', count: banks.value.length }
])

/**
 * 岗位练兵的展示状态
 *
 * 前三态说的是「我练到哪了」，末一态说的是「练习本身还没开放」——
 * 后者不能也叫「未开始」：同一个词在同一张卡上指两件事，用户会把
 * 「未开始 + 8月30日开始」读成「现在能练，我还没开始练」。
 * 故未开放单列「未开放」，我没答题的叫「未答题」。
 *
 * @param {Object} item - 练习列表项
 * @returns {{ type: string, text: string }} 标签样式与文案
 */
const assignedState = (item) => {
  if (item.status === 'published') return { type: 'idle', text: '未开放' }
  if (item.finished) return { type: 'done', text: '已练完' }
  if (item.answeredCount > 0) return { type: 'ongoing', text: '进行中' }
  return { type: 'idle', text: '未答题' }
}

/**
 * 时间信息的展示文案与紧迫标记
 *
 * 分两种情况，取决于后端算出的 status：
 * - published：已发布但未到 startTime，此时该说「什么时候开始」而不是截止时间，
 *   用户看到「8月30日截止」会以为现在能练；
 * - 其余：按 endTime 说截止。startTime/endTime 都可为空表示不限时。
 *
 * 临近截止（3 天内）标橙，让人先看见快到期的那个。
 * 只给日期不给「还剩几天」不行：看到「8月30日截止」还要自己数天数；
 * 只给天数也不行：跨月时「还剩 5 天」没法核对日历。故两者并列。
 *
 * @param {Object} item - 练习列表项
 * @returns {{ text: string, urgent: boolean }} 文案与是否临期
 */
const timeInfo = (item) => {
  // 未开始：只说开始时间。此时 canPractice 为 false，卡片整体已置灰
  if (item.status === 'published' && item.startTime) {
    const days = diffNaturalDays(item.startTime)
    if (days === null) return { text: '练习尚未开始', urgent: false }
    if (days === 0) return { text: '今天开始', urgent: false }
    if (days === 1) return { text: '明天开始', urgent: false }
    return { text: `${formatDate(item.startTime, 'M月D日')}开始`, urgent: false }
  }

  if (!item.endTime) return { text: '不限练习时间', urgent: false }

  const days = diffNaturalDays(item.endTime)
  // 时间格式异常时退回不限时文案，避免渲染出「NaN 天」
  if (days === null) return { text: '不限练习时间', urgent: false }

  const date = formatDate(item.endTime, 'M月D日')
  if (days < 0) return { text: `${date}已截止`, urgent: false }
  if (days === 0) return { text: '今天截止', urgent: true }
  if (days === 1) return { text: '明天截止', urgent: true }
  if (days <= 3) return { text: `${date}截止 · 还剩 ${days} 天`, urgent: true }
  return { text: `${date}截止`, urgent: false }
}

/**
 * 上次练习时间的相对文案
 *
 * 绝对时间戳（"08-20 11:12"）要读者自己算过了多久，
 * 而这里的用途是「这个练习被我搁下多久了」，相对文案更直接。
 * 超过一周退回具体日期：「12 天前」这种量级已不需要精确到天。
 *
 * @param {Object} item - 练习列表项
 * @returns {string} 相对时间文案，从未练过时返回空串
 */
const lastPracticeText = (item) => {
  if (!item.lastPracticeTime) return ''

  const last = new Date(item.lastPracticeTime)
  if (Number.isNaN(last.getTime())) return ''

  const diffMs = Date.now() - last.getTime()
  // 时钟偏差或服务端时间略超前时按刚刚处理，不显示负数
  if (diffMs < 0) return '上次练习：刚刚'

  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return '上次练习：刚刚'
  if (mins < 60) return `上次练习：${mins} 分钟前`

  const hours = Math.floor(mins / 60)
  if (hours < 24) return `上次练习：${hours} 小时前`

  const days = Math.floor(hours / 24)
  if (days <= 7) return `上次练习：${days} 天前`
  return `上次练习：${formatDate(last, 'M月D日')}`
}

/**
 * 已答题数的展示值
 * 抽题规则改小后，旧记录的 answeredCount 可能超过当前 totalCount，
 * 夹住上界避免显示「12/10」这种大于总数的分数
 * @param {Object} item - 练习列表项
 * @returns {number} 不超过 totalCount 的已答数
 */
const answeredText = (item) => Math.min(item.answeredCount, item.totalCount)

/**
 * 岗位练兵的完成百分比
 * @param {Object} item - 练习列表项
 * @returns {number} 0-100 的整数
 */
const progressPercent = (item) => {
  if (!item.totalCount) return 0
  // 与 answeredText 同源夹取，否则进度条停在 100% 而文字另说一个数
  return Math.round((answeredText(item) / item.totalCount) * 100)
}

/**
 * 加载练习范围选项
 */
const loadOptions = async () => {
  loading.value = true
  try {
    // 三者互不依赖，并行取；任一失败不应连带其余空白，故分别兜底
    const [listRes, optionRes, statsRes] = await Promise.allSettled([
      getAssignedPracticeListApi(),
      getPracticeOptionsApi(),
      getPracticeStatsApi()
    ])

    // 派生字段在这里一次算好挂到列表项上：模板里 timeInfo/lastPracticeText
    // 会在 class 绑定与文本插值中各调一次，且每次重渲染（如切 tab）都重算。
    // 这些值只依赖接口数据，请求回来时算一遍就够
    const rawAssigned = listRes.status === 'fulfilled' ? listRes.value.data || [] : []
    assigned.value = rawAssigned.map((item) => {
      const time = timeInfo(item)
      const state = assignedState(item)
      return {
        ...item,
        timeText: time.text,
        timeUrgent: time.urgent,
        stateType: state.type,
        stateText: state.text,
        lastText: lastPracticeText(item),
        answeredText: answeredText(item),
        progressPercent: progressPercent(item),
        // 读屏会把卡内 7 段文本连读成一长串，难分信息边界，
        // 故汇总一句作为按钮的可读名称
        ariaLabel: `${item.name}，${state.text}，${time.text}，共 ${item.totalCount} 题`
      }
    })
    const options = optionRes.status === 'fulfilled' ? optionRes.value.data || {} : {}
    banks.value = options.banks || []
    // 统计失败时保留零值：概览是辅助信息，不该拖垮两个练习入口
    if (statsRes.status === 'fulfilled') {
      // 字段级合并：后端只回部分字段时，其余项保持 0。整体赋值会让缺失字段变
      // undefined，而 accuracy 是用模板字符串拼的，会直接显示成 "undefined%"
      stats.value = { ...stats.value, ...(statsRes.value.data || {}) }
    }
  } catch {
    // 错误提示由响应拦截器统一给出，此处仅保持空列表
    assigned.value = []
    banks.value = []
  } finally {
    loading.value = false
  }
}

/**
 * 进入岗位练兵
 * @param {Object} item - 练习列表项
 */
const startAssigned = (item) => {
  if (!item.canPractice) {
    showToast(item.blockReason || '该练习当前不可进入')
    return
  }
  router.push({ path: '/practice/answer', query: { practiceId: item.id } })
}

/**
 * 进入自主练习作答
 * 只传 bankId：考核点范围由后端按管理端配置自动限定，前端不需要也不应该指定
 * @param {Object} bank - 题库项（含 canPractice/blockReason）
 */
const startPractice = (bank) => {
  if (bank.canPractice === false) {
    showToast(bank.blockReason || '该题库当前不可练习')
    return
  }
  router.push({ path: '/practice/answer', query: { bankId: bank.id } })
}

onMounted(loadOptions)
</script>

<style scoped>
.practice-setup-page {
  min-height: 100vh;
  background-color: var(--bg-page);
}

/* ── 蓝色品牌顶区：渐变与装饰圆同首页 .hero ─────────── */
.hero {
  position: relative;
  overflow: hidden;
  /* 顶部预留状态栏高度：真机取安全区，桌面预览兜底 44px 与设计稿一致
     不能写 env(x, 44px)，因为浏览器支持该函数但值为 0 时不会走 fallback */
  padding: max(env(safe-area-inset-top), 44px) 25px 41px;
  /* 负边距挂在顶区而非 .content：顶区始终渲染，加载态与内容态被同等上提，
     否则 loading 与 .content 是 v-if/v-else 兄弟，切换时整块会跳 25px */
  margin-bottom: -25px;
  background-image: linear-gradient(180deg, #0c66f2 0%, #3c90f7 100%);
}

.hero-blob {
  position: absolute;
  border-radius: 50%;
  background-color: rgb(255 255 255 / 9%);
  pointer-events: none;
}

.hero-blob--lg {
  top: -52px;
  right: -40px;
  width: 172px;
  height: 172px;
}

.hero-blob--sm {
  top: 48px;
  right: -86px;
  width: 138px;
  height: 138px;
}

/* 导航行：标题居中于整行，返回键绝对定位不参与居中计算 */
.hero-bar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
}

.hero-back {
  /* 触摸区撑到 44px，用负左偏移让箭头图形仍对齐 25px 内边距 */
  position: absolute;
  left: -11px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: none;
  background: none;
  font-size: 20px;
  color: #fff;
  cursor: pointer;
}

.hero-title {
  font-size: 17px;
  font-weight: 600;
  color: #fff;
}

.hero-slogan {
  position: relative;
  margin-top: 18px;
  font-size: 25px;
  font-weight: 600;
  line-height: 34px;
  color: #fff;
}

.hero-sub {
  position: relative;
  margin-top: 2px;
  font-size: 14px;
  line-height: 20px;
  /* 次级信息压低对比，保持蓝底上的层次 */
  color: rgb(255 255 255 / 88%);
}

/* ── 内容区：整体上移压住渐变区底部 ─────────── */
/* z-index 保留：要盖在渐变之上，上提由 .hero 的负下边距完成 */
.content {
  position: relative;
  z-index: 1;
  padding: 0 15px calc(var(--spacing-md) + env(safe-area-inset-bottom));
}

/* 数据概览：四等分列 */
.overview {
  display: flex;
  height: 71px;
  margin-bottom: 13px;
  border-radius: 14px;
  background-color: #fff;
  box-shadow: 0 2px 12px rgb(18 40 82 / 5%);
}

.overview-item {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.overview-value {
  font-size: 20px;
  font-weight: 600;
  line-height: 26px;
  color: var(--primary-color);
}

.overview-label {
  margin-top: 2px;
  font-size: 12px;
  line-height: 17px;
  color: var(--text-disabled);
}

/* 顶区已先渲染，加载态只需在其下方留白，不必再撑满整屏 */
.card {
  padding: var(--spacing-md);
  border-radius: 14px;
  background-color: var(--bg-card);
  box-shadow: 0 2px 12px rgb(18 40 82 / 5%);
}

.card + .card {
  margin-top: 13px;
}

/* ── 类型切换：与任务页 .chip 同款胶囊 ─────────── */
.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 13px;
}

.tab {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 8px 16px;
  -webkit-appearance: none;
  appearance: none;
  border: 1px solid #eaecf0;
  border-radius: 999px;
  background-color: #fff;
  font-size: 14px;
  line-height: 18px;
  color: #667085;
  cursor: pointer;
}

.tab--active {
  border-color: var(--primary-color);
  background-color: var(--primary-color);
  font-weight: 500;
  color: #fff;
}

/* 数字用底色块托住：直接跟在文字后会读成「岗位练兵3」 */
.tab-count {
  min-width: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background-color: #f2f4f7;
  font-size: 12px;
  line-height: 18px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: #667085;
}

.tab--active .tab-count {
  /* 选中态底色是主色，数字块改用半透明白，省一套写死的深色 */
  background-color: rgb(255 255 255 / 24%);
  color: #fff;
}

/* 选项行：图标 44px 撑起行高，已超出 48px 触摸下限 */
.option-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  cursor: pointer;
}

/* 题库图标：渐变底衬承接顶区主色，纯装饰 */
.bank-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  font-size: 22px;
  color: #fff;
}

.bank-icon--0 {
  background-image: linear-gradient(135deg, #1171f8 0%, #4f9dfb 100%);
}

.bank-icon--1 {
  background-image: linear-gradient(135deg, #12b5cb 0%, #37d0d6 100%);
}

.bank-icon--2 {
  background-image: linear-gradient(135deg, #f59a23 0%, #fbb851 100%);
}

/* 名称与题数纵向排布，左对齐成一条线 */
.option-text {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
}

.option-item + .option-item {
  border-top: 1px solid var(--border-color);
}

.option-item:active {
  opacity: 0.7;
}

.option-name {
  flex: 1;
  /* min-width:0 不能省：flex 项默认 min-width:auto，长题库名会拒绝收缩，
     把同行的标签/题数/箭头挤出可视区 */
  min-width: 0;
  overflow: hidden;
  font-size: 16px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.option-count {
  margin-top: 2px;
  font-size: 13px;
  color: var(--text-disabled);
}

/* 箭头是纯指示符号，比正文更浅一档，避免和题库名抢视线；
   size 必须显式给，否则 van-icon 按继承字号渲染会被行内上下文撑大 */
.option-arrow {
  flex-shrink: 0;
  color: #c9cdd4;
}

/* ── 岗位练兵：一个练习一张卡 ─────────── */
/*
  空态仍需白底卡片托住，否则 van-empty 直接贴在灰色页背景上。
  用显式类而非 :has(.van-empty)：后者要 Chrome 105+/Safari 15.4+，
  企业微信内置浏览器（X5 内核）版本参差，不支持时空态会没有白底。
*/
.assigned-wrap--empty {
  padding: var(--spacing-md);
  border-radius: 14px;
  background-color: var(--bg-card);
  box-shadow: 0 2px 12px rgb(18 40 82 / 5%);
}

.assigned-list li + li {
  margin-top: 12px;
}

/*
  用 button 而非 li 承载点击：键盘可聚焦、回车可触发，
  li 上挂 @click 对读屏和键盘用户都不可达。
  卡片规格与任务页 .card 对齐（圆角 18px、投影 4%），两页归为一套。
*/
.pcard {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  padding: 16px;
  text-align: left;
  -webkit-appearance: none;
  appearance: none;
  border: none;
  border-radius: 18px;
  background-color: var(--bg-card);
  box-shadow: 0 2px 10px rgb(16 24 40 / 4%);
  cursor: pointer;
}

.pcard:active {
  opacity: 0.7;
}

.pcard:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}

/* 标题行：名称占满剩余宽度，状态标签靠右不参与收缩 */
.pcard-head {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  min-height: 28px;
}

.pcard-name {
  flex: 1;
  /* min-width:0 不能省：flex 项默认 min-width:auto，长练习名会拒绝收缩，
     把状态标签挤出可视区 */
  min-width: 0;
  overflow: hidden;
  font-size: 16px;
  font-weight: 500;
  line-height: 22px;
  color: var(--text-primary);
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 信息行：截止靠左、题数靠右 */
.pcard-info {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--spacing-sm);
}

.pcard-due {
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  line-height: 18px;
  color: var(--text-secondary);
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 临期标红。不用 --danger-color：那个红读作「出错了」，
   而临近截止是提醒，用橙色档（同「未达标」的语义分层） */
.pcard-due--urgent {
  font-weight: 500;
  color: var(--unqualified-color);
}

.pcard-total {
  flex-shrink: 0;
  font-size: 13px;
  line-height: 18px;
  color: var(--text-disabled);
  font-variant-numeric: tabular-nums;
}

/* 上次练习：卡内最次级的信息，压到最浅一档 */
.pcard-last {
  font-size: 12px;
  line-height: 17px;
  color: var(--text-disabled);
}

/*
  不可练原因不用红：红读作「系统出错」，而「已结束」「不允许重练」是既定规则，
  照红了还会把视线拉到整屏最不需要操作的那张卡。用最浅一档灰陈述即可。
*/
.pcard-block {
  font-size: 12px;
  line-height: 17px;
  color: var(--text-disabled);
}

/* 不可练时降低对比度，但保留可点击以便提示原因 */
.pcard--disabled .pcard-name,
.pcard--disabled .pcard-due,
.pcard--disabled .pcard-total,
.pcard--disabled .pcard-last {
  color: var(--text-disabled);
}

/* 进度条一并降饱和：否则置灰卡里一条饱和蓝比正常卡还扎眼，
   与文字的置灰互相打架 */
.pcard--disabled .progress-fill {
  background-image: none;
  background-color: #c9cdd4;
}

/* 自主练习的置灰态与岗位练兵一致：已练完且不允许重练时仍可见但不可点 */
/* 箭头不列入：它的基础色已浅于 --text-disabled，再套一层反而变深 */
.option-item--disabled .option-name,
.option-item--disabled .option-count {
  color: var(--text-disabled);
}

/* 图标一并降饱和，否则置灰行里彩色底衬仍在抢注意力 */
.option-item--disabled .bank-icon {
  filter: grayscale(1);
  opacity: 0.6;
}

/* 状态胶囊：进行中用主色实心强调，其余两态弱化 */
.status-pill {
  flex-shrink: 0;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 17px;
  white-space: nowrap;
}

.status-pill--ongoing {
  background-color: var(--primary-color);
  color: #fff;
}

.status-pill--idle {
  background-color: #f2f3f5;
  color: var(--text-disabled);
}

.status-pill--done {
  background-color: rgb(0 180 42 / 10%);
  color: var(--success-color);
}

/* 进度条。间距由 .pcard 的 gap 统一给，这里不再挂 margin-top */
.progress-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.progress-track {
  flex: 1;
  overflow: hidden;
  height: 6px;
  border-radius: 3px;
  background-color: #eef0f3;
}

.progress-fill {
  display: block;
  height: 100%;
  border-radius: 3px;
  background-image: linear-gradient(90deg, #0c66f2 0%, #4f9dfb 100%);
  transition: width 0.3s;
}

.progress-text {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--text-disabled);
  /* 等宽数字防止进度变化时宽度跳动 */
  font-variant-numeric: tabular-nums;
}

</style>
