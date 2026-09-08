<!--
  组件名称：CompositeChildren - 材料题小题编辑器

  功能描述：
    维护一道材料题下的小题列表。每个小题有独立的题型、题干、
    选项/答案、分值，允许一道材料题下混合不同题型。
    材料题分值由小题分值之和派生，由后端重算，此处只做展示。

  使用方式：
    <CompositeChildren v-model="childList" :type-options="typeOptions" />

  属性说明：
    - modelValue：小题数组。既有小题带 id（保留），新增的不带 id
    - typeOptions：题型字典项（组件内部会排除 composite，禁止嵌套）
-->

<template>
  <div class="composite-children">
    <div class="children-header">
      <span class="children-title">小题（{{ list.length }}）</span>
      <span class="children-score">合计 {{ totalScore }} 分</span>
    </div>

    <div v-for="(child, idx) in list" :key="child.id ?? `new-${idx}`" class="child-card">
      <div class="child-bar">
        <span class="child-no">第 {{ idx + 1 }} 小题</span>
        <ElSelect
          v-model="child.type"
          class="child-type"
          size="small"
          @change="handleTypeChange(child)"
        >
          <ElOption
            v-for="it in childTypeOptions"
            :key="it.value"
            :label="it.name"
            :value="it.value"
          />
        </ElSelect>
        <!--
          :controls="false" 去掉上下箭头：卡片顶栏已经挤了序号、题型、分值、三个操作按钮，
          箭头既占宽又让这一行显得零碎；分值直接键入更快。
        -->
        <ElInputNumber
          v-model="child.suggestedScore"
          class="child-score"
          size="small"
          :min="0.5"
          :max="100"
          :precision="2"
          :step="1"
          :controls="false"
        />
        <span class="child-score-unit">分</span>
        <div class="child-actions">
          <ElButton link :icon="ArrowUp" :disabled="idx === 0" @click="moveChild(idx, -1)" />
          <ElButton
            link
            :icon="ArrowDown"
            :disabled="idx === list.length - 1"
            @click="moveChild(idx, 1)"
          />
          <ElButton link type="danger" :icon="Delete" @click="removeChild(idx)" />
        </div>
      </div>

      <!--
        题干是卡片里唯一的富文本项（选项与解析都改成纯文本了），
        故给完整工具栏——公式、列表、图示都可能用到。
      -->
      <ArtRichEditor
        v-model="child.stem"
        :placeholder="`第 ${idx + 1} 小题的题干`"
        :min-height="80"
      />

      <!-- 选择题：选项 + 勾选正确答案 -->
      <div v-if="isChoice(child)" class="child-options">
        <!--
          结构与普通题的选项行保持一致：序号用 span、勾选独立放右侧。
          原先把序号和勾选合成一个 ElRadio 塞在最左，ElRadio 自身是 inline-flex、
          其 label 会参与宽度计算，把输入框挤成一个字宽竖排。
        -->
        <ElRadioGroup v-if="child.type === 'single'" v-model="child.answer" class="option-rows">
          <div v-for="(opt, oi) in child.options" :key="oi" class="option-row">
            <span class="option-label">{{ opt.key }}</span>
            <!--
              选项用纯文本输入：内容是「A/B/C 选一个」的短文本，
              不需要加粗、列表、表格。需要富文本的是小题题干（可能含公式、图示）。
            -->
            <ElInput
              v-model="opt.value"
              :placeholder="`选项 ${opt.key} 内容`"
              maxlength="500"
              class="option-input"
            />
            <ElRadio :value="opt.key" class="option-mark">正确答案</ElRadio>
            <ElButton
              link
              type="danger"
              :icon="Delete"
              :disabled="child.options.length <= 2"
              @click="removeOption(child, oi)"
            />
          </div>
        </ElRadioGroup>

        <ElCheckboxGroup
          v-else
          :model-value="multipleChecked(child)"
          class="option-rows"
          @update:model-value="setMultipleAnswer(child, $event as string[])"
        >
          <div v-for="(opt, oi) in child.options" :key="oi" class="option-row">
            <span class="option-label">{{ opt.key }}</span>
            <ElInput
              v-model="opt.value"
              :placeholder="`选项 ${opt.key} 内容`"
              maxlength="500"
              class="option-input"
            />
            <ElCheckbox :value="opt.key" class="option-mark">正确答案</ElCheckbox>
            <ElButton
              link
              type="danger"
              :icon="Delete"
              :disabled="child.options.length <= 2"
              @click="removeOption(child, oi)"
            />
          </div>
        </ElCheckboxGroup>

        <ElButton
          link
          type="primary"
          :icon="Plus"
          :disabled="child.options.length >= 8"
          @click="addOption(child)"
        >
          添加选项
        </ElButton>
        <div class="child-hint">勾选右侧「正确答案」标记该小题的答案</div>
      </div>

      <!-- 判断题：固定正确/错误 -->
      <div v-else-if="child.type === 'judge'" class="child-answer">
        <span class="child-label">答案</span>
        <ElRadioGroup v-model="child.answer">
          <ElRadio value="正确">正确</ElRadio>
          <ElRadio value="错误">错误</ElRadio>
        </ElRadioGroup>
      </div>

      <!-- 其余题型（填空/问答/论述）：文本答案 -->
      <div v-else class="child-answer child-answer--text">
        <span class="child-label">答案</span>
        <ElInput
          v-model="child.answer"
          type="textarea"
          :rows="2"
          :placeholder="
            child.type === 'blank' ? '多个空请每行填一个，顺序与题干空位一致' : '请输入标准答案'
          "
          maxlength="2000"
          show-word-limit
        />
      </div>

      <!--
        每个小题各自的解析（选填）。用纯文本而非富文本：卡片里已有题干编辑器，
        再加一个会让工具栏堆叠。后端该字段按富文本存（上限 20000），纯文本也合法。
      -->
      <div class="child-answer child-answer--text">
        <span class="child-label">解析</span>
        <ElInput
          v-model="child.analysis"
          type="textarea"
          :rows="2"
          placeholder="该小题的答案解析（选填）"
          maxlength="2000"
          show-word-limit
        />
      </div>
    </div>

    <ElButton link type="primary" :icon="Plus" :disabled="list.length >= 20" @click="addChild">
      添加小题
    </ElButton>
    <div v-if="list.length === 0" class="children-empty">材料题至少需要一个小题</div>
  </div>
