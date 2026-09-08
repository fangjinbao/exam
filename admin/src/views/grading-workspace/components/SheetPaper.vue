<!--
  阅卷工作台中栏卷面：按题型分大题逐题批阅
  主观题可打分（✓给满分 / ✗给零分 / 直接填分）；客观题只读，仅展示自动判分结果。
-->

<template>
  <div v-loading="loading" class="paper">
    <section v-for="(section, sIdx) in sections" :key="section.type" class="section">
      <header class="section-head">
        <h3 class="section-title">{{ cnNumeral(sIdx) }}、{{ typeLabel(section.type) }}</h3>
        <p class="section-sub"> （本题共{{ section.count }}小题，共{{ section.totalScore }}分） </p>
      </header>

      <article v-for="item in section.items" :id="`q-${item.id}`" :key="item.id" class="question">
        <div class="q-stem">
          <span class="q-index">{{ item.indexInSection }}.</span>
          <!-- 题干为管理端录入的富文本，按 HTML 渲染 -->
          <div class="rich-text" v-html="item.stem"></div>
          <span class="q-full">（{{ item.fullScore }}分）</span>
        </div>

        <!-- 选择题列出选项，否则阅卷员看不出考生选的是什么 -->
        <ul v-if="optionsOf(item).length" class="q-options">
          <li v-for="(opt, i) in optionsOf(item)" :key="i">{{ opt }}</li>
        </ul>

        <div class="q-body">
          <!-- 考生答案是阅卷时最主要的阅读对象，独立成块并给足字号，不与参考信息同权重 -->
          <div class="answer-block">
            <span class="block-label">考生答案</span>
            <!-- 考生提交的内容，只按纯文本渲染，不能 v-html -->
            <div class="answer-body" :class="{ 'is-empty': !item.candidateAnswer }">
              {{ item.candidateAnswer || '未作答' }}
            </div>
          </div>

          <!-- 标准答案与评分标准是比对用的参考信息，弱化处理 -->
          <div
            v-if="item.standardAnswer || !isRichTextEmpty(item.scoringCriteria)"
            class="ref-block"
          >
            <div v-if="item.standardAnswer" class="q-row">
              <span class="row-label">标准答案</span>
              <span class="answer-text">{{ item.standardAnswer }}</span>
            </div>
            <div v-if="!isRichTextEmpty(item.scoringCriteria)" class="q-row">
              <span class="row-label">评分标准</span>
              <div class="rich-text criteria" v-html="item.scoringCriteria"></div>
            </div>
          </div>

          <!-- 评分区：阅卷员唯一要动手的地方，用左侧色条与上分隔线抬高视觉权重 -->
          <div class="score-block">
            <!-- 客观题由系统判分，此处只读；主观题给快捷满分/零分 + 手填 -->
            <template v-if="item.questionCategory === 'objective'">
              <span class="block-label">得分</span>
              <span class="score-readonly">{{ formatScore(item.score) }}</span>
              <span class="score-total">/ {{ formatScore(item.fullScore) }} 分</span>
              <ElTag
                v-if="item.isCorrect !== null"
                :type="item.isCorrect ? 'success' : 'danger'"
                size="small"
                disable-transitions
              >
                {{ item.isCorrect ? '正确' : '错误' }}
              </ElTag>
              <span class="auto-hint">系统自动判分</span>
            </template>
            <!--
              已批阅的主观题只读展示：分数 + 阅卷人 + 批阅时间 + 评语。
              批阅完还留着一排输入框，阅卷员分不清哪些是待办、也容易误触改掉已确认的分。
              要改分须先解锁（成绩已发布时得先撤回成绩），入口在页头。
            -->
            <template v-else-if="isLocked(item)">
              <span class="block-label">得分</span>
              <span class="score-readonly">{{ formatScore(item.score) }}</span>
              <span class="score-total">/ {{ formatScore(item.fullScore) }} 分</span>
              <span v-if="item.reviewerName" class="review-meta">
                {{ reviewMetaText(item) }}
              </span>
              <div v-if="item.reviewComment" class="review-comment">
                <span class="comment-label">评语</span>
                <span class="comment-text">{{ item.reviewComment }}</span>
              </div>
            </template>
            <template v-else>
              <span class="block-label">评分</span>
              <ElInputNumber
                :model-value="item.draftScore ?? item.score"
                :min="0"
                :max="item.fullScore"
                :precision="1"
                :step="1"
                :controls="false"
                :disabled="readonly"
                class="score-input"
                @update:model-value="setScore(item, $event ?? null)"
              />
              <span class="score-total">/ {{ formatScore(item.fullScore) }} 分</span>
              <!--
                满分/零分做成分段控件而非 ElButton type：
                Element 的 success/danger 是实心填充，与相邻未选中按钮的描边样式撞色，
                两个按钮又都是「快捷填分」的同级操作，用不同强调色会读成两个主操作。
                这里默认全中性、仅选中项着色，用原生 button 避开主题对 ElButton 的覆盖。
              -->
              <div class="quick-seg" role="group" aria-label="快捷打分">
                <button
                  type="button"
                  class="seg-btn"
                  :class="{ 'is-active-full': isFull(item) }"
                  :disabled="readonly"
                  :aria-pressed="isFull(item)"
                  @click="setScore(item, item.fullScore)"
                >
                  满分
                </button>
                <button
                  type="button"
                  class="seg-btn"
                  :class="{ 'is-active-zero': isZero(item) }"
                  :disabled="readonly"
                  :aria-pressed="isZero(item)"
                  @click="setScore(item, 0)"
                >
                  零分
                </button>
              </div>
              <ElInput
                :model-value="item.draftComment"
                placeholder="评语（选填）"
                maxlength="500"
                :disabled="readonly"
                class="comment-input"
                @update:model-value="setComment(item, $event)"
              />
            </template>
          </div>
        </div>
      </article>
    </section>

    <ElEmpty v-if="!loading && !sections.length" :description="emptyText" />
  </div>
