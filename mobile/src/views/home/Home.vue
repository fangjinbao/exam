<!--
  页面名称：Home - 首页

  功能描述：
    考生首页，展示问候语、数据概览、待考提醒与快捷功能
    待考状态由当前时间与考试起止时间自动判定，距开考天数实时计算

  路由信息：
    路径：/home
    名称：Home
    是否缓存：是（KeepAlive）
-->

<template>
  <div class="home-page">
    <!-- 蓝色品牌顶区 -->
    <header class="hero">
      <span class="hero-blob hero-blob--lg" aria-hidden="true"></span>
      <span class="hero-blob hero-blob--sm" aria-hidden="true"></span>

      <div class="hero-bar">
        <div class="hero-text">
          <h1 class="hero-greeting">{{ greeting }}，{{ profile.name || '考生' }}</h1>
          <p class="hero-company">{{ profile.company || '—' }}</p>
        </div>
        <button
          type="button"
          class="hero-bell"
          :aria-label="unreadCount > 0 ? `消息通知，${unreadCount} 条未读` : '消息通知'"
          @click="router.push('/message')"
        >
          <svg viewBox="0 0 1024 1024" aria-hidden="true">
            <path
              fill="#fff"
              d="M512 76a68 68 0 0 1 68 68v22a290 290 0 0 1 222 282v154l62 96a34 34 0 0 1-28 53H188a34 34 0 0 1-28-53l62-96V448a290 290 0 0 1 222-282v-22a68 68 0 0 1 68-68Zm0 810a102 102 0 0 0 96-68H416a102 102 0 0 0 96 68Z"
            />
          </svg>
          <span v-if="unreadCount > 0" class="hero-dot" aria-hidden="true"></span>
        </button>
      </div>
    </header>

    <div class="content">
      <!-- 数据概览：四列，压住渐变区底部 -->
      <section class="overview" aria-label="数据概览">
        <div v-for="item in overviewItems" :key="item.key" class="overview-item">
          <p class="overview-value" :class="{ 'overview-value--warn': item.warn }">
            {{ item.value }}
          </p>
          <p class="overview-label">{{ item.label }}</p>
        </div>
      </section>

      <!-- 练习入口 -->
      <button type="button" class="practice-banner" @click="router.push('/practice/setup')">
        <span class="practice-text">
          <span class="practice-title">今日还没练题</span>
          <span class="practice-desc">每天 15 题，稳步提升</span>
        </span>
        <!-- 纯装饰插图，alt 留空避免读屏重复朗读左侧已有的文案 -->
        <img class="practice-art" :src="practiceBannerArt" alt="" aria-hidden="true" />
      </button>

      <!-- 待考提醒 -->
      <section class="section" aria-label="待考提醒">
        <header class="section-header">
          <h2 class="section-title">待考提醒</h2>
          <button
            v-if="upcomingList.length"
            type="button"
            class="section-more"
            @click="router.push('/task')"
          >
            查看全部
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M9 5l7 7-7 7"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </header>

        <!--
          骨架而非转圈：块位与下方真实考试行一致，数据到位时只是灰块变文字，
          不像转圈那样从「居中一个圈」整块跳成两行列表
        -->
        <div v-if="loading" class="exam-card exam-card--loading">
          <AppSkeleton variant="row-list" bare :count="2" />
        </div>
        <!--
          空状态给图形 + 副文案：原先只有一行灰字，视觉上像卡片没加载出来。
          副文案顺带把考生引到练习，避免这块区域在无考试时完全没用。
        -->
        <div v-else-if="!upcomingList.length" class="state-card state-card--empty">
          <span class="empty-art" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <rect
                x="3"
                y="5"
                width="18"
                height="16"
                rx="4"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
              />
              <path
                d="M3 10h18M8 3v4M16 3v4"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
              />
              <path
                d="M9.5 15.5l2 2 3.5-3.5"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>
          <span class="empty-title">暂无待考安排</span>
          <span class="empty-tip">有新考试会在这里提醒你</span>
        </div>
        <div v-else class="exam-card">
          <button
            v-for="(item, index) in upcomingList"
            :key="item.id"
            type="button"
            class="exam-row"
            :class="{
              'exam-row--divided': index > 0,
              // 正在进行且不是重考态的行整行浅蓝：这是唯一能立刻点进去考的，要一眼找到
              'exam-row--live': item.status === EXAM_STATUS.ONGOING && !item.attemptCount
            }"
            @click="goExam(item)"
          >
            <!--
              图标底色跟考试状态绑定，不再按 index 蓝橙交替——
              按序号交替纯装饰、不带信息，同一场考试刷新后换个位置就变色，反而显得随意
            -->
            <HomeIcon
              name="calendar"
              :variant="item.status === EXAM_STATUS.ONGOING ? 'blue' : 'orange'"
              :size="44"
            />
            <span class="exam-main">
              <span class="exam-name">{{ item.name }}</span>
              <span class="exam-time">{{ formatDate(item.startTime, 'MM-DD HH:mm') }}</span>
            </span>
            <span class="exam-status">
              <!--
                三种状态的视觉权重刻意拉开：
                进行中是实心徽标（可立即行动）、可重考是描边徽标（可选行动）、
                倒计时只是纯数字（暂时不能操作，仅告知）。
                原先三者都是同字号文字，最该点的那条反而看不出来。

                已考过但仍有重考机会：状态位显「可重考 + 已考 N 次」。
                不标出来考生分不清哪场考过了，会重复点进去。
                机会已用尽的考试后端不下发，故此处 attemptCount>0 必然还能再考。
              -->
              <template v-if="item.attemptCount > 0">
                <span class="exam-badge exam-badge--retake">可重考</span>
                <span class="exam-sub">已考 {{ item.attemptCount }} 次</span>
              </template>
              <template v-else-if="item.status === EXAM_STATUS.ONGOING">
                <span class="exam-badge exam-badge--live">
                  <span class="exam-live-dot" aria-hidden="true"></span>
                  进行中
                </span>
              </template>
              <template v-else>
                <span class="exam-countdown">
                  <span class="exam-days">{{ daysUntil(item.startTime) }}</span>
                  <span class="exam-unit">天后</span>
                </span>
              </template>
            </span>
          </button>
        </div>
      </section>

      <!-- 快捷功能 -->
      <section class="section" aria-label="快捷功能">
        <header class="section-header">
          <h2 class="section-title">快捷功能</h2>
        </header>
        <nav class="shortcut-card">
          <button
            v-for="item in shortcuts"
            :key="item.key"
            type="button"
            class="shortcut"
            @click="router.push(item.path)"
          >
            <HomeIcon :name="item.icon" :variant="item.variant" :size="50" />
            <span class="shortcut-label">{{ item.label }}</span>
          </button>
        </nav>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import { formatDate, diffNaturalDays } from '@/utils/format'
