<!-- 外部考生批量导入对话框：下载模板、选择文件、确认导入（逐行导入，跳过错误行并展示明细） -->
<template>
  <ElDialog
    :model-value="modelValue"
    title="批量导入外部考生"
    width="480px"
    @update:model-value="handleVisibleChange"
    @closed="handleClosed"
  >
    <div class="import-body">
      <!-- 操作步骤说明 -->
      <ol class="import-steps">
        <li>下载导入模板，按模板格式填写外部考生信息</li>
        <li>上传填写好的文件，确认导入后系统自动生成考试账号</li>
      </ol>

      <div class="import-template">
        <ElButton type="primary" link :icon="Download" @click="handleDownloadTemplate">
          下载导入模板
        </ElButton>
      </div>

      <!-- 文件上传（手动触发导入，不自动上传） -->
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

      <!-- 跳过明细：逐行导入后，展示被跳过的行号与原因 -->
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
  import { ref } from 'vue'
  import { ElMessage, type UploadFile, type UploadRawFile } from 'element-plus'
  import { Download, UploadFilled } from '@element-plus/icons-vue'
  import { downloadTemplate, parseExcel } from '@/utils/excel'
  import { externalCandidateApi, type ImportCandidateRow } from '@/api/externalCandidate'

  defineOptions({ name: 'ExternalCandidateImportDialog' })

  defineProps<{ modelValue: boolean }>()
  const emit = defineEmits<{
    'update:modelValue': [value: boolean]
    success: []
  }>()

  const importing = ref(false)
  const selectedFile = ref<UploadRawFile | null>(null)
  // 逐行导入后被跳过的行明细（行号 + 原因）
  const skipped = ref<{ row: number; reason: string }[]>([])

  // 模板中文表头 → 后端字段名映射（顺序即模板列顺序）
  const HEADER_MAP: Record<string, keyof ImportCandidateRow> = {
    姓名: 'name',
    所属单位: 'company',
    证件号: 'idCard',
    联系电话: 'phone',
    电子邮箱: 'email'
  }

  function handleVisibleChange(value: boolean) {
    emit('update:modelValue', value)
  }

  /** 记录待导入文件（覆盖式，仅保留最后选择的一个），并清空上次的跳过明细 */
  function handleFileChange(file: UploadFile) {
    selectedFile.value = file.raw ?? null
    skipped.value = []
  }

  /** 超出数量限制时提示 */
  function handleExceed() {
    ElMessage.warning('仅支持上传单个文件，请先移除已选择的文件')
  }

  /** 下载导入模板：前端生成含表头与示例行的 xlsx 文件 */
  function handleDownloadTemplate() {
    const example = [
      '张三',
      '示例单位',
      '110101199001011234',
      '13800000000',
      'zhangsan@example.com'
    ]
    // 证件号（索引 2）、联系电话（索引 3）设文本格式，避免长数字被 Excel 当数值导致精度丢失
    downloadTemplate(Object.keys(HEADER_MAP), example, '外部考生导入模板', '外部考生', [2, 3])
  }

  async function handleConfirm() {
    if (!selectedFile.value) {
      ElMessage.warning('请先选择要导入的文件')
      return
    }
    importing.value = true
    try {
      const rows = await parseExcel<ImportCandidateRow>(selectedFile.value, HEADER_MAP)
      if (!rows.length) {
        ElMessage.warning('文件内容为空，请按模板填写后再导入')
        return
      }
      const { data } = await externalCandidateApi.import(rows)
      skipped.value = data.errors
      if (data.failed) {
        ElMessage.warning(`成功导入 ${data.success} 名，跳过 ${data.failed} 行，详见下方明细`)
      } else {
        ElMessage.success(`成功导入 ${data.success} 名外部考生，账号已生成`)
      }
      emit('success')
      // 有跳过行时保留对话框展示明细，全部成功才自动关闭
      if (!data.failed) handleVisibleChange(false)
    } catch (error: any) {
      ElMessage.error(error.message || '导入失败，请检查文件内容')
    } finally {
      importing.value = false
    }
  }

  /** 对话框关闭后重置已选文件与跳过明细 */
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
