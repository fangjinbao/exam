<!--
  监考中心：按考试组织的监考入口
  一行一场考试，显示应考/进行中/已交卷份数；点「进入监考」进工作台逐个考生看。
  只列指派给自己监考的考试（超管看全部），已结束的留在列表里供事后查看但不可操作。
-->

<template>
  <div class="proctor">
    <!-- 筛选卡片 -->
    <ElCard shadow="never" class="filter-card">
      <ElForm :model="filterForm" :inline="true" class="filter-form">
        <ElFormItem label="考试名称">
          <ElInput
            v-model="filterForm.name"
            placeholder="输入考试名称"
            clearable
            class="filter-input"
            @keyup.enter="handleSearch"
          />
        </ElFormItem>
        <ElFormItem label="考试状态">
          <ElSelect v-model="filterForm.status" placeholder="全部" clearable class="filter-input">
            <ElOption label="未开始" value="published" />
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
      <div class="table-container">
        <ElTable v-loading="loading" :data="tableData" height="100%" style="width: 100%">
          <ElTableColumn prop="examNo" label="考试编号" width="190" fixed="left" />
          <ElTableColumn prop="name" label="考试名称" min-width="180" show-overflow-tooltip />
          <ElTableColumn label="考试时间" min-width="230">
            <template #default="{ row }">
              {{ formatTime(row.startTime) }} 至 {{ formatTime(row.endTime) }}
            </template>
          </ElTableColumn>
          <ElTableColumn prop="duration" label="时长(分钟)" width="110" align="center" />
          <ElTableColumn prop="candidateCount" label="应考人数" width="100" align="center" />
          <!-- 进行中是本页的核心信息：有人在考时用强调色，便于扫一眼定位要盯的场次 -->
          <ElTableColumn label="进行中" width="90" align="center">
            <template #default="{ row }">
              <span :class="row.ongoingCount > 0 ? 'ongoing-num' : 'idle-num'">
                {{ row.ongoingCount }}
              </span>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="submittedCount" label="已交卷" width="90" align="center" />
          <ElTableColumn prop="status" label="状态" width="100" align="center">
            <template #default="{ row }">
              <ElTag :type="examStatusTagType(row.status)" size="small" disable-transitions>
                {{ EXAM_STATUS_TEXT[row.status] || row.status }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn label="操作" width="120" align="left" fixed="right">
            <template #default="{ row }">
              <!--
                已结束的考试也给入口：事后要能查切屏记录与作答进度，
                工作台内会按状态禁掉三个写动作，此处不必藏按钮。
              -->
              <ElButton v-auth="'detail'" link type="primary" @click="handleEnter(row)">
                {{ row.status === 'finished' ? '查看' : '进入监考' }}
              </ElButton>
            </template>
          </ElTableColumn>
          <template #empty>暂无指派给你的监考任务</template>
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
    </ElCard>
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive, onMounted, onActivated } from 'vue'
  import { useRouter } from 'vue-router'
  import { ElMessage } from 'element-plus'
  import { Search } from '@element-plus/icons-vue'
  import { proctorApi, type ProctorExam } from '@/api/proctor'
  import { EXAM_STATUS_TEXT, examStatusTagType } from '@/api/exam'

  defineOptions({ name: 'Proctor' })

  const router = useRouter()
  const loading = ref(false)
  const tableData = ref<ProctorExam[]>([])

  const filterForm = reactive({ name: '', status: '' })
  const pagination = reactive({ page: 1, pageSize: 10, total: 0 })

  /** 加载监考考试列表 */
  async function loadExams() {
    loading.value = true
    try {
      const { data } = await proctorApi.getExamList({
        name: filterForm.name || undefined,
        status: filterForm.status || undefined,
        page: pagination.page,
        pageSize: pagination.pageSize
      })
      tableData.value = data.list
      pagination.total = data.pagination.total
    } catch (error: any) {
      ElMessage.error(error.message || '加载监考列表失败')
    } finally {
      loading.value = false
    }
  }

  function handleSearch() {
    pagination.page = 1
    loadExams()
  }

  function handleReset() {
    filterForm.name = ''
    filterForm.status = ''
    pagination.page = 1
    loadExams()
  }

  function handleSizeChange() {
    pagination.page = 1
    loadExams()
  }

  function formatTime(value?: string | null) {
    if (!value) return '-'
    return value.replace('T', ' ').slice(0, 16)
  }

  /**
   * 进入监考工作台
   *
   * 不跳 /exam-detail：那是考试管理模块的页面，按后端菜单模式只有分到「考试管理」
   * 菜单的角色才会注册该路由。本按钮的显隐只看 exam:proctor:detail，
   * 只有监考权限的账号点了会因 to.matched 为空落到 404。与阅卷中心同款考虑。
   */
  function handleEnter(row: ProctorExam) {
    router.push({ path: '/proctor-workspace', query: { id: row.id, name: row.name } })
  }

  onMounted(loadExams)
  /*
    从工作台返回时重拉：工作台里的强制交卷/解锁/重考会改变本页的
    进行中与已交卷份数，缓存下的旧数字会与实际不符。
  */
  onActivated(loadExams)
</script>

<style lang="scss" scoped>
  /*
    筛选卡 + 表格卡两卡布局，与考试管理、认证项目、证书发放、考点管理一致。
    阅卷中心与练习管理是单卡的少数派，此处不跟随它们。
  */
  .proctor {
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: 100%;

    .filter-card {
      flex-shrink: 0;
      border: none !important;
      border-radius: 12px;
      box-shadow: none !important;

      :deep(.el-card__body) {
        padding: 12px 20px;
      }

      .filter-form {
        @include responsiveFilterForm();
      }
    }

    .table-card {
      display: flex;
      flex: 1;
      flex-direction: column;
      overflow: hidden;
      border: none !important;
      border-radius: 12px;
      box-shadow: none !important;

      :deep(.el-card__body) {
        display: flex;
        flex-direction: column;
        height: 100%;
        padding: 20px;
      }

      .table-container {
        flex: 1;
        overflow: hidden;
      }

      .pagination-container {
        display: flex;
        flex-shrink: 0;
        justify-content: flex-end;
        margin-top: 16px;
      }
    }

    .filter-input {
      width: 200px;
    }

    /* 有人在考时强调，无人在考时压低为次要色 */
    .ongoing-num {
      font-weight: 600;
      color: var(--el-color-warning);
    }

    .idle-num {
      color: var(--art-text-gray-600);
    }
  }
</style>