import { EXAM_STATUS } from '@/constants/exam'
import { getUpcomingExamsApi, getOverviewApi } from '@/api/modules/homeApi'
import { getProfileApi } from '@/api/modules/profileApi'
import { getUnreadCountApi } from '@/api/modules/messageApi'
import HomeIcon from '@/components/Common/HomeIcon.vue'
import AppSkeleton from '@/components/Common/AppSkeleton.vue'
// 走 import 而非裸路径字符串：让构建产出带 hash 的资源名，避免更新插图后被缓存
import practiceBannerArt from '@/assets/images/practice-banner.png'

const router = useRouter()

// 待考列表
const upcomingList = ref([])

// 顶区展示的个人信息
const profile = ref({ name: '', company: '' })

// 未读消息数，用于铃铛红点
const unreadCount = ref(0)

// 加载状态
const loading = ref(false)

// 请求序号：Tab 快速切换会有多次请求在途，只接受最新一次的结果
let requestId = 0

/**
 * 快捷功能入口
 * 练习的两类拆成并列入口：从首页直达对应 tab，少一次页内切换。
 * 两者都落在 /practice/setup，靠 tab query 指定默认选中项
 */
const shortcuts = [
  {
    key: 'assigned',
    label: '岗位练兵',
    icon: 'target',
    variant: 'blue',
    path: '/practice/setup?tab=assigned'
  },
  {
    key: 'bank',
    label: '自主练习',
    icon: 'pencil',
    variant: 'green',
    path: '/practice/setup?tab=bank'
  },
  { key: 'wrong', label: '错题本', icon: 'book', variant: 'orange', path: '/practice/wrong' },
  { key: 'score', label: '我的成绩', icon: 'chart', variant: 'purple', path: '/profile/scores' }
]

