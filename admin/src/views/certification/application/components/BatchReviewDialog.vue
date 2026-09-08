<!--
  批量审核对话框

  一个单位一次报几十人，逐条点不现实。整批要么全成要么全不成：
  含已审核记录时服务端整批拒绝，不会挑出待审的悄悄审掉。
  只有驳回需要填原因，通过则直接确认。
-->
<template>
  <ElDialog
    :model-value="modelValue"
    :title="result === 'approved' ? '批量通过报名' : '批量驳回报名'"
    width="520px"
    @update:model-value="emit('update:modelValue', $event)"
    @closed="handleClosed"
  >
    <ElAlert :type="result === 'approved' ? 'success' : 'warning'" :closable="false">
      <template #title>
        即将{{ result === 'approved' ? '通过' : '驳回' }} <b>{{ count }}</b> 条待审核报名。
        <template v-if="result === 'rejected'">
          驳回后这些人占用的名额会释放，单位可以另报他人。
        </template>
      </template>
    </ElAlert>
    <ElForm
      v-if="result === 'rejected'"
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="88px"
      class="batch-form"
    >
      <ElFormItem label="驳回原因" prop="rejectReason">
        <ElInput
          v-model="form.rejectReason"
          type="textarea"
          :rows="3"
          placeholder="请输入驳回原因（将应用于所选全部记录）"
          maxlength="200"
          show-word-limit
        />
      </ElFormItem>
    </ElForm>
    <template #footer>
      <ElButton @click="emit('update:modelValue', false)">取消</ElButton>
      <ElButton type="primary" :loading="loading" @click="handleConfirm">确定</ElButton>
    </template>
  </ElDialog>
</template>

<script setup lang="ts">
  import { ref, reactive } from 'vue'
  import type { FormInstance, FormRules } from 'element-plus'

  const props = defineProps<{
    modelValue: boolean
    /** approved 通过 / rejected 驳回 */
    result: 'approved' | 'rejected'
    /** 参与本次批量操作的记录条数（仅待审核的） */
    count: number
    loading: boolean
  }>()

  const emit = defineEmits<{
    'update:modelValue': [v: boolean]
    /** 确认提交，驳回时带上原因 */
    confirm: [rejectReason?: string]
  }>()

  const formRef = ref<FormInstance>()
  const form = reactive({ rejectReason: '' })
  const rules: FormRules = {
    rejectReason: [{ required: true, message: '请输入驳回原因', trigger: 'blur' }]
  }

  function handleClosed() {
    form.rejectReason = ''
    formRef.value?.clearValidate()
  }

  async function handleConfirm() {
    // 通过无需填原因，直接放行；驳回先过表单校验
    if (props.result === 'rejected') {
      try {
        await formRef.value?.validate()
      } catch {
        return // 校验未过，留在对话框里
      }
      emit('confirm', form.rejectReason.trim())
      return
    }
    emit('confirm')
  }
</script>

<style lang="scss" scoped>
  .batch-form {
    margin-top: 16px;
  }
</style>
