<!--
  考试台账：一场考试一行的全量流水

  当前为静态演示数据（./mock.ts），后端接口尚未落地。
  与首页「待处理的考试」的分工：那张表只列有待办的场次、是开工入口；
  台账列全部场次、是查阅口径，故列更全（编号、试卷、时长、及格线、平均分、及格率）。

  平均分与及格率在成绩未发布时渲染成「—」。填 0 会被读成「平均分 0 分」，
  比留空更容易误导。
-->

<template>
  <div class="ledger-page">
    <!-- 筛选卡片 -->
    <ElCard shadow="never" class="filter-card">
      <ElForm :model="filterForm" :inline="true" class="filter-form">
        <ElFormItem label="考试名称">
          <ElInput
            v-model="filterForm.keyword"
            placeholder="输入考试名称或编号"
            clearable
            class="filter-input"
          />
        </ElFormItem>
        <ElFormItem label="所属公司">
          <ElSelect
            v-model="filterForm.companyName"
            placeholder="全部"
            clearable
            class="filter-select"
          >
            <ElOption v-for="c in MOCK_COMPANIES" :key="c" :label="c" :value="c" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="状态">
          <ElSelect v-model="filterForm.status" placeholder="全部" clearable class="filter-select">
            <ElOption label="未发布" value="unpublished" />
            <ElOption label="已发布" value="published" />
            <ElOption label="进行中" value="ongoing" />
            <ElOption label="已结束" value="finished" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem>
          <ElButton type="primary" :icon="Search" @click="handleSearch">搜索</ElButton>
          <ElButton @click="handleReset">重置</ElButton>
        </ElFormItem>
      </ElForm>
    </ElCard>

    <!-- 表格卡片 -->
    <ElCard shadow="never" class="table-card">
      <div class="table-header">
        <!-- 汇总行：台账的价值在于能一眼看到总量，不必自己把每行加一遍 -->
        <div class="summary">
          <span class="summary-item"
            >共 <b>{{ filtered.length }}</b> 场</span
          >
          <span class="summary-item"
            >应考 <b>{{ totals.candidate }}</b> 人</span
          >
          <span class="summary-item"
            >实考 <b>{{ totals.actual }}</b> 人</span
          >
          <span class="summary-item">
            缺考 <b :class="{ 'num-warn': totals.absent > 0 }">{{ totals.absent }}</b> 人
          </span>
          <span class="summary-item">
            待阅 <b :class="{ 'num-warn': totals.pending > 0 }">{{ totals.pending }}</b> 份
          </span>
        </div>
      </div>

      <div class="table-container">
        <ElTable v-loading="loading" :data="pagedRows" stripe>
          <ElTableColumn prop="examNo" label="考试编号" width="140" show-overflow-tooltip />
          <ElTableColumn prop="name" label="考试名称" min-width="200" show-overflow-tooltip />
          <ElTableColumn prop="companyName" label="所属公司" width="120" show-overflow-tooltip />
          <ElTableColumn prop="paperName" label="试卷" min-width="150" show-overflow-tooltip />
          <ElTableColumn prop="startTime" label="考试时间" width="150" />
          <ElTableColumn label="时长" width="80" align="center">
            <template #default="{ row }">{{ row.duration }} 分</template>
          </ElTableColumn>
          <ElTableColumn label="及格线" width="80" align="center">
            <template #default="{ row }">{{ row.passScore }} 分</template>
          </ElTableColumn>
          <ElTableColumn label="应考" width="80" align="center">
            <template #default="{ row }">
              <span class="num-cell">{{ row.candidateCount }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="实考" width="80" align="center">
            <template #default="{ row }">
              <span class="num-cell">{{ row.actualCount }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="缺考" width="80" align="center">
            <template #default="{ row }">
              <!-- 未结束的考试谈不上缺考，给「—」而非 0 -->
              <span v-if="row.absentCount === null" class="dash">—</span>
              <b v-else-if="row.absentCount > 0" class="num-warn">{{ row.absentCount }}</b>
              <span v-else class="num-ok">0</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="待阅" width="80" align="center">
            <template #default="{ row }">
              <b v-if="row.pendingCount > 0" class="num-warn">{{ row.pendingCount }}</b>
              <span v-else class="num-ok">0</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="已发布" width="90" align="center">
            <template #default="{ row }">
              <span class="num-cell">{{ row.publishedCount }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="平均分" width="90" align="center">
            <template #default="{ row }">
              <span v-if="row.avgScore === null" class="dash">—</span>
              <span v-else class="num-cell">{{ row.avgScore.toFixed(1) }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="及格率" width="90" align="center">
            <template #default="{ row }">
              <span v-if="row.passRate === null" class="dash">—</span>
              <span v-else class="num-cell">{{ row.passRate }}%</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="状态" width="100" fixed="right">
            <template #default="{ row }">
              <ElTag :type="examStatusTagType(row.status)" size="small" disable-transitions>
                {{ EXAM_STATUS_TEXT[row.status] || row.status }}
              </ElTag>
            </template>
          </ElTableColumn>
        </ElTable>
      </div>

      <div class="pagination">
        <ElPagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="filtered.length"
          layout="total, sizes, prev, pager, next, jumper"
          background
        />
      </div>
    </ElCard>
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive, computed, watch, onMounted } from 'vue'
  import { Search } from '@element-plus/icons-vue'
  import { EXAM_STATUS_TEXT, examStatusTagType } from '@/api/exam'
  import { MOCK_LEDGER, MOCK_COMPANIES, type ExamLedgerRow } from './mock'

  defineOptions({ name: 'AnalyticsExamLedger' })

  const loading = ref(false)
  const rows = ref<ExamLedgerRow[]>([])

  /*
    筛选表单与已生效的筛选条件分开。

    输入框改动不应立刻过滤表格——那样每敲一个字表格就跳一次，
    点「搜索」才把 filterForm 拷进 applied，与考试管理页的行为一致。
  */
  const filterForm = reactive({
    keyword: '',
    companyName: '',
    status: ''
  })

  const applied = ref({ ...filterForm })

  const page = ref(1)
  const pageSize = ref(20)

  const filtered = computed(() => {
    const { keyword, companyName, status } = applied.value
    const kw = keyword.trim().toLowerCase()

    return rows.value.filter((r) => {
      // 编号也参与关键字匹配：台账里常按编号找场次
      const hitKeyword =
        !kw || r.name.toLowerCase().includes(kw) || r.examNo.toLowerCase().includes(kw)
      return (
        hitKeyword &&
        (!companyName || r.companyName === companyName) &&
        (!status || r.status === status)
      )
    })
  })

  /*
    汇总只统计筛选后的行，不是全量。

    筛了「华东分公司」却显示全公司的应考总数会直接把人误导，
    汇总必须跟着当前视图变。
  */
  const totals = computed(() => ({
    candidate: sum(filtered.value.map((r) => r.candidateCount)),
    actual: sum(filtered.value.map((r) => r.actualCount)),
    absent: sum(filtered.value.map((r) => r.absentCount ?? 0)),
    pending: sum(filtered.value.map((r) => r.pendingCount))
  }))

  /*
    前端分页：静态数据全量在内存里，分页只为控制表格高度。
    接后端后要改成服务端分页——场次上万时全量传到浏览器再切页会让首屏卡住。
  */
  const pagedRows = computed(() =>
    filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
  )

  function sum(list: number[]): number {
    return list.reduce((acc, n) => acc + (n || 0), 0)
  }

  function handleSearch() {
    applied.value = { ...filterForm }
  }

  function handleReset() {
    filterForm.keyword = ''
    filterForm.companyName = ''
    filterForm.status = ''
    applied.value = { ...filterForm }
  }

  /*
    筛选或页长变化后回到第一页。

    否则在第 5 页筛出 3 条会看到一张空表——数据是有的，只是当前页码越界了，
    用户很难想到要去点第 1 页。
  */
  watch([applied, pageSize], () => {
    page.value = 1
  })

  function load() {
    loading.value = true
    rows.value = MOCK_LEDGER
    loading.value = false
  }

  onMounted(load)
</script>

<style lang="scss" scoped>
  .ledger-page {
    width: 100%;
  }

  // 卡片一律无边框无阴影、12px 圆角，与考试管理等页一致
  .filter-card,
  .table-card {
    border: none !important;
    border-radius: 12px;
    box-shadow: none !important;
  }

  .table-card {
    margin-top: 16px;
  }

  .filter-form {
    display: flex;
    flex-wrap: wrap;
    row-gap: 4px;
  }

  .filter-input {
    width: 220px;
  }

  .filter-select {
    width: 150px;
  }

  .table-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  // 汇总行：字号压到 13px，是辅助信息不与表格抢注意力
  .summary {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    font-size: 13px;
    color: var(--el-text-color-regular);

    b {
      font-size: 15px;
      font-variant-numeric: tabular-nums;
      color: var(--el-text-color-primary);
    }
  }

  .table-container {
    width: 100%;
  }

  // 数字列统一等宽，翻页时列宽不跳
  .num-cell,
  .num-warn,
  .num-ok {
    font-variant-numeric: tabular-nums;
  }

  .num-warn {
    color: var(--el-color-danger);
  }

  .num-ok {
    color: var(--el-text-color-secondary);
  }

  // 「—」用占位色，避免看起来像一个真实数据
  .dash {
    color: var(--el-text-color-placeholder);
  }

  .pagination {
    display: flex;
    justify-content: flex-end;
    margin-top: 16px;
  }
</style>
