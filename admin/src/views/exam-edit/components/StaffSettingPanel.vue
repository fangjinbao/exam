<!--
  考试工作人员设置区块（监考 / 阅卷共用）
  两类名单的交互完全相同（选内部人员 → 表格展示 → 移除/清空），故只此一份，
  由 title / sub / emptyText / pickerTitle 调整文案。
  v-model 绑定已选人员数组。
-->

<template>
  <section class="panel">
    <div class="panel-head">
      <span class="panel-title">{{ title }}</span>
      <span class="panel-sub">{{ sub }}</span>
    </div>
    <div class="panel-body" :class="{ 'is-empty': !list.length }">
      <div class="staff-toolbar">
        <!--
          空态不另起灰块：原先「按钮在上 + 灰块写『点按钮添加』」两处说同一件事，
          三个人员面板叠起来就是三片同样的灰。空态时状态文字与按钮同处一行。
        -->
        <div v-if="list.length" class="staff-stat">
          已选 <b>{{ list.length }}</b> 人
        </div>
        <div v-else class="staff-stat is-empty">
          <span class="stat-empty-text">{{ emptyText }}</span>
          <!-- 补充说明只在空态出现：它描述的正是「未指派」这一状态下的行为 -->
          <span v-if="emptyHint" class="stat-empty-hint">{{ emptyHint }}</span>
        </div>
        <!-- 描边权重：实心主色留给页面底部的「保存」，见 exam-edit 同款注释 -->
        <div class="staff-actions">
          <ElButton :icon="Plus" @click="pickerVisible = true">
            {{ pickButtonText }}
          </ElButton>
          <span v-if="list.length" class="action-sep" aria-hidden="true"></span>
          <ElButton v-if="list.length" link type="danger" @click="handleClear">清空</ElButton>
        </div>
      </div>
      <ElTable v-if="list.length" :data="list" max-height="240">
        <ElTableColumn type="index" label="#" width="56" align="center" />
        <ElTableColumn prop="name" label="姓名" min-width="100" show-overflow-tooltip />
        <ElTableColumn label="账号" min-width="110" show-overflow-tooltip>
          <template #default="{ row }">{{ row.account || '-' }}</template>
        </ElTableColumn>
        <ElTableColumn label="所属部门" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.belong || '-' }}</template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="80" align="center">
          <template #default="{ row }">
            <ElButton link type="danger" @click="handleRemove(row)">移除</ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </div>

    <CandidatePickerDialog
      v-model="pickerVisible"
      :selected="pickedForDialog"
      :title="pickerTitle"
      :empty-text="emptyText"
      internal-only
      @confirm="handleConfirm"
    />
  </section>
</template>

<script setup lang="ts">
  import { ref, computed } from 'vue'
  import { Plus } from '@element-plus/icons-vue'
  import CandidatePickerDialog, {
    type PickedCandidate
  } from '@/components/business/pickers/CandidatePickerDialog.vue'

  /** 已指派人员项（与后端 ExamStaffVo 对齐） */
  export interface StaffItem {
    userId: number
    name: string
    account?: string | null
    belong?: string
  }

  const props = withDefaults(
    defineProps<{
      /** 已选人员（v-model） */
      modelValue: StaffItem[]
      title: string
      sub: string
      /** 空态文案，同时用于选人弹窗「已选」面板的空态，故须是不含场景假设的短句 */
      emptyText: string
      /** 空态下的补充说明（可选），只显示在本区块，不传给弹窗 */
      emptyHint?: string
      pickerTitle: string
      pickButtonText?: string
    }>(),
    { emptyHint: '', pickButtonText: '选择人员' }
  )

  const emit = defineEmits<{
    (e: 'update:modelValue', v: StaffItem[]): void
  }>()

  const pickerVisible = ref(false)
  const list = computed(() => props.modelValue ?? [])

  /** 选人弹窗用统一的 PickedCandidate 结构，此处做双向映射 */
  const pickedForDialog = computed<PickedCandidate[]>(() =>
    list.value.map((s) => ({
      type: 'internal' as const,
      id: s.userId,
      name: s.name,
      belong: s.belong ?? '',
      account: s.account ?? null
    }))
  )

  function handleConfirm(picked: PickedCandidate[]) {
    emit(
      'update:modelValue',
      picked.map((p) => ({
        userId: p.id,
        name: p.name,
        account: p.account ?? null,
        belong: p.belong ?? ''
      }))
    )
  }

  function handleRemove(row: StaffItem) {
    emit(
      'update:modelValue',
      list.value.filter((s) => s.userId !== row.userId)
    )
  }

  function handleClear() {
    emit('update:modelValue', [])
  }
</script>

<style lang="scss" scoped>
  // 区块卡片骨架：与 practice-edit / paper-edit 的各 Panel 组件同款。
  // 必须定义在本组件内——父级 index.vue 的 scoped 样式只作用到子组件根元素，
  // panel-head / panel-body 这些内部节点匹配不到父级规则。
  .panel {
    overflow: hidden;
    background: var(--el-bg-color-overlay);
    border-radius: 12px;

    .panel-head {
      display: flex;
      gap: 8px;
      align-items: baseline;
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

    /*
      底部 18px 与上方对齐：这块的内容是工具栏+表格，没有 ElFormItem
      自带的 18px 下边距垫着，原来的 4px 会让表格贴住卡片底缘。
    */
    .panel-body {
      padding: 18px 20px;

      /* 空态下工具栏后面没有表格，抹掉它的下边距免得底部空一截 */
      &.is-empty .staff-toolbar {
        margin-bottom: 0;
      }
    }
  }

  .staff-toolbar {
    display: flex;
    gap: 16px;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .staff-stat {
    min-width: 0;
    font-size: 13px;
    color: var(--el-text-color-regular);

    b {
      margin: 0 2px;
      font-size: 15px;
      color: var(--el-color-primary);
    }

    /* 空态：状态与补充说明竖排在按钮左侧，整块只占一行按钮的高度 */
    &.is-empty {
      display: flex;
      flex-direction: column;
      gap: 2px;
      line-height: 1.4;
    }

    .stat-empty-text {
      color: var(--el-text-color-secondary);
    }

    .stat-empty-hint {
      font-size: 12px;
      color: var(--el-text-color-placeholder);
    }
  }

  .staff-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  /* 添加动作与「清空」之间的竖线分隔 */
  .action-sep {
    width: 1px;
    height: 16px;
    margin: 0 2px;
    background: var(--el-border-color-lighter);
  }
</style>
