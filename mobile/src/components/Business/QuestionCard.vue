<!--
  组件名称：QuestionCard - 题目作答卡片

  功能描述：
    按题型渲染作答控件，支持单选、多选、判断、填空、简答五种题型
    考试作答与在线练习共用，通过 disabled 控制是否可修改

  使用方式：
    <QuestionCard v-model="answer" :question="question" :index="1" :total="10" />

  属性说明：
    - question：题目对象（含 type、content、options）
    - modelValue：当前作答（多选为数组，其余为字符串）
    - index/total：题号与总题数，用于题干前缀展示
    - disabled：是否禁止修改（已交卷或已提交练习后为 true）
-->

<template>
  <div class="question-card">
    <!-- 题干 -->
    <header class="question-header">
      <van-tag plain type="primary">{{ typeText }}</van-tag>
      <span v-if="total" class="question-index">{{ index }} / {{ total }}</span>
      <span v-if="question.score" class="question-score">{{ question.score }} 分</span>

      <!-- 页面级操作位：练习页放收藏，考试页不传即不占位 -->
      <span v-if="$slots.actions" class="question-actions">
        <slot name="actions" />
      </span>
    </header>

    <!--
      题干用 v-html 渲染富文本（图文混排）。
      内容已在服务端写入题目时经 sanitizeRichText 净化（白名单标签、
      img 仅放行站内 /uploads 与 data:image），此处不再二次处理。
    -->
    <div class="question-content rich-text" v-html="question.content"></div>

    <!--
      材料题：只展示共享材料，不渲染任何作答控件。
      其小题作为独立的 QuestionCard 紧随其后渲染（见 CompositeGroup）。
    -->
    <p v-if="isComposite" class="composite-hint">请阅读上方材料，回答下列小题</p>

    <!-- 单选 / 判断：单选组 -->
    <van-radio-group
      v-else-if="isRadio"
      :model-value="modelValue"
      :disabled="disabled"
      class="option-group"
      @update:model-value="emitChange"
    >
      <van-radio
        v-for="option in question.options"
        :key="option.key"
        :name="option.key"
        class="option-item"
        :class="{ 'option-item--checked': isChecked(option.key) }"
      >
        <!-- 选项支持富文本（如图片选项），序号与内容分开渲染 -->
        <span v-if="!isJudge" class="option-key">{{ option.key }}.</span>
        <span class="option-value rich-text" v-html="option.value"></span>
      </van-radio>
    </van-radio-group>

    <!-- 多选：复选组 -->
    <van-checkbox-group
      v-else-if="isCheckbox"
      :model-value="normalizedArray"
      :disabled="disabled"
      class="option-group"
      @update:model-value="emitChange"
    >
      <van-checkbox
        v-for="option in question.options"
        :key="option.key"
        :name="option.key"
        shape="square"
        class="option-item"
        :class="{ 'option-item--checked': isChecked(option.key) }"
      >
        <span v-if="!isJudge" class="option-key">{{ option.key }}.</span>
        <span class="option-value rich-text" v-html="option.value"></span>
      </van-checkbox>
    </van-checkbox-group>

    <!--
      填空：每空一个独立输入框
      原先是一个 textarea 让考生按换行分隔多个空，考生得自己数第几行对应第几空，
      漏填一行后面全部错位，且题干里的空位与输入区没有任何对应关系。
      拆成带「第 N 空」标注的独立框后，位置关系是显式的。
      单空时不显示标注，避免只有一个框还标「第 1 空」的冗余。
    -->
    <template v-else-if="question.type === QUESTION_TYPE.BLANK">
      <!-- 题干没标出空位：填了也必然判错，如实告知而不是给个假的输入框 -->
      <div v-if="blankMisconfigured" class="blank-error">
        该题空位配置异常，请联系监考老师
      </div>
      <div v-else class="blank-list">
        <div v-for="(item, i) in blankValues" :key="i" class="blank-item">
          <span v-if="blankValues.length > 1" class="blank-label">第 {{ i + 1 }} 空</span>
          <van-field
            :model-value="item"
            :disabled="disabled"
            class="answer-field"
            :placeholder="blankValues.length > 1 ? `请输入第 ${i + 1} 空答案` : '请输入答案'"
            :maxlength="blankMaxLength"
            @update:model-value="(val) => updateBlank(i, val)"
          />
        </div>
      </div>
    </template>

    <!-- 问答 / 论述：多行输入，带字数统计 -->
    <van-field
      v-else-if="question.type === QUESTION_TYPE.QA || question.type === QUESTION_TYPE.ESSAY"
      :model-value="modelValue"
      :disabled="disabled"
      class="answer-field"
      type="textarea"
      rows="4"
      autosize
      maxlength="500"
      show-word-limit
      placeholder="请输入答案"
      @update:model-value="emitChange"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { QUESTION_TYPE, QUESTION_TYPE_TEXT } from '@/constants/exam'

