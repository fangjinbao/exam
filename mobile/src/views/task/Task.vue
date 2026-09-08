<!--
  页面名称：Task - 任务

  功能描述：
    考生待办任务的集中入口，按紧急程度聚合展示
    最紧急的一项提为顶部主卡，其余收进列表；考试状态由当前时间与起止时间自动判定

  布局说明：
    主卡是整页唯一强焦点，带倒计时与主操作按钮；列表项靠「考试 / 岗位练兵 / 错题」
    文字标签区分类型，芯片按类型筛选。
    练习只收岗位练兵：自主练习是随时可练的常驻入口，不构成待办，在首页与练习页进。

  路由信息：
    路径：/task
    名称：Task
    是否缓存：是（KeepAlive）
-->

<template>
  <div class="task-page">
    <!-- 顶部：日期 + 标题 + 头像，不用 nav-bar，留白交给内容 -->
    <header class="page-head">
      <div class="head-text">
        <p class="head-date">{{ todayText }}</p>
        <h1 class="head-title">今天要完成的</h1>
      </div>
      <button
        type="button"
        class="head-avatar"
        aria-label="进入我的"
        @click="router.push('/profile')"
      >
        {{ userInitial }}
      </button>
    </header>

    <AppSkeleton v-if="loading" variant="split-card" />

    <div v-else class="content">
      <!-- 主卡：最紧急的一项 -->
      <button v-if="heroVisible" type="button" class="hero" @click="openTask(heroItem)">
        <span class="hero-blob" aria-hidden="true"></span>

        <span class="hero-pill">{{ heroItem.typeText }} · {{ heroItem.statusText }}</span>
        <span class="hero-title">{{ heroItem.name }}</span>
        <span class="hero-meta">{{ heroItem.meta }}</span>

        <span class="hero-foot">
          <span class="hero-left">
            <span class="hero-count">{{ heroItem.headline }}</span>
            <span v-if="heroItem.showProgress" class="hero-track">
              <span class="hero-fill" :style="{ width: heroItem.percent + '%' }"></span>
            </span>
          </span>
          <span class="hero-btn">{{ heroItem.action }}</span>
        </span>
      </button>

      <!-- 类型筛选 -->
      <div class="chips">
        <button
          v-for="chip in chipItems"
          :key="chip.key"
          type="button"
          class="chip"
          :class="{ 'chip--active': activeChip === chip.key }"
          :aria-pressed="activeChip === chip.key"
          @click="activeChip = chip.key"
        >
          {{ chip.label }}
        </button>
      </div>

      <!-- 任务分组：考试按状态分两组，练习一组 -->
      <section v-for="group in visibleGroups" :key="group.key" class="group">
        <header class="group-head">
          <h2 class="group-title">{{ group.title }}</h2>
          <span class="group-extra">{{ group.list.length }} {{ group.unit }}</span>
        </header>

        <ul class="card-list">
          <li v-for="item in group.list" :key="item.key">
            <!--
              未开考的考试只做视觉置灰，不加 aria-disabled：卡片现在是可点的
              （进详情看说明），标成 disabled 会让读屏器播报为不可用而误导考生。
            -->
            <button
              type="button"
              class="card"
              :class="{ 'card--disabled': item.disabled }"
              @click="openTask(item)"
            >
              <span class="card-main">
                <span class="card-line">
                  <span class="tag" :class="`tag--${item.type}`">{{ item.typeText }}</span>
                  <span class="card-name">{{ item.name }}</span>
                </span>
                <span class="card-meta">{{ item.meta }}</span>
              </span>

              <!-- 右侧二选一：练过的看进度环，其余看状态胶囊 -->
              <span v-if="item.showRing" class="ring">
                <svg viewBox="0 0 36 36" aria-hidden="true">
                  <circle class="ring-track" cx="18" cy="18" r="15.5" />
                  <circle
                    class="ring-fill"
                    cx="18"
                    cy="18"
                    r="15.5"
                    :stroke-dasharray="RING_LENGTH"
                    :stroke-dashoffset="ringOffset(item.percent)"
                  />
                </svg>
                <em class="ring-text">
                  <!-- 光秃秃一个「60%」读屏听不出是什么的百分比，补个只读不显的前缀 -->
                  <i class="sr-only">已练</i>{{ item.percent }}%
                </em>
              </span>
              <span v-else class="pill" :class="`pill--${item.pillType}`">
                {{ item.statusText }}
              </span>
            </button>
          </li>
        </ul>
      </section>

      <!-- 错题巩固：浅蓝底，与上面的白卡区分 -->
      <button
        v-if="showWrong && wrongCount > 0"
        type="button"
        class="card card--wrong"
        @click="router.push('/practice/wrong')"
      >
        <span class="card-main">
          <span class="card-line">
            <span class="tag tag--wrong">错题</span>
            <span class="card-name">{{ wrongCount }} 道错题待巩固</span>
          </span>
          <span class="card-meta">复习一遍，通过率更高</span>
        </span>
        <span class="card-link">
          去巩固
          <van-icon name="arrow" size="12" />
        </span>
      </button>

      <!-- 空态：分主卡都没有的「全无待办」与筛选后无内容两种 -->
      <div v-if="isEmpty" class="state-block">
        <van-empty image-size="80" :description="emptyText" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onActivated, onDeactivated, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/userStore'
