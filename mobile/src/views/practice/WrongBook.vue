<!--
  页面名称：WrongBook - 错题本

  功能描述：
    展示历次练习与考试中的错题，含题干、题型、来源与上次作答
    支持一键进入错题再练习，答对后该题自动从错题本移除

  路由信息：
    路径：/practice/wrong
    名称：WrongBook
    是否缓存：否
-->

<template>
  <div class="wrong-book-page">
    <van-nav-bar title="错题本" left-arrow fixed placeholder @click-left="router.back()" />

    <AppSkeleton v-if="loading" variant="text-card" />

    <van-empty v-else-if="!list.length" description="暂无错题" />

    <template v-else>
      <div class="content">
        <p class="summary">共 {{ list.length }} 道错题</p>

        <ul class="wrong-list">
          <li v-for="item in list" :key="item.id" class="wrong-card">
            <header class="card-header">
              <van-tag plain type="primary">{{ item.typeText }}</van-tag>
              <span class="source-text">{{ sourceLabel(item) }}</span>
            </header>

            <!--
              列表用纯文本摘要：题干含富文本，直接插值会显示标签，
              而在窄列表里渲染图片会把卡片撑得很长。点进去重练时看完整内容。
            -->
            <p class="question-content">{{ richTextSummary(item.content) }}</p>

            <div class="card-footer">
              <span class="wrong-answer">上次作答：{{ formatAnswer(item.userAnswer) }}</span>
              <span class="wrong-time">{{ formatDate(item.wrongTime, 'MM-DD HH:mm') }}</span>
            </div>
          </li>
        </ul>
      </div>

      <footer class="footer">
        <van-button type="primary" block round @click="goPractice">开始错题练习</van-button>
      </footer>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { formatDate } from '@/utils/format'
import { richTextSummary } from '@/utils/richText'
import { getWrongListApi } from '@/api/modules/practiceApi'
import AppSkeleton from '@/components/Common/AppSkeleton.vue'

const router = useRouter()

// 错题列表
const list = ref([])

// 加载状态
const loading = ref(false)

/**
 * 错题来源展示文案
 * @param {Object} item - 错题项
 * @returns {string} 来源文案
 */
const sourceLabel = (item) => {
  const prefix = item.source === 'exam' ? '来自考试' : '来自练习'
  return `${prefix}：${item.sourceName}`
}

/**
 * 格式化作答展示
 * @param {string|string[]} value - 作答值
 * @returns {string} 展示文案
 */
const formatAnswer = (value) => {
  if (Array.isArray(value)) return value.join('、')
  if (value === 'true') return '正确'
  if (value === 'false') return '错误'
  return value === undefined || value === null || value === '' ? '未作答' : String(value)
}

/**
 * 加载错题列表
 */
const loadList = async () => {
  loading.value = true
  try {
    const res = await getWrongListApi()
    list.value = res.data || []
  } catch {
    // 错误提示由响应拦截器统一给出，此处仅保持空列表
    list.value = []
  } finally {
    loading.value = false
  }
}

/**
 * 进入错题再练习
 */
const goPractice = () => {
  router.push({ path: '/practice/answer', query: { mode: 'wrong' } })
}

onMounted(loadList)
</script>

<style scoped>
.wrong-book-page {
  min-height: 100vh;
  background-color: var(--bg-page);
}

.content {
  padding: var(--spacing-md);
  padding-bottom: 88px;
}

.summary {
  margin-bottom: var(--spacing-sm);
  font-size: 13px;
  color: var(--text-secondary);
}

/* 错题卡片 */
.wrong-card {
  padding: var(--spacing-md);
  background-color: var(--bg-card);
  border-radius: var(--radius-lg);
}

.wrong-card + .wrong-card {
  margin-top: var(--spacing-sm);
}

.card-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.source-text {
  font-size: 12px;
  color: var(--text-disabled);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.question-content {
  margin: var(--spacing-sm) 0;
  font-size: 15px;
  color: var(--text-primary);
  line-height: 1.6;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  padding-top: var(--spacing-sm);
  border-top: 1px solid var(--border-color);
  font-size: 13px;
}

.wrong-answer {
  color: var(--danger-color);
  word-break: break-all;
}

.wrong-time {
  flex-shrink: 0;
  color: var(--text-disabled);
}

.footer {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  padding: var(--spacing-sm) var(--spacing-md);
  padding-bottom: calc(var(--spacing-sm) + env(safe-area-inset-bottom));
  background-color: var(--bg-card);
  border-top: 1px solid var(--border-color);
}
</style>