</template>

<script setup lang="ts">
  import { formatScore } from '@/api/grading'
  import { cnNumeral, splitOptions } from '@/utils/paperStructure'
  import { isRichTextEmpty } from '@/utils/richText'
  import type { GradingRow, GradingSection } from '../types'

  defineOptions({ name: 'SheetPaper' })

  const props = defineProps<{
    sections: GradingSection[]
    loading: boolean
    /** 成绩已发布时禁止改分，须先撤回 */
    readonly: boolean
    /**
     * 是否已解锁改分
     *
     * 未解锁时已批阅的主观题只读展示；解锁后回到可编辑，用于纠正打错的分。
     * 解锁只在成绩未发布时可用（已发布须先撤回），由父组件把关。
     */
    unlocked: boolean
    /** 题型 value → 中文名 */
    typeLabel: (type: string) => string
    /** 空态文案（待批阅页签与全部页签的含义不同） */
    emptyText: string
  }>()

  const emit = defineEmits<{
    (e: 'score', payload: { id: number; score: number | null }): void
    (e: 'comment', payload: { id: number; comment: string }): void
  }>()

  /** 选项原文解析为可直接展示的字符串数组 */
  function optionsOf(item: GradingRow): string[] {
    return splitOptions(item.options)
  }

  /**
   * 该主观题是否锁定为只读展示
   *
   * 判据是「这道题已经有分了」而非整卷状态：一份卷允许分多次阅完，
   * 按整卷判会把同一份卷里已阅和待阅的题一起锁掉或一起放开。
   * 解锁后一律可编辑，否则撤回成绩也改不了分。
   */
  function isLocked(item: GradingRow): boolean {
    return !props.unlocked && item.score !== null
  }

  /**
   * 署名文案：「admin 批阅 · 08-23 18:28」
   *
   * 时间砍掉年份与秒：阅卷是当下的事，年份基本恒等于今年，秒更无人关心，
   * 全量时间戳只会把署名撑成一长串，跟旁边的分数抢注意力。
   * 需要精确时间可查评分记录（留痕表里有完整时间）。
   */
  function reviewMetaText(item: GradingRow): string {
    const who = `${item.reviewerName} 批阅`
    if (!item.reviewTime) return who
    // 后端统一下发 'YYYY-MM-DD HH:mm:ss'，切出 'MM-DD HH:mm'
    const short = item.reviewTime.slice(5, 16)
    return `${who} · ${short}`
  }

  /** 当前生效分数（草稿优先）等于满分 */
  function isFull(item: GradingRow): boolean {
    return (item.draftScore ?? item.score) === item.fullScore
  }

  function isZero(item: GradingRow): boolean {
    return (item.draftScore ?? item.score) === 0
  }

  function setScore(item: GradingRow, score: number | null) {
    if (props.readonly) return
    emit('score', { id: item.id, score })
  }

  function setComment(item: GradingRow, comment: string) {
    emit('comment', { id: item.id, comment })
  }
