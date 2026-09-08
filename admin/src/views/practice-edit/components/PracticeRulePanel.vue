<!--
  练习抽题规则面板：题型 / 难度 / 知识点 / 抽取数量。
  与试卷抽题规则的差别是没有「每题分值」——练习不计分。
  难度与知识点留空表示不限（对应后端 difficulty='' 与 knowledgePointId=0）。
  可用题量由父组件按题库范围统计后经 availCounts 传入，下标与 rules 对齐。
-->
<template>
  <div class="rule-panel">
    <div class="panel-toolbar">
      <span class="toolbar-summary">
        共 <b>{{ totalCount }}</b> 题
      </span>
      <ElButton link type="primary" :icon="Plus" @click="addRule">添加规则</ElButton>
    </div>

    <!-- max-height 而非 height：规则少时表格随内容收缩，不留大片死白 -->
    <ElTable :data="rules" max-height="320" size="small">
      <ElTableColumn label="题型" width="115">
        <template #header><span class="req">*</span>题型</template>
        <template #default="{ row }">
          <ElSelect v-model="row.questionType" placeholder="题型" @change="emitChange">
            <ElOption v-for="d in questionTypes" :key="d.value" :label="d.name" :value="d.value" />
          </ElSelect>
        </template>
      </ElTableColumn>
      <ElTableColumn label="难度" width="95">
        <template #default="{ row }">
          <ElSelect v-model="row.difficulty" placeholder="不限" clearable @change="emitChange">
            <ElOption v-for="d in difficulties" :key="d.value" :label="d.name" :value="d.value" />
          </ElSelect>
        </template>
      </ElTableColumn>
      <ElTableColumn label="知识点" min-width="140">
        <template #default="{ row }">
          <ElTreeSelect
            v-model="row.knowledgePointId"
            :data="kpTree"
            :props="{ label: 'name', children: 'children' }"
            node-key="id"
            value-key="id"
            check-strictly
            clearable
            filterable
            :render-after-expand="false"
            placeholder="不限"
            style="width: 100%"
            @change="emitChange"
          />
        </template>
      </ElTableColumn>
      <ElTableColumn label="抽取数量" width="185" align="center">
        <template #header><span class="req">*</span>抽取数量</template>
        <template #default="{ row, $index }">
          <div class="draw-cell">
            <ElInputNumber
              v-model="row.drawCount"
              :min="1"
              :max="availCounts[$index] || 1"
              :disabled="!availCounts[$index]"
              :precision="0"
              controls-position="right"
              style="width: 100%"
            />
            <!-- 上限来自所选题库中命中该规则的正式题数，超出即不可再加 -->
            <span class="avail-tip">
              {{ row.questionType ? `可用 ${availCounts[$index] || 0}` : '先选题型' }}
            </span>
          </div>
        </template>
      </ElTableColumn>
      <ElTableColumn label="操作" width="60" align="center">
        <template #default="{ $index }">
          <ElButton link type="danger" @click="removeRule($index)">删除</ElButton>
        </template>
      </ElTableColumn>
      <template #empty>请添加抽题规则</template>
    </ElTable>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { Plus } from '@element-plus/icons-vue'
  import type { DictDataItem } from '@/api/dataDict'
  import type { KnowledgePoint } from '@/api/knowledgePoint'
  import type { PracticeRuleItem } from '@/api/practice'

  defineOptions({ name: 'PracticeRulePanel' })

  /**
   * 规则列表用 defineModel 承载：本面板要增删数组元素，
   * 直接 push/splice props 会触发 vue/no-mutating-props（项目 lint 为 error 级）。
   */
  const rules = defineModel<PracticeRuleItem[]>('rules', { required: true })

  // 其余入参只在模板里用，不需要在脚本中持有 props 引用
  defineProps<{
    /** 各规则的可用题量，下标与 rules 对齐 */
    availCounts: number[]
    questionTypes: DictDataItem[]
    difficulties: DictDataItem[]
    kpTree: KnowledgePoint[]
  }>()

  const emit = defineEmits<{
    /** 规则增删改后通知父组件重算可用题量 */
    (e: 'change'): void
  }>()

  const totalCount = computed(() => rules.value.reduce((sum, r) => sum + (r.drawCount || 0), 0))

  /** 新增一条空规则：难度与知识点默认不限 */
  function addRule() {
    rules.value.push({
      questionType: '',
      difficulty: '',
      // 不预设 0：ElTreeSelect 会把 0 当已选值显示成「0」而非 placeholder「不限」
      knowledgePointId: undefined,
      drawCount: 1
    })
    emit('change')
  }

  function removeRule(index: number) {
    rules.value.splice(index, 1)
    emit('change')
  }

  function emitChange() {
    emit('change')
  }
</script>

<style lang="scss" scoped>
  .rule-panel {
    .panel-toolbar {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
      margin-bottom: 10px;

      .toolbar-summary {
        font-size: 13px;
        color: var(--el-text-color-secondary);

        b {
          color: var(--el-color-primary);
        }
      }
    }

    .req {
      margin-right: 2px;
      color: var(--el-color-danger);
    }

    // 数量与可用量同行：竖排会把行高撑高，且小字悬在输入框下方没有对齐基准
    .draw-cell {
      display: flex;
      align-items: center;
      gap: 8px;

      .el-input-number {
        flex: 1;
        min-width: 0;
      }

      // 不为「可用 0」标红：这是填表过程中的常态，标红像报错
      .avail-tip {
        flex-shrink: 0;
        font-size: 12px;
        color: var(--el-text-color-placeholder);
        white-space: nowrap;
      }
    }
  }
</style>