// 数据概览原始数据
const overview = ref({
  examCount: 0,
  practiceCount: 0,
  certificateCount: 0,
  wrongCount: 0
})

/** 数据概览展示项，错题数用橙色强调 */
const overviewItems = computed(() => [
  { key: 'exam', label: '已考次数', value: overview.value.examCount },
  { key: 'practice', label: '练习题量', value: overview.value.practiceCount },
  { key: 'cert', label: '证书获得', value: overview.value.certificateCount },
  { key: 'wrong', label: '错题数', value: overview.value.wrongCount, warn: true }
])

// 问候语。不能用 computed：唯一输入 new Date() 不是响应式源，
// 页面被 KeepAlive 缓存后会一直停在首次求值时的时段
const greeting = ref('')

/** 按当前时段刷新问候语 */
const refreshGreeting = () => {
  const h = new Date().getHours()
  if (h < 6) greeting.value = '夜深了'
  else if (h < 12) greeting.value = '上午好'
  else if (h < 14) greeting.value = '中午好'
  else if (h < 18) greeting.value = '下午好'
  else greeting.value = '晚上好'
}
// 首帧前先算一次，避免问候语位置短暂空白
refreshGreeting()

/**
 * 计算距开考天数，按自然日取整
 * 同一天开考显示 0，避免出现负数
 * @param {string} startTime - 考试开始时间
 * @returns {number} 距开考的自然日天数
 */
const daysUntil = (startTime) => {
  const days = diffNaturalDays(startTime)
  // 时间字段缺失或格式异常时兜底为 0，否则会渲染出「NaN 天后」
  // 同一天开考显示 0，已开考的负数也夹到 0
  return days === null ? 0 : Math.max(0, days)
}

/**
 * 加载首页数据（四个区块并行请求）
 */
const loadData = async () => {
  refreshGreeting()
  const currentId = ++requestId
  loading.value = true
  try {
    // 用 allSettled 让四个区块独立降级：个人信息或未读数失败
    // 不应把核心的待考提醒误判为「暂无待考安排」
    const [upcomingRes, overviewRes, profileRes, messageRes] = await Promise.allSettled([
      getUpcomingExamsApi(),
      getOverviewApi(),
      getProfileApi(),
      getUnreadCountApi()
    ])
    // 已有更新的请求在途时丢弃本次结果，避免旧数据覆盖新数据
    if (currentId !== requestId) return

    // 错误提示由响应拦截器统一给出，此处按区块保留各自的兜底值
    upcomingList.value = upcomingRes.status === 'fulfilled' ? upcomingRes.value.data || [] : []
    if (overviewRes.status === 'fulfilled') {
      // 字段级合并：后端只回部分字段时，其余项保持 0 而不是渲染成空白
      overview.value = { ...overview.value, ...(overviewRes.value.data || {}) }
    }
    if (profileRes.status === 'fulfilled') {
      profile.value = profileRes.value.data || profile.value
    }
    unreadCount.value =
      messageRes.status === 'fulfilled' ? messageRes.value.data?.unreadCount || 0 : 0
  } finally {
    if (currentId === requestId) loading.value = false
  }
}

