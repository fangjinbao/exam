<!-- 外部考生批量导入对话框：下载模板、选择文件、确认导入（原型，导入结果走本地 Mock） -->
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
  import * as XLSX from 'xlsx'
  import { saveAs } from 'file-saver'
  import { externalCandidateApi, type ExternalCandidatePayload } from '@/api/externalCandidate'

  defineOptions({ name: 'ExternalCandidateImportDialog' })

  defineProps<{ modelValue: boolean }>()
  const emit = defineEmits<{
    'update:modelValue': [value: boolean]
    success: []
  }>()

  const importing = ref(false)
  const selectedFile = ref<UploadRawFile | null>(null)

  function handleVisibleChange(value: boolean) {
    emit('update:modelValue', value)
  }

  /** 记录待导入文件（覆盖式，仅保留最后选择的一个） */
  function handleFileChange(file: UploadFile) {
    selectedFile.value = file.raw ?? null
  }

  /** 超出数量限制时提示 */
  function handleExceed() {
    ElMessage.warning('仅支持上传单个文件，请先移除已选择的文件')
  }

  /** 下载导入模板：前端生成含表头与示例行的 xlsx 文件 */
  function handleDownloadTemplate() {
    // 表头顺序与外部考生字段一致，含一行示例数据供参照
    const header = ['姓名', '准考证号', '所属单位', '证件号', '联系电话', '电子邮箱']
    const example = [
      '张三',
      'WB2026101',
      '示例单位',
      '110101199001011234',
      '13800000000',
      'zhangsan@example.com'
    ]
    const worksheet = XLSX.utils.aoa_to_sheet([header, example])
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, '外部考生')
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
    saveAs(new Blob([buffer], { type: 'application/octet-stream' }), '外部考生导入模板.xlsx')
  }

  // 模板中文表头 → 后端字段名映射（顺序与 handleDownloadTemplate 一致）
  const HEADER_MAP: Record<string, keyof ExternalCandidatePayload> = {
    姓名: 'name',
    准考证号: 'admissionNo',
    所属单位: 'company',
    证件号: 'idCard',
    联系电话: 'phone',
    电子邮箱: 'email'
  }

  /** 解析上传文件为考生行数组（读取首个工作表，按表头映射字段） */
  async function parseFile(file: UploadRawFile): Promise<ExternalCandidatePayload[]> {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    // 以中文表头为 key 读取每行，再映射为后端字段；数字型单元格转字符串避免类型错位
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    return raw.map((item) => {
      const row = {} as ExternalCandidatePayload
      for (const [cn, field] of Object.entries(HEADER_MAP)) {
        row[field] = String(item[cn] ?? '').trim()
      }
      return row
    })
  }

  async function handleConfirm() {
    if (!selectedFile.value) {
      ElMessage.warning('请先选择要导入的文件')
      return
    }
    importing.value = true
    try {
      const rows = await parseFile(selectedFile.value)
      if (!rows.length) {
        ElMessage.warning('文件内容为空，请按模板填写后再导入')
        return
      }
      const { data } = await externalCandidateApi.import(rows)
      ElMessage.success(`成功导入 ${data.count} 名外部考生，账号已生成`)
      emit('success')
      handleVisibleChange(false)
    } catch (error: any) {
      ElMessage.error(error.message || '导入失败，请检查文件内容')
    } finally {
      importing.value = false
    }
  }

  /** 对话框关闭后重置已选文件 */
  function handleClosed() {
    selectedFile.value = null
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
  }
</style>