</script>

<style lang="scss" scoped>
  .paper {
    min-height: 200px;
  }

  .section {
    margin-bottom: 20px;
  }

  // 扁平化：大题标题不用下划线，靠字重与间距区分层级
  .section-head {
    margin-bottom: 16px;
  }

  .section-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }

  .section-sub {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  // 扁平化：题目之间用留白分隔而非虚线，间距给足就不会看串行
  .question {
    margin-bottom: 28px;

    &:last-child {
      margin-bottom: 0;
    }
  }

  .q-stem {
    display: flex;
    gap: 8px;
    align-items: baseline;
    font-size: 14px;
    line-height: 1.7;
  }

  .q-index {
    flex-shrink: 0;
    font-weight: 600;
    color: var(--el-color-primary);
  }

  .q-full {
    flex-shrink: 0;
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }

  .q-options {
    padding-left: 22px;
    margin: 6px 0 0;
    font-size: 13px;
    line-height: 1.9;
    color: var(--el-text-color-regular);
    list-style: none;
  }

  // 扁平化：不用描边套盒子，三段各自是独立圆角色块，靠底色差异与间距区分
  .q-body {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 10px;
  }

  // 段落标签：小号但仍用 regular 而非 secondary。12px 配 .answer-block 与
  // .score-block 的底色，secondary 在浅色主题下只有 2.95:1 / 2.80:1，达不到
  // WCAG AA 的 4.5:1；主次关系靠字号已经拉开，不必再靠压低对比度
  .block-label {
    flex-shrink: 0;
    font-size: 12px;
    color: var(--el-text-color-regular);
  }

  // 考生答案：最浅底 + 正文字号，是阅卷时的主阅读区
  .answer-block {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 14px;
    background: var(--el-fill-color-lighter);
    border-radius: 6px;
  }

  .answer-body {
    font-size: 14px;
    line-height: 1.7;
    color: var(--el-text-color-primary);
    word-break: break-word;
    white-space: pre-wrap;

    &.is-empty {
      font-style: italic;
      color: var(--el-text-color-placeholder);
    }
  }

  // 参考信息：小字号 + 比答案区更灰的底，坐实注释所说的「弱化」。
  // 两块若同底色只靠 6px 间距会读成一个连续色块，主阅读区与参考区的层次就没了
  .ref-block {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 14px;
    background: var(--el-fill-color);
    border-radius: 6px;
  }

  .q-row {
    display: flex;
    gap: 8px;
    align-items: baseline;
    font-size: 13px;
  }

  // 用 regular 而非 secondary：13px 小字配 .ref-block 的 --el-fill-color 底，
  // secondary 在浅色主题下只有 2.75:1，达不到 WCAG AA 的 4.5:1；regular 是 5.45:1
  .row-label {
    flex-shrink: 0;
    width: 56px;
    color: var(--el-text-color-regular);
  }

  .answer-text {
    // min-width: 0 必需：flex 子项默认 min-width: auto，不会收缩到内容宽度以下，
    // 长标准答案会横向撑破色块而不换行（word-break 也救不回来）
    min-width: 0;
    color: var(--el-text-color-primary);
    word-break: break-word;
    white-space: pre-wrap;

    &.is-empty {
      color: var(--el-text-color-placeholder);
    }
  }

  // 收缩换行所需的 min-width: 0 由 .rich-text 基类统一提供（本元素同时带这两个类）
  .criteria {
    color: var(--el-text-color-regular);
  }

  // 评分区：唯一需要动手的地方，靠浅主色底与上方两个灰块拉开，不用描边和色条
  .score-block {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    padding: 12px 14px;
    background: var(--el-color-primary-light-9);
    border-radius: 6px;
  }

  // 输入框去描边改填充：Element 的默认边框是 wrapper 上的 inset box-shadow，
  // 与扁平化的色块语言冲突，这里统一改为白底无边，聚焦时才用主色描边提示
  .score-input,
  .comment-input {
    :deep(.el-input__wrapper) {
      background: var(--el-bg-color);
      box-shadow: none;

      &.is-focus {
        box-shadow: 0 0 0 1px var(--el-color-primary) inset;
      }
    }

    // 必须显式重申禁用态：上面那条 :deep 与 Element 内置的
    // .el-input.is-disabled .el-input__wrapper 优先级相同（同为 0,3,0），
    // 而本组件样式是懒加载 chunk、晚于全局主题插入，会盖掉内置禁用样式，
    // 导致成绩已发布（readonly）时输入框看起来仍可编辑，阅卷员察觉不到已锁定
    :deep(.el-input.is-disabled .el-input__wrapper) {
      background: var(--el-disabled-bg-color);
      box-shadow: 0 0 0 1px var(--el-disabled-border-color) inset;
    }
  }

  .score-input {
    width: 84px;

    // 分数是本页最关键的输入，加粗放大便于快速核对
    :deep(.el-input__inner) {
      font-size: 15px;
      font-weight: 600;
      text-align: center;
    }
  }

  // 客观题只读分数，与输入框视觉高度对齐
  .score-readonly {
    font-size: 15px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  // 署名推到行尾：分数是主角，阅卷人是落款，挤在分数右边会读成一串。
  // margin-left: auto 吃掉中间空白，与 SheetHeader 的操作区同一手法
  .review-meta {
    margin-left: auto;
    font-size: 12px;
    // 同在 .score-block 的主色浅底上 secondary 仅 2.83:1，达不到 WCAG AA
    color: var(--el-text-color-regular);
  }

  // 评语独占一行并起白底：与分数同行会挤成一条窄缝；
  // 平铺在主色浅底上又跟上一行糊成一块，白底才读得出是「一段引文」。
  // flex-basis: 100% 强制换行（父容器已 flex-wrap）
  .review-comment {
    display: flex;
    flex-basis: 100%;
    gap: 8px;
    align-items: baseline;
    padding: 8px 10px;
    background: var(--el-bg-color);
    border-radius: 4px;
  }

  // 评语标签单独一份而非复用 .block-label：后者是给主色浅底调的对比度，
  // 这里换白底，secondary 已有 4.6:1，可以压得更淡以突出评语正文
  .comment-label {
    flex-shrink: 0;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  .comment-text {
    // flex 子项默认 min-width: auto，长评语不换行会撑破色块
    min-width: 0;
    font-size: 13px;
    line-height: 1.7;
    color: var(--el-text-color-primary);
    word-break: break-word;
    white-space: pre-wrap;
  }

  // 同在 .score-block 的主色浅底上，secondary 只有 2.83:1。满分是阅卷时的打分上限，
  // 属于要看清的信息而非装饰，故与 .block-label 一并改用 regular（5.55:1）
  .score-total {
    font-size: 13px;
    color: var(--el-text-color-regular);
  }

  // 扁平分段控件：无外框无分隔线，两个色块并排，靠 gap 分开
  .quick-seg {
    display: inline-flex;
    flex-shrink: 0;
    gap: 4px;
  }

  .seg-btn {
    padding: 0 14px;
    font-size: 13px;
    line-height: 32px;
    color: var(--el-text-color-regular);
    cursor: pointer;
    background: var(--el-fill-color);
    border: none;
    border-radius: 6px;
    transition:
      background-color 0.15s,
      color 0.15s;

    // hover 用主色浅底而非同色系加深：fill-color→fill-color-dark 实测仅 1.05:1，
    // 几乎无反馈；改主色浅底后是色相偏移，两种主题下都能察觉
    &:hover:not(:disabled) {
      background: var(--el-color-primary-light-9);
    }

    // 键盘操作需要可见焦点，原生 button 去掉 border 后默认焦点环会不明显
    &:focus-visible {
      outline: 2px solid var(--el-color-primary);
      outline-offset: -2px;
    }

    &:disabled {
      color: var(--el-text-color-placeholder);
      cursor: not-allowed;
    }

    // 选中态：底色担色彩语义（绿=满分/红=零分），文字用常规深色而非品牌色。
    // 实测品牌色配任一档浅底都过不了 WCAG：success 配 light-8 仅 1.93:1、
    // danger 配 light-8 仅 2.37:1，浅色主题下几乎看不清是否选中。
    // 换成 --el-text-color-primary 后浅色约 9.8:1、暗色约 8.9:1（该变量随主题翻转）
    &.is-active-full {
      font-weight: 600;
      color: var(--el-text-color-primary);
      background: var(--el-color-success-light-7);
    }

    &.is-active-zero {
      font-weight: 600;
      color: var(--el-text-color-primary);
      background: var(--el-color-danger-light-7);
    }

    // 选中态必须显式声明 hover，否则会被上面那条 hover 规则盖掉：
    // .seg-btn:hover:not(:disabled) 特异性是 (0,4,0)，高于 .seg-btn.is-active-x 的 (0,3,0)，
    // 悬停已选中的按钮时绿/红语义会瞬间变成主色蓝。这里悬停加深一档给反馈但保住色彩语义
    &.is-active-full:hover:not(:disabled) {
      background: var(--el-color-success-light-5);
    }

    &.is-active-zero:hover:not(:disabled) {
      background: var(--el-color-danger-light-5);
    }
  }

  // 评语占满剩余宽度：原先限宽 260px，长评语只能看到开头
  .comment-input {
    flex: 1;
    min-width: 200px;
  }

  .auto-hint {
    font-size: 12px;
    color: var(--el-text-color-placeholder);
  }

  // v-html 注入的节点没有 scoped 属性，须用 :deep 才能命中
  .rich-text {
    display: inline;

    // min-width: 0 必需：题干（.q-stem）与评分标准（.ref-block）都是 flex 容器，
    // 本类作为 flex 子项会被 blockify，默认 min-width: auto 阻止收缩。
    // 富文本可能含长 URL、代码、公式等不可断行长串，缺此声明会横向撑破卷面区。
    min-width: 0;

    :deep(p) {
      display: inline;
      margin: 0;
    }

    // pre/code 默认 white-space: pre，不受外层 word-break 影响，超长代码行会横向
    // 撑破卷面。原先靠 .q-body 的 overflow: hidden 裁掉，扁平化去掉它后只剩祖先
    // .center-card 兜底，这里补上换行规则，不把裁切责任推给上层容器
    :deep(pre),
    :deep(code) {
      word-break: break-word;
      white-space: pre-wrap;
    }

    :deep(img) {
      max-width: 100%;
    }
  }
</style>
