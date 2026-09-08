<!-- 组卷实时结构预览面板：按题型分大题展示已选题目（一、单选题（共 N 题，M 分）…） -->
<template>
  <div class="structure-panel">
    <div class="panel-head">
      <span class="card-title">试卷结构预览</span>
      <span class="panel-total">
        共 {{ totalCount }} 题
        <!-- 材料题按 1 题计，展开后作答位更多，不等时标出免得误判题量 -->
        <template v-if="slotCount !== totalCount">（{{ slotCount }} 个作答位）</template>
        · 总分 <b>{{ totalScore }}</b> 分
      </span>
    </div>
    <div v-if="!sections.length" class="panel-empty">勾选题目后在此实时预览试卷结构</div>
    <div v-else class="panel-body">
      <div v-for="(section, sIdx) in sections" :key="section.type" class="panel-section">
        <div class="section-heading">
          {{ cnNumeral(sIdx) }}、{{ typeLabel(section.type) }}（共 {{ section.count }} 题，共
          {{ section.totalScore }} 分）
        </div>
        <div v-for="(item, qIdx) in section.items" :key="qIdx" class="section-item">
          <span class="item-no">{{ qIdx + 1 }}.</span>
          <!-- 试卷结构是一行一题的概览，题干按纯文本显示；富文本标签在这里既排不开也无意义 -->
          <span class="item-stem">{{ item.stemText || stripHtml(item.stem) }}</span>
          <!-- 材料题按 1 题计入统计，但卷面上会展开成 N 个作答位，标出来免得误读题量 -->
          <span v-if="item.childrenCount" class="item-sub">{{ item.childrenCount }} 小问</span>
          <span class="item-score">{{ item.score }} 分</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { cnNumeral, round2, type PaperSection } from '@/utils/paperStructure'
  import { stripHtml } from '@/utils/richText'

  /** 面板题目项：结构预览只需题干、分值，材料题另带题型与小题数 */
  interface StructureItem {
    stem: string
    /** 题干纯文本镜像；有则优先用，省一次前端剥离 */
    stemText?: string | null
    /** 题型字典 value，用于判定材料题（作答位按小题数计） */
    type?: string
    score: number
    /** 小题数：仅材料题有值，用于标注「N 小问」 */
    childrenCount?: number
  }

  const props = defineProps<{
    /** 已按题型分好的大题（含 items 的 stem/score） */
    sections: PaperSection<StructureItem>[]
    /** 题型 value → 显示名 */
    typeLabel: (type: string) => string
  }>()

  const totalCount = computed(() => props.sections.reduce((s, sec) => s + sec.count, 0))
  // 各大题分值虽已规整到两位小数，再相加仍会浮出尾数（1.05 + 1.1 得 2.1500000000000004），
  // 合计分直接渲染在面板头部，故这一层也要规整
  const totalScore = computed(() =>
    round2(props.sections.reduce((s, sec) => s + sec.totalScore, 0))
  )
  /**
   * 展开后的作答位数：材料题按其小题数计（无小题即 0），其余按 1 计。
   * 按 type 判定而非 childrenCount 真假值，否则无小题的材料题会被算成 1 个作答位。
   */
  const slotCount = computed(() =>
    props.sections.reduce(
      (s, sec) =>
        s +
        sec.items.reduce((n, it) => n + (it.type === 'composite' ? (it.childrenCount ?? 0) : 1), 0),
      0
    )
  )
</script>

<style lang="scss" scoped>
  .structure-panel {
    flex: 1 1 0;
    min-width: 360px;
    border-radius: 12px;
    background: var(--el-fill-color-light);
    display: flex;
    flex-direction: column;
    max-height: 532px;

    .panel-head {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 16px 12px;

      .card-title {
        font-weight: 600;
        font-size: 15px;
      }

      .panel-total {
        font-size: 13px;
        color: var(--el-text-color-regular);

        b {
          color: var(--el-color-primary);
          font-size: 16px;
          margin: 0 2px;
        }
      }
    }

    .panel-empty {
      padding: 40px 14px;
      text-align: center;
      color: var(--el-text-color-secondary);
      font-size: 13px;
    }

    .panel-body {
      overflow-y: auto;
      padding: 12px 14px;
    }

    .panel-section {
      margin-bottom: 14px;

      .section-heading {
        font-weight: 600;
        font-size: 13px;
        margin-bottom: 6px;
      }

      .section-item {
        display: flex;
        gap: 6px;
        font-size: 13px;
        line-height: 1.8;
        color: var(--el-text-color-regular);

        .item-no {
          flex-shrink: 0;
        }

        .item-stem {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* 小问数：弱化成灰色小字，别跟右侧分值抢 */
        .item-sub {
          flex-shrink: 0;
          padding: 0 6px;
          font-size: 12px;
          color: var(--el-text-color-secondary);
          background: var(--el-fill-color);
          border-radius: 3px;
        }

        .item-score {
          flex-shrink: 0;
          color: var(--el-color-primary);
        }
      }
    }
  }
</style>