</template>

<script setup lang="ts">
  import { Plus, Delete, ArrowUp, ArrowDown } from '@element-plus/icons-vue'
  import ArtRichEditor from '@/components/core/forms/art-rich-editor/index.vue'

  import type { CompositeChild } from './types'

  const props = defineProps<{
    modelValue: CompositeChild[]
    typeOptions: { name: string; value: string }[]
  }>()

  const emit = defineEmits<{ 'update:modelValue': [CompositeChild[]] }>()

  /** 双向绑定的小题列表 */
  const list = computed({
    get: () => props.modelValue,
    set: (val) => emit('update:modelValue', val)
  })

  /**
   * 可选题型：排除 composite
   *
   * 禁止嵌套——小题不能再是材料题。后端 saveComposite 也有同样校验，
   * 此处从下拉里去掉是为了让约束在界面上就明确，而不是提交后才报错。
   */
  const childTypeOptions = computed(() => props.typeOptions.filter((t) => t.value !== 'composite'))

  /** 小题分值合计（材料题分值由后端按此重算，这里仅展示） */
  const totalScore = computed(() =>
    Math.round(list.value.reduce((sum, c) => sum + (Number(c.suggestedScore) || 0), 0) * 100) / 100
  )

  /** 选项序号：A、B、C…… */
  const optionLabel = (idx: number) => String.fromCharCode(65 + idx)

  /** 某小题是否为选择题（需要维护选项列表） */
  const isChoice = (child: CompositeChild) => child.type === 'single' || child.type === 'multiple'

  /** 新增一个小题（默认单选、两个空选项） */
  function addChild() {
    list.value = [
      ...list.value,
      {
        type: 'single',
        stem: '',
        options: [
          { key: 'A', value: '' },
          { key: 'B', value: '' }
        ],
        answer: '',
        analysis: '',
        difficulty: 'medium',
        suggestedScore: 5
      }
    ]
  }

  /** 删除某个小题 */
  function removeChild(idx: number) {
    list.value = list.value.filter((_, i) => i !== idx)
  }

  /**
   * 上下移动小题（数组顺序即 sortNo，决定卷面与答题卡顺序）
   * @param idx 当前下标
   * @param delta -1 上移 / 1 下移
   */
  function moveChild(idx: number, delta: number) {
    const target = idx + delta
    if (target < 0 || target >= list.value.length) return
    const next = [...list.value]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    list.value = next
  }

  /**
   * 小题题型变更：重置与旧题型绑定的选项与答案
   *
   * 不重置会留下脏数据——例如从单选切到问答后，选项还挂着 A/B/C，
   * 提交时后端按问答题处理、选项被丢弃，但答案格式已经对不上。
   */
  function handleTypeChange(child: CompositeChild) {
    child.answer = ''
    if (isChoice(child)) {
      child.options = [
        { key: 'A', value: '' },
        { key: 'B', value: '' }
      ]
    } else if (child.type === 'judge') {
      // 判断题选项固定且为纯文本：其 answer 直接存选项文本，改富文本会打断判分
      child.options = [
        { key: '正确', value: '正确' },
        { key: '错误', value: '错误' }
      ]
    } else {
      child.options = []
    }
  }

  /** 给某小题添加选项 */
  function addOption(child: CompositeChild) {
    if (child.options.length >= 8) return
    child.options = [...child.options, { key: optionLabel(child.options.length), value: '' }]
  }

  /**
   * 删除某小题的一个选项
   *
   * 删除后序号要重排（A/B/C 连续），这意味着**留下来的选项 key 会变**——
   * 例如 A/B/C 删掉 B，原来的 C 变成新的 B。所以答案不能只「过滤掉被删的 key」，
   * 必须按「旧 key → 新 key」整体迁移，否则答案会静默指向另一个选项：
   * 上例中答案 C 若不迁移，就会落在一个已不存在的 key 上（单选变成未选、
   * 多选丢掉该项），而考生看到的正确答案与命题人的本意不一致。
   */
  function removeOption(child: CompositeChild, idx: number) {
    if (child.options.length <= 2) return

    const kept = child.options.filter((_, i) => i !== idx)
    // 旧 key → 新 key 的映射；被删项不在其中，迁移时自然丢弃
    const remap = new Map<string, string>()
    kept.forEach((o, i) => remap.set(o.key, optionLabel(i)))

    child.options = kept.map((o, i) => ({ ...o, key: optionLabel(i) }))

    if (child.type === 'single') {
      child.answer = remap.get(child.answer) ?? ''
    } else if (child.type === 'multiple') {
      child.answer = child.answer
        .split(',')
        .filter(Boolean)
        .map((k) => remap.get(k))
        .filter((k): k is string => !!k)
        .join(',')
    }
  }

  /** 多选答案的勾选状态（answer 存逗号分隔字母） */
  const multipleChecked = (child: CompositeChild) =>
    child.answer ? child.answer.split(',').filter(Boolean) : []

  /** 多选答案变更 */
  function setMultipleAnswer(child: CompositeChild, keys: string[]) {
    // 按选项顺序排序，保证「A,C」而不是「C,A」，便于人工核对
    const ordered = child.options.map((o) => o.key).filter((k) => keys.includes(k))
    child.answer = ordered.join(',')
  }
