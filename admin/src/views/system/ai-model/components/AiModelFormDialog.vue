<!-- AI模型配置新增/编辑弹窗：模型服务信息表单，密钥编辑时留空表示不修改 -->
<template>
  <ElDialog
    v-model="visible"
    :title="isEditing ? '编辑AI模型配置' : '新增AI模型配置'"
    width="600px"
    @closed="handleClosed"
  >
    <ElForm ref="formRef" :model="form" :rules="formRules" label-width="100px">
      <ElFormItem label="配置名称" prop="name">
        <ElInput v-model="form.name" placeholder="请输入配置名称" maxlength="50" show-word-limit />
      </ElFormItem>
      <ElFormItem label="模型服务商" prop="provider">
        <ElRadioGroup v-model="form.provider" @change="handleProviderChange">
          <ElRadio v-for="p in providers" :key="p" :value="p">{{ p }}</ElRadio>
        </ElRadioGroup>
      </ElFormItem>
      <ElFormItem label="接口地址" prop="apiUrl">
        <ElInput v-model="form.apiUrl" placeholder="请输入接口地址（http/https）" maxlength="200" />
      </ElFormItem>
      <ElFormItem label="密钥" prop="apiKey">
        <ElInput
          v-model="form.apiKey"
          type="password"
          show-password
          :placeholder="isEditing ? '留空表示不修改' : '请输入密钥'"
          maxlength="200"
        />
      </ElFormItem>
      <ElFormItem label="模型名称" prop="model">
        <ElInput v-model="form.model" placeholder="请输入模型名称，如 gpt-4o、claude-sonnet-4-20250514" maxlength="100" />
      </ElFormItem>
    </ElForm>
    <template #footer>
      <ElButton @click="visible = false">取消</ElButton>
      <ElButton type="primary" :loading="submitLoading" @click="handleSubmit">确定</ElButton>
    </template>
  </ElDialog>
</template>
<script setup lang="ts">
  import { ref, reactive, computed } from 'vue'
  import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
  import { aiModelApi, type AiModel, type AiModelPayload, type AiModelProvider } from '@/api/aiModel'

  defineOptions({ name: 'AiModelFormDialog' })

  const emit = defineEmits<{ success: [] }>()

  const providers: AiModelProvider[] = ['OpenAI', 'Anthropic']

  // 各服务商官方默认接口地址（base url），选择服务商时预填，可编辑以走中转/代理
  const DEFAULT_API_URL: Record<AiModelProvider, string> = {
    OpenAI: 'https://api.openai.com/v1',
    Anthropic: 'https://api.anthropic.com/v1'
  }

  const visible = ref(false)
  const isEditing = ref(false)
  const submitLoading = ref(false)
  const editingId = ref<number>()

  const formRef = ref<FormInstance>()
  const createForm = (): AiModelPayload => ({
    name: '',
    provider: '',
    model: '',
    apiUrl: '',
    apiKey: ''
  })
  const form = reactive<AiModelPayload>(createForm())

  // 接口地址格式校验（http/https）
  const validateApiUrl = (_rule: unknown, value: string, callback: (e?: Error) => void) => {
    if (!value) return callback(new Error('请输入接口地址'))
    return /^https?:\/\/.+/.test(value)
      ? callback()
      : callback(new Error('接口地址格式不正确，需以 http:// 或 https:// 开头'))
  }

  // 新增时密钥必填；编辑时留空表示不修改
  const validateApiKey = (_rule: unknown, value: string, callback: (e?: Error) => void) => {
    if (!isEditing.value && !value) return callback(new Error('请输入密钥'))
    return callback()
  }

  const formRules = computed<FormRules>(() => ({
    name: [{ required: true, message: '请输入配置名称', trigger: 'blur' }],
    provider: [{ required: true, message: '请选择模型服务商', trigger: 'change' }],
    model: [{ required: true, message: '请输入模型名称', trigger: 'blur' }],
    apiUrl: [{ validator: validateApiUrl, trigger: 'blur' }],
    apiKey: [{ validator: validateApiKey, trigger: 'blur' }]
  }))

  /** 打开新增 */
  function openAdd() {
    isEditing.value = false
    editingId.value = undefined
    visible.value = true
  }

  /** 打开编辑：密钥字段留空，展示脱敏值作为占位提示 */
  function openEdit(row: AiModel) {
    isEditing.value = true
    editingId.value = row.id
    visible.value = true
    Object.assign(form, {
      name: row.name,
      provider: row.provider,
      model: row.model,
      apiUrl: row.apiUrl,
      apiKey: ''
    })
  }

  /** 切换服务商：接口地址为空或仍是其它服务商默认值时，预填当前服务商官方地址 */
  function handleProviderChange(val: string | number | boolean | undefined) {
    const provider = val as AiModelProvider
    const isDefaultUrl = Object.values(DEFAULT_API_URL).includes(form.apiUrl)
    if (!form.apiUrl || isDefaultUrl) {
      form.apiUrl = DEFAULT_API_URL[provider]
    }
    // 切换服务商后旧模型失效：清空已填模型名，避免提交厂商与模型不匹配的脏数据
    form.model = ''
  }

  async function handleSubmit() {
    try {
      await formRef.value?.validate()
      submitLoading.value = true
      const payload: AiModelPayload = {
        name: form.name.trim(),
        provider: form.provider,
        model: form.model.trim(),
        apiUrl: form.apiUrl.trim(),
        apiKey: form.apiKey?.trim() || undefined
      }
      if (isEditing.value && editingId.value) {
        await aiModelApi.update({ id: editingId.value, ...payload })
        ElMessage.success('AI模型配置编辑成功')
      } else {
        await aiModelApi.add(payload)
        ElMessage.success('AI模型配置新增成功')
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
