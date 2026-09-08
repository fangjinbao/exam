<!--
  页面名称：AiChat - AI答疑

  功能描述：
    考生就练习或考试中的题目向 AI 提问并获取解答
    以对话形式展示提问与解答，AI 服务不可用时给出提示

  路由信息：
    路径：/practice/ai
    名称：AiChat
    查询参数：questionId（可选，关联具体题目）
    是否缓存：否
-->

<template>
  <div class="ai-chat-page">
    <van-nav-bar title="AI答疑" left-arrow fixed placeholder @click-left="router.back()" />

    <div class="chat-area">
      <!-- 空态引导 -->
      <div v-if="!records.length" class="guide">
        <van-icon name="chat-o" size="40" class="guide-icon" />
        <p class="guide-title">向 AI 提问</p>
        <p class="guide-text">
          {{
            questionId
              ? '已关联当前题目，可直接提问本题相关疑问。'
              : '可提问知识点理解、易错点区分等问题。'
          }}
        </p>
      </div>

      <!-- 对话记录 -->
      <ul v-else class="record-list">
        <li v-for="record in records" :key="record.id" class="record-item">
          <div class="bubble bubble--user">{{ record.question }}</div>
          <div class="bubble bubble--ai">
            <van-loading v-if="record.pending" size="16">解答中</van-loading>
            <template v-else>{{ record.answer }}</template>
          </div>
        </li>
      </ul>
    </div>

    <!-- 提问输入区 -->
    <footer class="input-bar">
      <van-field
        v-model="inputText"
        class="input-field"
        type="textarea"
        rows="1"
        autosize
        maxlength="200"
        placeholder="请输入您的问题"
        :disabled="asking"
      />
      <van-button
        type="primary"
        size="small"
        round
        :loading="asking"
        :disabled="!inputText.trim()"
        @click="handleAsk"
      >
        发送
      </van-button>
    </footer>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { aiAskApi } from '@/api/modules/practiceApi'

const route = useRoute()
const router = useRouter()

// 关联的题目 ID（从练习页带入，可为空）
const questionId = route.query.questionId

// 对话记录
const records = ref([])

// 输入内容
const inputText = ref('')

// 提问请求中
const asking = ref(false)

// 对话记录自增 ID
let recordSeed = 0

/**
 * 滚动到最新一条对话
 */
const scrollToLatest = async () => {
  await nextTick()
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
}

/**
 * 发送提问并获取 AI 解答
 * 请求失败时移除该条待答记录并提示原因
 */
const handleAsk = async () => {
  const question = inputText.value.trim()
  if (!question || asking.value) return

  recordSeed += 1
  const record = { id: recordSeed, question, answer: '', pending: true }
  records.value.push(record)
  inputText.value = ''
  asking.value = true
  scrollToLatest()

  try {
    const res = await aiAskApi({ questionId, question })
    record.answer = res.data?.answer || ''
    record.pending = false
  } catch {
    // AI 服务不可用时移除气泡避免留下空白解答，原因由响应拦截器提示
    records.value = records.value.filter((item) => item.id !== record.id)
    inputText.value = question
  } finally {
    asking.value = false
    scrollToLatest()
  }
}
</script>

<style scoped>
.ai-chat-page {
  min-height: 100vh;
  background-color: var(--bg-page);
}

.chat-area {
  padding: var(--spacing-md);
  /* 为底部输入栏留白 */
  padding-bottom: 96px;
}

/* 空态引导 */
.guide {
  padding: var(--spacing-xl) var(--spacing-md);
  text-align: center;
}

.guide-icon {
  color: var(--primary-color);
}

.guide-title {
  margin-top: var(--spacing-sm);
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.guide-text {
  margin-top: var(--spacing-xs);
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.6;
}

/* 对话记录 */
.record-item + .record-item {
  margin-top: var(--spacing-md);
}

.bubble {
  max-width: 85%;
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: 15px;
  line-height: 1.7;
  border-radius: var(--radius-lg);
  /* 解答含换行时保留排版 */
  white-space: pre-wrap;
  word-break: break-word;
}

/* 提问气泡靠右，主题色填充 */
.bubble--user {
  margin-left: auto;
  color: #fff;
  background-color: var(--primary-color);
  border-bottom-right-radius: var(--radius-sm);
}

/* 解答气泡靠左，白底 */
.bubble--ai {
  margin-top: var(--spacing-sm);
  color: var(--text-primary);
  background-color: var(--bg-card);
  border-bottom-left-radius: var(--radius-sm);
}

/* 底部输入栏 */
.input-bar {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: flex-end;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  padding-bottom: calc(var(--spacing-sm) + env(safe-area-inset-bottom));
  background-color: var(--bg-card);
  border-top: 1px solid var(--border-color);
}

.input-field {
  flex: 1;
  padding: var(--spacing-xs) var(--spacing-sm);
  background-color: var(--bg-page);
  border-radius: var(--radius-md);
}
</style>
