<!--
  组件名称：ExamAnswerFooter - 考试作答页底部操作区

  功能描述：
    底部固定操作栏：答题卡入口 + 上一题 / 下一题 + 末页转为交卷
    答题卡以弹层形式承载，内含题号网格与常驻交卷入口

  使用方式：
    <ExamAnswerFooter
      :pages="pages"
      :current-index="currentIndex"
      :is-answered="isAnswered"
      :submitting="submitting"
      @prev="currentIndex -= 1"
      @next="currentIndex += 1"
      @select="currentIndex = $event"
      @submit="handleSubmit"
    />

  属性说明：
    - pages：翻页单位列表（AnswerSheetCard 的契约形态，materia 题组占一格）
    - currentIndex：当前页下标
    - isAnswered：判断某题是否已作答的方法，入参为题目 ID
    - submitting：交卷进行中，用于按钮 loading 与防重复点击
-->

<template>
  <div>
    <footer class="answer-footer">
      <button
        type="button"
        class="footer-icon-btn"
        aria-label="打开答题卡"
        @click="sheetVisible = true"
      >
        <van-icon name="apps-o" size="20" />
      </button>

      <van-button class="footer-btn" round :disabled="currentIndex === 0" @click="emit('prev')">
        上一题
      </van-button>
      <van-button
        v-if="currentIndex < pages.length - 1"
        class="footer-btn"
        type="primary"
        round
        @click="emit('next')"
      >
        下一题
      </van-button>
      <van-button
        v-else
        class="footer-btn"
        type="primary"
        round
        :loading="submitting"
        :class="{ 'is-blocked': submitDisabled }"
        :aria-disabled="submitDisabled"
        @click="handleSubmitClick"
      >
        交卷
      </van-button>
    </footer>

    <!-- 答题卡弹层：跳题与提前交卷（材料题组占一格） -->
    <van-popup v-model:show="sheetVisible" position="bottom" round>
      <div class="sheet-popup">
        <AnswerSheetCard
          :questions="pages"
          :current-index="currentIndex"
          :is-answered="isAnswered"
          @select="handleSelect"
        />

        <!--
          跳题后底栏主按钮只在最后一页才是「交卷」，
          停在中间页时没有交卷入口，故在此常驻一个。
        -->
        <van-button
          class="sheet-submit-btn"
          type="primary"
          block
          round
          :loading="submitting"
          :class="{ 'is-blocked': submitDisabled }"
          :aria-disabled="submitDisabled"
          @click="handleSubmitClick"
        >
          交卷
        </van-button>

        <!--
          交卷被禁的原因写在按钮下方：只把按钮置灰，考生不知道为什么点不了，
          会反复点或以为页面坏了。文案由父级给（不允许提前交卷 / 还需答多久）。
        -->
        <p v-if="submitDisabled && submitTip" class="sheet-submit-tip">
          {{ submitTip }}
        </p>
      </div>
    </van-popup>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { showToast } from 'vant'
import AnswerSheetCard from '@/components/Business/AnswerSheetCard.vue'

const props = defineProps({
  /** 翻页单位列表 */
  pages: {
    type: Array,
    default: () => []
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
  },
  /** 交卷进行中 */
  submitting: {
    type: Boolean,
    default: false
  },
  /**
   * 交卷是否被禁（不允许提前交卷、或未满最短作答时长）
   * 默认 false：缺参时可交，不因漏传把考生的交卷入口锁死
   */
  submitDisabled: {
    type: Boolean,
    default: false
  },
  /** 交卷被禁的原因文案，展示在答题卡的交卷按钮下方 */
  submitTip: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['prev', 'next', 'select', 'submit'])

/**
 * 交卷点击：被禁时不交卷，改把原因 toast 出来
 *
 * 刻意不用 van-button 的 disabled——它会吞掉 click 事件，考生点了毫无反馈，
 * 只会反复点或以为页面卡了。改为保留可点击、用 .is-blocked 做置灰观感，
 * 点击时给出具体原因（不允许提前交卷 / 还需答多久）。
 *
 * 同时给 aria-disabled 而非 disabled：前者只声明状态、不吞事件，
 * 正是这里要的——读屏念出「不可用」与视觉一致，点击仍能拿到原因提示。
 */
const handleSubmitClick = () => {
  if (props.submitDisabled) {
    if (props.submitTip) showToast(props.submitTip)
    return
  }
  emit('submit')
}

// 答题卡弹层是否展开（纯 UI 状态，不必上提到页面）
const sheetVisible = ref(false)

/**
 * 选中题号：跳页并收起弹层
 * @param {number} index - 目标页下标
 */
const handleSelect = (index) => {
  emit('select', index)
  sheetVisible.value = false
}
</script>

<style scoped>
/* 底部固定操作栏：答题卡图标 + 翻页按钮，无分隔线（与练习页一致） */
.answer-footer {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
  background-color: var(--bg-card);
}

/* 方形图标按钮，尺寸与主按钮等高 */
.footer-icon-btn {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  color: var(--text-secondary);
  background-color: var(--bg-fill);
  border: none;
  border-radius: 12px;
  cursor: pointer;
}

.footer-btn {
  flex: 1;
  min-width: 0;
  height: 48px;
  font-size: 16px;
  font-weight: 500;
}

/* 答题卡弹层 */
.sheet-popup {
  padding: var(--spacing-md);
  padding-bottom: calc(var(--spacing-md) + env(safe-area-inset-bottom));
}

.sheet-submit-btn {
  margin-top: var(--spacing-md);
  height: 44px;
}

/*
  交卷被限制时的观感：置灰但仍可点（点击给原因，见 handleSubmitClick）。
  不用 van-button 的 disabled 属性，故这里要自己压掉主色。
  opacity 之外还要显式压背景与边框：van-button 的主色是背景色，
  只降透明度会得到一个半透明的蓝，看起来像加载中而不是不可用。
*/
.footer-btn.is-blocked,
.sheet-submit-btn.is-blocked {
  background-color: var(--bg-fill);
  border-color: var(--border-color);
  color: var(--text-secondary);
}

/* 交卷受限原因：紧跟答题卡里的交卷按钮，居中小字 */
.sheet-submit-tip {
  margin: var(--spacing-sm) 0 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-secondary);
  text-align: center;
}
</style>
