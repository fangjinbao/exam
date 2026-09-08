<!--
  组件名称：QuestionProgress - 作答进度区

  功能描述：
    展示当前题号、总题数与已答数，下方带一条按题号推进的进度条
    考试作答页与在线练习页共用

  使用方式：
    <QuestionProgress :current="currentIndex + 1" :total="pages.length" :answered="answeredCount" />

  属性说明：
    - current：当前题号（从 1 开始）
    - total：总题数
    - answered：已作答题数；为 null 时不展示右侧徽标
-->

<template>
  <div>
    <div class="progress-head">
      <p class="progress-no">
        第 {{ current }} 题
        <span class="progress-total">/ {{ total }}</span>
      </p>
      <span v-if="answered !== null" class="answered-badge">已答 {{ answered }}</span>
    </div>

    <div class="progress-bar">
      <div class="progress-bar__fill" :style="{ width: percent }"></div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  /** 当前题号（从 1 开始） */
  current: {
    type: Number,
    default: 1
  },
  /** 总题数 */
  total: {
    type: Number,
    default: 0
  },
  /** 已作答题数，为 null 时不展示徽标 */
  answered: {
    type: Number,
    default: null
  }
})

/** 进度条宽度：按当前题号占总题数的比例；总数为 0 时归零避免除零得 NaN */
const percent = computed(() => {
  if (!props.total) return '0%'
  return `${(props.current / props.total) * 100}%`
})
</script>

<style scoped>
.progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.progress-no {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.progress-total {
  margin-left: 2px;
  font-size: 14px;
  font-weight: 400;
  color: var(--text-disabled);
}

.answered-badge {
  padding: 5px 12px;
  font-size: 13px;
  color: #fff;
  background-color: var(--primary-color);
  border-radius: 20px;
}

.progress-bar {
  height: 6px;
  margin-top: 12px;
  background-color: var(--bg-fill);
  border-radius: 3px;
  overflow: hidden;
}

.progress-bar__fill {
  height: 100%;
  background-color: var(--primary-color);
  border-radius: 3px;
  transition: width 0.3s;
}
</style>
