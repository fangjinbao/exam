<!--
  练习题库面板（编辑页左栏）：选题库 + 练习方式 + 抽题规则。
  三者强耦合——抽题规则的可用题量取决于所选题库，且仅在「按规则抽题」时才有意义，
  故收在同一面板内，由本组件统一维护可用题量的请求与竞态。
-->
<template>
  <section class="panel">
    <div class="panel-head">
      <span class="panel-title">练习题库</span>
      <span class="panel-sub">练哪些题、怎么出题</span>
    </div>
    <div class="panel-body">
      <ElFormItem label="选择题库" prop="bankIds">
        <div v-if="banks.length" class="banks-picked">
          <div class="picked-list">
            <div v-for="b in banks" :key="b.id" class="picked-item">
              <span class="picked-name" :title="b.name">{{ b.name }}</span>
              <span class="picked-meta">{{ b.questionCount ?? 0 }} 题</span>
            </div>
          </div>
          <div class="picked-actions">
            <span class="picked-total">
              共 {{ banks.length }} 个题库 · {{ totalQuestions }} 题
            </span>
            <ElButton link type="primary" @click="pickerVisible = true">更换</ElButton>
          </div>
        </div>
        <ElButton v-else :icon="Plus" @click="pickerVisible = true">选择题库</ElButton>
      </ElFormItem>

      <ElFormItem label="练习方式">
        <!-- 单选语义用 radiogroup 而非 toggle button：未选中项移出 Tab 序，组内用方向键切换 -->
        <div class="draw-modes" role="radiogroup" aria-label="练习方式">
          <button
            v-for="(opt, i) in DRAW_MODE_OPTIONS"
            :key="opt.value"
            type="button"
            role="radio"
            class="draw-mode"
            :class="{ 'is-active': drawMode === opt.value }"
            :aria-checked="drawMode === opt.value"
            :tabindex="drawMode === opt.value ? 0 : -1"
            @click="selectMode(opt.value)"
            @keydown.left.prevent="handleArrow(i, -1)"
            @keydown.up.prevent="handleArrow(i, -1)"
            @keydown.right.prevent="handleArrow(i, 1)"
            @keydown.down.prevent="handleArrow(i, 1)"
          >
            <span class="mode-label">{{ opt.label }}</span>
            <span class="mode-desc">{{ opt.desc }}</span>
          </button>
        </div>
      </ElFormItem>

      <!--
        规则表不走带 label 的 ElFormItem：110px 的 label 缩进会把这张最少需要 580px 的表
        挤出左栏（左栏约 700px），右侧「抽取数量」列会被裁掉。改为标题独立成行、表格占满整宽。
      -->
      <div v-if="drawMode === 'random'" class="rule-block">
        <div class="rule-block-label">抽题规则</div>
        <PracticeRulePanel
          v-model:rules="rules"
          :avail-counts="ruleCounts"
          :question-types="questionTypes"
          :difficulties="difficulties"
          :kp-tree="kpTree"
          @change="refreshAvailability"
        />
      </div>
    </div>

    <BankPickerDrawer v-model="pickerVisible" :selected="banks" @confirm="handleBankConfirm" />
  </section>
</template>