/**
 * 点击待考项进入考试详情
 *
 * 未开考也放行：考生需要提前看考试说明、时长、及格线、注意事项。
 * 是否可作答由详情页的「开始考试」按钮把关（那里按 earlyEnterMinutes 判定），
 * 服务端 getExamPaper 再兜一道，不在入口处拦。
 * @param {Object} item - 待考项
 */
const goExam = (item) => {
  router.push(`/exam/detail/${item.id}`)
}

// 页面被 KeepAlive 缓存，每次激活时重新拉取，保证交卷/练习后统计与待考及时刷新
onActivated(loadData)
</script>

<style scoped>
.home-page {
  min-height: 100vh;
  background-color: #f6f8fb;

  /*
    卡片阴影：小模糊半径 + 低透明度，只做「贴地」的接触感。
    原先 12px 模糊配 2px 偏移，在这个浅灰蓝底上会四边均匀晕开一圈灰雾，
    观感是蒙了层脏而不是抬起来。收紧半径后边界干净，层次靠白底与底色的明度差承担。
  */
  --card-shadow: 0 1px 3px rgb(18 40 82 / 5%);
}

/* ── 蓝色品牌顶区 ───────────────────────────── */
.hero {
  position: relative;
  overflow: hidden;
  /* 顶部预留状态栏高度：真机取安全区，桌面预览兜底 44px 与设计稿一致
     不能写 env(x, 44px)，因为浏览器支持该函数但值为 0 时不会走 fallback */
  padding: max(env(safe-area-inset-top), 44px) 25px 41px;
  background-image: linear-gradient(180deg, #0c66f2 0%, #3c90f7 100%);
}

/* 右上角装饰圆 */
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

.hero-bar {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.hero-greeting {
  font-size: 25px;
  font-weight: 600;
  line-height: 34px;
  color: #fff;
}

.hero-company {
  margin-top: 2px;
  font-size: 15px;
  line-height: 21px;
  /* 次级信息压低对比，保持蓝底上的层次 */
  color: rgb(255 255 255 / 88%);
}

/* 铃铛：触摸区撑到 44px，用负边距抵消以保持图形对齐右侧 25px */
.hero-bell {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  /* 红点相对铃铛按钮定位，不能落到 .hero-bar 上 */
  position: relative;
  margin: -6px -11px 0 0;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
}

.hero-bell svg {
  width: 23px;
  height: 23px;
}

.hero-dot {
  position: absolute;
  top: 9px;
  right: 9px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: #fb3835;
}

/* ── 内容区：整体上移压住渐变区底部 ─────────── */
.content {
  position: relative;
  z-index: 1;
  margin-top: -25px;
  padding: 0 15px 80px;
}

/* 数据概览：四等分列 */
.overview {
  display: flex;
  height: 71px;
  border-radius: 14px;
  background-color: #fff;
  box-shadow: var(--card-shadow);
}

.overview-item {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.overview-value {
  font-size: 24px;
  font-weight: 600;
  line-height: 30px;
  color: #1d2129;
}

/* 错题数用橙色强调，提示待处理 */
.overview-value--warn {
  color: #fe7212;
}

/* 同 .exam-time：这是数字的名称，不是禁用文本，12px 更需要足够对比 */
.overview-label {
  margin-top: 2px;
  font-size: 12px;
  line-height: 17px;
  color: var(--text-secondary);
}

/* ── 练习入口 ─────────────────────────────── */
.practice-banner {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  overflow: hidden;
  width: 100%;
  height: 82px;
  margin-top: 13px;
  padding: 0 22px;
  border: none;
  border-radius: 14px;
  background-image: linear-gradient(90deg, #1c5bed 0%, #5f66f3 100%);
  text-align: left;
  cursor: pointer;
}

/* 文案压在插图之上：插图是绝对定位的，不抬层级会被盖住 */
.practice-text {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
}

.practice-title {
  font-size: 21px;
  font-weight: 600;
  line-height: 28px;
  color: #fff;
}

/*
  纯白而非 90% 透明：横幅是左深右浅的渐变，90% 白在浅的一端只有 3.96:1。
  文案虽落在偏左的深色段（4.82:1 合格），但文案变长或换机型宽度后会往浅端延伸，
  纯白最差情况 4.49:1，不必留这个余量问题。
*/
.practice-desc {
  margin-top: 2px;
  font-size: 14px;
  line-height: 20px;
  color: #fff;
}

/*
  插图贴右侧。用 contain 而非 cover：图是 2.4:1 而容器约 1.85:1，
  cover 会把左右两端的书本和勾选裁掉。
*/
.practice-art {
  position: absolute;
  right: 8px;
  bottom: 0;
  width: 146px;
  height: 74px;
  object-fit: contain;
  object-position: right bottom;
  pointer-events: none;
}

/* ── 章节 ─────────────────────────────────── */
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 18px;
}

.section-title {
  font-size: 17px;
  font-weight: 600;
  line-height: 24px;
  color: #1d2129;
}

.section-more {
  display: flex;
  align-items: center;
  padding: 0;
  background: none;
  border: none;
  font-size: 13px;
  line-height: 24px;
  color: #0c66f2;
  cursor: pointer;
}

.section-more svg {
  width: 13px;
  height: 13px;
  margin-left: 2px;
}

/* 加载 / 空状态 */
/*
  用 min-height 而非固定高度：loading 与空状态共用这张卡，
  两者内容高度不同（一个只有转圈、一个有插图加两行字）。
  固定 88px 会让 loading 结束切到空状态时卡片从 88 窜到 132，
  下方快捷功能整块跟着下移。统一预留空状态的实际高度就不会跳。
  132 = 上下 padding 20+22 + 插图 40 + 主文案 10+20 + 副文案 3+17
*/
.state-card {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 132px;
  margin-top: 8px;
  border-radius: 14px;
  background-color: #fff;
  box-shadow: var(--card-shadow);
}

/* 空状态内容比 loading 多，改纵向排布；高度由内容撑出，与 .state-card 的 min-height 对齐 */
.state-card--empty {
  flex-direction: column;
  padding: 20px 0 22px;
}

.empty-art {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background-color: #f2f5fa;
  /*
    图形描边取 currentColor，只在这里定一次色。
    #78869c 对 #f2f5fa 底为 3.38:1，过图形元素 3:1 基线；
    再浅（如 #a9b4c4 仅 1.92:1）描边会融进底色，插图看着就是个灰方块
  */
  color: #78869c;
}

.empty-art svg {
  display: block;
  width: 22px;
  height: 22px;
}

.empty-title {
  margin-top: 10px;
  font-size: 14px;
  line-height: 20px;
  color: #4e5969;
}

/* #5f6e85 对白底 5.18:1，满足 12px 正文的 4.5:1；原 #a9b4c4 只有 2.10:1 读不清 */
.empty-tip {
  margin-top: 3px;
  font-size: 12px;
  line-height: 17px;
  color: #5f6e85;
}

/* ── 待考提醒列表 ─────────────────────────── */
.exam-card {
  overflow: hidden;
  margin-top: 8px;
  border-radius: 14px;
  background-color: #fff;
  box-shadow: var(--card-shadow);
}

/*
  加载态复用 .exam-card 的白底圆角，只补内边距。
  骨架的行高（68px）与真实 .exam-row（72px）接近，两条约等于空态卡的 132px，
  故加载 → 有数据 / 空态之间不会有明显的高度跳动。
*/
.exam-card--loading {
  padding: 0 13px;
}

.exam-row {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  height: 72px;
  padding: 0 14px;
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.exam-row:active {
  background-color: #f4f6fa;
}

/*
  进行中的行只保留左侧竖条，不再整行染浅蓝。
  染色的本意是「一屏里第一时间定位」，但那要有别的行做对照才成立——
  待考通常只有一条，整张卡被染成浅蓝时没有对比对象，只会显得发灰、
  像是不可点的禁用态，反而把「立刻能考」读反了。
  竖条 + 右侧实心徽标已经是列表里最重的一组信号，够用。

  用 inset 阴影画竖条而非 border-left：border 会挤动内容横向位置，
  导致这一行的图标比其他行右移。
*/
.exam-row--live {
  box-shadow: inset 3px 0 0 #0c66f2;
}

/* 行间分隔线，首行不画 */
.exam-row--divided {
  border-top: 1px solid #ebebef;
}

.exam-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  /* 原 23px 是图标 46px 时的留白，图标缩到 44px 后同步收到 12px，避免中段被推得过右 */
  margin-left: 12px;
}

/* 考试名是这一行的主体，加粗才压得住右侧的实心徽标 */
.exam-name {
  overflow: hidden;
  font-size: 16px;
  font-weight: 600;
  line-height: 22px;
  color: #1d2129;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/*
  用 --text-secondary 而非 --text-disabled(#86909c)：
  开考时间是考生要读的有效信息，不是禁用态。
  #86909c 对白底仅 3.24:1，13px 正文要求 4.5:1，本来就不合格；
  #4e5969 为 7.10:1。
*/
.exam-time {
  margin-top: 2px;
  font-size: 13px;
  line-height: 18px;
  color: var(--text-secondary);
}

/* 状态区：三种状态共用的右侧容器，纵向右对齐 */
.exam-status {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  align-items: flex-end;
  margin-left: 10px;
}

/* 徽标基础样式，实心/描边两种在下面分别定 */
.exam-badge {
  display: inline-flex;
  align-items: center;
  height: 26px;
  padding: 0 10px;
  border-radius: 13px;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

/* 进行中：实心蓝，权重最高 */
.exam-badge--live {
  background-color: #0c66f2;
  color: #fff;
}

/* 呼吸点：让「进行中」有活着的感觉，比静态徽标更容易被扫到 */
.exam-live-dot {
  width: 6px;
  height: 6px;
  margin-right: 5px;
  border-radius: 50%;
  background-color: #fff;
  animation: exam-pulse 1.6s ease-in-out infinite;
}

@keyframes exam-pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.35;
  }
}

/* 前庭功能敏感的用户会被持续闪动干扰，跟随系统设置停掉 */
@media (prefers-reduced-motion: reduce) {
  .exam-live-dot {
    animation: none;
  }
}

/*
  可重考：描边徽标，权重低于实心的「进行中」。
  色值沿用 #0c66f2（同为可点击的行动态），不取 --primary-color——
  那是另一个蓝（#1171F8），两个蓝并排会露出色差。
*/
.exam-badge--retake {
  border: 1px solid #a8c9fb;
  background-color: #f2f7ff;
  color: #0c66f2;
}

/* 重考态徽标下的「已考 N 次」补充说明 */
.exam-sub {
  margin-top: 3px;
  font-size: 12px;
  line-height: 16px;
  color: var(--text-secondary);
}

/* 倒计时：暂时不能操作，只做告知，用纯数字不加徽标 */
.exam-countdown {
  display: flex;
  align-items: baseline;
}

.exam-days {
  font-size: 20px;
  font-weight: 600;
  line-height: 26px;
  color: #1d2129;
}

/* 「天后」是倒计时数字的单位，与数字同属有效信息 */
.exam-unit {
  margin-left: 3px;
  font-size: 13px;
  color: var(--text-secondary);
}

/* ── 快捷功能四宫格 ───────────────────────── */
.shortcut-card {
  display: flex;
  margin-top: 8px;
  padding: 17px 0 15px;
  border-radius: 14px;
  background-color: #fff;
  box-shadow: var(--card-shadow);
}

.shortcut {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
  /* 按压整块缩放做反馈：这些入口没有 hover 态可依赖（移动端） */
  transition: transform 0.15s ease;
}

.shortcut:active {
  transform: scale(0.94);
}

/* 标签退到次级：浅底图标的视觉重量已降低，标签再用近黑会盖过图标 */
.shortcut-label {
  margin-top: 7px;
  font-size: 13px;
  line-height: 18px;
  color: #4e5969;
}
</style>
