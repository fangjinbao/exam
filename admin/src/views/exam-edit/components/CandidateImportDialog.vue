<!--
  考生批量导入对话框：下载模板、选择文件、确认导入。
  导入只把表格行「匹配」为系统内已存在的人员，不新建账号——考试考生必须指向真实的
  内部人员或外部考生，凭一张表格凭空建号会绕过组织管理与外部考生管理的既有校验。
  匹配结果不落库，交由父页合并进已选列表随考试一起保存，因此误导入可直接在页面上删掉。
-->
<template>
  <ElDialog
    :model-value="modelValue"
    title="批量导入考生"
    width="520px"
    :close-on-click-modal="false"
    @update:model-value="handleVisibleChange"
    @closed="handleClosed"
  >
    <div class="import-body">
      <ol class="import-steps">
        <li>下载导入模板，按模板格式填写考生信息</li>
        <li>内部考生填统一身份账号，外部考生填手机号；身份证号仅外部考生需要，用于二次核验</li>
        <li>上传填写好的文件，系统按账号匹配已有人员并加入已选列表</li>
      </ol>

      <div class="import-template">
        <ElButton type="primary" link :icon="Download" @click="handleDownloadTemplate">
          下载导入模板
        </ElButton>
      </div>

      <!-- 手动触发：先在前端解析成行数据再走匹配接口，不直传文件 -->
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
          <div class="upload-tip">仅支持 .xlsx / .xls 格式，单个文件，单次最多 1000 行</div>
        </template>
      </ElUpload>

      <!-- 跳过明细：逐行匹配后展示未匹配上的行号与原因 -->
      <ElAlert
        v-if="skipped.length"
        type="warning"
        :closable="false"
        show-icon
        class="import-skipped"
      >
        <template #title>本次跳过 {{ skipped.length }} 行（其余已加入已选列表）</template>
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
  import { examApi, type ImportExamCandidateRow } from '@/api/exam'
  import type { PickedCandidate } from '@/components/business/pickers/CandidatePickerDialog.vue'

  defineOptions({ name: 'CandidateImportDialog' })

  defineProps<{ modelValue: boolean }>()
  const emit = defineEmits<{
    'update:modelValue': [value: boolean]
    /** 匹配成功的考生，由父页合并进已选列表 */
    imported: [list: PickedCandidate[]]
  }>()

  const importing = ref(false)
  const selectedFile = ref<UploadRawFile | null>(null)
  // 逐行匹配后被跳过的行明细（行号 + 原因）
  const skipped = ref<{ row: number; reason: string }[]>([])

  // 模板中文表头 → 后端字段名映射（顺序即模板列顺序）
  const HEADER_MAP: Record<string, keyof ImportExamCandidateRow> = {
    考生类型: 'candidateType',
    姓名: 'name',
    登录账号: 'account',
    身份证号: 'idCard'
  }

  function handleVisibleChange(value: boolean) {
    emit('update:modelValue', value)
  }

  /** 记录待导入文件（覆盖式，仅保留最后选择的一个），并清空上次的跳过明细 */
  function handleFileChange(file: UploadFile) {
    selectedFile.value = file.raw ?? null
    skipped.value = []
  }

  function handleExceed() {
    ElMessage.warning('仅支持上传单个文件，请先移除已选择的文件')
  }

  /** 下载导入模板：前端生成含表头与示例行的 xlsx */
  function handleDownloadTemplate() {
    const example = ['内部', '张三', 'zhangsan', '']
    // 登录账号（索引 2）、身份证号（索引 3）设文本格式：手机号与 18 位身份证号
    // 若被 Excel 当数值会因超出精度上限而舍位
    downloadTemplate(Object.keys(HEADER_MAP), example, '考生导入模板', '考生', [2, 3])
  }

  async function handleConfirm() {
    if (!selectedFile.value) {
      ElMessage.warning('请先选择要导入的文件')
      return
    }
    importing.value = true
    try {
      const rows = await parseExcel<ImportExamCandidateRow>(selectedFile.value, HEADER_MAP)
      if (!rows.length) {
        ElMessage.warning('文件内容为空，请按模板填写后再导入')
        return
      }
      const { data } = await examApi.resolveImportCandidates(rows)
      skipped.value = data.errors
      if (data.matched.length) {
        emit(
          'imported',
          data.matched.map((m) => ({
            type: m.type,
            id: m.id,
            name: m.name,
            belong: m.belong,
            account: m.account ?? null,
            idCard: m.idCard ?? null,
            phone: m.phone ?? null
          }))
        )
      }
      if (!data.matched.length) {
        ElMessage.warning('没有匹配到任何考生，请检查文件内容')
      } else if (data.errors.length) {
        ElMessage.warning(
          `匹配到 ${data.matched.length} 名考生，跳过 ${data.errors.length} 行，详见下方明细`
        )
      } else {
        ElMessage.success(`已匹配 ${data.matched.length} 名考生并加入已选列表`)
      }
      // 有跳过行时保留对话框展示明细，全部成功才自动关闭
      if (data.matched.length && !data.errors.length) handleVisibleChange(false)
    } catch (error: any) {
      ElMessage.error(error?.message || '导入失败，请检查文件内容')
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
