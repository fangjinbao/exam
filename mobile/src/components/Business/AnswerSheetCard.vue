<!--
  组件名称：AnswerSheetCard - 答题卡

  功能描述：
    以题号网格展示全卷作答进度，已作答题号填充主题色、当前题描边强调
    点击题号跳转到对应题目

  使用方式：
    <AnswerSheetCard
      :questions="pages"
      :current-index="currentIndex"
      :is-answered="isAnswered"
      @select="currentIndex = $event"
    />

  属性说明：
    - questions：翻页单位列表，**必须**是以下两种形态之一（不接受扁平题目数组）
        · { kind: 'single', question }               普通题，占一格
        · { kind: 'group', parent, children: [] }    材料题组，占一格并标注小问数
      考试页直接用 useQuestionPages 的产出；练习页把扁平列表 map 成 single 形态。
      统一契约是有意的：早先版本兼容「无 kind 时按普通题处理」，靠探测对象上
      有没有 question 字段来猜形态，一旦题目对象将来多出个同名字段就会静默错取值。
    - currentIndex：当前页下标（须与 questions 同一下标空间，否则跳题会错位）
    - isAnswered：判断某题是否已作答的方法，入参为题目 ID
-->

<template>
  <section class="sheet-card">
    <h2 class="sheet-title">答题卡</h2>
    <div class="sheet-grid">
      <button
        v-for="(item, idx) in questions"
        :key="pageKey(item, idx)"
        type="button"
        class="sheet-item"
        :class="{
          'sheet-item--done': isPageDone(item),
          'sheet-item--active': idx === currentIndex,
          'sheet-item--group': isGroup(item)
        }"
        @click="emit('select', idx)"
      >
        <span class="sheet-no">{{ idx + 1 }}</span>
        <!-- 材料题组标注小问数，让考生知道点进去有多题要答 -->
        <span v-if="isGroup(item)" class="sheet-sub">{{ item.children.length }} 问</span>
      </button>
    </div>
  </section>
</template>

<script setup>
const props = defineProps({
  /**
   * 翻页单位列表：每项必须带 kind（'single' | 'group'）
   *
   * validator 在开发期就拦住误传扁平题目数组的情况——这种错误不会报错，
   * 只会表现为答题卡跳题错位或格子填色不对，很难从现象反推原因。
   */
  questions: {
    type: Array,
    default: () => [],
    validator: (list) =>
      list.every((item) => item?.kind === 'single' || item?.kind === 'group')
  },
  /** 当前页下标 */
  currentIndex: {
    type: Number,
    default: 0
  },
  /** 判断某题是否已作答，入参为题目 ID */
  isAnswered: {
    type: Function,
    required: true
  }
})

const emit = defineEmits(['select'])

/** 该项是否为材料题组 */
const isGroup = (item) => item?.kind === 'group'

/** 网格 key：材料题组用材料题 id，普通题用题目 id，取不到时退化为下标 */
const pageKey = (item, idx) => {
  if (isGroup(item)) return `g${item.parent.id}`
  return item?.question?.id ?? idx
}

/**
 * 该页是否已完成作答
 *
 * 材料题组需其全部小题都已作答才算完成——只答一半就标绿会让考生漏题。
 *
 * 空材料题组（没有小题）判**未完成**：这种数据只可能来自配置错误
 * （材料题未配小题，或小题 parentId 配错），该页会渲染出材料却没有任何
 * 可作答内容。判「已完成」等于用绿色掩盖异常、让考生以为答过了，
 * 所以宁可显示未完成把问题暴露出来。
 *
 * @param {Object} item - 翻页单位
 * @returns {boolean} 是否已完成
 */
const isPageDone = (item) => {
  if (isGroup(item)) {
    if (item.children.length === 0) return false
    return item.children.every((child) => props.isAnswered(child.id))
  }
  return item?.question ? props.isAnswered(item.question.id) : false
}
</script>

<style scoped>
.sheet-card {
  margin-top: var(--spacing-md);
  padding: var(--spacing-md);
  background-color: var(--bg-card);
  border-radius: var(--radius-lg);
}

.sheet-title {
  margin-bottom: var(--spacing-sm);
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.sheet-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: var(--spacing-sm);
}

/* 题号按钮：触摸区域 44px */
.sheet-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  height: 44px;
  font-size: 14px;
  color: var(--text-secondary);
  background-color: var(--bg-page);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
}

.sheet-no {
  line-height: 1.1;
}

/* 小问数标注：字号压小，避免把 44px 的格子挤变形 */
.sheet-sub {
  font-size: 10px;
  line-height: 1;
  opacity: 0.75;
}

/* 已作答：填充主题色 */
.sheet-item--done {
  color: #fff;
  background-color: var(--primary-color);
  border-color: var(--primary-color);
}

/* 当前题：描边强调 */
.sheet-item--active {
  border-color: var(--primary-color);
  border-width: 2px;
}
</style>
