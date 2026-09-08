<!--
  首页四张指标卡

  四个数字都是「待办量」而非成就展示，故有值时着色、为 0 时保持中性。
  整卡可点，跳转由父级决定——本组件只负责展示，不认识路由。
-->

<template>
  <div class="stat-grid">
    <button type="button" class="stat-card" @click="emit('grading', 'pending')">
      <span class="stat-main">
        <span class="stat-label">待批阅答卷</span>
        <span class="stat-num">
          <span class="stat-value" :class="{ 'is-warn': pendingSheets > 0 }">
            {{ pendingSheets }}
          </span>
          <span class="stat-unit">份</span>
        </span>
      </span>
      <span class="stat-icon stat-icon--teal" aria-hidden="true">
        <ElIcon><DocumentChecked /></ElIcon>
      </span>
    </button>

    <button type="button" class="stat-card" @click="emit('grading')">
      <span class="stat-main">
        <span class="stat-label">成绩待发布</span>
        <span class="stat-num">
          <span class="stat-value" :class="{ 'is-warn': unpublishedSheets > 0 }">
            {{ unpublishedSheets }}
          </span>
          <span class="stat-unit">份</span>
        </span>
      </span>
      <span class="stat-icon stat-icon--orange" aria-hidden="true">
        <ElIcon><Promotion /></ElIcon>
      </span>
    </button>

    <button type="button" class="stat-card" @click="emit('exam')">
      <span class="stat-main">
        <span class="stat-label">进行中考试</span>
        <span class="stat-num">
          <span class="stat-value" :class="{ 'is-active': ongoingCount > 0 }">
            {{ ongoingCount }}
          </span>
          <span class="stat-unit">场</span>
        </span>
      </span>
      <span class="stat-icon stat-icon--blue" aria-hidden="true">
        <ElIcon><Monitor /></ElIcon>
      </span>
    </button>

    <button type="button" class="stat-card" @click="emit('exam')">
      <span class="stat-main">
        <!-- 只算已结束考试的缺考，进行中的「还没交」不是缺考 -->
        <span class="stat-label">缺考（已结束考试）</span>
        <span class="stat-num">
          <span class="stat-value">{{ absentCount }}</span>
          <span class="stat-unit">人</span>
        </span>
      </span>
      <span class="stat-icon stat-icon--red" aria-hidden="true">
        <ElIcon><UserFilled /></ElIcon>
      </span>
    </button>
  </div>
</template>

<script setup lang="ts">
  import { DocumentChecked, Promotion, Monitor, UserFilled } from '@element-plus/icons-vue'

  defineOptions({ name: 'DashboardStatCards' })

  defineProps<{
    pendingSheets: number
    unpublishedSheets: number
    ongoingCount: number
    absentCount: number
  }>()

  /** 卡片只发意图，具体跳哪个筛选态由首页决定 */
  const emit = defineEmits<{
    grading: [progress?: string]
    exam: []
  }>()
</script>

<style lang="scss" scoped>
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
  }

  // 用原生 button 而非 div：整卡可点，键盘可达、读屏能识别为按钮。
  // 去掉默认按钮样式后靠卡片自身的底色与描边表达可点性
  .stat-card {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    padding: 18px 20px;
    font: inherit;
    text-align: left;
    cursor: pointer;

    // 无边框无阴影、12px 圆角，与 exam/question-bank 等页的卡片一致
    background: var(--art-main-bg-color);
    border: none;
    border-radius: 12px;
    transition: background-color 0.15s;

    // 可点性靠 hover 底色变化表达，不用描边或阴影——本项目卡片一律无边框无阴影
    &:hover {
      background: var(--el-fill-color-light);
    }

    // 原生 button 去边框后默认焦点环不明显，键盘操作需要可见焦点
    &:focus-visible {
      outline: 2px solid var(--el-color-primary);
      outline-offset: 2px;
    }
  }

  // 左侧文字列：标签在上、数字在下
  .stat-main {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
    min-width: 0;
  }

  // 数字与单位同一行、底部对齐，单位不跟着大字号一起抬高
  .stat-num {
    display: flex;
    gap: 4px;
    align-items: baseline;
  }

  .stat-label {
    font-size: 13px;
    color: var(--el-text-color-regular);

    // 「缺考（已结束考试）」较长，窄屏下不换行会把图标挤出卡片
    white-space: nowrap;
  }

  // 数字是本卡的主角，字号拉开到 28px；等宽数字避免加载后跳动
  .stat-value {
    font-size: 28px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    color: var(--el-text-color-primary);

    // 待办量非 0 时着色提示，为 0 保持中性——0 是好事，不该染成警示色
    &.is-warn {
      color: var(--el-color-danger);
    }

    &.is-active {
      color: var(--el-color-primary);
    }
  }

  .stat-unit {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  /*
    图标块：浅色底 + 同色系图标，仅作视觉锚点不承载信息，
    故对读屏隐藏（aria-hidden），标签文字已足够说明这张卡是什么。
    尺寸固定，不参与 flex 压缩，避免长标签把它压扁。
  */
  .stat-icon {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    font-size: 22px;
    border-radius: 10px;

    &--teal {
      color: #0d9488;
      background: rgb(13 148 136 / 12%);
    }

    &--orange {
      color: #ea8c00;
      background: rgb(234 140 0 / 12%);
    }

    &--blue {
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
    }

    &--red {
      color: #e05252;
      background: rgb(224 82 82 / 12%);
    }
  }
</style>
