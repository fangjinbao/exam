<!--
  阅卷中心：按考试组织的阅卷入口
  一行一场考试，显示交卷份数与待批阅份数；点「快速批阅」进工作台逐个考生阅，
  发布/撤回在此按整场批量执行（单份发布仍在工作台内）。
-->

<template>
  <div class="grading">
    <!-- 搜索区：与列表同卡内，不单独套卡片 -->
    <div class="body-card">
      <ElForm :model="filterForm" :inline="true" class="filter-form">
        <ElFormItem label="考试名称">
          <ElInput
            v-model="filterForm.examName"
            placeholder="输入考试名称"
            clearable
            class="filter-input"
            @keyup.enter="handleSearch"
          />
        </ElFormItem>
        <ElFormItem label="阅卷进度">
          <ElSelect v-model="filterForm.progress" placeholder="全部" clearable class="filter-input">
            <ElOption
              v-for="opt in GRADING_PROGRESS_OPTIONS"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem>
          <ElButton type="primary" :icon="Search" @click="handleSearch">搜索</ElButton>
          <ElButton @click="handleReset">重置</ElButton>
        </ElFormItem>
      </ElForm>

      <div class="table-container">
        <ElTable v-loading="loading" :data="tableData" height="100%" style="width: 100%">
          <ElTableColumn prop="examNo" label="考试编号" width="190" fixed="left" />
          <ElTableColumn prop="name" label="考试名称" min-width="180" show-overflow-tooltip />
          <ElTableColumn label="来源" min-width="150" show-overflow-tooltip>
            <template #default="{ row }">
              <ElTag v-if="row.sourceName" type="info" size="small" disable-transitions>
                {{ row.sourceName }}
              </ElTag>
              <span v-else>-</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="考试时间" min-width="230">
            <template #default="{ row }">
              {{ formatTime(row.startTime) }} 至 {{ formatTime(row.endTime) }}
            </template>
          </ElTableColumn>
          <ElTableColumn prop="candidateCount" label="考试人数" width="100" align="center" />
          <ElTableColumn prop="sheetCount" label="交卷人数" width="100" align="center" />
          <!-- 待批阅是本页的核心信息：有待阅时用警示色，阅完转为常规色 -->
          <ElTableColumn label="待批阅" width="100" align="center">
            <template #default="{ row }">
              <span :class="row.pendingCount > 0 ? 'pending-num' : 'done-num'">
                {{ row.pendingCount }}
              </span>
            </template>
          </ElTableColumn>
          <!-- 操作列间距与单行约束由全局 .table-actions 统一（见 assets/styles/el-ui.scss） -->
          <ElTableColumn
            label="操作"
            width="250"
            align="left"
            fixed="right"
            class-name="table-actions"
          >
            <template #default="{ row }">
              <ElButton v-auth="'detail'" link type="primary" @click="handleDetail(row)">
                查看详情
              </ElButton>
              <ElButton v-auth="'detail'" link type="primary" @click="handleGrade(row)">
                快速批阅
              </ElButton>
              <ElButton
                v-if="row.publishedCount < row.sheetCount"
                v-auth="'publish'"
                link
                type="success"
                @click="handlePublishExam(row)"
              >
                发布成绩
              </ElButton>
              <ElButton
                v-if="row.publishedCount > 0"
                v-auth="'withdraw'"
                link
                type="warning"
                @click="handleWithdrawExam(row)"
              >
                撤回成绩
              </ElButton>
            </template>
          </ElTableColumn>
          <template #empty>暂无待阅考试</template>
        </ElTable>
      </div>

      <div class="pagination-container">
        <ElPagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="loadExams"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { Search } from '@element-plus/icons-vue'
  import { gradingApi, GRADING_PROGRESS_OPTIONS, type GradingExam } from '@/api/grading'

  defineOptions({ name: 'Grading' })

  const router = useRouter()
  const loading = ref(false)
  const tableData = ref<GradingExam[]>([])

  const filterForm = reactive({ examName: '', progress: '' })
  const pagination = reactive({ page: 1, pageSize: 10, total: 0 })

  /** 加载考试维度阅卷列表 */
  async function loadExams() {
    loading.value = true
    try {
      const { data } = await gradingApi.getExams({
        examName: filterForm.examName || undefined,
        progress: filterForm.progress || undefined,
        page: pagination.page,
        pageSize: pagination.pageSize
      })
      tableData.value = data.list
      pagination.total = data.pagination.total
    } catch (error: any) {
      ElMessage.error(error.message || '加载阅卷列表失败')
    } finally {
      loading.value = false
    }
  }

  function handleSearch() {
    pagination.page = 1
    loadExams()
  }

  function handleReset() {
    filterForm.examName = ''
    filterForm.progress = ''
    pagination.page = 1
    loadExams()
  }

  function handleSizeChange() {
    pagination.page = 1
    loadExams()
  }

  /**
   * 查看该场考试的阅卷详情（工作台，停在名单不自动选人）
   *
   * 不跳 /exam-detail：那是考试管理模块的页面，按后端菜单模式只有分到「考试管理」
   * 菜单的角色才会注册该路由。而本按钮的显隐只看 exam:grading:detail，
   * 只有阅卷权限的账号点了会因 to.matched 为空落到 404（看起来像功能坏了）。
   * 阅卷中心要看的本就是「这场考的阅卷情况」，留在工作台内即可。
   */
  function handleDetail(row: GradingExam) {
    router.push({ path: '/grading-workspace', query: { id: row.id, name: row.name } })
  }

  /** 快速批阅：进工作台并直接落到第一个待批阅的考生 */
  function handleGrade(row: GradingExam) {
    router.push({
      path: '/grading-workspace',
      query: { id: row.id, name: row.name, mode: 'quick' }
    })
  }

  function formatTime(value?: string | null) {
    if (!value) return '-'
    return value.replace('T', ' ').slice(0, 16)
  }
  /**
   * 整场发布成绩
   * 后端逐份发布并跳过主观题未阅完的，故此处按返回的 published/skipped 分情况提示，
   * 不能笼统报「发布成功」——有人被跳过时用户必须知道。
   */
  async function handlePublishExam(row: GradingExam) {
    const pendingHint =
      row.pendingCount > 0 ? `其中 ${row.pendingCount} 份尚未阅完，将被跳过。` : ''
    try {
      await ElMessageBox.confirm(
        `确认发布「${row.name}」的成绩？${pendingHint}发布后考生可查看成绩。`,
        '整场发布成绩',
        { type: 'warning' }
      )
    } catch {
      return
    }
    try {
      const { data } = await gradingApi.publishExamScores(row.id)
      if (data.skipped > 0) {
        ElMessage.warning(
          `已发布 ${data.published} 份，跳过 ${data.skipped} 份${data.reasons.length ? `：${data.reasons.join('；')}` : ''}`
        )
      } else {
        ElMessage.success(`已发布 ${data.published} 份成绩`)
      }
      loadExams()
    } catch (error: any) {
      ElMessage.error(error.message || '发布成绩失败')
    }
  }

  /** 整场撤回成绩 */
  async function handleWithdrawExam(row: GradingExam) {
    try {
      await ElMessageBox.confirm(
        `确认撤回「${row.name}」已发布的 ${row.publishedCount} 份成绩？撤回后考生将无法查看。`,
        '整场撤回成绩',
        { type: 'warning' }
      )
    } catch {
      return
    }
    try {
      const { data } = await gradingApi.withdrawExamScores(row.id)
      if (data.skipped > 0) {
        ElMessage.warning(
          `已撤回 ${data.withdrawn} 份，跳过 ${data.skipped} 份${data.reasons.length ? `：${data.reasons.join('；')}` : ''}`
        )
      } else {
        ElMessage.success(`已撤回 ${data.withdrawn} 份成绩`)
      }
      loadExams()
    } catch (error: any) {
      ElMessage.error(error.message || '撤回成绩失败')
    }
  }

  onMounted(loadExams)
</script>

<style lang="scss" scoped>
  .grading {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  // 与 exam-detail 的 .body-card 同款：白底 + 12px 圆角，不用 ElCard
  .body-card {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    padding: 20px;
    background: var(--el-bg-color);
    border-radius: 12px;
  }

  .filter-input {
    width: 200px;
  }

  .filter-form {
    flex-shrink: 0;

    :deep(.el-form-item) {
      margin-bottom: 12px;
    }
  }

  .table-container {
    flex: 1;
    min-height: 0;
  }

  .pagination-container {
    display: flex;
    flex-shrink: 0;
    justify-content: flex-end;
    padding-top: 12px;
  }

  // 待批阅份数：有待阅时用警示色，阅完转为常规色，一眼分辨哪场还要干活
  .pending-num {
    font-size: 15px;
    font-weight: 600;
    color: var(--el-color-warning);
  }

  .done-num {
    font-size: 15px;
    font-weight: 600;
    color: var(--el-color-success);
  }
</style>
