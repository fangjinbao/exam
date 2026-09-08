<!--
  考生成绩 Tab：一人一行，列出该场考试的每位考生及其成绩。
  全集取「考试已分配的考生」而非「已有答卷」——没参加的人也要列出并标未参加，
  否则管理员看不出还差谁没考。
  导出走后端全量接口按当前筛选取数，不导当前分页，避免只导出眼前这一页。
-->
<template>
  <div class="score-tab">
    <div class="filter-bar">
      <ElInput
        v-model="filter.keyword"
        placeholder="搜索考生姓名"
        clearable
        :prefix-icon="Search"
        class="filter-input"
        @keyup.enter="handleSearch"
        @clear="handleSearch"
      />
      <ElSelect
        v-model="filter.status"
        placeholder="全部状态"
        clearable
        class="filter-select"
        @change="handleSearch"
      >
        <ElOption
          v-for="o in EXAM_SCORE_STATUS_OPTIONS"
          :key="o.value"
          :label="o.label"
          :value="o.value"
        />
      </ElSelect>
      <ElButton type="primary" @click="handleSearch">查询</ElButton>
      <ElButton @click="handleReset">重置</ElButton>
      <ElButton
        class="export-btn"
        :icon="Download"
        :loading="exporting"
        :disabled="total === 0"
        @click="handleExport"
      >
        成绩导出
      </ElButton>
    </div>

    <ElTable v-loading="loading" :data="list" size="small" class="score-table">
      <ElTableColumn type="index" label="#" width="56" align="center" :index="indexBase" />
      <ElTableColumn prop="name" label="考生" min-width="110" show-overflow-tooltip />
      <ElTableColumn label="类型" width="80" align="center">
        <template #default="{ row }">
          <ElTag
            :type="row.candidateType === 'internal' ? 'primary' : 'warning'"
            size="small"
            disable-transitions
          >
            {{ row.candidateType === 'internal' ? '内部' : '外部' }}
          </ElTag>
        </template>
      </ElTableColumn>
      <!-- 账号含义内外部不同，表头挂提示，与选择考生/考生名单同口径 -->
      <ElTableColumn prop="account" min-width="130" show-overflow-tooltip>
        <template #header>
          <span class="th-with-tip">
            账号
            <ElTooltip placement="top">
              <template #content>
                内部人员为统一身份账号<br />
                外部考生为账号
              </template>
              <ElIcon class="th-tip-icon"><QuestionFilled /></ElIcon>
            </ElTooltip>
          </span>
        </template>
        <template #default="{ row }">{{ row.account || '-' }}</template>
      </ElTableColumn>
      <ElTableColumn label="身份证号" prop="idCard" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">{{ row.idCard || '-' }}</template>
      </ElTableColumn>
      <ElTableColumn label="手机号" prop="phone" min-width="115" show-overflow-tooltip>
        <template #default="{ row }">{{ row.phone || '-' }}</template>
      </ElTableColumn>
      <ElTableColumn label="所属公司" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">{{ row.companyName || '-' }}</template>
      </ElTableColumn>
      <ElTableColumn label="所属部门" min-width="130" show-overflow-tooltip>
        <template #default="{ row }">{{ row.departmentName || '-' }}</template>
      </ElTableColumn>
      <ElTableColumn label="状态" width="90" align="center">
        <template #default="{ row }">
          <ElTag :type="statusTagType(row.status)" size="small" disable-transitions>
            {{ EXAM_SCORE_STATUS_TEXT[row.status] || row.status }}
          </ElTag>
        </template>
      </ElTableColumn>
      <ElTableColumn label="客观分" width="80" align="center">
        <template #default="{ row }">{{ scoreText(row.objectiveScore) }}</template>
      </ElTableColumn>
      <ElTableColumn label="主观分" width="80" align="center">
        <template #default="{ row }">{{ scoreText(row.subjectiveScore) }}</template>
      </ElTableColumn>
      <ElTableColumn label="总分" width="80" align="center">
        <template #default="{ row }">{{ scoreText(row.totalScore) }}</template>
      </ElTableColumn>
      <ElTableColumn label="是否及格" width="90" align="center">
        <template #default="{ row }">{{ passedText(row.passed) }}</template>
      </ElTableColumn>
      <ElTableColumn label="用时" width="90" align="center">
        <template #default="{ row }">
          {{ row.durationMinutes !== null ? `${row.durationMinutes} 分钟` : '-' }}
        </template>
      </ElTableColumn>
      <ElTableColumn label="交卷时间" width="150" align="center">
        <template #default="{ row }">{{ formatTime(row.submitTime) }}</template>
      </ElTableColumn>
      <template #empty>暂无考生</template>
    </ElTable>

    <ElPagination
      v-if="total > 0"
      class="score-pager"
      layout="total, sizes, prev, pager, next, jumper"
      :current-page="page"
      :page-size="pageSize"
      :page-sizes="[10, 20, 50]"
      :total="total"
      @current-change="handlePageChange"
      @size-change="handleSizeChange"
    />
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive, onMounted } from 'vue'
  import { ElMessage } from 'element-plus'
  import { Search, Download, QuestionFilled } from '@element-plus/icons-vue'
  import { exportToExcel } from '@/utils/excel'
  import {
    examApi,
    EXAM_SCORE_STATUS_TEXT,
    EXAM_SCORE_STATUS_OPTIONS,
    type ExamScoreItem
  } from '@/api/exam'

  defineOptions({ name: 'ExamScoreTab' })

  const props = defineProps<{
    examId: number
    /** 考试名称，用于导出文件名 */
    examName: string
  }>()

  const loading = ref(false)
  const exporting = ref(false)
  const list = ref<ExamScoreItem[]>([])
  const page = ref(1)
  const pageSize = ref(10)
  const total = ref(0)
  const filter = reactive({ keyword: '', status: '' })

  const indexBase = (i: number) => (page.value - 1) * pageSize.value + i + 1

  function statusTagType(status: string) {
    const map: Record<string, 'info' | 'warning' | 'primary' | 'success'> = {
      not_started: 'info',
      ongoing: 'warning',
      pending_grading: 'primary',
      completed: 'success'
    }
    return map[status] || 'info'
  }

  /** 分数为 null 表示未判分/成绩未发布，统一显示「-」 */
  function scoreText(value: number | null) {
    return value === null || value === undefined ? '-' : String(value)
  }

  /** 及格判定在成绩发布后才有值，未发布显示「-」 */
  function passedText(value: boolean | null) {
    if (value === null || value === undefined) return '-'
    return value ? '及格' : '不及格'
  }

  function formatTime(value?: string | null) {
    if (!value) return '-'
    return value.replace('T', ' ').slice(0, 16)
  }

  /**
   * 净化文件名：考试名称由用户自由填写，可能含 / \ : * ? " < > | 等
   * 在 Windows/macOS 下非法或会被当作路径分隔的字符，直接拼进文件名会导致保存异常
   */
  function safeFileName(name: string) {
    return name.replace(/[\\/:*?"<>|]/g, '_').trim()
  }

  async function fetchList() {
    loading.value = true
    try {
      const { data } = await examApi.getScorePage(props.examId, {
        keyword: filter.keyword || undefined,
        status: filter.status || undefined,
        page: page.value,
        pageSize: pageSize.value
      })
      list.value = data.list
      total.value = data.pagination.total
    } catch (e: any) {
      ElMessage.error(e?.message || '获取考生成绩失败')
    } finally {
      loading.value = false
    }
  }

  /** 条件变化后回到首页，否则在第 3 页搜出 2 条会看到空列表 */
  function handleSearch() {
    page.value = 1
    fetchList()
  }

  function handleReset() {
    filter.keyword = ''
    filter.status = ''
    handleSearch()
  }

  function handlePageChange(p: number) {
    page.value = p
    fetchList()
  }

  function handleSizeChange(s: number) {
    pageSize.value = s
    page.value = 1
    fetchList()
  }

  /** 导出：按当前筛选条件走后端全量接口，导出结果与列表所见口径一致但不受分页限制 */
  async function handleExport() {
    exporting.value = true
    try {
      const { data } = await examApi.getScoreExport(props.examId, {
        keyword: filter.keyword || undefined,
        status: filter.status || undefined
      })
      if (!data.length) {
        ElMessage.warning('暂无可导出的成绩数据')
        return
      }
      const rows = data.map((item) => ({
        name: item.name,
        candidateType: item.candidateType === 'internal' ? '内部' : '外部',
        account: item.account || '',
        idCard: item.idCard || '',
        phone: item.phone || '',
        companyName: item.companyName || '',
        departmentName: item.departmentName || '',
        status: EXAM_SCORE_STATUS_TEXT[item.status] || item.status,
        objectiveScore: scoreText(item.objectiveScore),
        subjectiveScore: scoreText(item.subjectiveScore),
        totalScore: scoreText(item.totalScore),
        passed: passedText(item.passed),
        durationMinutes: item.durationMinutes !== null ? item.durationMinutes : '',
        submitTime: formatTime(item.submitTime)
      }))
      exportToExcel(
        [
          { header: '考生姓名', field: 'name' },
          { header: '考生类型', field: 'candidateType' },
          { header: '账号', field: 'account' },
          { header: '身份证号', field: 'idCard' },
          { header: '手机号', field: 'phone' },
          { header: '所属公司', field: 'companyName' },
          { header: '所属部门', field: 'departmentName' },
          { header: '考试状态', field: 'status' },
          { header: '客观分', field: 'objectiveScore' },
          { header: '主观分', field: 'subjectiveScore' },
          { header: '总分', field: 'totalScore' },
          { header: '是否及格', field: 'passed' },
          { header: '用时(分钟)', field: 'durationMinutes' },
          { header: '交卷时间', field: 'submitTime' }
        ],
        rows,
        `${safeFileName(props.examName) || '考试'}-考生成绩`,
        '考生成绩'
      )
      ElMessage.success(`已导出 ${rows.length} 条成绩`)
    } catch (e: any) {
      ElMessage.error(e?.message || '导出失败')
    } finally {
      exporting.value = false
    }
  }

  onMounted(fetchList)
</script>

<style lang="scss" scoped>
  .score-tab {
    display: flex;
    flex-direction: column;
    height: 100%;

    .filter-bar {
      display: flex;
      flex-shrink: 0;
      gap: 10px;
      margin-bottom: 12px;

      .filter-input {
        width: 200px;
      }

      .filter-select {
        width: 130px;
      }

      // 导出与查询/重置分区：靠右独立成组，避免误点
      .export-btn {
        margin-left: auto;
      }
    }

    .score-table {
      flex: 1;
      min-height: 0;

      /* 账号列表头挂了问号提示，样式走公共 mixin */
      @include tableHeaderTip();
    }

    .score-pager {
      flex-shrink: 0;
      justify-content: flex-end;
      margin-top: 12px;
    }
  }
</style>