import { EXAM_STATUS, EXAM_STATUS_TEXT } from '@/constants/exam'
import { getUpcomingExamsApi, getOverviewApi } from '@/api/modules/homeApi'
import { getAssignedPracticeListApi } from '@/api/modules/practiceApi'
import AppSkeleton from '@/components/Common/AppSkeleton.vue'

const router = useRouter()
const userStore = useUserStore()

// 进度环周长：r=15.5 的圆，2πr ≈ 97.39，用于 dasharray 算偏移
const RING_LENGTH = 97.39

const WEEK_TEXT = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

// 待办考试列表
const examList = ref([])

// 岗位练兵列表（管理端建好并分配给我的）
const practiceList = ref([])

// 错题数
const wrongCount = ref(0)

// 当前筛选项
const activeChip = ref('all')

// 加载状态
const loading = ref(false)

// 当前时间，每秒推进一次，供主卡倒计时用
const now = ref(Date.now())

// 倒计时定时器，页面被 KeepAlive 缓存，需随激活/停用起停
let timer = null

// 请求序号：Tab 快速切换会有多次请求在途，只接受最新一次的结果
let requestId = 0

/** 顶部日期，如「8月5日 周二」 */
const todayText = computed(() => {
  const date = new Date(now.value)
  return `${date.getMonth() + 1}月${date.getDate()}日 ${WEEK_TEXT[date.getDay()]}`
})

/** 头像用姓名首字，取不到时用「考」兜底，与我的页一致 */
const userInitial = computed(() => {
  const name = userStore.userInfo?.name || ''
  return name ? name.charAt(0) : '考'
})

/**
 * 把毫秒差额格式成倒计时文案
 * 超过一天只说到天与小时，一天内精确到秒，让主卡的紧迫感随时间递进
 * @param {number} ms - 剩余毫秒
 * @returns {string} 如「2天3小时」「01:12:30」
 */
const formatRemain = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000))
  const day = Math.floor(total / 86400)
  const hour = Math.floor((total % 86400) / 3600)
  if (day > 0) return `${day}天${hour}小时`
  const minute = Math.floor((total % 3600) / 60)
  const second = total % 60
  const pad = (num) => String(num).padStart(2, '0')
  return `${pad(hour)}:${pad(minute)}:${pad(second)}`
}

/**
 * 时间串转时间戳
 * @param {string|Date} value - 后端下发的时间
 * @returns {number} 时间戳，非法时为 NaN
 */
const toTime = (value) => new Date(value).getTime()

/**
 * 时间戳格式成「MM-DD HH:mm」
 * @param {number} time - 时间戳
 * @returns {string} 短格式时间
 */
