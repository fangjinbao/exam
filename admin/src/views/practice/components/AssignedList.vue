<!-- 岗位练兵列表：查询、创建/编辑、发布/撤回/结束、删除与详情查看 -->
<template>
  <div class="assigned-list">
    <!-- 筛选卡片 -->
    <ElCard shadow="never" class="filter-card">
      <ElForm :model="filterForm" :inline="true" class="filter-form">
        <ElFormItem label="练习名称">
          <ElInput
            v-model="filterForm.keyword"
            placeholder="输入练习名称"
            clearable
            class="filter-input"
          />
        </ElFormItem>
        <ElFormItem label="状态">
          <ElSelect v-model="filterForm.status" placeholder="全部" clearable class="filter-select">
            <ElOption label="未发布" value="unpublished" />
            <ElOption label="已发布" value="published" />
            <ElOption label="进行中" value="ongoing" />
            <ElOption label="已结束" value="finished" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="开始日期">
          <ElDatePicker
            v-model="filterForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            class="filter-date"
          />
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
        <ElButton v-auth="'add'" type="primary" :icon="Plus" @click="handleAdd">创建练习</ElButton>
        <!-- 未选中时保持中性灰，选中后才转为 danger 提示破坏性 -->
        <ElButton
          v-auth="'batch-delete'"
          :type="selectedIds.length ? 'danger' : 'info'"
          plain
          :icon="Delete"
          :disabled="!selectedIds.length"
          @click="handleBatchDelete"
        >
          批量删除{{ selectedIds.length ? `(${selectedIds.length})` : '' }}
        </ElButton>
      </div>

      <div class="table-container">
        <ElTable
          v-loading="loading"
          :data="tableData"
          height="100%"
          style="width: 100%"
          @selection-change="handleSelectionChange"
        >
          <ElTableColumn type="selection" width="50" align="center" fixed="left" />
          <ElTableColumn
            prop="name"
            label="练习名称"
            min-width="180"
            show-overflow-tooltip
            fixed="left"
          />
          <ElTableColumn prop="code" label="练习编号" width="120" show-overflow-tooltip />
          <ElTableColumn label="练习题库" min-width="160" show-overflow-tooltip>
            <template #default="{ row }">{{ row.bankNames?.join('、') || '-' }}</template>
          </ElTableColumn>
          <ElTableColumn label="练习方式" width="100" align="center">
            <template #default="{ row }">
              {{ row.drawMode === 'random' ? '规则抽题' : '全库顺序' }}
            </template>
          </ElTableColumn>
          <ElTableColumn prop="questionCount" label="题目数" width="80" align="center" />
          <!-- 起止时间拆两行：单行要 300px 会把后面的列挤出可视区 -->
          <ElTableColumn label="练习时间" width="170" align="center">
            <template #default="{ row }">
              <template v-if="row.startTime || row.endTime">
                <div class="time-line">{{ formatTime(row.startTime) }}</div>
                <div class="time-line time-line--end">{{ formatTime(row.endTime) }}</div>
              </template>
              <template v-else>不限时</template>
            </template>
          </ElTableColumn>
          <ElTableColumn label="参与人数" width="90" align="center">
            <template #default="{ row }">{{ participantText(row) }}</template>
          </ElTableColumn>
          <ElTableColumn prop="status" label="状态" width="90" align="center">
            <template #default="{ row }">
              <ElTag :type="statusTagType(row.status)" size="small" disable-transitions>
                {{ PRACTICE_STATUS_TEXT[row.status] || row.status }}
              </ElTag>
            </template>
          </ElTableColumn>
          <!-- 创建人/创建时间：与考试列表对齐（后端列表接口本就返回这两个字段） -->
          <ElTableColumn prop="createByName" label="创建人" width="110" show-overflow-tooltip>
            <template #default="{ row }">{{ row.createByName || '-' }}</template>
          </ElTableColumn>
          <ElTableColumn prop="createTime" label="创建时间" width="170" align="center">
            <template #default="{ row }">{{ formatTime(row.createTime) }}</template>
          </ElTableColumn>

          <!--
            260 与考试列表一致：最坏情况「已发布 + 未开自动结束」有
            详情/参与人员/撤回/结束/删除 五个按钮共 12 字，240 会挤到换行。
          -->
          <ElTableColumn
            label="操作"
            width="260"
            align="left"
            fixed="right"
            class-name="table-actions"
          >
            <template #default="{ row }">
              <ElButton v-auth="'detail'" link type="primary" @click="handleDetail(row)">
                详情
              </ElButton>
              <ElButton
                v-if="row.status === 'unpublished'"
                v-auth="'update'"
                link
                type="primary"
                @click="handleEdit(row)"
              >
                编辑
              </ElButton>
              <ElButton
                v-if="row.status === 'unpublished'"
                v-auth="'publish'"
                link
                type="success"
                @click="handlePublish(row)"
              >
                发布
              </ElButton>
              <!--
                发布后无法再进编辑页改名单，改由名单弹窗中途增减，与考试同口径。
                全员参与的练习不给这个入口：它没有名单可维护，且追加会把受众
                从全员收窄到刚加的几个人，方向与意图相反（后端也会拒）。
              -->
              <ElButton
                v-if="
                  (row.status === 'published' || row.status === 'ongoing') &&
                  row.participantScope === 'specified'
                "
                v-auth="'assign-participants'"
                link
                type="primary"
                @click="openRosterDialog(row)"
              >
                参与人员
              </ElButton>
              <ElButton
                v-if="row.status === 'published' || row.status === 'ongoing'"
                v-auth="'withdraw'"
                link
                type="warning"
                @click="handleWithdraw(row)"
              >
                撤回
              </ElButton>
              <!-- 未开自动结束的练习需要手动收尾 -->
              <ElButton
                v-if="(row.status === 'published' || row.status === 'ongoing') && !row.autoFinish"
                v-auth="'finish'"
                link
                type="info"
                @click="handleFinish(row)"
              >
                结束
              </ElButton>
              <ElButton
                v-if="row.status !== 'ongoing'"
                v-auth="'delete'"
                link
                type="danger"
                @click="handleDelete(row)"
              >
                删除
              </ElButton>
            </template>
          </ElTableColumn>
          <template #empty>暂无练习数据</template>
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
          @current-change="loadList"
        />
      </div>
    </ElCard>

    <!--
      参与人员名单：先展示现有人员（标注谁已开始练习），再在其中添加或移除。
      changed 事件用于刷新列表页的「参与人数」列。
    -->
    <ParticipantRosterDialog
      v-if="rosterPractice"
      v-model="rosterVisible"
      :practice-id="rosterPractice.id"
      :practice-name="rosterPractice.name"
      @changed="loadList"
    />
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive, onActivated, onDeactivated, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { Search, Plus, Delete } from '@element-plus/icons-vue'
  import {
    practiceApi,
    PRACTICE_STATUS_TEXT,
    practiceStatusTagType as statusTagType,
    ALL_PARTICIPANTS,
    type Practice
  } from '@/api/practice'
  import ParticipantRosterDialog from './ParticipantRosterDialog.vue'

  defineOptions({ name: 'AssignedList' })

  const router = useRouter()

  const loading = ref(false)
  const tableData = ref<Practice[]>([])
  const selectedIds = ref<number[]>([])

  const filterForm = reactive({
    keyword: '',
    status: '',
    dateRange: [] as string[]
  })

  const pagination = reactive({ page: 1, pageSize: 10, total: 0 })

  /** 时间戳裁到分钟；练习时间可空，两端都空即不限时 */
  function formatTime(value?: string | null) {
    if (!value) return '-'
    return value.replace('T', ' ').slice(0, 16)
  }

  /** 参与人数文案：全员参与时后端下发哨兵值 */
  function participantText(row: Practice) {
    return row.participantCount === ALL_PARTICIPANTS ? '全员' : `${row.participantCount} 人`
  }

  /** 加载列表 */
  async function loadList() {
    loading.value = true
    try {
      const { data } = await practiceApi.getList({
        keyword: filterForm.keyword || undefined,
        status: filterForm.status || undefined,
        startDate: filterForm.dateRange?.[0] || undefined,
        endDate: filterForm.dateRange?.[1] || undefined,
        page: pagination.page,
        pageSize: pagination.pageSize
      })
      tableData.value = data.list
      pagination.total = data.pagination.total
    } catch (e: any) {
      ElMessage.error(e?.message || '获取练习列表失败')
    } finally {
      loading.value = false
    }
  }

  function handleSearch() {
    pagination.page = 1
    loadList()
  }

  function handleReset() {
    filterForm.keyword = ''
    filterForm.status = ''
    filterForm.dateRange = []
    pagination.page = 1
    loadList()
  }

  function handleSizeChange() {
    pagination.page = 1
    loadList()
  }

  function handleSelectionChange(rows: Practice[]) {
    selectedIds.value = rows.map((r) => r.id)
  }

  function handleAdd() {
    router.push('/practice-edit')
  }

  function handleEdit(row: Practice) {
    router.push({ path: '/practice-edit', query: { id: row.id } })
  }

  function handleDetail(row: Practice) {
    router.push({ path: '/practice-detail', query: { id: row.id } })
  }

  /** 发布：确认后调接口，成功即刷新列表 */
  async function handlePublish(row: Practice) {
    try {
      await ElMessageBox.confirm(
        `确定发布练习「${row.name}」？发布后参与人员即可看到并开始练习。`,
        '发布确认',
        { type: 'warning' }
      )
    } catch {
      return // 用户取消
    }
    try {
      await practiceApi.publish(row.id)
      ElMessage.success('发布成功')
      loadList()
    } catch (e: any) {
      ElMessage.error(e?.message || '发布失败')
    }
  }

  /** 撤回：回到未发布，可继续编辑 */
  // ===== 参与人员名单（查看 / 添加 / 移除） =====

  const rosterVisible = ref(false)
  const rosterPractice = ref<Practice | null>(null)

  /** 打开名单弹窗：先展示现有人员，再在其中添加或移除 */
  function openRosterDialog(row: Practice) {
    rosterPractice.value = row
    rosterVisible.value = true
  }

  async function handleWithdraw(row: Practice) {
    try {
      await ElMessageBox.confirm(
        `确定撤回练习「${row.name}」？撤回后学员将无法继续练习。`,
        '撤回确认',
        { type: 'warning' }
      )
    } catch {
      return
    }
    try {
      await practiceApi.withdraw(row.id)
      ElMessage.success('撤回成功')
      loadList()
    } catch (e: any) {
      ElMessage.error(e?.message || '撤回失败')
    }
  }

  /** 手动结束 */
  async function handleFinish(row: Practice) {
    try {
      await ElMessageBox.confirm(
        `确定结束练习「${row.name}」？结束后学员不能再作答。`,
        '结束确认',
        { type: 'warning' }
      )
    } catch {
      return
    }
    try {
      await practiceApi.finish(row.id)
      ElMessage.success('练习已结束')
      loadList()
    } catch (e: any) {
      ElMessage.error(e?.message || '结束失败')
    }
  }

  /** 删除单个 */
  async function handleDelete(row: Practice) {
    try {
      await ElMessageBox.confirm(`确定删除练习「${row.name}」？删除后不可恢复。`, '删除确认', {
        type: 'warning',
        confirmButtonClass: 'el-button--danger'
      })
    } catch {
      return
    }
    try {
      await practiceApi.delete(row.id)
      ElMessage.success('删除成功')
      // 删掉当前页最后一条时回退一页，避免停在空页
      if (tableData.value.length === 1 && pagination.page > 1) pagination.page--
      loadList()
    } catch (e: any) {
      ElMessage.error(e?.message || '删除失败')
    }
  }

  /** 批量删除：进行中的会被后端跳过并返回原因 */
  async function handleBatchDelete() {
    const count = selectedIds.value.length
    if (!count) return
    try {
      await ElMessageBox.confirm(
        `确定删除选中的 ${count} 个练习？进行中的练习会被跳过。`,
        '批量删除确认',
        { type: 'warning', confirmButtonClass: 'el-button--danger' }
      )
    } catch {
      return
    }
    try {
      const { data } = await practiceApi.batchDelete(selectedIds.value)
      // 有跳过项时用 warning 并列出原因，避免「成功」二字盖掉部分失败
      if (data.failed.length) {
        ElMessage.warning(
          `已删除 ${data.success} 个，${data.failed.length} 个未删除：${data.failed.join('；')}`
        )
      } else {
        ElMessage.success(`已删除 ${data.success} 个练习`)
      }
      pagination.page = 1
      loadList()
    } catch (e: any) {
      ElMessage.error(e?.message || '批量删除失败')
    }
  }

  onMounted(loadList)
  /**
   * 从编辑页返回时刷新（父页配 keepAlive，onMounted 不会再触发）。
   *
   * 以「曾被 deactivate」为判据，而不是「跳过首次 activated」：KeepAlive 给被包裹的 vnode 打
   * shapeFlag 256，父页首次挂载完成后会触发一次 activated，而本组件的钩子在 setup 阶段就已注入
   * 父实例，于是首屏会紧接 onMounted 再打一次同样的请求——那次要跳过。但本组件也可能是切 Tab
   * 才懒挂载的（父页早已挂载完），此时它的首次 activated 是真的返回页面，不能跳。
   */
  let wasDeactivated = false
  onDeactivated(() => {
    wasDeactivated = true
  })
  onActivated(() => {
    if (!wasDeactivated) return
    wasDeactivated = false
    loadList()
  })
</script>

<style lang="scss" scoped>
  .assigned-list {
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

      .table-header {
        display: flex;
        flex-shrink: 0;
        gap: 12px;
        margin-bottom: 16px;
      }

      .table-container {
        flex: 1;
        overflow: hidden;
      }

      // 起止时间上下两行，末行淡一档以区分「起」与「止」
      .time-line {
        font-size: 12px;
        line-height: 1.5;

        &--end {
          color: var(--el-text-color-secondary);
        }
      }

      .pagination-container {
        display: flex;
        flex-shrink: 0;
        justify-content: flex-end;
        margin-top: 16px;
      }
    }
  }
</style>
