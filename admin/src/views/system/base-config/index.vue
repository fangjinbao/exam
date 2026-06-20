<!-- 系统配置 - 基础配置：维护系统名称、Logo、描述、时区与日期格式等全局参数 -->
<template>
  <div class="system-base-config">
    <ElCard shadow="never" class="config-card">
      <ElForm
        ref="formRef"
        v-loading="loading"
        :model="form"
        :rules="formRules"
        label-width="120px"
        class="config-form"
      >
        <!-- 系统名称：必填，最多50字 -->
        <ElFormItem label="系统名称" prop="sysName">
          <ElInput
            v-model="form.sysName"
            placeholder="请输入系统名称"
            maxlength="50"
            show-word-limit
            clearable
          />
        </ElFormItem>

        <!-- 系统Logo：图片上传，单张≤2MB，PNG/JPG -->
        <ElFormItem label="系统Logo" prop="sysLogo">
          <ElUpload
            class="logo-uploader"
            :show-file-list="false"
            :before-upload="handleBeforeUpload"
            accept="image/png,image/jpeg"
          >
            <img v-if="form.sysLogo" :src="form.sysLogo" class="logo-preview" alt="系统Logo" />
            <div v-else class="logo-placeholder">
              <ElIcon class="logo-placeholder-icon"><Plus /></ElIcon>
              <span class="logo-placeholder-text">点击上传</span>
            </div>
          </ElUpload>
          <div class="logo-tip">支持 PNG/JPG 格式，单张不超过 2MB</div>
        </ElFormItem>

<!-- PART_2 -->
        <!-- 系统描述：非必填，最多200字 -->
        <ElFormItem label="系统描述" prop="sysDesc">
          <ElInput
            v-model="form.sysDesc"
            type="textarea"
            placeholder="请输入系统简介说明"
            :rows="4"
            maxlength="200"
            show-word-limit
          />
        </ElFormItem>

        <!-- 默认时区：必填，下拉选择 -->
        <ElFormItem label="默认时区" prop="timezone">
          <ElSelect v-model="form.timezone" placeholder="请选择默认时区" style="width: 100%">
            <ElOption v-for="item in timezoneOptions" :key="item" :label="item" :value="item" />
          </ElSelect>
        </ElFormItem>

        <!-- 日期格式：必填，下拉选择 -->
        <ElFormItem label="日期格式" prop="dateFormat">
          <ElSelect v-model="form.dateFormat" placeholder="请选择日期格式" style="width: 100%">
            <ElOption v-for="item in dateFormatOptions" :key="item" :label="item" :value="item" />
          </ElSelect>
        </ElFormItem>

        <ElFormItem>
          <ElButton type="primary" :loading="submitLoading" @click="handleSubmit">保存</ElButton>
        </ElFormItem>
      </ElForm>
    </ElCard>
  </div>
</template>
<!-- PART_3 -->

<script setup lang="ts">
  import { ref, reactive, onMounted } from 'vue'
  import { ElMessage, type FormInstance, type FormRules, type UploadRawFile } from 'element-plus'
  import { Plus } from '@element-plus/icons-vue'
  import { getBaseConfig, updateBaseConfig, type BaseConfig } from '@/api/system'

  defineOptions({ name: 'SystemBaseConfig' })

  // 单张 Logo 大小上限（2MB）
  const MAX_LOGO_SIZE = 2 * 1024 * 1024

  const loading = ref(false)
  const submitLoading = ref(false)
  const formRef = ref<FormInstance>()

  const form = reactive<BaseConfig>({
    sysName: '',
    sysLogo: '',
    sysDesc: '',
    timezone: '(UTC+08:00) 北京',
    dateFormat: 'YYYY-MM-DD'
  })

  // 时区可选项
  const timezoneOptions = [
    '(UTC+08:00) 北京',
    '(UTC+09:00) 东京',
    '(UTC+00:00) 伦敦',
    '(UTC-05:00) 纽约',
    '(UTC+07:00) 曼谷'
  ]

  // 日期格式可选项
  const dateFormatOptions = ['YYYY-MM-DD', 'YYYY/MM/DD', 'MM-DD-YYYY', 'DD-MM-YYYY']

  const formRules: FormRules = {
    sysName: [{ required: true, message: '请填写系统名称', trigger: 'blur' }],
    timezone: [{ required: true, message: '请选择默认时区', trigger: 'change' }],
    dateFormat: [{ required: true, message: '请选择日期格式', trigger: 'change' }]
  }

  // 加载已保存的配置回填表单
  async function loadConfig() {
    loading.value = true
    try {
      const { data } = await getBaseConfig()
      if (data) {
        Object.assign(form, data)
      }
    } catch (error: any) {
      ElMessage.error(error.message || '加载配置失败')
    } finally {
      loading.value = false
    }
  }

  // 上传前校验类型与大小，校验通过转为 base64 预览
  // 说明：原型阶段无真实上传服务，暂以 base64 本地预览；
  // 生产环境须替换为对象存储/CDN 上传接口，sysLogo 仅保存返回的图片 URL，避免 base64 入库
  function handleBeforeUpload(file: UploadRawFile) {
    const isImage = file.type === 'image/png' || file.type === 'image/jpeg'
    if (!isImage) {
      ElMessage.error('只能上传 PNG/JPG 格式的图片')
      return false
    }
    if (file.size > MAX_LOGO_SIZE) {
      ElMessage.error('图片大小不能超过 2MB')
      return false
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      form.sysLogo = (e.target?.result as string) || ''
    }
    reader.readAsDataURL(file)
    // 阻止组件默认上传行为
    return false
  }

  // 保存配置
  async function handleSubmit() {
    if (!formRef.value) return
    try {
      await formRef.value.validate()
    } catch {
      return
    }
    submitLoading.value = true
    try {
      await updateBaseConfig({ ...form })
      ElMessage.success('配置已保存，刷新页面后生效')
    } catch (error: any) {
      // 保存失败保留填写内容，显示具体错误原因
      ElMessage.error(error.message || '保存失败')
    } finally {
      submitLoading.value = false
    }
  }

  onMounted(loadConfig)
</script>
<!-- PART_5 -->

<style scoped>
  .system-base-config {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .config-card {
    border: none !important;
    box-shadow: none !important;
    border-radius: 12px;
  }

  .config-card :deep(.el-card__body) {
    padding: 24px 20px;
  }

  /* 表单限制宽度，避免铺满整卡 */
  .config-form {
    max-width: 600px;
  }

  /* Logo 上传区 */
  .logo-uploader :deep(.el-upload) {
    width: 100px;
    height: 100px;
    border: 1px dashed var(--el-border-color);
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color 0.2s;
  }

  .logo-uploader :deep(.el-upload):hover {
    border-color: var(--el-color-primary);
  }

  .logo-preview {
    width: 100px;
    height: 100px;
    object-fit: contain;
    border-radius: 8px;
  }

  .logo-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    color: var(--el-text-color-secondary);
  }

  .logo-placeholder-icon {
    font-size: 24px;
  }

  .logo-placeholder-text {
    font-size: 13px;
  }

  .logo-tip {
    margin-top: 8px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
    line-height: 1.5;
  }
</style>
