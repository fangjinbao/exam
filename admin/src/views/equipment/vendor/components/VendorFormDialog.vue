<!-- 厂商信息 - 新增/编辑弹窗：维护厂商名称、联系人、联系方式、地址与备注 -->
<template>
  <ElDialog
    :model-value="visible"
    :title="title"
    width="560px"
    @update:model-value="(v) => emit('update:visible', v)"
    @closed="handleClosed"
  >
    <ElForm ref="formRef" :model="form" :rules="formRules" label-width="90px">
      <!-- 厂商名称：必填，最多100字 -->
      <ElFormItem label="厂商名称" prop="name">
        <ElInput v-model="form.name" placeholder="请输入厂商全称" maxlength="100" show-word-limit clearable />
      </ElFormItem>
      <ElFormItem label="联系人" prop="contact">
        <ElInput v-model="form.contact" placeholder="请输入联系人姓名" maxlength="50" clearable />
      </ElFormItem>
      <ElFormItem label="联系电话" prop="phone">
        <ElInput v-model="form.phone" placeholder="请输入联系电话" maxlength="20" clearable />
      </ElFormItem>
      <ElFormItem label="邮箱" prop="email">
        <ElInput v-model="form.email" placeholder="请输入邮箱地址" maxlength="100" clearable />
      </ElFormItem>
      <ElFormItem label="地址" prop="address">
        <ElInput v-model="form.address" placeholder="请输入厂商地址" maxlength="200" clearable />
      </ElFormItem>
      <ElFormItem label="备注" prop="remark">
        <ElInput
          v-model="form.remark"
          type="textarea"
          :rows="3"
          placeholder="请输入备注说明"
          maxlength="500"
          show-word-limit
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
  import { addVendor, updateVendor, type Vendor } from '@/api/equipment-vendor'

  defineOptions({ name: 'VendorFormDialog' })

  const props = defineProps<{
    /** 弹窗显隐 */
    visible: boolean
    /** 编辑目标，新增时为 null */
    editTarget: Vendor | null
  }>()

  const emit = defineEmits<{
    'update:visible': [value: boolean]
    success: []
  }>()

  const isEditing = computed(() => !!props.editTarget)
  const title = computed(() => (isEditing.value ? '编辑厂商' : '新增厂商'))

  const formRef = ref<FormInstance>()
  const submitLoading = ref(false)
  const form = reactive({
    id: undefined as number | undefined,
    name: '',
    contact: '',
    phone: '',
    email: '',
    address: '',
    remark: ''
  })

  const formRules: FormRules = {
    name: [{ required: true, message: '请输入厂商名称', trigger: 'blur' }],
    email: [{ type: 'email', message: '请输入正确的邮箱格式', trigger: 'blur' }]
  }

  // 弹窗打开时初始化表单
  watch(
    () => props.visible,
    (val) => {
      if (!val) return
      if (props.editTarget) {
        Object.assign(form, {
          id: props.editTarget.id,
          name: props.editTarget.name,
          contact: props.editTarget.contact,
          phone: props.editTarget.phone,
          email: props.editTarget.email,
          address: props.editTarget.address,
          remark: props.editTarget.remark
        })
      } else {
        // 新增模式：确保不残留上一次编辑的数据
        Object.assign(form, {
          id: undefined,
          name: '',
          contact: '',
          phone: '',
          email: '',
          address: '',
          remark: ''
        })
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
      const payload = {
        name: form.name,
        contact: form.contact || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
        remark: form.remark || undefined
      }
      if (isEditing.value && form.id) {
        await updateVendor({ id: form.id, ...payload })
        ElMessage.success('更新成功')
      } else {
        await addVendor(payload)
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
    Object.assign(form, {
      id: undefined,
      name: '',
      contact: '',
      phone: '',
      email: '',
      address: '',
      remark: ''
    })
  }
</script>