const formatClock = (time) => {
  const date = new Date(time)
  const pad = (num) => String(num).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * 已答题数的展示值
 * 抽题规则改小后，旧记录的 answeredCount 可能超过当前 totalCount，
 * 夹住上界避免显示「12/10」这种大于总数的分数
 * @param {Object} item - 练习列表项
 * @returns {number} 不超过 totalCount 的已答数
 */
const answeredText = (item) => {
  const answered = Math.max(0, Number(item.answeredCount) || 0)
  // totalCount 缺失时不夹取。Math.min(x, undefined) 得 NaN，会渲染成「NaN / undefined」
  if (!Number.isFinite(item.totalCount)) return answered
  return Math.min(answered, item.totalCount)
}

/**
 * 练习完成百分比
 * @param {Object} item - 练习列表项
 * @returns {number} 0-100 的整数
 */
const practicePercent = (item) => {
  if (!Number.isFinite(item.totalCount) || item.totalCount <= 0) return 0
  // 与 answeredText 同源夹取，否则进度条停在 100% 而文字另说一个数
  return Math.round((answeredText(item) / item.totalCount) * 100)
}

/**
 * 进度环的 dashoffset
 * @param {number} percent - 0-100 的完成度
 * @returns {number} 剩余弧长
 */
const ringOffset = (percent) => RING_LENGTH * (1 - percent / 100)

/**
 * 考试项归一化成卡片模型
 * @param {Object} item - 后端考试项
 * @returns {Object} 卡片模型
 */
const toExamCard = (item) => {
  const ongoing = item.status === EXAM_STATUS.ONGOING
  const endAt = toTime(item.endTime)
  const startAt = toTime(item.startTime)
  // 时间非法时不显示倒计时，只留状态文案，避免出现「NaN天NaN小时」
  const target = ongoing ? endAt : startAt
  const remain = Number.isFinite(target) ? formatRemain(target - now.value) : ''
  // 副文本给考试的起止时段，倒计时归 headline，两处不重复同一句话
  const span = Number.isFinite(startAt)
    ? `${formatClock(startAt)}${Number.isFinite(endAt) ? ` - ${formatClock(endAt)}` : ''}`
    : ''

  return {
    key: `exam-${item.id}`,
    id: item.id,
    type: 'exam',
    typeText: '考试',
    name: item.name,
    statusText: EXAM_STATUS_TEXT[item.status] || '',
    meta: span || '时间待定',
    // 进行中盯剩余交卷时间，未开始盯还有多久开考
    headline: remain ? (ongoing ? `剩余 ${remain}` : `${remain}后开始`) : '时间待定',
    showProgress: false,
    percent: 0,
    showRing: false,
    pillType: ongoing ? 'ongoing' : 'idle',
    // 未开考只做视觉降对比，点击仍可进详情看考试说明；能否作答由详情页把关
    disabled: !ongoing,
    /*
      未开考用「查看详情」而非「未开始」：这是主卡上唯一的实心主按钮，
      写「未开始」会被读成不可操作，但它实际会跳转 —— 文案要与行为一致。
      距开考还有多久由 headline 承担（如「2小时后开始」），不靠按钮表达。
    */
    action: ongoing ? '进入考试' : '查看详情',
    // 非法时间排到最后而不是让 NaN 参与比较：sort 的比较函数返回 NaN 时
    // 各引擎行为不一致，会把整组顺序搅乱，连「最紧急那项」都可能选错
    sortAt: Number.isFinite(target) ? target : Number.POSITIVE_INFINITY
  }
}

/**
 * 岗位练兵归一化成卡片模型
 * @param {Object} item - 后端练习项
 * @returns {Object} 卡片模型
 */
const toPracticeCard = (item) => {
  const answered = answeredText(item)
  const percent = practicePercent(item)
  const started = answered > 0
  const bankText = item.bankNames ? `${item.bankNames} · ` : ''

  return {
    key: `practice-${item.id}`,
    id: item.id,
    type: 'practice',
    // 主卡胶囊没有分组标题作上下文，必须自带全名；卡片标签与分组标题重复一次，
    // 但四字比「练习」只多占约 24px，换来的是两处口径一致
    typeText: '岗位练兵',
    name: item.name,
    statusText: started ? '进行中' : '未开始',
    meta: `${bankText}共 ${item.totalCount} 题`,
    headline: `已练 ${answered} / ${item.totalCount} 题`,
    showProgress: true,
    percent,
    // 练过的用进度环，没练过的用胶囊：0% 的环传达不了信息
    showRing: started,
    pillType: 'idle',
    disabled: false,
    action: started ? '继续练习' : '开始练习',
    sortAt: Number.POSITIVE_INFINITY
  }
}

/** 进行中的考试，按最早截止排前 */
const ongoingExams = computed(() =>
  examList.value
    .filter((item) => item.status === EXAM_STATUS.ONGOING)
    .map(toExamCard)
    .sort((a, b) => a.sortAt - b.sortAt)
)

/** 待开始的考试，按最早开考排前 */
const upcomingExams = computed(() =>
  examList.value
    .filter((item) => item.status === EXAM_STATUS.PUBLISHED)
    .map(toExamCard)
    .sort((a, b) => a.sortAt - b.sortAt)
)

/** 待练的岗位练兵：已结束或已练完的不算待办，避免任务页堆积无需处理的项 */
const pendingPractices = computed(() =>
  practiceList.value
    .filter((item) => item.canPractice && !item.finished)
    .map(toPracticeCard)
)

/**
 * 主卡项：最紧急的一项
 * 进行中的考试最急（有交卷时限），其次待开考的，最后才是练习
 */
const heroItem = computed(
  () => ongoingExams.value[0] || upcomingExams.value[0] || pendingPractices.value[0] || null
)

/**
 * 主卡是否出现
 * 切到某个类型时，主卡若不属于该类型必须一起收起，
 * 否则筛选后屏上仍留着一张不属于该分类的卡
 */
const heroVisible = computed(
  () =>
    !!heroItem.value &&
    (activeChip.value === 'all' || activeChip.value === heroItem.value.type)
)

/** 芯片：只列当前真有内容的类型，避免点进去一片空白 */
const chipItems = computed(() => {
  const list = [{ key: 'all', label: '全部' }]
  if (ongoingExams.value.length || upcomingExams.value.length) {
    list.push({ key: 'exam', label: '考试' })
  }
  // 任务页只收岗位练兵（自主练习是随时可练的入口，不构成待办），
  // 芯片写全名而不用「练习」，免得考生以为这里也管自主练习
  if (pendingPractices.value.length) list.push({ key: 'practice', label: '岗位练兵' })
  if (wrongCount.value > 0) list.push({ key: 'wrong', label: '错题' })
  return list
})

/**
 * 当前筛选下要渲染的分组
 * 主卡占用的那项从列表里剔掉，避免同一项出现两次；
 * 剔完为空的分组整组隐藏，不留一个空标题
 */
const visibleGroups = computed(() => {
  const heroKey = heroVisible.value ? heroItem.value.key : ''
  const strip = (list) => list.filter((item) => item.key !== heroKey)
  const groups = [
    { key: 'ongoing', title: '进行中的考试', unit: '场', type: 'exam', list: strip(ongoingExams.value) },
    { key: 'upcoming', title: '即将开始的考试', unit: '场', type: 'exam', list: strip(upcomingExams.value) },
    { key: 'practice', title: '岗位练兵', unit: '个', type: 'practice', list: strip(pendingPractices.value) }
  ]
  return groups.filter(
    (group) =>
      group.list.length > 0 && (activeChip.value === 'all' || activeChip.value === group.type)
  )
})

/** 错题卡是否出现 */
const showWrong = computed(() => activeChip.value === 'all' || activeChip.value === 'wrong')

/** 当前屏上是否什么都没有 */
const isEmpty = computed(() => {
  if (heroVisible.value || visibleGroups.value.length > 0) return false
  return !(showWrong.value && wrongCount.value > 0)
})

/** 空态文案：全无待办与筛选后无内容是两回事 */
const emptyText = computed(() =>
  activeChip.value === 'all' ? '暂无待办任务' : '该分类下暂无内容'
)

/**
 * 加载任务数据
 */
const loadData = async () => {
  const currentId = ++requestId
  loading.value = true
  // 没有 catch：allSettled 不会 reject，各请求的失败已由下面的 status 判断吸收成
  // 兜底值；错误提示由响应拦截器统一给出
  try {
    // 用 allSettled 让各区块独立降级，互不拖累
    const [examRes, practiceRes, overviewRes] = await Promise.allSettled([
      getUpcomingExamsApi(),
      getAssignedPracticeListApi(),
      getOverviewApi()
    ])
    // 已有更新的请求在途时丢弃本次结果，避免旧数据覆盖新数据
    if (currentId !== requestId) return

    examList.value = examRes.status === 'fulfilled' ? examRes.value.data || [] : []
    practiceList.value = practiceRes.status === 'fulfilled' ? practiceRes.value.data || [] : []
    wrongCount.value =
      overviewRes.status === 'fulfilled' ? overviewRes.value.data?.wrongCount || 0 : 0
  } finally {
    if (currentId === requestId) loading.value = false
  }
}

/**
 * 点击任务项
 * @param {Object} item - 卡片模型
 */
const openTask = (item) => {
  if (!item) return
  if (item.type === 'exam') {
    // 未开考也进详情：考生要先看说明与规则，能否作答由详情页的「开始考试」把关
    router.push(`/exam/detail/${item.id}`)
    return
  }
  router.push({ path: '/practice/answer', query: { practiceId: item.id } })
}

/** 停掉倒计时，重复调用安全 */
const stopTimer = () => {
  if (timer) clearInterval(timer)
  timer = null
}

// 页面被 KeepAlive 缓存，每次激活时重新拉取，保证交卷/练习后任务及时刷新
onActivated(() => {
  loadData()
  // 倒计时只在页面可见时走，切走后停掉，避免缓存页在后台空转
  now.value = Date.now()
  // 先停再起：激活/停用理论上成对，但重复起会丢掉旧 timer 的句柄，泄漏无法回收
  stopTimer()
  timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onDeactivated(stopTimer)

// onDeactivated 不覆盖组件被销毁的路径（如退出登录清掉整棵路由视图），
// 那种情况只走 onUnmounted，漏挂会留下一个每秒仍在跑的定时器
onUnmounted(stopTimer)
</script>

<style scoped>
/* 本页配色：主色只用一个，浅色调由它派生，不引入第二个强调色 */
.task-page {
  --accent: #3b5bff;
  --accent-soft: #eef1ff;

  min-height: 100vh;
  /* 比全局 --bg-page 更暖一档，让白卡浮起来 */
  background-color: #f5f6f8;
}

/* ── 顶部：日期 + 标题 + 头像 ─────────── */
.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  /* 顶部预留状态栏高度：真机取安全区，桌面预览兜底 20px
     不能写 env(x, 20px)，因为浏览器支持该函数但值为 0 时不会走 fallback */
  padding: calc(max(env(safe-area-inset-top), 20px) + 8px) 20px 16px;
}

.head-text {
  min-width: 0;
}

.head-date {
  font-size: 13px;
  line-height: 18px;
  color: #667085;
}

.head-title {
  margin-top: 2px;
  font-size: 26px;
  font-weight: 700;
  line-height: 34px;
  color: #101828;
}

/* 头像：没有头像图时用姓名首字，与我的页一致 */
.head-avatar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  /* 触摸区不低于 44px，与列表卡的 min-height 同一下限 */
  width: 44px;
  height: 44px;
  padding: 0;
  -webkit-appearance: none;
  appearance: none;
  border: none;
  border-radius: 50%;
  background-color: var(--accent);
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
}

/* 顶区已先渲染，加载态与空态只需在其下方留白 */
.state-block {
  padding: var(--spacing-xl) 0;
}

.content {
  /* 底部留出 tabbar 高度，避免最后一项被遮挡 */
  padding: 0 16px calc(80px + env(safe-area-inset-bottom));
}

/* ── 主卡：全页唯一强焦点 ─────────── */
.hero {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 18px 20px 20px;
  /* 重置 button 默认样式，保持卡片外观与左对齐文本 */
  text-align: left;
  /* 清掉 iOS Safari 对 button 的原生外观残留；项目未配 autoprefixer，前缀手写 */
  -webkit-appearance: none;
  appearance: none;
  border: none;
  border-radius: 22px;
  background-image: linear-gradient(135deg, #3b5bff 0%, #6b84ff 100%);
  /* 带主色的柔光投影，让主卡明显浮于灰底之上 */
  box-shadow: 0 10px 24px rgb(59 91 255 / 26%);
  cursor: pointer;
}

.hero:active {
  opacity: 0.92;
}

.hero:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* 右上角装饰圆，低透明度纯装饰 */
.hero-blob {
  position: absolute;
  top: -46px;
  right: -34px;
  width: 150px;
  height: 150px;
  border-radius: 50%;
  background-color: rgb(255 255 255 / 12%);
  pointer-events: none;
}

.hero-pill {
  position: relative;
  align-self: flex-start;
  padding: 4px 12px;
  border-radius: 999px;
  background-color: rgb(255 255 255 / 22%);
  font-size: 12px;
  line-height: 17px;
  color: #fff;
}

.hero-title {
  position: relative;
  /* 最多两行，超出截断：考试名可能很长，放开会把底部倒计时挤出卡片 */
  display: -webkit-box;
  overflow: hidden;
  margin-top: 12px;
  font-size: 22px;
  font-weight: 700;
  line-height: 30px;
  color: #fff;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.hero-meta {
  position: relative;
  display: block;
  overflow: hidden;
  margin-top: 6px;
  font-size: 13px;
  line-height: 18px;
  /* 次级信息压低对比，保持蓝底上的层次 */
  color: rgb(255 255 255 / 82%);
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 主卡底部：左侧倒计时/进度，右侧按钮 */
.hero-foot {
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: 12px;
  margin-top: 20px;
}

.hero-left {
  flex: 1;
  min-width: 0;
}

.hero-count {
  display: block;
  overflow: hidden;
  font-size: 20px;
  font-weight: 700;
  line-height: 27px;
  color: #fff;
  white-space: nowrap;
  text-overflow: ellipsis;
  /* 等宽数字防止倒计时每秒跳动时宽度变化 */
  font-variant-numeric: tabular-nums;
}

.hero-track {
  display: block;
  overflow: hidden;
  height: 5px;
  margin-top: 8px;
  border-radius: 3px;
  background-color: rgb(255 255 255 / 28%);
}

.hero-fill {
  display: block;
  height: 100%;
  border-radius: 3px;
  background-color: #fff;
  transition: width 0.3s;
}

/* 白底胶囊按钮：主卡上唯一的实心元素，作为主操作 */
.hero-btn {
  flex-shrink: 0;
  padding: 11px 22px;
  border-radius: 999px;
  background-color: #fff;
  font-size: 15px;
  font-weight: 600;
  line-height: 21px;
  color: var(--accent);
}

/* ── 类型筛选芯片 ─────────── */
.chips {
  display: flex;
  gap: 8px;
  /* 芯片数量可能超出一屏宽，允许横向滚动而不换行 */
  overflow-x: auto;
  margin: 18px 0 20px;
  /* 隐藏滚动条：移动端无需可见滚动条，横向滚动靠手势 */
  scrollbar-width: none;
}

.chips::-webkit-scrollbar {
  display: none;
}

.chip {
  flex-shrink: 0;
  min-height: 34px;
  padding: 8px 18px;
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

.chip--active {
  border-color: var(--accent);
  background-color: var(--accent);
  font-weight: 500;
  color: #fff;
}

/* ── 分组 ─────────── */
.group + .group {
  margin-top: 22px;
}

.group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  /* 与卡片内边距对齐，标题不贴屏幕边 */
  padding: 0 2px;
}

/* 分组标题不再用主色竖条：主卡已承担强调，这里保持安静 */
.group-title {
  font-size: 15px;
  font-weight: 600;
  color: #344054;
}

.group-extra {
  font-size: 13px;
  color: #98a2b3;
}

.card-list li + li {
  margin-top: 12px;
}

/* ── 列表卡 ─────────── */
.card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  /* 触摸目标高度不低于 44px */
  min-height: 44px;
  padding: 16px;
  text-align: left;
  -webkit-appearance: none;
  appearance: none;
  border: none;
  border-radius: 18px;
  background-color: #fff;
  box-shadow: 0 2px 10px rgb(16 24 40 / 4%);
  cursor: pointer;
}

.card:active {
  opacity: 0.7;
}

.card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* 错题卡：浅蓝底无投影，与白卡区分但仍是同一套结构 */
.card--wrong {
  margin-top: 12px;
  background-color: var(--accent-soft);
  box-shadow: none;
}

/* 未开考的项降低对比度以区分优先级，但仍可点击进详情看说明 */
.card--disabled .card-name,
.card--disabled .card-meta {
  color: #98a2b3;
}

.card-main {
  flex: 1;
  min-width: 0;
}

/* 标题行：类型标签与名称同行 */
.card-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.card-name {
  /* min-width:0 不能省：flex 项默认 min-width:auto，长名称会拒绝收缩，
     把同行的标签/进度环挤出可视区 */
  min-width: 0;
  overflow: hidden;
  font-size: 16px;
  font-weight: 600;
  line-height: 22px;
  color: #101828;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.card-meta {
  display: block;
  overflow: hidden;
  margin-top: 5px;
  font-size: 13px;
  line-height: 18px;
  color: #667085;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
}

/* ── 类型标签：考试蓝、练习灰，一眼可分 ─────────── */
.tag {
  flex-shrink: 0;
  padding: 2px 7px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 500;
  line-height: 17px;
  white-space: nowrap;
}

.tag--exam,
.tag--wrong {
  background-color: var(--accent-soft);
  color: var(--accent);
}

.tag--practice {
  background-color: #f2f4f7;
  color: #475467;
}

/* 错题卡本身已是浅蓝底，标签改用实底才分得出层次 */
.card--wrong .tag--wrong {
  background-color: var(--accent);
  color: #fff;
}

.card-link {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 2px;
  font-size: 14px;
  font-weight: 600;
  color: var(--accent);
}

/* ── 状态胶囊 ─────────── */
.pill {
  flex-shrink: 0;
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 17px;
  white-space: nowrap;
}

.pill--idle {
  background-color: #f2f4f7;
  color: #667085;
}

.pill--ongoing {
  background-color: var(--accent-soft);
  color: var(--accent);
}

/* ── 进度环：细描边 + 居中百分比 ─────────── */
.ring {
  position: relative;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
}

.ring svg {
  width: 100%;
  height: 100%;
  /* 起点转到 12 点方向，默认从 3 点开始 */
  transform: rotate(-90deg);
}

.ring circle {
  fill: none;
  stroke-width: 3;
}

.ring-track {
  stroke: #eaecf0;
}

.ring-fill {
  stroke: var(--accent);
  stroke-linecap: round;
  transition: stroke-dashoffset 0.3s;
}

.ring-text {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 11px;
  font-weight: 600;
  font-style: normal;
  color: #344054;
  font-variant-numeric: tabular-nums;
}

/* 只给读屏、不占视觉空间。不能用 display:none 或 visibility:hidden，
   那两种读屏也会跳过 */
.sr-only {
  position: absolute;
  overflow: hidden;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
