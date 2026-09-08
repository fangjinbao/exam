<!-- 证书设计器：选中元素属性编辑面板（文本内容/字段类型/坐标/宽度/字号/颜色/粗细/对齐/删除） -->
<template>
  <div class="props-panel">
    <div v-if="!element" class="props-empty">
      <ElIcon class="empty-icon"><Pointer /></ElIcon>
      <span>选中画布元素以编辑属性</span>
    </div>
    <ElForm v-else label-width="64px" label-position="left" size="small">
      <ElFormItem label="类型">
        <ElTag size="small">{{ typeLabel }}</ElTag>
      </ElFormItem>

      <ElFormItem v-if="element.type === 'text'" label="文本">
        <ElInput
          :model-value="element.text"
          type="textarea"
          :rows="2"
          maxlength="100"
          placeholder="请输入文本"
          @update:model-value="patch({ text: $event })"
        />
      </ElFormItem>

      <ElFormItem v-if="element.type === 'field'" label="字段">
        <ElSelect
          :model-value="element.fieldKey"
          placeholder="选择字段"
          @update:model-value="patch({ fieldKey: $event })"
        >
          <ElOption v-for="f in FIELD_OPTIONS" :key="f.key" :label="f.label" :value="f.key" />
        </ElSelect>
      </ElFormItem>

      <ElFormItem label="位置">
        <div class="row2">
          <ElInputNumber
            :model-value="element.x"
            :min="0"
            controls-position="right"
            @update:model-value="patch({ x: toNum($event) })"
          />
          <ElInputNumber
            :model-value="element.y"
            :min="0"
            controls-position="right"
            @update:model-value="patch({ y: toNum($event) })"
          />
        </div>
      </ElFormItem>

      <ElFormItem label="宽度">
        <div class="width-row">
          <ElInputNumber
            :model-value="element.width"
            :min="MIN_ELEMENT_WIDTH"
            :max="800"
            controls-position="right"
            @update:model-value="patch({ width: toNum($event, MIN_ELEMENT_WIDTH) })"
          />
          <!--
            框宽是 text-align 的参照系，也是下划线横线的长度，故不做成自动贴合。
            但短文本配默认 200px 框宽会「右对齐后拖不到左边」——文字顶在框右缘，
            框左缘已到 x=0 仍离左侧很远。这个按钮把框收到文字实宽，便于精确定位。
          -->
          <ElButton v-if="element.type !== 'seal'" size="small" @click="emit('fit-width')">
            适应文字
          </ElButton>
        </div>
      </ElFormItem>

      <ElFormItem v-if="element.type !== 'seal'" label="字号">
        <ElInputNumber
          :model-value="element.fontSize"
          :min="8"
          :max="120"
          controls-position="right"
          @update:model-value="patch({ fontSize: toNum($event, 8) })"
        />
      </ElFormItem>

      <template v-if="element.type !== 'seal'">
        <ElFormItem label="颜色">
          <ElColorPicker
            :model-value="element.color"
            @update:model-value="patch({ color: $event || '#000000' })"
          />
        </ElFormItem>
        <ElFormItem label="加粗">
          <ElSwitch :model-value="element.bold" @update:model-value="patch({ bold: !!$event })" />
        </ElFormItem>
        <ElFormItem label="下划线">
          <ElSwitch
            :model-value="element.underline"
            @update:model-value="patch({ underline: !!$event })"
          />
        </ElFormItem>
        <ElFormItem label="对齐">
          <ElRadioGroup
            :model-value="element.align"
            @update:model-value="patch({ align: $event as any })"
          >
            <ElRadioButton value="left">左</ElRadioButton>
            <ElRadioButton value="center">中</ElRadioButton>
            <ElRadioButton value="right">右</ElRadioButton>
          </ElRadioGroup>
        </ElFormItem>
      </template>

      <div class="danger-zone">
        <ElButton
          type="danger"
          plain
          size="small"
          class="remove-btn"
          :icon="Delete"
          @click="emit('remove', element.id)"
        >
          删除元素
        </ElButton>
      </div>
    </ElForm>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { Delete, Pointer } from '@element-plus/icons-vue'
  import { FIELD_OPTIONS, MIN_ELEMENT_WIDTH, type DesignerElement } from './designer-types'

  const props = defineProps<{ element: DesignerElement | null }>()

  const emit = defineEmits<{
    (e: 'patch', payload: { id: string; changes: Partial<DesignerElement> }): void
    (e: 'remove', id: string): void
    /** 把框宽收到文字实宽：测量需真实 DOM，由持有画布的父组件执行 */
    (e: 'fit-width'): void
  }>()

  const typeLabel = computed(() => {
    if (!props.element) return ''
    return { text: '静态文本', field: '动态字段', seal: '印章' }[props.element.type]
  })

  /** 合并变更并上抛（携带元素 id，由父级更新对应元素） */
  function patch(changes: Partial<DesignerElement>) {
    if (!props.element) return
    emit('patch', { id: props.element.id, changes })
  }

  /** ElInputNumber 可能传 null，兜底为下限值 */
  function toNum(v: number | undefined | null, fallback = 0): number {
    return typeof v === 'number' && !Number.isNaN(v) ? v : fallback
  }
</script>

<style lang="scss" scoped>
  /* 宽度输入与「适应文字」同排；输入框可压缩，避免窄面板下按钮被挤出 */
  .width-row {
    display: flex;
    gap: 8px;
    align-items: center;
    width: 100%;

    :deep(.el-input-number) {
      flex: 1;
      min-width: 0;
    }
  }

  .props-panel {
    height: 100%;
    padding: 18px 16px;
    overflow-y: auto;

    :deep(.el-form-item) {
      margin-bottom: 16px;
    }

    :deep(.el-form-item__label) {
      color: var(--el-text-color-secondary);
      font-size: 13px;
    }

    :deep(.el-input-number),
    :deep(.el-select),
    :deep(.el-textarea) {
      width: 100%;
    }

    :deep(.el-radio-group) {
      width: 100%;

      .el-radio-button {
        flex: 1;
      }

      .el-radio-button__inner {
        width: 100%;
      }
    }
  }

  .props-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    color: var(--el-text-color-placeholder);
    font-size: 13px;
    margin-top: 64px;

    .empty-icon {
      font-size: 32px;
      opacity: 0.5;
    }
  }

  .row2 {
    display: flex;
    gap: 8px;

    :deep(.el-input-number) {
      width: 100%;
    }
  }

  .danger-zone {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--el-border-color-lighter);

    .remove-btn {
      width: 100%;
    }
  }
</style>
