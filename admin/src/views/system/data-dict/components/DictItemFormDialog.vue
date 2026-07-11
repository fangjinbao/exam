<!-- 字典项新增/编辑弹窗：名称/值/排序/状态，同一字典类型下名称与值唯一 -->
<template>
  <ElDialog
    v-model="visible"
    :title="isEditing ? '编辑字典项' : '新增字典项'"
    width="500px"
    @closed="handleClosed"
  >
    <ElForm ref="formRef" :model="form" :rules="formRules" label-width="90px">
      <ElFormItem label="字典项名称" prop="name">
        <ElInput v-model="form.name" placeholder="请输入字典项名称" maxlength="50" show-word-limit />
      </ElFormItem>
      <ElFormItem label="字典项值" prop="value">
        <ElInput v-model="form.value" placeholder="请输入字典项值" maxlength="50" show-word-limit />
      </ElFormItem>
      <ElFormItem label="排序" prop="sort">
        <ElInputNumber
          v-model="form.sort"
          :min="0"
          :precision="0"
          controls-position="right"
          placeholder="数值越小越靠前"
          style="width: 100%"
        />
      </ElFormItem>
      <ElFormItem label="状态" prop="status">
        <ElRadioGroup v-model="form.status">
          <ElRadio :value="1">启用</ElRadio>
          <ElRadio :value="0">停用</ElRadio>
        </ElRadioGroup>
      </ElFormItem>
    </ElForm>
    <template #footer>
      <ElButton @click="visible = false">取消</ElButton>
      <ElButton type="primary" :loading="submitLoading" @click="handleSubmit">确定</ElButton>
    </template>
  </ElDialog>
</template>
<script setup lang="ts">
  import { ref, reactive } from 'vue'
  import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
  import { dataDictApi, type DictItem, type DictItemPayload } from '@/api/dataDict'

  defineOptions({ name: 'DictItemFormDialog' })

  const emit = defineEmits<{ success: [] }>()

  const visible = ref(false)
  const isEditing = ref(false)
  const submitLoading = ref(false)
  const editingId = ref<number>()
  const currentTypeId = ref<number>()

  const formRef = ref<FormInstance>()
  const createForm = (): Omit<DictItemPayload, 'typeId'> => ({
    name: '',
    value: '',
    sort: 0,
    status: 1
  })
  const form = reactive<Omit<DictItemPayload, 'typeId'>>(createForm())

  const formRules: FormRules = {
    name: [{ required: true, message: '请输入字典项名称', trigger: 'blur' }],
    value: [{ required: true, message: '请输入字典项值', trigger: 'blur' }],
    status: [{ required: true, message: '请选择状态', trigger: 'change' }]
  }

  /** 打开新增：需传入当前字典类型 id */
  function openAdd(typeId: number) {
    isEditing.value = false
    editingId.value = undefined
    currentTypeId.value = typeId
    visible.value = true
  }

  /** 打开编辑 */
  function openEdit(row: DictItem) {
    isEditing.value = true
    editingId.value = row.id
    currentTypeId.value = row.typeId
    visible.value = true
    Object.assign(form, {
      name: row.name,
      value: row.value,
      sort: row.sort,
      status: row.status
    })
  }

  async function handleSubmit() {
    if (!currentTypeId.value) return
    try {
      await formRef.value?.validate()
      submitLoading.value = true
      const payload: DictItemPayload = {
        typeId: currentTypeId.value,
        name: form.name.trim(),
        value: form.value.trim(),
        sort: form.sort ?? 0,
        status: form.status
      }
      if (isEditing.value && editingId.value) {
        await dataDictApi.updateItem({ id: editingId.value, ...payload })
        ElMessage.success('字典项编辑成功')
      } else {
        await dataDictApi.addItem(payload)
        ElMessage.success('字典项新增成功')
      }
      visible.value = false
      emit('success')
    } catch (error: any) {
      if (error !== false && error) ElMessage.error(error.message || '操作失败')
    } finally {
      submitLoading.value = false
    }
  }

  function handleClosed() {
    formRef.value?.resetFields()
    Object.assign(form, createForm())
  }

  defineExpose({ openAdd, openEdit })
</script>
