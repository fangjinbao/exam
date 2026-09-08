<!--
  页面名称：Profile - 我的

  功能描述：
    展示考生个人信息与数据概览，提供个人信息维护、我的成绩、我的证书入口
    以及设置、帮助与反馈入口，并支持退出登录（需二次确认）

  路由信息：
    路径：/profile
    名称：Profile
    是否缓存：是（KeepAlive）

  说明：
    顶部状态栏（时间、信号、电池）由设备系统绘制，页面只预留安全区高度
    设置与帮助与反馈暂无对应页面，点击提示功能开发中
-->

<template>
  <div class="profile-page">
    <!-- 顶部渐变区：标题 + 个人信息入口 -->
    <div class="hero">
      <span class="hero-blob hero-blob--lg" aria-hidden="true"></span>
      <span class="hero-blob hero-blob--sm" aria-hidden="true"></span>

      <h1 class="hero-title">我的</h1>

      <button type="button" class="hero-user" @click="router.push('/profile/edit')">
        <span class="avatar">{{ userInitial }}</span>
        <span class="hero-info">
          <span class="hero-name">{{ profile.name || '未设置姓名' }}</span>
          <span class="hero-company">{{ profile.company || '所属单位未设置' }}</span>
        </span>
        <svg class="hero-arrow" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M9 5l7 7-7 7"
            fill="none"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>

    <div class="content">
      <!-- 数据概览：平均分 / 证书 / 已考次数 -->
      <section class="stats">
        <div v-for="(item, index) in stats" :key="item.label" class="stat">
          <span class="stat-value">{{ item.value }}</span>
          <span class="stat-label">{{ item.label }}</span>
          <i v-if="index < stats.length - 1" class="stat-sep" aria-hidden="true"></i>
        </div>
      </section>

      <!-- 功能入口：分两组卡片 -->
      <section v-for="group in menuGroups" :key="group.key" class="menu-card">
        <button
          v-for="menu in group.list"
          :key="menu.title"
          type="button"
          class="menu-row"
          @click="handleMenu(menu)"
        >
          <MenuIcon :name="menu.icon" />
          <span class="menu-title">{{ menu.title }}</span>
          <svg class="menu-arrow" viewBox="0 0 24 24" aria-hidden="true">
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
      </section>

      <!-- 退出登录 -->
      <button type="button" class="logout" @click="handleLogout">退出登录</button>
    </div>
  </div>
