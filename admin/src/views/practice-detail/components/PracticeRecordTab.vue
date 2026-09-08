<!--
  练习记录 Tab：一人一行，汇总该人的练习次数与最近一次成绩。
  参与范围为「指定员工」时，一次都没练过的人也会列出并标为未开始——管理员通常最关心还有谁没练。
  「全员参与」不落参与人员记录，无法枚举应练人员，故只列练过的人。
  点「查看」进抽屉：先看这个人的每次练习，再点某次看逐题作答。
-->
<template>
  <div class="record-tab">
    <div class="filter-bar">
      <ElInput
        v-model="filter.keyword"
        placeholder="搜索人员姓名"
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
          v-for="o in RECORD_STATUS_OPTIONS"
          :key="o.value"
          :label="o.label"
          :value="o.value"
        />
      </ElSelect>
      <ElButton type="primary" @click="handleSearch">查询</ElButton>
      <ElButton @click="handleReset">重置</ElButton>
    </div>

    <ElTable v-loading="loading" :data="list" size="small" class="record-table">
      <ElTableColumn type="index" label="#" width="56" align="center" :index="indexBase" />
      <ElTableColumn prop="name" label="人员" min-width="110" show-overflow-tooltip />
      <ElTableColumn label="类型" width="80" align="center">
        <template #default="{ row }">
          <ElTag
            :type="row.userType === 'internal' ? 'primary' : 'warning'"
            size="small"
            disable-transitions
          >
            {{ row.userType === 'internal' ? '内部' : '外部' }}
          </ElTag>
        </template>
      </ElTableColumn>
      <ElTableColumn label="所属公司" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">{{ row.companyName || '-' }}</template>
      </ElTableColumn>
      <ElTableColumn label="所属部门" min-width="130" show-overflow-tooltip>
        <template #default="{ row }">{{ row.departmentName || '-' }}</template>
      </ElTableColumn>
      <ElTableColumn label="练习次数" width="90" align="center">
        <template #default="{ row }">{{ row.attemptCount || '-' }}</template>
      </ElTableColumn>
      <ElTableColumn label="最近答题" width="100" align="center">
        <template #default="{ row }">
          <span v-if="row.attemptCount">{{ row.lastAnsweredCount }}/{{ row.lastTotalCount }}</span>
          <span v-else>-</span>
        </template>
      </ElTableColumn>
      <ElTableColumn label="最近正确率" width="110" align="center">
        <template #default="{ row }">
          <span v-if="row.lastAccuracy !== null" :class="accuracyClass(row.lastAccuracy)">
            {{ row.lastAccuracy }}%
          </span>
          <span v-else>-</span>
        </template>
      </ElTableColumn>
      <ElTableColumn label="状态" width="90" align="center">
        <template #default="{ row }">
          <ElTag :type="statusTagType(row.status)" size="small" disable-transitions>
            {{ RECORD_STATUS_TEXT[row.status] || row.status }}
          </ElTag>
        </template>
      </ElTableColumn>
      <ElTableColumn label="最近练习时间" width="150" align="center">
        <template #default="{ row }">{{ formatTime(row.lastPracticeTime) }}</template>
      </ElTableColumn>
      <ElTableColumn label="操作" width="80" align="center" fixed="right">
        <template #default="{ row }">
          <ElButton link type="primary" :disabled="!row.attemptCount" @click="handleView(row)">
            查看
          </ElButton>
        </template>
      </ElTableColumn>
      <template #empty>暂无练习记录</template>
    </ElTable>

    <ElPagination
      v-if="total > 0"
      class="record-pager"
      layout="total, sizes, prev, pager, next, jumper"
      :current-page="page"
      :page-size="pageSize"
      :page-sizes="[10, 20, 50]"
      :total="total"
      @current-change="handlePageChange"
      @size-change="handleSizeChange"
    />

    <RecordDetailDrawer
      v-model="drawerVisible"
      :practice-id="practiceId"
      :user="activeUser"
      @closed="activeUser = null"
    />
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive, onMounted } from 'vue'
  import { ElMessage } from 'element-plus'
  import { Search } from '@element-plus/icons-vue'
  import { practiceApi, type PracticeRecordUser } from '@/api/practice'
  import RecordDetailDrawer from './RecordDetailDrawer.vue'

  defineOptions({ name: 'PracticeRecordTab' })

  const props = defineProps<{ practiceId: number }>()

  /** 状态文案与筛选项，与后端 practice-record.service 的状态常量对齐 */
  const RECORD_STATUS_TEXT: Record<string, string> = {
    not_started: '未开始',
    ongoing: '练习中',
    finished: '已完成'
  }
  const RECORD_STATUS_OPTIONS = [
    { label: '未开始', value: 'not_started' },
    { label: '练习中', value: 'ongoing' },
    { label: '已完成', value: 'finished' }
  ]

  const loading = ref(false)
  const list = ref<PracticeRecordUser[]>([])
  const page = ref(1)
  const pageSize = ref(10)
  const total = ref(0)
  const filter = reactive({ keyword: '', status: '' })

  const drawerVisible = ref(false)
  const activeUser = ref<PracticeRecordUser | null>(null)

  const indexBase = (i: number) => (page.value - 1) * pageSize.value + i + 1

  /** 正确率着色：低于 60% 标红提示，60-84 常规，85 以上标绿 */
  function accuracyClass(v: number) {
    if (v < 60) return 'acc-low'
    if (v < 85) return 'acc-mid'
    return 'acc-high'
  }

  function statusTagType(status: string) {
    const map: Record<string, 'info' | 'warning' | 'success'> = {
      not_started: 'info',
      ongoing: 'warning',
      finished: 'success'
    }
    return map[status] || 'info'
  }

  function formatTime(value?: string | null) {
    if (!value) return '-'
    return value.replace('T', ' ').slice(0, 16)
  }

  async function fetchList() {
    loading.value = true
    try {
      const { data } = await practiceApi.getRecordPage(props.practiceId, {
        keyword: filter.keyword || undefined,
        status: filter.status || undefined,
        page: page.value,
        pageSize: pageSize.value
      })
      list.value = data.list
      total.value = data.pagination.total
    } catch (e: any) {
      ElMessage.error(e?.message || '获取练习记录失败')
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

  function handleView(row: PracticeRecordUser) {
    activeUser.value = row
    drawerVisible.value = true
  }

  onMounted(fetchList)
</script>

<style lang="scss" scoped>
  .record-tab {
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
    }

    .record-table {
      flex: 1;
      min-height: 0;
    }

    .record-pager {
      flex-shrink: 0;
      justify-content: flex-end;
      margin-top: 12px;
    }

    // 正确率着色：偏低的要能一眼挑出来
    .acc-low {
      color: var(--el-color-danger);
    }

    .acc-mid {
      color: var(--el-text-color-primary);
    }

    .acc-high {
      color: var(--el-color-success);
    }
  }
</style>
