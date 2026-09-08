<!--
  页面名称：Message - 消息

  功能描述：
    展示考生收到的考试通知、报考审核结果、成绩发布等系统消息
    未读消息带标记，点击进入详情后自动转为已读

  路由信息：
    路径：/message
    名称：Message
    是否缓存：是（KeepAlive）
-->

<template>
  <div class="message-page">
    <van-nav-bar title="消息" fixed placeholder />

    <div class="content">
      <AppSkeleton v-if="loading" variant="text-card" />

      <van-empty v-else-if="!list.length" description="暂无消息" />

      <ul v-else class="message-list">
        <li
          v-for="item in list"
          :key="item.id"
          class="message-item"
          @click="goDetail(item.id)"
        >
          <div class="item-head">
            <!-- 未读标记：红点 -->
            <span v-if="!item.isRead" class="unread-dot" aria-label="未读"></span>
            <h3 class="message-title" :class="{ 'message-title--read': item.isRead }">
              {{ item.title }}
            </h3>
          </div>

          <div class="item-foot">
            <van-tag :type="getMessageTagType(item.type)">{{ item.typeText }}</van-tag>
            <span class="message-time">{{ formatDate(item.time, 'MM-DD HH:mm') }}</span>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import { formatDate } from '@/utils/format'
import { MESSAGE_TYPE_TAG } from '@/constants/exam'
import { getMessageListApi } from '@/api/modules/messageApi'
import AppSkeleton from '@/components/Common/AppSkeleton.vue'

const router = useRouter()

// 消息列表
const list = ref([])

// 加载状态
const loading = ref(false)

// 请求序号：Tab 快速切换会有多次请求在途，只接受最新一次的结果
let requestId = 0

/**
 * 获取消息类型对应的标签样式
 * @param {string} type - 消息类型
 * @returns {string} Vant Tag 的 type 值
 */
const getMessageTagType = (type) => MESSAGE_TYPE_TAG[type] || 'default'

/**
 * 加载消息列表
 */
const loadList = async () => {
  const currentId = ++requestId
  loading.value = true
  try {
    const res = await getMessageListApi()
    // 已有更新的请求在途时丢弃本次结果，避免旧数据覆盖新数据
    if (currentId !== requestId) return
    list.value = res.data?.list || []
  } catch {
    // 错误提示由响应拦截器统一给出，此处仅保持空列表
    if (currentId === requestId) list.value = []
  } finally {
    if (currentId === requestId) loading.value = false
  }
}

/**
 * 进入消息详情
 * @param {number} id - 消息 ID
 */
const goDetail = (id) => {
  router.push(`/message/detail/${id}`)
}

// 页面缓存复用，每次激活时重新拉取以同步已读状态
onActivated(loadList)
</script>

<style scoped>
.message-page {
  min-height: 100vh;
  background-color: var(--bg-page);
}

.content {
  padding: var(--spacing-md);
  padding-bottom: 80px;
}

/* 消息卡片 */
.message-item {
  padding: var(--spacing-md);
  background-color: var(--bg-card);
  border-radius: var(--radius-lg);
  cursor: pointer;
}

.message-item + .message-item {
  margin-top: var(--spacing-sm);
}

.message-item:active {
  opacity: 0.9;
}

.item-head {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

/* 未读红点，与标题首行对齐 */
.unread-dot {
  flex-shrink: 0;
  width: 7px;
  height: 7px;
  margin-top: 7px;
  background-color: var(--danger-color);
  border-radius: 50%;
}

.message-title {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.5;
}

/* 已读消息标题弱化 */
.message-title--read {
  font-weight: 400;
  color: var(--text-secondary);
}

.item-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: var(--spacing-sm);
}

.message-time {
  font-size: 12px;
  color: var(--text-disabled);
}
</style>