<script setup lang="ts">
  import { ref, computed } from 'vue'
  import { ElMessage } from 'element-plus'
  import { Plus } from '@element-plus/icons-vue'
  import {
    practiceApi,
    DRAW_MODE_OPTIONS,
    type PracticeDrawMode,
    type PracticeRuleItem
  } from '@/api/practice'
  import type { DictDataItem } from '@/api/dataDict'
  import type { KnowledgePoint } from '@/api/knowledgePoint'
  import BankPickerDrawer, {
    type PickedBank
  } from '@/components/business/pickers/BankPickerDrawer.vue'
  import PracticeRulePanel from './PracticeRulePanel.vue'

  defineOptions({ name: 'PracticeSourcePanel' })

  /**
   * 抽题规则用 defineModel 承载并继续以 v-model 透传给 PracticeRulePanel：
   * 本组件回填可用题量时要改规则行的 drawCount，下层还要增删行，
   * 走 props 会触发 vue/no-mutating-props（项目 lint 为 error 级）。
   */
  const rules = defineModel<PracticeRuleItem[]>('rules', { required: true })

  const props = defineProps<{
    /** 已选题库（父组件持有同一数组引用） */
    banks: PickedBank[]
    drawMode: PracticeDrawMode
    questionTypes: DictDataItem[]
    difficulties: DictDataItem[]
    kpTree: KnowledgePoint[]
  }>()

  const emit = defineEmits<{
    (e: 'update:banks', v: PickedBank[]): void
    (e: 'update:drawMode', v: PracticeDrawMode): void
  }>()

  const pickerVisible = ref(false)
  // 各条规则在当前题库范围内的可用题量（下标与 rules 对齐）
  const ruleCounts = ref<number[]>([])
  // 可用量请求序号：并发返回时只认最新一次
  let availabilitySeq = 0

  const totalQuestions = computed(() => props.banks.reduce((s, b) => s + (b.questionCount || 0), 0))

  function selectMode(mode: PracticeDrawMode) {
    emit('update:drawMode', mode)
    // 切到规则模式时补算一次，避免刚切过去所有行都显示「可用 0」
    if (mode === 'random') void refreshAvailability()
  }

  function handleArrow(index: number, step: number) {
    const next = (index + step + DRAW_MODE_OPTIONS.length) % DRAW_MODE_OPTIONS.length
    selectMode(DRAW_MODE_OPTIONS[next].value)
  }

  function handleBankConfirm(list: PickedBank[]) {
    emit('update:banks', list)
    // 题库变了可用题量随之变化，重算
    void refreshAvailability()
  }

  /**
   * 刷新各规则的可用题量。
   * 题型未选时该行条件不完整，直接记 0 而不发请求（后端要求 questionType 非空）。
   */
  async function refreshAvailability() {
    if (props.drawMode !== 'random') return
    // 发请求时就固定「哪些行参与查询、各自的原始下标」，回填只认这份快照。
    // 若改成回填时重新遍历 rules，请求往返期间删行会让后面的行拿到前一行的计数。
    // drawCountAtRequest 一并快照：回填收敛时用它判断用户是否在往返期间改过这一行
    const ready = rules.value
      .map((r, idx) => ({ r, idx, drawCountAtRequest: r.drawCount }))
      .filter(({ r }) => r.questionType)
    const rowCount = rules.value.length
    const bankIds = props.banks.map((b) => b.id)
    if (!bankIds.length || !ready.length) {
      ruleCounts.value = rules.value.map(() => 0)
      return
    }
    const seq = ++availabilitySeq
    try {
      const { data: res } = await practiceApi.ruleAvailability({
        bankIds,
        rules: ready.map(({ r }) => ({
          questionType: r.questionType,
          difficulty: r.difficulty || '',
          knowledgePointId: r.knowledgePointId || 0,
          drawCount: r.drawCount
        }))
      })
      // 已有更新的请求发出，或行数已变，本次结果作废
      if (seq !== availabilitySeq || rules.value.length !== rowCount) return
      const next = new Array(rowCount).fill(0)
      ready.forEach(({ idx }, i) => (next[idx] = res.counts[i] ?? 0))
      ruleCounts.value = next
      // 题库范围缩小后可用量可能降到已填数量之下，:max 不回收已有值，这里主动收敛并告知
      const clamped: number[] = []
      ready.forEach(({ r, idx, drawCountAtRequest }) => {
        // 用户在请求往返期间改过这一行，本次结果对它已过期，不能覆盖刚输入的值
        if (r.drawCount !== drawCountAtRequest) return
        const cap = next[idx]
        if (cap > 0 && r.drawCount > cap) {
          r.drawCount = cap
          clamped.push(idx + 1)
        }
      })
      if (clamped.length) {
        ElMessage.info(`第 ${clamped.join('、')} 条规则的抽取数量已按可用题量下调`)
      }
    } catch {
      if (seq !== availabilitySeq) return
      ruleCounts.value = rules.value.map(() => 0)
    }
  }

  // 供父组件在详情回填后补算一次
  defineExpose({ refreshAvailability })
</script>

<style lang="scss" scoped>
  .panel {
    overflow: hidden;
    background: var(--el-bg-color-overlay);
    border-radius: 12px;

    .panel-head {
      display: flex;
      align-items: baseline;
      gap: 8px;
      padding: 14px 20px;
      border-bottom: 1px solid var(--el-border-color-lighter);

      .panel-title {
        font-size: 15px;
        font-weight: 600;
      }

      .panel-sub {
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    .panel-body {
      padding: 18px 20px 4px;
    }
  }

  // 抽题规则整块：标题单独一行，表格占满卡片内宽
  .rule-block {
    margin-bottom: 18px;

    .rule-block-label {
      // 与 ElFormItem 的 label 对齐：项目在 el-ui.scss 里把 .el-form-item__label 的
      // line-height 覆写成了 --el-component-custom-height，这里不能用 Element 的默认 32px
      margin-bottom: 8px;
      font-size: var(--el-form-label-font-size);
      line-height: var(--el-component-custom-height);
      color: var(--el-text-color-regular);
    }
  }

  // 练习方式选择：卡片式单选
  .draw-modes {
    display: flex;
    gap: 10px;
    width: 100%;

    .draw-mode {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 2px;
      padding: 10px 12px;
      font: inherit;
      text-align: left;
      cursor: pointer;
      background: var(--el-fill-color-blank);
      border: 1px solid var(--el-border-color);
      border-radius: 8px;
      transition: all 0.2s;

      &:hover {
        border-color: var(--el-color-primary-light-5);
      }

      &.is-active {
        background: var(--el-color-primary-light-9);
        border-color: var(--el-color-primary);
      }

      .mode-label {
        font-size: 14px;
        font-weight: 600;
        line-height: 1.4;
        color: var(--el-text-color-primary);
      }

      .mode-desc {
        font-size: 12px;
        line-height: 1.4;
        color: var(--el-text-color-secondary);
      }
    }
  }

  // 已选题库回显
  .banks-picked {
    width: 100%;

    .picked-list {
      display: flex;
      flex-direction: column;
      max-height: 160px;
      overflow-y: auto;

      .picked-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 6px 10px;
        border-bottom: 1px solid var(--el-border-color-lighter);

        &:last-child {
          border-bottom: none;
        }

        .picked-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .picked-meta {
          flex-shrink: 0;
          font-size: 12px;
          color: var(--el-text-color-secondary);
        }
      }
    }

    .picked-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 6px;

      .picked-total {
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }
  }
</style>