</script>

<style lang="scss" scoped>
  .composite-children {
    width: 100%;
  }

  .children-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;

    .children-title {
      font-size: 14px;
      font-weight: 500;
    }

    .children-score {
      font-size: 13px;
      color: var(--art-text-gray-600);
    }
  }

  /* 每道小题一张卡，左侧色条强调从属于上方材料 */
  /*
   * 白底细描边而非灰底 + 主题色左边框：卡片里几乎全是输入控件，
   * 灰底会和输入框的白底打架、看着像禁用态，边框色块也在抢注意力。
   * 用一圈浅描边划出归属就够了，深色主题下靠 --art-main-bg-color 自动跟随。
   */
  .child-card {
    padding: 14px;
    margin-bottom: 12px;
    background: var(--art-main-bg-color);
    border: 1px solid var(--art-border-color);
    border-radius: 8px;

    &:hover {
      border-color: var(--el-color-primary-light-7);
    }
  }

  .child-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;

    .child-no {
      font-size: 13px;
      font-weight: 500;
    }

    .child-type {
      width: 96px;
    }

    /* 去掉箭头后不需要留出按钮位，"100.00" 五字符 64px 够用 */
    .child-score {
      width: 64px;

      /* 窄框里居中比左对齐好认 */
      :deep(.el-input__inner) {
        text-align: center;
      }
    }

    .child-score-unit {
      font-size: 13px;
      color: var(--art-text-gray-600);
    }

    /* 操作按钮推到最右，避免随题型下拉宽度浮动 */
    .child-actions {
      display: flex;
      gap: 2px;
      margin-left: auto;
    }
  }

  .child-options {
    margin-top: 10px;
  }

  /* 选项行：序号 + 富文本内容 + 删除，纵向排列多行 */
  .option-rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  }

  /* 与普通题的选项行样式保持一致，避免同一功能两套观感 */
  .option-row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;

    .option-label {
      flex-shrink: 0;
      width: 22px;
      height: 22px;
      line-height: 22px;
      text-align: center;
      font-size: var(--el-font-size-base);
      font-weight: 600;
      border-radius: 50%;
      background: var(--el-fill-color-light);
    }

    .option-input {
      flex: 1;
      min-width: 0;
    }

    .option-mark {
      flex-shrink: 0;
      margin-right: 0;
    }
  }

  .child-answer {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 10px;

    &--text {
      align-items: flex-start;
    }
  }

  .child-label {
    flex-shrink: 0;
    font-size: 13px;
    color: var(--art-text-gray-700);
  }

  .child-hint,
  .children-empty {
    margin-top: 6px;
    font-size: 12px;
    color: var(--art-text-gray-500);
  }

  .children-empty {
    color: var(--el-color-danger);
  }
</style>
