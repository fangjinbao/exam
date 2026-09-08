<!-- 题目批量导入对话框：下载模板、选择文件、确认导入到当前题库（逐行导入，跳过错误行并展示明细） -->
<template>
  <ElDialog
    :model-value="modelValue"
    title="批量导入题目"
    width="520px"
    @update:model-value="handleVisibleChange"
    @closed="handleClosed"
  >
    <div class="import-body">
      <ol class="import-steps">
        <li>下载导入模板，按模板格式填写题目信息</li>
        <li>题型填写{{ typeNamesText }}；难度填写{{ difficultyNamesText }}</li>
        <li>客观题（单选/多选/判断）需填选项，多个选项换行分隔；知识点多个用顿号分隔</li>
        <li>上传文件后确认导入，题目将归入当前题库「{{ bankName }}」</li>
      </ol>

      <div class="import-template">
        <ElButton type="primary" link :icon="Download" @click="handleDownloadTemplate">
          下载导入模板
        </ElButton>
      </div>

      <ElUpload
        drag
        :auto-upload="false"
        :limit="1"
        :on-change="handleFileChange"
        :on-exceed="handleExceed"
        accept=".xlsx,.xls"
        class="import-upload"
      >
        <ElIcon class="upload-icon"><UploadFilled /></ElIcon>
        <div class="upload-text">将文件拖到此处，或<em>点击选择文件</em></div>
        <template #tip>
          <div class="upload-tip">仅支持 .xlsx / .xls 格式，单个文件</div>
        </template>
      </ElUpload>

      <ElAlert
        v-if="skipped.length"
        type="warning"
        :closable="false"
        show-icon
        class="import-skipped"
      >
        <template #title>本次跳过 {{ skipped.length }} 行（其余已成功导入）</template>
        <ul class="skip-list">
          <li v-for="item in skipped" :key="item.row">第 {{ item.row }} 行：{{ item.reason }}</li>
        </ul>
      </ElAlert>
    </div>

    <template #footer>
      <ElButton @click="handleVisibleChange(false)">取消</ElButton>
      <ElButton type="primary" :loading="importing" @click="handleConfirm">确认导入</ElButton>
    </template>
  </ElDialog>
</template>

<script setup lang="ts">
  import { ref, computed } from 'vue'
  import { ElMessage, type UploadFile, type UploadRawFile } from 'element-plus'
  import { Download, UploadFilled } from '@element-plus/icons-vue'
  import { downloadTemplate, parseExcel } from '@/utils/excel'
  import { questionApi, type ImportQuestionRow } from '@/api/question'
  import type { DictDataItem } from '@/api/dataDict'

  defineOptions({ name: 'QuestionImportDialog' })

  const props = defineProps<{
    modelValue: boolean
    bankId: number
    bankName: string
    typeOptions: DictDataItem[]
    difficultyOptions: DictDataItem[]
  }>()
  const emit = defineEmits<{
    'update:modelValue': [value: boolean]
    success: []
  }>()

  const importing = ref(false)
  const selectedFile = ref<UploadRawFile | null>(null)
  const skipped = ref<{ row: number; reason: string }[]>([])

  // 模板中文表头 → 字段名映射（顺序即模板列顺序）
  const HEADER_MAP: Record<string, keyof ImportQuestionRow> = {
    题干: 'stem',
    题型: 'typeName',
    选项: 'options',
    标准答案: 'answer',
    答案解析: 'analysis',
    难度: 'difficultyName',
    分值: 'suggestedScore',
    知识点: 'knowledgePointNames'
  }

  const typeNamesText = computed(() => props.typeOptions.map((it) => it.name).join('/') || '题型名称')
  const difficultyNamesText = computed(
    () => props.difficultyOptions.map((it) => it.name).join('/') || '难度名称'
  )

  function handleVisibleChange(value: boolean) {
    emit('update:modelValue', value)
  }

  function handleFileChange(file: UploadFile) {
    selectedFile.value = file.raw ?? null
    skipped.value = []
  }

  function handleExceed() {
    ElMessage.warning('仅支持上传单个文件，请先移除已选择的文件')
  }

  function handleDownloadTemplate() {
    const firstType = props.typeOptions[0]?.name ?? '单选'
    const firstDiff = props.difficultyOptions[0]?.name ?? '中等'
    const example = [
      '以下哪项属于安全操作规范？',
      firstType,
      '正确佩戴防护装备\n违规操作设备\n无视警示标识\n随意进入危险区域',
      '正确佩戴防护装备',
      '安全操作需按规范佩戴防护装备',
      firstDiff,
      '5',
      '安全生产'
    ]
    downloadTemplate(Object.keys(HEADER_MAP), example, '题目导入模板', '题目')
  }

  async function handleConfirm() {
    if (!selectedFile.value) {
      ElMessage.warning('请先选择要导入的文件')
      return
    }
    importing.value = true
    try {
      const rows = await parseExcel<ImportQuestionRow>(selectedFile.value, HEADER_MAP)
      if (!rows.length) {
        ElMessage.warning('文件内容为空，请按模板填写后再导入')
        return
      }
      const { data } = await questionApi.import(props.bankId, rows)
      skipped.value = data.errors
      if (data.failed) {
        ElMessage.warning(`成功导入 ${data.success} 道，跳过 ${data.failed} 行，详见下方明细`)
      } else {
        ElMessage.success(`成功导入 ${data.success} 道题目`)
      }
      emit('success')
      if (!data.failed) handleVisibleChange(false)
    } catch (error: any) {
      ElMessage.error(error.message || '导入失败，请检查文件内容')
    } finally {
      importing.value = false
    }
  }

  function handleClosed() {
    selectedFile.value = null
    skipped.value = []
  }
</script>

<style lang="scss" scoped>
  .import-body {
    display: flex;
    flex-direction: column;
    gap: 16px;

    .import-steps {
      margin: 0;
      padding-left: 20px;
      color: var(--el-text-color-regular);
      font-size: 13px;
      line-height: 1.8;
    }

    .import-template {
      display: flex;
    }

    .upload-icon {
      font-size: 44px;
      color: var(--el-text-color-placeholder);
      margin-bottom: 8px;
    }

    .upload-text {
      color: var(--el-text-color-regular);
      font-size: 14px;

      em {
        color: var(--el-color-primary);
        font-style: normal;
      }
    }

    .upload-tip {
      color: var(--el-text-color-placeholder);
      font-size: 12px;
      margin-top: 8px;
    }

    .import-skipped {
      .skip-list {
        margin: 8px 0 0;
        padding-left: 18px;
        max-height: 160px;
        overflow-y: auto;
        font-size: 12px;
        line-height: 1.7;
      }
    }
  }
</style>