const props = defineProps({
  /** 题目对象 */
  question: {
    type: Object,
    required: true
  },
  /** 当前作答：多选为数组，其余为字符串 */
  modelValue: {
    type: [String, Array],
    default: ''
  },
  /** 当前题号（从 1 开始） */
  index: {
    type: Number,
    default: 0
  },
  /** 总题数，为 0 时不展示题号 */
  total: {
    type: Number,
    default: 0
  },
  /** 是否禁止修改作答 */
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'change'])

/** 题型展示文案 */
const typeText = computed(
  () => props.question.typeText || QUESTION_TYPE_TEXT[props.question.type] || '题目'
)

/** 是否为单选类题型（单选、判断） */
const isRadio = computed(
  () => props.question.type === QUESTION_TYPE.SINGLE || props.question.type === QUESTION_TYPE.JUDGE
)

/** 是否为多选题型 */
const isCheckbox = computed(() => props.question.type === QUESTION_TYPE.MULTIPLE)

/** 多选作答归一化为数组，避免父组件传入非数组导致渲染异常 */
const normalizedArray = computed(() =>
  Array.isArray(props.modelValue) ? props.modelValue : []
)

/**
 * 判断选项是否被选中
 * Vant 4 的 --checked 修饰类只落在内部图标节点上，根节点没有，
 * 因此选中态的整块底色与描边只能靠自行判定后挂类名实现。
 * @param {string} key - 选项号
 * @returns {boolean} 是否选中
 */
const isChecked = (key) => {
  if (isCheckbox.value) return normalizedArray.value.includes(key)
  return props.modelValue === key
}

/**
 * 是否为判断题
 *
 * 判断题的选项文本本身就是答案（"正确"/"错误"），不带 A/B 字母序号，
 * 故渲染时不显示序号前缀。
 */
const isJudge = computed(() => props.question.type === QUESTION_TYPE.JUDGE)

/**
 * 是否为材料题
 *
 * 材料题不可作答，只渲染材料；后端下发时它与其小题一同出现在题目列表里，
 * 材料题的 score 为 0、不占作答位。
 */
const isComposite = computed(() => props.question.type === QUESTION_TYPE.COMPOSITE)

/**
 * 作答变更时同步父组件并抛出 change 事件（供自动保存使用）
 * @param {string|string[]} value - 新的作答值
 */
const emitChange = (value) => {
  emit('update:modelValue', value)
  emit('change', value)
}

/**
 * 填空题的空位数量
 *
 * 直接用后端下发的 blankCount，不在前端自己数题干下划线。
 * 判分是按 answer.split('\n') 逐空比对、段数不等直接判错，
 * 空位数必须与判分侧同源；前端自己实现一份正则，遇到「下划线中间被富文本标签打断」
 * 这类写法两边会算出不同的数，考生会莫名其妙丢分。
 */
const blankCount = computed(() => {
  if (props.question.type !== QUESTION_TYPE.BLANK) return 0
  return Number(props.question.blankCount) || 0
})

/**
 * 题目配置是否异常（填空题但没标出空位）
 *
 * 后端建题时会校验至少一个空，正常题不会到这里；
 * 但校验上线前建的历史题可能一个空都没有。这种题的存量答案若是多段，
 * 考生按单框填必然因段数不等而判错——属于「能填但必错」，
 * 所以宁可显式提示异常，也不静默给一个看似正常的输入框。
 */
const blankMisconfigured = computed(
  () => props.question.type === QUESTION_TYPE.BLANK && blankCount.value < 1
)

/** 后端对整题答案的长度上限，各空之和不得超过它 */
const ANSWER_MAX_LENGTH = 2000

/**
 * 单空的输入上限
 *
 * 每空按 200 字放开（与改为多框前的单框上限一致，不让单空题的容量倒退），
 * 但空数很多时按「总上限扣掉分隔符后均分」收紧，
 * 否则各空都填满会超出后端 2000 字校验，交卷时才报错就太晚了。
 */
const blankMaxLength = computed(() => {
  const count = blankCount.value || 1
  const separators = count - 1
  return Math.min(200, Math.floor((ANSWER_MAX_LENGTH - separators) / count))
})

/** 各空的当前值，长度补齐到空位数，缺失的空补空串 */
const blankValues = computed(() => {
  const parts = String(props.modelValue || '').split('\n')
  return Array.from({ length: blankCount.value }, (_, i) => parts[i] ?? '')
})

/**
 * 更新第 i 个空
 *
 * 始终按空位数拼满 \n 分隔的字符串，中间空着的也要留出分隔符，
 * 否则只填了第二空时答案会跑到第一空的位置上。
 * 全部为空时回到空串，避免只剩分隔符的 "\n\n" 被当成作答内容存下去。
 * @param {number} i - 空位序号（从 0 开始）
 * @param {string} value - 该空的新值
 */
const updateBlank = (i, value) => {
  const next = [...blankValues.value]
  next[i] = value
  emitChange(next.some((item) => item.trim()) ? next.join('\n') : '')
}
</script>

<style scoped>
.question-card {
  background-color: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: var(--spacing-md);
}

.question-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

/* 题型标签：主色描边小胶囊 */
.question-header :deep(.van-tag--plain) {
  padding: 5px 10px;
  font-size: 12px;
  border-radius: 6px;
}

