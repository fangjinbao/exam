<!--
  阅卷工作台右栏：答题卡
  顶部显示试题数与已得分，下方按题型分组列题号按钮，点击定位到卷面对应题目。
-->

<template>
  <aside class="card-panel">
    <div class="summary">
      <div class="summary-cell">
        <span class="summary-num">{{ totalCount }}</span>
        <span class="summary-label">试题</span>
      </div>
      <span class="summary-split" />
      <div class="summary-cell">
        <span class="summary-num">{{ gainedScore.toFixed(2) }}</span>
        <span class="summary-label">得分</span>
      </div>
    </div>

    <div class="sections">
      <section v-for="(section, sIdx) in sections" :key="section.type" class="card-section">
        <h4 class="section-title"> {{ cnNumeral(sIdx) }}、{{ typeLabel(section.type) }} </h4>
        <div class="no-grid">
          <button
            v-for="item in section.items"
            :key="item.id"
            type="button"
            class="no-btn"
            :class="stateClass(item)"
            :title="`第 ${item.questionNo} 题`"
            @click="emit('locate', item.id)"
          >
            {{ item.indexInSection }}
          </button>
        </div>
      </section>
      <ElEmpty v-if="!sections.length" description="暂无题目" :image-size="60" />
    </div>
  </aside>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { cnNumeral } from '@/utils/paperStructure'
  import type { GradingRow, GradingSection } from '../types'

  defineOptions({ name: 'AnswerCardPanel' })

  const props = defineProps<{
    sections: GradingSection[]
    /** 题型 value → 中文名 */
    typeLabel: (type: string) => string
  }>()

  const emit = defineEmits<{ (e: 'locate', itemId: number): void }>()

  const totalCount = computed(() => props.sections.reduce((sum, section) => sum + section.count, 0))

  /**
   * 已得分合计：草稿分优先于已保存分
   * 打完分还没提交时也要能看到合计变化，否则阅卷员无法在提交前核对总分。
   */
  const gainedScore = computed(() =>
    props.sections.reduce(
      (sum, section) =>
        sum + section.items.reduce((s, item) => s + (item.draftScore ?? item.score ?? 0), 0),
      0
    )
  )

  /**
   * 题号按钮状态：待批阅（主观题未评）/ 本次已填 / 已评过
   * 客观题恒为已评（交卷即自动判分），不占用「待批阅」这个提醒色。
   */
  function stateClass(item: GradingRow): string {
    if (item.draftScore !== null) return 'is-draft'
    if (item.score !== null) return 'is-graded'
    return 'is-pending'
  }
</script>

<style lang="scss" scoped>
  .card-panel {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    width: 220px;
    overflow: hidden;
    background: var(--el-bg-color);
    border-radius: 12px;
  }

  .summary {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: space-around;
    padding: 16px 12px;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  .summary-cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-items: center;
  }

  .summary-num {
    font-size: 20px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .summary-label {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  .summary-split {
    width: 1px;
    height: 28px;
    background: var(--el-border-color-lighter);
  }

  .sections {
    flex: 1;
    min-height: 0;
    padding: 12px;
    overflow-y: auto;
  }

  .card-section {
    margin-bottom: 14px;
  }

  .section-title {
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .no-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  // 题号按钮：28px 见方，满足点击目标下限又不至于把答题卡撑宽
  .no-btn {
    width: 28px;
    height: 28px;
    font-size: 12px;
    cursor: pointer;
    background: var(--el-fill-color-light);
    border: 1px solid var(--el-border-color);
    border-radius: 4px;

    &:hover {
      border-color: var(--el-color-primary);
    }

    // 未评分：留空白底 + 常规边框，与已评分的实心色块区分
    &.is-pending {
      color: var(--el-text-color-secondary);
    }

    &.is-graded {
      color: var(--el-color-success);
      background: var(--el-color-success-light-9);
      border-color: var(--el-color-success-light-5);
    }

    // 本次输入未提交：用主色标出，提交后转为已评色
    &.is-draft {
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border-color: var(--el-color-primary);
    }
  }
</style>
