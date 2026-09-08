<!--
  页面名称：ExamList - 考试列表

  功能描述：
    展示已分配给该考生的考试，含实时状态与是否已交卷
    未分配考试时不展示可进入的考试

  路由信息：
    路径：/exam/list
    名称：ExamList
    是否缓存：否
-->

<template>
  <div class="exam-list-page">
    <van-nav-bar title="参加考试" left-arrow fixed placeholder @click-left="router.back()" />

    <div class="content">
      <AppSkeleton v-if="loading" variant="card-list" />

      <van-empty v-else-if="!list.length" description="暂无可参加的考试" />

      <ul v-else class="exam-list">
        <li v-for="item in list" :key="item.id" class="exam-card" @click="goDetail(item)">
          <header class="card-header">
            <h3 class="exam-name">{{ item.name }}</h3>
            <van-tag :type="getStatusTagType(item)">{{ getStatusLabel(item) }}</van-tag>
          </header>

          <!-- 说明为空时整段不渲染：空 <p> 仍占外边距，标题与下方信息之间会空一截 -->
          <p v-if="item.description" class="exam-desc">{{ item.description }}</p>

          <dl class="exam-meta">
            <div class="meta-item">
              <dt>考试时间</dt>
              <dd>{{ formatDate(item.startTime, 'MM-DD HH:mm') }}</dd>
            </div>
            <div class="meta-item">
              <dt>时长</dt>
              <dd>{{ item.duration }} 分钟</dd>
            </div>
            <div class="meta-item">
              <dt>题量</dt>
              <dd>{{ item.questionCount }} 题</dd>
            </div>
            <div class="meta-item">
              <dt>及格分</dt>
              <dd>{{ item.passScore }} 分</dd>
            </div>
          </dl>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { formatDate } from '@/utils/format'
import { getExamStatusText, getExamStatusTag, EXAM_STATUS } from '@/constants/exam'
import { getExamListApi } from '@/api/modules/examApi'
import AppSkeleton from '@/components/Common/AppSkeleton.vue'

const router = useRouter()

// 考试列表
const list = ref([])

// 加载状态
const loading = ref(false)

/**
 * 获取状态展示文案（已交卷优先显示「已完成」）
 * @param {Object} item - 考试项
 * @returns {string} 状态文案
 */
const getStatusLabel = (item) => {
  if (item.submitted) return '已完成'
  return getExamStatusText(item.status)
}

/**
 * 获取状态标签类型
 * @param {Object} item - 考试项
 * @returns {string} Vant Tag 的 type 值
 */
const getStatusTagType = (item) => {
  // 已完成用灰而非蓝：这是「无需再操作」的终态，
  // 蓝色实心标签比「进行中」的绿还抢眼，考完几场后满屏蓝标，
  // 真正该被看见的进行中考试反倒被压平了
  if (item.submitted) return 'default'
  return getExamStatusTag(item.status)
}

/**
 * 加载考试列表
 */
const loadList = async () => {
  loading.value = true
  try {
    const res = await getExamListApi()
    list.value = res.data || []
  } catch {
    // 错误提示由响应拦截器统一给出，此处仅保持空列表
    list.value = []
  } finally {
    loading.value = false
  }
}

/**
 * 进入考试详情
 *
 * 已交卷的转去交卷详情；已结束的给出提示，不进入详情。
 * 未开考的放行——考生要先看考试说明与规则，能否作答由详情页的
 * 「开始考试」按钮按 earlyEnterMinutes 把关，服务端再兜一道。
 * @param {Object} item - 考试项
 */
const goDetail = (item) => {
  if (item.submitted) {
    router.push(`/exam/result/${item.id}`)
    return
  }
  if (item.status === EXAM_STATUS.FINISHED) {
    showToast('本场考试已结束')
    return
  }
  router.push(`/exam/detail/${item.id}`)
}

onMounted(loadList)
</script>

<style scoped>
.exam-list-page {
  min-height: 100vh;
  background-color: var(--bg-page);
}

.content {
  padding: var(--spacing-md);
}

/* 考试卡片 */
.exam-card {
  background-color: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: var(--spacing-md);
  cursor: pointer;
}

.exam-card + .exam-card {
  margin-top: var(--spacing-md);
}

.exam-card:active {
  opacity: 0.9;
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-sm);
}

.exam-name {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.4;
}

.exam-desc {
  margin-top: var(--spacing-xs);
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* 元信息：两列铺开 */
.exam-meta {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-xs) var(--spacing-sm);
  margin-top: var(--spacing-sm);
  padding-top: var(--spacing-sm);
  border-top: 1px solid var(--border-color);
}

.meta-item {
  display: flex;
  gap: 4px;
  font-size: 13px;
}

.meta-item dt {
  color: var(--text-disabled);
}

.meta-item dd {
  color: var(--text-primary);
}
</style>
