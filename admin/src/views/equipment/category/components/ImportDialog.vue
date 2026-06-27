<!-- 设备分类 - 导入弹窗：下载模板、拖拽/选择上传 Excel、前端解析后提交校验 -->
<template>
  <ElDialog
    :model-value="visible"
    title="批量导入设备分类"
    width="560px"
    @update:model-value="(v) => emit('update:visible', v)"
    @closed="handleClosed"
  >
    <div class="import-body">
      <ElAlert
        title="导入说明"
        type="info"
        :closable="false"
        show-icon
        class="import-tip"
      >
        <template #default>
          <p>1. 请先下载模板，按格式填写后上传。</p>
          <p>2. 分类名称必填；上级分类填写完整路径（如"电气设备/高压设备"），顶级分类留空。</p>
          <p>3. 仅支持 .xlsx / .xls 文件，大小不超过 10MB。</p>
        </template>
      </ElAlert>

      <ElButton type="primary" link :icon="Download" class="tpl-btn" @click="handleDownloadTemplate">
        下载导入模板
      </ElButton>

      <ElUpload
        drag
        :auto-upload="false"
        :show-file-list="true"
        :limit="1"
        accept=".xlsx,.xls"
        :before-upload="() => false"
        :on-change="handleFileChange"
        :on-exceed="handleExceed"
        :on-remove="handleRemove"
      >
        <ElIcon class="upload-icon"><UploadFilled /></ElIcon>
        <div class="upload-text">将文件拖到此处，或<em>点击选择文件</em></div>
      </ElUpload>

      <!-- 导入错误明细 -->
      <ElAlert
        v-if="errorMsg"
        :title="errorMsg"
        type="error"
        :closable="false"
        show-icon
        class="error-tip"
      />
    </div>
    <template #footer>
      <ElButton @click="emit('update:visible', false)">取消</ElButton>
      <ElButton type="primary" :loading="submitLoading" :disabled="!selectedFile" @click="handleImport">
        开始导入
      </ElButton>
    </template>
  </ElDialog>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { ElMessage, type UploadFile } from 'element-plus'
  import { Download, UploadFilled } from '@element-plus/icons-vue'
  import * as XLSX from 'xlsx'
  import { saveAs } from 'file-saver'
  import { importCategories, type CategoryImportRow } from '@/api/equipment-category'

  defineOptions({ name: 'CategoryImportDialog' })

  const props = defineProps<{ visible: boolean }>()
  const emit = defineEmits<{
    'update:visible': [value: boolean]
    success: []
  }>()

  // 单文件大小上限 10MB
  const MAX_FILE_SIZE = 10 * 1024 * 1024
  // 单次导入行数上限，避免超大文件导致前端卡顿/后端超时
  const MAX_IMPORT_ROWS = 1000

  const selectedFile = ref<File | null>(null)
  const submitLoading = ref(false)
  const errorMsg = ref('')

  // 下载导入模板（含表头、字段说明与示例行）
  function handleDownloadTemplate() {
    const aoa = [
      ['分类名称(必填)', '上级分类(选填,完整路径)', '备注(选填)'],
      ['高压设备', '电气设备', '示例：电气设备下的子分类'],
      ['储罐设备', '', '示例：顶级分类，上级留空']
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '设备分类导入模板')
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    saveAs(
      new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }),
      '设备分类导入模板.xlsx'
    )
  }

  // 文件选择/变更（auto-upload 关闭，仅记录文件并做前置校验）
  function handleFileChange(file: UploadFile) {
    errorMsg.value = ''
    const raw = file.raw
    if (!raw) return
    const isExcel = /\.(xlsx|xls)$/i.test(raw.name)
    if (!isExcel) {
      ElMessage.error('只能上传 Excel 文件')
      selectedFile.value = null
      return
    }
    if (raw.size > MAX_FILE_SIZE) {
      ElMessage.error('文件大小不能超过 10MB')
      selectedFile.value = null
      return
    }
    selectedFile.value = raw
  }

  function handleExceed() {
    ElMessage.warning('一次只能导入一个文件，请先移除已选文件')
  }

  function handleRemove() {
    selectedFile.value = null
    errorMsg.value = ''
  }

  // 读取并解析 Excel 为行数据
  function parseExcel(file: File): Promise<CategoryImportRow[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer)
          const wb = XLSX.read(data, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const json = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 })
          // 跳过表头行，映射为行对象
          const rows: CategoryImportRow[] = json
            .slice(1)
            .filter((r) => Array.isArray(r) && r.length > 0 && String(r[0] ?? '').trim())
            .map((r) => ({
              name: String(r[0] ?? '').trim(),
              parentPath: String(r[1] ?? '').trim(),
              remark: String(r[2] ?? '').trim()
            }))
          resolve(rows)
        } catch {
          reject(new Error('文件解析失败，请检查文件格式'))
        }
      }
      reader.onerror = () => reject(new Error('文件读取失败'))
      reader.readAsArrayBuffer(file)
    })
  }

  async function handleImport() {
    if (!selectedFile.value) return
    submitLoading.value = true
    errorMsg.value = ''
    try {
      const rows = await parseExcel(selectedFile.value)
      if (rows.length === 0) {
        errorMsg.value = '文件中没有有效数据'
        return
      }
      if (rows.length > MAX_IMPORT_ROWS) {
        errorMsg.value = `单次最多导入 ${MAX_IMPORT_ROWS} 行，当前文件含 ${rows.length} 行`
        return
      }
      const { data } = await importCategories(rows)
      ElMessage.success(`成功导入 ${data?.successCount ?? 0} 个分类`)
      emit('update:visible', false)
      emit('success')
    } catch (error: any) {
      // 校验类错误展示在弹窗内，便于用户对照修正
      errorMsg.value = error.message || '导入失败'
    } finally {
      submitLoading.value = false
    }
  }

  function handleClosed() {
    selectedFile.value = null
    errorMsg.value = ''
  }
</script>

<style lang="scss" scoped>
  .import-body {
    display: flex;
    flex-direction: column;
    gap: 16px;

    .import-tip {
      p {
        margin: 2px 0;
        line-height: 1.6;
      }
    }

    .tpl-btn {
      align-self: flex-start;
    }

    .upload-icon {
      font-size: 48px;
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
  }
</style>
