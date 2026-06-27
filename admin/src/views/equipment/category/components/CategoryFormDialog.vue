<!-- 设备分类 - 新增/编辑弹窗：填写分类名称、选择父级分类（编辑时过滤自身及子树） -->
<template>
  <ElDialog
    :model-value="visible"
    :title="title"
    width="500px"
    @update:model-value="(v) => emit('update:visible', v)"
    @closed="handleClosed"
  >
    <ElForm ref="formRef" :model="form" :rules="formRules" label-width="100px">
      <!-- 分类名称：必填 -->
      <ElFormItem label="分类名称" prop="name">
        <ElInput
          v-model="form.name"
          placeholder="请输入分类名称"
          maxlength="50"
          show-word-limit
          clearable
        />
      </ElFormItem>
      <!-- 上级分类：不选则为顶级；新增子分类时预置且禁用修改 -->
      <ElFormItem label="上级分类">
        <ElTreeSelect
          v-model="form.parentId"
          :data="treeOptions"
          :props="{ label: 'name' }"
          node-key="id"
          placeholder="不选则为顶级分类"
          clearable
          check-strictly
          :disabled="isEditing"
          :render-after-expand="false"
          style="width: 100%"
        />
      </ElFormItem>
    </ElForm>
    <template #footer>
      <ElButton @click="emit('update:visible', false)">取消</ElButton>
      <ElButton type="primary" :loading="submitLoading" @click="handleSubmit">确定</ElButton>
    </template>
  </ElDialog>
</template>

<script setup lang="ts">
  import { ref, reactive, computed, watch } from 'vue'
  import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
  import {
    addCategory,
    updateCategory,
    type EquipmentCategory
  } from '@/api/equipment-category'

  defineOptions({ name: 'CategoryFormDialog' })

  const props = defineProps<{
    /** 弹窗显隐 */
    visible: boolean
    /** 编辑目标，新增时为 null */
    editTarget: EquipmentCategory | null
    /** 新增子分类时预置的父级 ID */
    presetParentId: number | null
    /** 分类树（用于父级选择，已在父级过滤当前节点子树） */
    treeOptions: EquipmentCategory[]
  }>()

  const emit = defineEmits<{
    'update:visible': [value: boolean]
    success: []
  }>()

  const isEditing = computed(() => !!props.editTarget)
  const title = computed(() => (isEditing.value ? '编辑分类' : '新增分类'))

  const formRef = ref<FormInstance>()
  const submitLoading = ref(false)
  const form = reactive({
    id: undefined as number | undefined,
    name: '',
    parentId: null as number | null
  })

  const formRules: FormRules = {
    name: [{ required: true, message: '请输入分类名称', trigger: 'blur' }]
  }

  // 弹窗打开时初始化表单
  watch(
    () => props.visible,
    (val) => {
      if (!val) return
      if (props.editTarget) {
        form.id = props.editTarget.id
        form.name = props.editTarget.name
        form.parentId = props.editTarget.parentId
      } else {
        form.id = undefined
        form.name = ''
        form.parentId = props.presetParentId ?? null
      }
    }
  )

  async function handleSubmit() {
    try {
      await formRef.value?.validate()
    } catch {
      return
    }
    submitLoading.value = true
    try {
      if (isEditing.value && form.id) {
        await updateCategory({ id: form.id, name: form.name })
        ElMessage.success('更新成功')
      } else {
        await addCategory({ name: form.name, parentId: form.parentId })
        ElMessage.success('新增成功')
      }
      emit('update:visible', false)
      emit('success')
    } catch (error: any) {
      ElMessage.error(error.message || '操作失败')
    } finally {
      submitLoading.value = false
    }
  }

  function handleClosed() {
    formRef.value?.resetFields()
    form.id = undefined
    form.name = ''
    form.parentId = null
  }
</script>