.question-index {
  font-size: 13px;
  color: var(--text-disabled);
}

/* 分值靠右对齐 */
/* 操作位靠右，与题型标签、题号同一行 */
.question-actions {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
}

.question-score {
  margin-left: auto;
  font-size: 13px;
  color: var(--warning-color);
}

/* 题干加粗，与选项形成层级差 */
.question-content {
  margin: 14px 0 20px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.75;
}

/*
 * 富文本内容通用样式（题干与选项共用）
 *
 * 图片必须限宽：题库里的图片尺寸不可控，不限宽会横向撑破屏幕导致整页可横向滚动。
 * 用 :deep 是因为 v-html 插入的节点不带 scoped 属性，scoped 选择器命中不到。
 */
.rich-text :deep(img) {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 8px 0;
  border-radius: 8px;
}

/* v-html 的段落自带上下边距，首尾段落去掉以免与卡片间距叠加 */
.rich-text :deep(p) {
  margin: 0 0 8px;
}

.rich-text :deep(p:last-child) {
  margin-bottom: 0;
}

/* 表格在窄屏可横向滚动，不挤压正文 */
.rich-text :deep(table) {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
}

.rich-text :deep(td),
.rich-text :deep(th) {
  padding: 6px 10px;
  border: 1px solid var(--border-color, #e5e5e5);
}

/* 材料题提示语：材料与小题之间的分隔说明 */
.composite-hint {
  margin: 0;
  padding: 10px 12px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  background-color: var(--bg-fill);
  border-radius: 8px;
}

/* 选项组 */
.option-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/*
 * 选项整行可点，触摸高度不低于 44px。
 * 未选中用浅灰底 + 透明边框，选中时只换底色与边框颜色，
 * 边框始终占位以免选中瞬间行高跳动。
 */
.option-item {
  min-height: 56px;
  padding: 16px;
  font-size: 15px;
  line-height: 1.6;
  background-color: var(--bg-fill);
  border: 1px solid transparent;
  border-radius: 12px;
  transition: background-color 0.2s, border-color 0.2s;
}

/*
 * Vant 的标签容器默认是行内块，图片选项会与序号错位。
 * 改成 flex 顶端对齐：序号在左固定，内容在右自适应。
 */
.option-item :deep(.van-radio__label),
.option-item :deep(.van-checkbox__label) {
  display: flex;
  align-items: flex-start;
  width: 100%;
  margin-left: 8px;
}

/*
 * 选项序号与内容并排：序号不收缩，内容占满剩余宽度。
 * 内容改用富文本后可能是图片或多段文本，min-width:0 防止其撑破行宽。
 */
.option-key {
  flex-shrink: 0;
  margin-right: 6px;
  font-weight: 600;
}

.option-value {
  flex: 1;
  min-width: 0;
}

/* 描边画在 van-field 根节点上，故内边距也给根节点，让文字与字数统计都离开边框 */
.answer-field {
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: 15px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
}

/* 填空题：多个空竖排，间距比框内 padding 大一档，让每组标注与框读作一体 */
.blank-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.blank-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

/*
  「第 N 空」标注放在框左侧而非上方：竖排多空时上方标注会把整块拉得很长，
  横排每行只占一行高度，一屏能看到更多空。
  定宽 + 不收缩，保证多空时所有输入框左边界对齐。
*/
/* 定宽 54px 而非 44px：要放得下「第 10 空」的两位数题号而不换行 */
.blank-label {
  flex-shrink: 0;
  width: 54px;
  font-size: 13px;
  line-height: 18px;
  color: var(--text-secondary);
}

/* 空位配置异常提示：用警示橙而非红，题目有问题不是考生的操作出错 */
.blank-error {
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid #ffd0a6;
  border-radius: var(--radius-md);
  background-color: #fff3e8;
  font-size: 14px;
  line-height: 20px;
  color: #d25f00;
}

/* 输入框占满标注之外的剩余宽度 */
.blank-item .answer-field {
  flex: 1;
  min-width: 0;
}

/* 选中项：主色浅底 + 主色描边 */
.option-item--checked {
  background-color: var(--primary-light);
  border-color: var(--primary-color);
}

/* 勾选框未选中态给白底描边，压在浅灰选项块上才有对比 */
:deep(.van-checkbox__icon .van-icon),
:deep(.van-radio__icon .van-icon) {
  background-color: var(--bg-card);
  border-color: #d6d9e0;
}

/* 选中态由主色填充，勾/点为白色 */
:deep(.van-checkbox__icon--checked .van-icon),
:deep(.van-radio__icon--checked .van-icon) {
  background-color: var(--primary-color);
  border-color: var(--primary-color);
}

/* 选项文案与勾选框留出间距，长文案换行后与首行左对齐 */
:deep(.van-checkbox__label),
:deep(.van-radio__label) {
  margin-left: 12px;
  color: var(--text-primary);
}

/* 禁用态（已提交）保留原有配色，只降低文字对比度 */
:deep(.van-checkbox--disabled .van-checkbox__label),
:deep(.van-radio--disabled .van-radio__label) {
  color: var(--text-secondary);
}
</style>
