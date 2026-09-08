<!--
  页面名称：MessageDetail - 消息详情

  功能描述：
    展示消息完整内容，进入即由后端标记该消息为已读

  路由信息：
    路径：/message/detail/:id
    名称：MessageDetail
    是否缓存：否
-->

<template>
  <div class="message-detail-page">
    <van-nav-bar title="消息详情" left-arrow fixed placeholder @click-left="router.back()" />

    <AppSkeleton v-if="loading" variant="article" />

    <div v-else-if="detail" class="content">
      <article class="card">
        <h1 class="message-title">{{ detail.title }}</h1>

        <div class="message-meta">
          <van-tag :type="getMessageTagType(detail.type)">{{ detail.typeText }}</van-tag>
          <span class="message-time">{{ formatDate(detail.time) }}</span>
        </div>

        <p class="message-content">{{ detail.content }}</p>
      </article>
    </div>

    <van-empty v-else description="消息不存在" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { formatDate } from '@/utils/format'
import { MESSAGE_TYPE_TAG } from '@/constants/exam'
import { getMessageDetailApi } from '@/api/modules/messageApi'
import AppSkeleton from '@/components/Common/AppSkeleton.vue'

const route = useRoute()
const router = useRouter()

// 消息详情
const detail = ref(null)

// 加载状态
const loading = ref(false)

/**
 * 获取消息类型对应的标签样式
 * @param {string} type - 消息类型
 * @returns {string} Vant Tag 的 type 值
 */
const getMessageTagType = (type) => MESSAGE_TYPE_TAG[type] || 'default'

/**
 * 加载消息详情（后端在读取时标记已读）
 */
const loadDetail = async () => {
  loading.value = true
  try {
    const res = await getMessageDetailApi(route.params.id)
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
.message-detail-page {
  min-height: 100vh;
  background-color: var(--bg-page);
}

.content {
  padding: var(--spacing-md);
}

.card {
  padding: var(--spacing-md);
  background-color: var(--bg-card);
  border-radius: var(--radius-lg);
}

.message-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.5;
}

.message-meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-sm);
  padding-bottom: var(--spacing-md);
  border-bottom: 1px solid var(--border-color);
}

.message-time {
  font-size: 13px;
  color: var(--text-disabled);
}

.message-content {
  margin-top: var(--spacing-md);
  font-size: 15px;
  color: var(--text-secondary);
  line-height: 1.8;
  /* 消息正文含换行时保留排版 */
  white-space: pre-wrap;
}
</style>
