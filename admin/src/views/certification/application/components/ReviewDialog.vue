<!--
  单条报名审核：通过 / 驳回（驳回必填原因）

  与 BatchReviewDialog 的区别只是作用范围：这里针对一条记录并展示其详情，
  批量那个只报条数。审核结果的状态机由服务端把关（已审核的不可重复审核）。
-->
<template>
  <ElDialog
    :model-value="modelValue"
    title="报名审核"
    width="520px"
    @update:model-value="emit('update:modelValue', $event)"
    @closed="handleClosed"
  >
    <div v-if="row" class="review-info">
      <div class="info-item">
        <span class="info-label">考生姓名</span>
        <span>{{ row.candidateName }}</span>
      </div>
      <div class="info-item">
        <span class="info-label">鉴定项目</span>
        <span>{{ row.projectName }}</span>
      </div>
      <div class="info-item">
        <span class="info-label">报名单位</span>
        <span>
          {{ row.orgName || '未占单位名额' }}
          <template v-if="row.deptName"> / {{ row.deptName }}</template>
        </span>
      </div>
      <div class="info-item">
        <span class="info-label">报名时间</span>
        <span>{{ row.applyTime }}</span>
      </div>
    </div>
    <ElForm ref="formRef" :model="form" :rules="rules" label-width="88px">
      <ElFormItem label="审核结果" prop="result">
        <ElRadioGroup v-model="form.result">
          <ElRadio value="approved">通过</ElRadio>
          <ElRadio value="rejected">驳回</ElRadio>
        </ElRadioGroup>
      </ElFormItem>
      <ElFormItem v-if="form.result === 'rejected'" label="驳回原因" prop="rejectReason">
        <ElInput
          v-model="form.rejectReason"
          type="textarea"
          :rows="3"
          placeholder="请输入驳回原因"
          maxlength="200"
          show-word-limit
        />
      </ElFormItem>
    </ElForm>
    <template #footer>
      <ElButton @click="emit('update:modelValue', false)">取消</ElButton>
      <ElButton type="primary" :loading="loading" @click="handleConfirm">提交</ElButton>
    </template>
  </ElDialog>
</template>

<script setup lang="ts">
  import { ref, reactive } from 'vue'
  import type { FormInstance, FormRules } from 'element-plus'
  import type { CertApplication } from '@/api/certApplication'

  defineProps<{
    modelValue: boolean
    /** 待审核的那条记录，用于展示详情 */
    row: CertApplication | null
    loading: boolean
  }>()

  const emit = defineEmits<{
    'update:modelValue': [v: boolean]
    /** 确认提交：审核结果 + 驳回原因（通过时为 undefined） */
    confirm: [result: 'approved' | 'rejected', rejectReason?: string]
  }>()

  const formRef = ref<FormInstance>()
  const createForm = () => ({ result: 'approved' as 'approved' | 'rejected', rejectReason: '' })
  const form = reactive(createForm())

  // 只有选了驳回才要求填原因，故用自定义校验而非 required
  const validateReason = (_rule: unknown, value: string, callback: (e?: Error) => void) => {
    if (form.result === 'rejected' && !value?.trim()) return callback(new Error('请输入驳回原因'))
    return callback()
  }
  const rules: FormRules = {
    result: [{ required: true, message: '请选择审核结果', trigger: 'change' }],
    rejectReason: [{ validator: validateReason, trigger: 'blur' }]
  }

  function handleClosed() {
    Object.assign(form, createForm())
    formRef.value?.clearValidate()
  }

  async function handleConfirm() {
    try {
      await formRef.value?.validate()
    } catch {
      return // 校验未过，留在对话框里
    }
    emit('confirm', form.result, form.result === 'rejected' ? form.rejectReason.trim() : undefined)
  }
</script>

<style lang="scss" scoped>
  // 与原页面内的样式一致，随对话框一起迁出
  .review-info {
    margin-bottom: 16px;

    .info-item {
      display: flex;
      margin-bottom: 8px;

      .info-label {
        width: 88px;
        color: var(--el-text-color-secondary);
      }
    }
  }
</style>