</template>
<script setup>
import { ref, computed, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { useUserStore } from '@/stores/userStore'
import MenuIcon from '@/components/Common/MenuIcon.vue'
import { getProfileApi, getScoreListApi } from '@/api/modules/profileApi'
import { getOverviewApi } from '@/api/modules/homeApi'

const router = useRouter()
const userStore = useUserStore()

// 个人信息
const profile = ref({ name: '', phone: '', email: '', company: '' })

// 数据概览：平均分、证书数、已考次数
const overview = ref({ avgScore: '--', certificateCount: 0, examCount: 0 })

// 请求序号：Tab 快速切换会有多次请求在途，只接受最新一次的结果
let requestId = 0

/**
 * 功能入口配置，按设计稿分两组
 *
 * 底板配色已烤进 MenuIcon 的位图里，这里不再配 color。
 * 改配色要回到 output/build_menu_icons.py 重跑，见 MenuIcon.vue 顶部说明。
 */
const menuGroups = [
  {
    key: 'account',
    list: [
      { title: '个人信息', icon: 'person', path: '/profile/edit' },
      { title: '我的成绩', icon: 'trending', path: '/profile/scores' },
      { title: '我的证书', icon: 'medal', path: '/profile/certificates' }
    ]
  },
  {
    key: 'support',
    list: [
      { title: '设置', icon: 'gear', path: '' },
      { title: '帮助与反馈', icon: 'question', path: '' }
    ]
  }
]

/**
 * 头像占位：取姓名首字
 *
 * 不要用 userStore.userName 兜底——它的值域已扩展为「姓名 / 加载中 / 未登录」三态，
 * 拿它取首字会在信息未到位时显示「加」或「未」。这里只认真实姓名。
 */
const userInitial = computed(() => {
  const name = profile.value.name || userStore.userInfo?.name || ''
  return name ? name.charAt(0) : '考'
})

/** 概览三项，顺序与设计稿一致 */
const stats = computed(() => [
  { value: overview.value.avgScore, label: '平均分' },
  { value: overview.value.certificateCount, label: '证书' },
  { value: overview.value.examCount, label: '已考次数' }
])

/**
 * 加载个人信息与数据概览
 * 三个请求相互独立降级，任一失败不影响其余区块
 */
const loadData = async () => {
  const currentId = ++requestId

  // 登录时 profile 拉取失败是被刻意降级吞掉的（不阻断登录），但全项目没有第二个
  // 调用点，失败后会一直停在无姓名状态。这里补一次重试入口。
  if (userStore.isLogin && !userStore.userInfo) {
    await userStore.fetchUserInfo().catch(() => undefined)
  }

  const [profileRes, overviewRes, scoreRes] = await Promise.allSettled([
    getProfileApi(),
    getOverviewApi(),
    getScoreListApi()
  ])

  // 已有更新的请求在途时丢弃本次结果，避免旧数据覆盖新数据
  if (currentId !== requestId) return

  if (profileRes.status === 'fulfilled') {
    // getProfileApi 打的是 /profile/info，后端尚未实现、目前仍由 mock 兜。
    // 姓名与所属单位以登录拿到的真实身份为准（userStore），否则会出现
    // 「用张伟的手机号登录，页面显示 mock 里的张建国」这种自相矛盾。
    // phone/email 等字段后端接口落地前继续用 mock 值。
    const mocked = profileRes.value.data || {}
    const identity = userStore.userInfo

    // 关键：按「身份是否已加载」整体判断，不要逐字段 || 回退。
    // SysUser 的 name/nickName/departmentId 均可空，内部员工没填姓名或没挂部门时
    // 真实值就是 null，逐字段回退会重新显示 mock 里另一个人的姓名/单位。
    // 身份已加载 → 即使字段为空也用空值（由模板显示「未设置姓名」占位）；
    // 身份还没拉到（userInfo 为 null）→ 才允许用 mock 兜住展示。
    // 两条分支都不能让 mock 的姓名/单位落到页面上：
    // 身份已加载 → 用真实值（可为空，模板有占位）；
    // 身份没拉到（登录时 profile 失败）→ 清空，显示占位而不是 mock 里的另一个人。
    // 身份字段一律以 userStore（真实登录态）为准，不让 mock 值落到页面上：
    // 身份已加载 → 用真实值（可为空，模板有占位）；
    // 身份没拉到（登录时 profile 失败）→ 留空显示占位，而不是 mock 里的另一个人。
    // idCard 后端刻意不下发（PII），这里显式丢掉 mock 的假证件号。
    const restMocked = { ...mocked }
    delete restMocked.idCard
    profile.value = {
      ...restMocked,
      // userOrgName/userPhone/userEmail 这三个 computed 内部已从 userInfo 派生并兜底为 ''，
      // identity 为空时它们自动返回空串，无需再包一层三元。
      name: identity?.name || '',
      company: userStore.userOrgName,
      phone: userStore.userPhone,
      email: userStore.userEmail
    }
  }

  const next = { ...overview.value }

  if (overviewRes.status === 'fulfilled') {
    const data = overviewRes.value.data || {}
    next.certificateCount = data.certificateCount ?? 0
    next.examCount = data.examCount ?? 0
  }

  // 平均分由已发布成绩现算，四舍五入取整；无成绩时显示占位符
  if (scoreRes.status === 'fulfilled') {
    const list = scoreRes.value.data || []
    const scored = list.filter((item) => typeof item.totalScore === 'number')
    next.avgScore = scored.length
      ? Math.round(scored.reduce((sum, item) => sum + item.totalScore, 0) / scored.length)
      : '--'
  }

  overview.value = next
}

/**
 * 功能入口点击：已有页面直接跳转，未实现的提示开发中
 * @param {Object} menu - 入口配置
 */
const handleMenu = (menu) => {
  if (menu.path) {
    router.push(menu.path)
    return
  }
  showToast('功能开发中')
}

/**
 * 退出登录（二次确认）
 */
const handleLogout = async () => {
  // 二次确认单独 try：取消时 showConfirmDialog 会 reject，属正常流程
  try {
    await showConfirmDialog({ title: '退出登录', message: '确定退出登录吗？' })
  } catch {
    // 考生取消退出
    return
  }

  // logout 内部已兜住接口异常并保证清本地登录态，此处 await 是为了等注销请求发出
  await userStore.logout()
  router.replace('/login')
}

// 页面缓存复用，每次激活时同步最新数据
onActivated(loadData)
</script>
<style scoped>
.profile-page {
  min-height: 100vh;
  background-color: #f5f6fa;
}

/* ── 顶部渐变区 ───────────────────────────── */
.hero {
  position: relative;
  overflow: hidden;
  /* 顶部预留状态栏高度：真机取安全区，桌面预览兜底 44px 与设计稿一致
     不能写 env(x, 44px)，因为浏览器支持该函数但值为 0 时不会走 fallback */
  padding: max(env(safe-area-inset-top), 44px) 25px 41px;
  background: linear-gradient(180deg, #0a65f4 0%, #4696f9 100%);
}

/* 右上角装饰圆 */
.hero-blob {
  position: absolute;
  border-radius: 50%;
  background-color: rgba(255, 255, 255, 0.09);
  pointer-events: none;
}

.hero-blob--lg {
  top: -46px;
  right: -34px;
  width: 168px;
  height: 168px;
}

.hero-blob--sm {
  top: 62px;
  right: -78px;
  width: 130px;
  height: 130px;
}

.hero-title {
  position: relative;
  margin-top: 4px;
  font-size: 17px;
  font-weight: 600;
  line-height: 24px;
  color: #fff;
  text-align: center;
}

/* 个人信息入口：整行可点 */
.hero-user {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  margin-top: 22px;
  padding: 0;
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
}

.avatar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 68px;
  height: 68px;
  font-size: 26px;
  font-weight: 600;
  color: #fff;
  background-color: rgba(255, 255, 255, 0.26);
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: 50%;
}

.hero-info {
  flex: 1;
  min-width: 0;
  margin-left: 12px;
}

.hero-name {
  display: block;
  font-size: 19px;
  font-weight: 600;
  line-height: 26px;
  color: #fff;
}

.hero-company {
  display: block;
  margin-top: 2px;
  font-size: 13px;
  line-height: 18px;
  color: rgba(255, 255, 255, 0.88);
}

.hero-arrow {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  margin-left: 8px;
  color: #fff;
}

/* ── 内容区 ───────────────────────────────── */
/* 整体上移压住渐变区底部。
   负边距写在 .content 上而不是 .stats 上：.content 无 padding-top/border 时
   子元素的负边距会与父元素合并，相对渐变的位移会被抵消 */
.content {
  position: relative;
  z-index: 1;
  margin-top: -19px;
  padding: 0 15px 80px;
}

.stats {
  display: flex;
  background-color: #fff;
  border-radius: 10px;
  box-shadow: 0 1px 6px rgba(17, 61, 122, 0.05);
}

/* 显式定高，避免不同平台字体行高差异导致卡片高度偏离设计稿 */
.stat {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 68px;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  line-height: 30px;
  color: #1d2129;
}

/*
  与首页 .overview-label 同源问题：这是数字的名称而非禁用文本。
  --text-disabled(#86909c) 对白底 3.24:1，12px 正文要求 4.5:1。
*/
.stat-label {
  margin-top: 2px;
  font-size: 12px;
  line-height: 17px;
  color: var(--text-secondary);
}

/* 竖分隔线：仅前两项右侧 */
.stat-sep {
  position: absolute;
  top: 50%;
  right: 0;
  width: 1px;
  height: 28px;
  background-color: #eef0f3;
  transform: translateY(-50%);
}

/* ── 功能入口 ─────────────────────────────── */
.menu-card {
  margin-top: 12px;
  background-color: #fff;
  border-radius: 10px;
}

.menu-card + .menu-card {
  margin-top: 10px;
}

.menu-row {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  height: 57px;
  padding: 0 14px 0 13px;
  background: none;
  border: none;
  cursor: pointer;
}

/* 行间分隔线：左侧与图标底板对齐 */
.menu-row + .menu-row::before {
  content: '';
  position: absolute;
  top: 0;
  left: 13px;
  right: 14px;
  height: 1px;
  background-color: #efeff1;
}

.menu-title {
  flex: 1;
  margin-left: 18px;
  font-size: 16px;
  line-height: 22px;
  color: #1d2129;
  text-align: left;
}

.menu-arrow {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  color: #c9cdd4;
}

/* ── 退出登录 ─────────────────────────────── */
/* 与上方功能列表统一为白色卡片，去掉红色描边，
   仅用文字色保留危险操作提示，避免成为页面视觉重心 */
.logout {
  display: block;
  width: 100%;
  height: 50px;
  margin-top: 12px;
  font-size: 16px;
  color: var(--danger-color);
  background-color: #fff;
  border: none;
  border-radius: 10px;
  cursor: pointer;
}
</style>
