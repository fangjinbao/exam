<!--
  页面名称：Workspace - 工作台

  功能描述：
    考生完成考试与练习的集中入口，包含参加考试、在线练习、错题本
    展示待考数量与错题数量作为入口提示

  路由信息：
    路径：/workspace
    名称：Workspace
    是否缓存：是（KeepAlive）
-->

<template>
  <div class="workspace-page">
    <van-nav-bar title="工作台" fixed placeholder />

    <div class="content">
      <!-- 功能入口 -->
      <section class="entry-group">
        <button
          v-for="entry in entries"
          :key="entry.key"
          type="button"
          class="entry-item"
          @click="router.push(entry.path)"
        >
          <span class="entry-icon" :class="`entry-icon--${entry.key}`">
            <van-icon :name="entry.icon" size="24" />
          </span>
          <span class="entry-text">
            <span class="entry-name">{{ entry.name }}</span>
            <span class="entry-desc">{{ entry.desc }}</span>
          </span>
          <van-tag v-if="entry.badge" type="danger" round>{{ entry.badge }}</van-tag>
          <van-icon name="arrow" class="entry-arrow" />
        </button>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import { getOverviewApi, getUpcomingExamsApi } from '@/api/modules/homeApi'

const router = useRouter()

// 待考数量（参加考试入口角标）
const upcomingCount = ref(0)

// 错题数量（错题本入口角标）
const wrongCount = ref(0)

// 请求序号：Tab 快速切换会有多次请求在途，只接受最新一次的结果
let requestId = 0

/** 功能入口配置 */
const entries = computed(() => [
  {
    key: 'exam',
    name: '参加考试',
    desc: '查看待参加的考试并作答',
    icon: 'edit',
    path: '/exam/list',
    badge: upcomingCount.value
  },
  {
    key: 'practice',
    name: '在线练习',
    desc: '按题库或知识点练习并看解析',
    icon: 'todo-list-o',
    path: '/practice/setup',
    badge: 0
  },
  {
    key: 'wrong',
    name: '错题本',
    desc: '回顾历次错题并再次练习',
    icon: 'warning-o',
    path: '/practice/wrong',
    badge: wrongCount.value
  }
])

/**
 * 加载入口角标数据
 * 请求失败时角标保持为 0，不阻断入口使用
 */
const loadBadges = async () => {
  const currentId = ++requestId
  try {
    const [overviewRes, upcomingRes] = await Promise.all([
      getOverviewApi(),
      getUpcomingExamsApi()
    ])
    // 已有更新的请求在途时丢弃本次结果，避免旧数据覆盖新数据
    if (currentId !== requestId) return
    wrongCount.value = overviewRes.data?.wrongCount || 0
    upcomingCount.value = (upcomingRes.data || []).length
  } catch {
    // 角标加载失败不阻断入口使用，仅最新一次请求的失败结果生效
    if (currentId === requestId) {
      wrongCount.value = 0
      upcomingCount.value = 0
    }
  }
}

// 页面被 KeepAlive 缓存，每次激活时重新拉取，保证待考数与错题数角标及时刷新
onActivated(loadBadges)
</script>

<style scoped>
.workspace-page {
  min-height: 100vh;
  background-color: var(--bg-page);
}

.content {
  padding: var(--spacing-md);
  padding-bottom: 80px;
}

.entry-group {
  background-color: var(--bg-card);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

/* 入口项：整行可点，触摸高度 64px */
.entry-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  width: 100%;
  min-height: 64px;
  padding: var(--spacing-md);
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
}

.entry-item + .entry-item {
  border-top: 1px solid var(--border-color);
}

.entry-item:active {
  background-color: var(--bg-page);
}

/* 图标底色按功能区分，弱化处理不做强调色块 */
.entry-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  flex-shrink: 0;
  color: var(--primary-color);
  background-color: rgba(17, 113, 248, 0.1);
}

.entry-icon--wrong {
  color: var(--danger-color);
  background-color: rgba(245, 63, 63, 0.1);
}

.entry-icon--practice {
  color: var(--success-color);
  background-color: rgba(0, 180, 42, 0.1);
}

.entry-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.entry-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
}

.entry-desc {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-disabled);
}

.entry-arrow {
  color: var(--text-disabled);
  flex-shrink: 0;
}
</style>
