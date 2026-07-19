<!-- 外部单位批量导入对话框：下载模板、选择文件、确认导入（逐行导入，跳过错误行并展示明细） -->
<template>
  <ElDialog
    :model-value="modelValue"
    title="批量导入外部单位"
    width="480px"
    @update:model-value="handleVisibleChange"
    @closed="handleClosed"
  >
    <div class="import-body">
      <ol class="import-steps">
        <li>下载导入模板，按模板格式填写外部单位信息</li>
        <li>上传填写好的文件，确认导入。单位名称/编码重复的行会被跳过</li>
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
  import { externalOrgApi, type ImportOrgRow } from '@/api/externalOrg'

  defineOptions({ name: 'ExternalOrgImportDialog' })

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
  const HEADER_MAP: Record<string, keyof ImportOrgRow> = {
    单位名称: 'name',
    单位编码: 'code',
    联系人: 'contact',
    联系电话: 'phone',
    单位地址: 'address',
    备注: 'remark'
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
    const example = ['示例单位', 'ORG001', '张三', '13800000000', '北京市朝阳区', '备注信息']
    // 单位编码（索引 1）设文本格式，避免长数字编码被 Excel 当数值导致精度丢失
    downloadTemplate(Object.keys(HEADER_MAP), example, '外部单位导入模板', '外部单位', [1])
  }

  async function handleConfirm() {
    if (!selectedFile.value) {
      ElMessage.warning('请先选择要导入的文件')
      return
    }
    importing.value = true
    try {
      const rows = await parseExcel<ImportOrgRow>(selectedFile.value, HEADER_MAP)
      if (!rows.length) {
        ElMessage.warning('文件内容为空，请按模板填写后再导入')
        return
      }
      const { data } = await externalOrgApi.import(rows)
      skipped.value = data.errors
      if (data.failed) {
        ElMessage.warning(`成功导入 ${data.success} 个，跳过 ${data.failed} 行，详见下方明细`)
      } else {
        ElMessage.success(`成功导入 ${data.success} 个外部单位`)
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
