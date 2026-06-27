<!-- 设备分类 - 绑定检查清单弹窗：从系统内检查清单中选择，支持清空解绑 -->
<template>
  <ElDialog
    :model-value="visible"
    title="绑定检查清单"
    width="500px"
    @update:model-value="(v) => emit('update:visible', v)"
  >
    <ElForm label-width="100px">
      <ElFormItem label="所属分类">
        <span class="category-name">{{ categoryName }}</span>
      </ElFormItem>
      <ElFormItem label="检查清单">
        <ElSelect
          v-model="selectedId"
          placeholder="请选择检查清单，清空即解绑"
          clearable
          filterable
          style="width: 100%"
        >
          <ElOption
            v-for="item in options"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          />
        </ElSelect>
      </ElFormItem>
    </ElForm>
    <template #footer>
      <ElButton @click="emit('update:visible', false)">取消</ElButton>
      <ElButton type="primary" :loading="submitLoading" @click="handleSubmit">确定</ElButton>
    </template>
  </ElDialog>
</template>

<script setup lang="ts">
  import { ref, watch } from 'vue'
  import { ElMessage } from 'element-plus'
  import {
    getChecklistOptions,
    bindChecklist,
    type ChecklistOption,
    type EquipmentCategory
  } from '@/api/equipment-category'

  defineOptions({ name: 'ChecklistBindDialog' })

  const props = defineProps<{
    /** 弹窗显隐 */
    visible: boolean
    /** 当前绑定操作的分类 */
    category: EquipmentCategory | null
  }>()

  const emit = defineEmits<{
    'update:visible': [value: boolean]
    success: []
  }>()

  const options = ref<ChecklistOption[]>([])
  const selectedId = ref<number | null>(null)
  const submitLoading = ref(false)
  const categoryName = ref('')

  // 弹窗打开时加载候选清单并回填当前绑定
  watch(
    () => props.visible,
    async (val) => {
      if (!val || !props.category) return
      categoryName.value = props.category.name
      selectedId.value = props.category.checklistId
      // 每次打开都重新拉取，避免首次失败后永久空列表
      try {
        const { data } = await getChecklistOptions()
        options.value = data || []
      } catch (error: any) {
        ElMessage.error(error.message || '加载检查清单失败')
      }
    }
  )

  async function handleSubmit() {
    if (!props.category) return
    submitLoading.value = true
    try {
      await bindChecklist(props.category.id, selectedId.value ?? null)
      ElMessage.success(selectedId.value ? '绑定成功' : '已解绑')
      emit('update:visible', false)
      emit('success')
    } catch (error: any) {
      ElMessage.error(error.message || '操作失败')
    } finally {
      submitLoading.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .category-name {
    color: var(--el-text-color-primary);
    font-weight: 500;
  }
</style>
