<!--
  组件名称：ExamAnswerHeader - 考试作答页顶部栏

  功能描述：
    固定在作答页顶部，展示返回按钮、考试名称、作答进度与剩余时间倒计时
    剩余不足 5 分钟时倒计时转为警示色；交卷进行中返回按钮禁用

  使用方式：
    <ExamAnswerHeader
      :exam-name="paper.examName"
      :answered-count="answeredCount"
      :total-count="paper.questions.length"
      :remain="remain"
      :remain-text="remainText"
      :back-disabled="submitting"
      @back="handleBack"
    />
-->

<template>
  <header class="answer-header">
    <button type="button" class="header-back" :disabled="backDisabled" @click="emit('back')">
      <van-icon name="arrow-left" size="18" />
    </button>

    <div class="header-info">
      <p class="exam-name">{{ examName }}</p>
      <p class="answer-progress">已答 {{ answeredCount }} / {{ totalCount }}</p>
    </div>

    <!--
      倒计时按考试设置「剩余时间」开关显示。
      关闭时整个元素不渲染而非置空字符串：留一个空 span 会占着
      grid/flex 的位置，把考试名的可用宽度按有倒计时的情形压窄。
      注意计时本身仍在跑（到点自动交卷不受影响），这里只是不展示。
    -->
    <span
      v-if="showRemaining"
      class="countdown"
      :class="{ 'countdown--urgent': remain <= URGENT_SECONDS }"
    >
      {{ remainText }}
    </span>
  </header>
</template>

<script setup>
/** 剩余时间进入警示色的阈值（秒） */
const URGENT_SECONDS = 300

defineProps({
  /** 考试名称 */
  examName: {
    type: String,
    default: ''
  },
  /** 已作答题数 */
  answeredCount: {
    type: Number,
    default: 0
  },
  /** 总题数 */
  totalCount: {
    type: Number,
    default: 0
  },
  /** 剩余秒数，用于判定是否进入警示色 */
  remain: {
    type: Number,
    default: 0
  },
  /** 剩余时间展示文案（HH:mm:ss） */
  remainText: {
    type: String,
    default: '00:00:00'
  },
  /** 返回按钮是否禁用（交卷进行中） */
  backDisabled: {
    type: Boolean,
    default: false
  },
  /**
   * 是否展示剩余时间倒计时（对应考试设置「剩余时间」）
   * 默认 true：缺参时按展示处理，不因漏传把倒计时藏掉
   */
  showRemaining: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['back'])
</script>

<style scoped>
/* 顶部固定条：返回 + 考试信息 + 倒计时 */
.answer-header {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  min-height: 52px;
  padding: var(--spacing-sm) var(--spacing-md);
  background-color: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
}

/* 图标视觉尺寸不变，靠内边距把可点击区域撑到 44px 触摸标准 */
.header-back {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  margin-left: calc(var(--spacing-sm) * -1);
  background: none;
  border: none;
  color: var(--text-primary);
  cursor: pointer;
}

/* 交卷进行中禁止返回，给出可见的禁用态 */
.header-back:disabled {
  color: var(--text-disabled);
  cursor: not-allowed;
}

.header-info {
  flex: 1;
  min-width: 0;
}

.exam-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  /* 考试名过长时截断，避免挤压倒计时 */
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.answer-progress {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-disabled);
}

/* 倒计时：等宽数字避免跳动 */
.countdown {
  font-size: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

/* 剩余不足 5 分钟时转为警示色 */
.countdown--urgent {
  color: var(--danger-color);
}
</style>
