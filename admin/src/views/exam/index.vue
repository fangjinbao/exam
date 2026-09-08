<!-- 考试管理：考试的查询、创建/编辑、分配考生、防作弊策略配置、发布/撤回、删除与详情查看 -->
<template>
  <div class="exam">
    <!-- 筛选卡片 -->
    <ElCard shadow="never" class="filter-card">
      <ElForm :model="filterForm" :inline="true" class="filter-form">
        <ElFormItem label="考试名称">
          <ElInput
            v-model="filterForm.keyword"
            placeholder="输入考试名称"
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
        <!-- 两类考试的可操作性不同（鉴定考试改不了名单），列表要能分开看 -->
        <ElFormItem label="考试类型">
          <ElSelect
            v-model="filterForm.examType"
            placeholder="全部"
            clearable
            class="filter-select"
          >
            <ElOption
              v-for="opt in EXAM_TYPE_OPTIONS"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
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
        <ElButton v-auth="'add'" type="primary" :icon="Plus" @click="handleAdd">创建考试</ElButton>
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
            label="考试名称"
            min-width="180"
            show-overflow-tooltip
            fixed="left"
          />
          <ElTableColumn label="类型" width="110" align="center">
            <template #default="{ row }">
              <ElTag
                :type="row.examType === 'skill' ? 'warning' : 'info'"
                size="small"
                disable-transitions
              >
                {{ EXAM_TYPE_TEXT[row.examType] || '普通考试' }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="paperName" label="试卷名称" min-width="160" show-overflow-tooltip />
          <ElTableColumn prop="paperType" label="试卷类型" width="100" align="center">
            <template #default="{ row }">
              {{ row.paperType === 'random' ? '随机' : '固定' }}
            </template>
          </ElTableColumn>
          <ElTableColumn label="考试时间" min-width="300" align="center">
            <template #default="{ row }">
              {{ formatTime(row.startTime) }} ~ {{ formatTime(row.endTime) }}
            </template>
          </ElTableColumn>
          <ElTableColumn prop="duration" label="时长(分钟)" width="110" align="center" />
          <ElTableColumn prop="passScore" label="及格分" width="90" align="center" />
          <ElTableColumn prop="candidateCount" label="参考人数" width="100" align="center" />
          <ElTableColumn prop="status" label="状态" width="100" align="center">
            <template #default="{ row }">
              <ElTag :type="statusTagType(row.status)" size="small" disable-transitions>
                {{ statusTextMap[row.status] || row.status }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="createByName" label="创建人" width="110" show-overflow-tooltip>
            <template #default="{ row }">{{ row.createByName || '-' }}</template>
          </ElTableColumn>
          <!-- 所属单位取创建人部门上溯到的公司节点，后端实时派生，未挂部门的账号为空 -->
          <ElTableColumn
            prop="createByOrgName"
            label="所属单位"
            min-width="150"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ row.createByOrgName || '-' }}</template>
          </ElTableColumn>
          <ElTableColumn prop="createTime" label="创建时间" width="170" align="center">
            <template #default="{ row }">{{ formatTime(row.createTime) }}</template>
          </ElTableColumn>
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
              <!--
                主行动位：只放生命周期的下一步。未发布给「发布」，
                已发布/进行中给「追加考生」（后端 append-candidates 正好放行这两态）。
                已结束无下一步，此位留空。
              -->
              <ElButton
                v-if="row.status === 'unpublished'"
                v-auth="'publish'"
                link
                type="success"
                @click="handlePublish(row)"
              >
                发布
              </ElButton>
              <ElButton
                v-else-if="row.status === 'published' || row.status === 'ongoing'"
                v-auth="'update'"
                link
                type="primary"
                @click="openRosterDialog(row)"
              >
                考生名单
              </ElButton>
              <!-- 撤回只在已发布未开考时可用，与主行动位并列而非收进下拉：它是发布的逆操作 -->
              <ElButton
                v-if="row.status === 'published'"
                v-auth="'withdraw'"
                link
                type="warning"
                @click="handleWithdraw(row)"
              >
                撤回
              </ElButton>
              <!-- 低频与破坏性操作收进下拉，避免九个按钮平铺折行、各行错位 -->
              <ElDropdown
                v-if="moreActions(row).length"
                trigger="click"
                @command="handleMoreCommand"
              >
                <span class="more-trigger">
                  更多<ElIcon><ArrowDown /></ElIcon>
                </span>
                <template #dropdown>
                  <ElDropdownMenu>
                    <ElDropdownItem
                      v-for="action in moreActions(row)"
                      :key="action.command"
                      :command="{ command: action.command, row }"
                      :class="{ 'is-danger': action.danger }"
                    >
                      {{ action.label }}
                    </ElDropdownItem>
                  </ElDropdownMenu>
                </template>
              </ElDropdown>
            </template>
          </ElTableColumn>
          <template #empty>暂无考试数据</template>
        </ElTable>
      </div>

      <!-- 分页 -->
      <div class="pagination-container">
        <ElPagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="loadExamList"
        />
      </div>
    </ElCard>

    <!--
      指派监考人 / 阅卷人：复用编辑页的 StaffSettingPanel，选人逻辑不重写。
      单次只处理一个岗位，与后端 assign-staff 的入参一致。
    -->
    <ElDialog
      v-model="staffVisible"
      :title="`设置${staffLabel()}人员`"
      width="720px"
      append-to-body
      destroy-on-close
    >
      <div v-if="staffExam" class="staff-dialog-exam">{{ staffExam.name }}</div>
      <StaffSettingPanel
        v-model="staffList"
        :title="`${staffLabel()}人员`"
        :sub="`指派本场考试的${staffLabel()}人`"
        :empty-text="`尚未指派${staffLabel()}人员`"
        :empty-hint="staffRole === 'grader' ? '不指派则本场答卷对全部有阅卷权限的人可见' : ''"
        :picker-title="`选择${staffLabel()}人员`"
        :pick-button-text="`选择${staffLabel()}人员`"
      />
      <template #footer>
        <ElButton @click="staffVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="staffSaving" @click="handleStaffSave">保存</ElButton>
      </template>
    </ElDialog>

    <!--
      考生名单：先展示现有考生（标注谁已进入考试），再在其中添加或移除。
      changed 事件用于刷新列表页的「参考人数」列。
    -->
    <CandidateRosterDialog
      v-if="rosterExam"
      v-model="rosterVisible"
      :exam-id="rosterExam.id"
      :exam-name="rosterExam.name"
      @changed="loadExamList"
    />
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive, onActivated } from 'vue'
  import { useRouter, useRoute } from 'vue-router'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { Search, Plus, Delete, ArrowDown } from '@element-plus/icons-vue'
  import {
    examApi,
    EXAM_STATUS_TEXT as statusTextMap,
    EXAM_TYPE_TEXT,
    EXAM_TYPE_OPTIONS,
    examStatusTagType as statusTagType,
    type Exam
  } from '@/api/exam'
  import { matchAuthMark } from '@/utils/permission/authMatch'
  import StaffSettingPanel, {
    type StaffItem
  } from '@/views/exam-edit/components/StaffSettingPanel.vue'
  import CandidateRosterDialog from './components/CandidateRosterDialog.vue'

  defineOptions({ name: 'Exam' })

  const router = useRouter()
  const route = useRoute()

  /*
    权限判断（供「更多」下拉用）。

    v-auth 指令只切 display:none，套在下拉项上会留下一个空菜单——点开什么都没有。
    故下拉项改由 JS 判权限，无可用项时整个「更多」入口都不渲染。

    权限点在 setup 期一次性快照，不用 computed 跟随 route：本页被 keep-alive 缓存
    （有 onActivated），route 是全局响应式对象，切到别的页面后缓存组件若重渲染，
    会拿新路由的 authList 误判本页按钮（与 directives/auth.ts 同一个坑，那边也是挂载时快照）。
  */
  const authCodes = ((route.meta.authList as Array<{ authMark: string }> | undefined) ?? []).map(
    (item) => item.authMark
  )
  /** 当前用户是否有某个操作权限 */
  function can(action: string) {
    return matchAuthMark(authCodes, action)
  }

  const loading = ref(false)
  const tableData = ref<Exam[]>([])
  // 表格勾选的考试 id（批量删除用）
  const selectedIds = ref<number[]>([])

  // 正在复制的考试 id：复制入口收进「更多」下拉后无 loading 态可挂，
  // 这里退化为防重入标志，避免确认框被连点复制出多份副本
  const copyingId = ref<number | null>(null)

  // 筛选条件（dateRange 为 [开始日期, 结束日期]）
  const filterForm = reactive<{
    keyword: string
    status: string
    examType: string
    dateRange: [string, string] | null
  }>({
    keyword: '',
    status: '',
    examType: '',
    dateRange: null
  })

  // 分页信息
  const pagination = reactive({ page: 1, pageSize: 10, total: 0 })

  /** 格式化时间（截去秒级 T 分隔，展示为 YYYY-MM-DD HH:mm） */
  function formatTime(val?: string | null) {
    if (!val) return '-'
    return val.replace('T', ' ').slice(0, 16)
  }

  /** 加载考试列表 */
  async function loadExamList() {
    loading.value = true
    try {
      const { data } = await examApi.getList({
        keyword: filterForm.keyword || undefined,
        status: filterForm.status || undefined,
        examType: filterForm.examType || undefined,
        startDate: filterForm.dateRange?.[0] || undefined,
        endDate: filterForm.dateRange?.[1] || undefined,
        page: pagination.page,
        pageSize: pagination.pageSize
      })
      tableData.value = data.list
      pagination.total = data.pagination.total
    } catch (error: any) {
      ElMessage.error(error.message || '加载考试列表失败')
    } finally {
      loading.value = false
    }
  }

  function handleSearch() {
    pagination.page = 1
    loadExamList()
  }

  function handleReset() {
    filterForm.keyword = ''
    filterForm.status = ''
    filterForm.examType = ''
    filterForm.dateRange = null
    pagination.page = 1
    loadExamList()
  }

  function handleSizeChange() {
    pagination.page = 1
    loadExamList()
  }

  /** 表格勾选变化，记录选中考试 id */
  function handleSelectionChange(rows: Exam[]) {
    selectedIds.value = rows.map((r) => r.id)
  }
  /** 跳转到独立创建页 */
  function handleAdd() {
    router.push({ path: '/exam-edit' })
  }

  // 行操作项：label 显示文案，command 分发标识，danger 用于删除的警示色
  type RowAction = { command: string; label: string; danger?: boolean }

  /**
   * 「更多」下拉里的操作项
   *
   * 操作列固定为「详情 / 主行动 / 更多」：主行动只给生命周期的下一步
   * （未发布→发布，已发布→追加考生，进行中→追加考生），低频与破坏性操作收进这里。
   * 九个按钮平铺会折行，且各行按钮数不同导致同名按钮左右错位。
   */
  function moreActions(row: Exam): RowAction[] {
    const actions: RowAction[] = []
    // 未发布态的编辑入口收进下拉，把外面的主行动位让给「发布」
    if (row.status === 'unpublished' && can('update')) {
      actions.push({ command: 'edit', label: '编辑考试' })
    }
    // 复制不限状态：主要用途正是拿一场已结束的考试重开下一期
    if (can('add')) actions.push({ command: 'copy', label: '复制考试' })
    /*
      监考人已结束后不再显示：考试都考完了，改监考人没有实际意义。
      阅卷人则任何阶段都放开——「考完才发现没派阅卷人」是真实场景。
      后端 assign-staff 对两者都不限状态，这里的收窄纯粹是入口层面的观感考虑。
    */
    if (row.status !== 'finished' && can('update')) {
      actions.push({ command: 'proctor', label: '设置监考人' })
    }
    if (can('update')) actions.push({ command: 'grader', label: '设置阅卷人' })
    if ((row.status === 'unpublished' || row.status === 'finished') && can('delete')) {
      actions.push({ command: 'delete', label: '删除考试', danger: true })
    }
    return actions
  }

  /** 「更多」下拉分发：row 随 command 一起传入，避免为每行建闭包 */
  function handleMoreCommand({ command, row }: { command: string; row: Exam }) {
    if (command === 'edit') handleEdit(row)
    else if (command === 'copy') handleCopy(row)
    else if (command === 'proctor') openStaffDialog(row, 'proctor')
    else if (command === 'grader') openStaffDialog(row, 'grader')
    else if (command === 'delete') handleDelete(row)
  }

  /** 跳转到独立编辑页（仅未发布可编辑） */
  function handleEdit(row: Exam) {
    router.push({ path: '/exam-edit', query: { id: row.id } })
  }

  /** 跳转到独立详情页（含基础信息与考生成绩两个 Tab） */
  function handleDetail(row: Exam) {
    router.push({ path: '/exam-detail', query: { id: row.id } })
  }

  /**
   * 复制考试
   *
   * 复制完直接跳编辑页：副本的时间是后端按「明天同一时刻」自动排的，
   * 只是个能用的占位值，实际场次几乎一定要考务自己定，
   * 停在列表页等他们再找到那一行点编辑是多余的一步。
   * 弹确认框先说清「带哪些、不带哪些」，避免考务以为成绩也一起复制了。
   */
  async function handleCopy(row: Exam) {
    // 防重入：复制入口收进「更多」下拉后不再有 loading 态可看，
    // 靠这个标志挡住确认框被连续触发导致复制出多份副本
    if (copyingId.value !== null) return
    // 必须在 await confirm 之前置位：ElMessageBox 不阻塞后续点击，
    // 若等确认后再置位，连点两次会弹出两个确认框、各自复制一份副本
    copyingId.value = row.id
    try {
      await ElMessageBox.confirm(
        `将复制「${row.name}」为一场未发布的新考试，含试卷、考试设置、考生名单与监考人员；不含答卷与成绩。副本的考试时间会自动落在未来，仅作占位，请按实际场次改好再发布。`,
        '复制考试',
        { type: 'info', confirmButtonText: '复制并编辑', cancelButtonText: '取消' }
      )
      const { data: created } = await examApi.copy(row.id)
      ElMessage.success(`已创建副本「${created.name}」，请确认考试时间`)
      router.push({ path: '/exam-edit', query: { id: created.id } })
    } catch (error: any) {
      // 与本页其他 handler 同一写法：confirm 被取消时 error 是 'cancel'，不当失败报
      if (error !== 'cancel') ElMessage.error(error?.message || '复制考试失败')
    } finally {
      copyingId.value = null
    }
  }

  /** 发布考试 */
  async function handlePublish(row: Exam) {
    try {
      await ElMessageBox.confirm('确定要发布该考试吗？发布后考生可参加考试', '提示', {
        type: 'warning'
      })
      await examApi.publish(row.id)
      ElMessage.success('发布成功')
      loadExamList()
    } catch (error: any) {
      if (error !== 'cancel') ElMessage.error(error.message || '发布失败')
    }
  }

  /** 撤回考试 */
  async function handleWithdraw(row: Exam) {
    try {
      await ElMessageBox.confirm('确定要撤回该考试吗？撤回后考生将无法参加', '提示', {
        type: 'warning'
      })
      await examApi.withdraw(row.id)
      ElMessage.success('撤回成功')
      loadExamList()
    } catch (error: any) {
      if (error !== 'cancel') ElMessage.error(error.message || '撤回失败')
    }
  }

  // ===== 指派监考人 / 阅卷人 =====

  const staffVisible = ref(false)
  const staffSaving = ref(false)
  const staffRole = ref<'proctor' | 'grader'>('proctor')
  const staffList = ref<StaffItem[]>([])
  const staffExam = ref<Exam | null>(null)

  /** 当前弹窗的岗位中文名，供标题与提示复用 */
  const staffLabel = () => (staffRole.value === 'proctor' ? '监考' : '阅卷')

  /*
    弹窗打开序号，用于丢弃过期响应。

    staffList 是两个岗位共享的 ref：先打开监考弹窗（请求 A 在飞）、关掉再打开阅卷
    弹窗（请求 B），若 B 先返回而 A 后返回，A 的监考名单会覆盖已显示的阅卷名单，
    此时点保存就把阅卷名单写成了监考名单（后端按 examId + role 全量替换，
    原阅卷名单被顶掉）。故 await 回来先比对序号，不是最新一次调用就整段丢弃。
  */
  let staffSeq = 0

  /**
   * 打开指派弹窗并载入该岗位现有名单
   *
   * 走详情接口而不是让列表页多带一份名单：名单只在打开弹窗时才需要，
   * 挂在列表响应里会让每次翻页都白拉一遍两个岗位的人员。
   */
  async function openStaffDialog(row: Exam, role: 'proctor' | 'grader') {
    const seq = ++staffSeq
    staffExam.value = row
    staffRole.value = role
    staffList.value = []
    staffVisible.value = true
    try {
      const { data } = await examApi.getDetail(row.id)
      if (seq !== staffSeq) return
      staffList.value = (role === 'proctor' ? data.proctors : data.graders) ?? []
    } catch (error: any) {
      // 过期请求的失败不该弹提示：用户已经在看另一个岗位的弹窗了
      if (seq !== staffSeq) return
      ElMessage.error(error.message || '加载人员名单失败')
    }
  }

  /** 保存指派（全量替换该岗位名单，传空数组即清空） */
  async function handleStaffSave() {
    if (!staffExam.value) return
    staffSaving.value = true
    try {
      await examApi.assignStaff(
        staffExam.value.id,
        staffRole.value,
        staffList.value.map((s) => ({ userId: s.userId }))
      )
      ElMessage.success(
        staffList.value.length
          ? `已指派 ${staffList.value.length} 名${staffLabel()}人员`
          : `已清空${staffLabel()}人员名单`
      )
      staffVisible.value = false
    } catch (error: any) {
      ElMessage.error(error.message || '保存失败')
    } finally {
      staffSaving.value = false
    }
  }

  // ===== 考生名单（查看 / 添加 / 移除） =====

  const rosterVisible = ref(false)
  const rosterExam = ref<Exam | null>(null)

  /** 打开名单弹窗：先展示现有考生，再在其中添加或移除 */
  function openRosterDialog(row: Exam) {
    rosterExam.value = row
    rosterVisible.value = true
  }

  /** 删除考试 */
  async function handleDelete(row: Exam) {
    try {
      await ElMessageBox.confirm('确定要删除该考试吗？删除后不可恢复', '提示', { type: 'warning' })
      await examApi.delete(row.id)
      ElMessage.success('删除成功')
      // 删除后当前页可能为空，回退一页
      if (tableData.value.length === 1 && pagination.page > 1) {
        pagination.page -= 1
      }
      loadExamList()
    } catch (error: any) {
      if (error !== 'cancel') ElMessage.error(error.message || '删除失败')
    }
  }

  /** 批量删除选中的考试 */
  async function handleBatchDelete() {
    if (!selectedIds.value.length) return
    try {
      await ElMessageBox.confirm(
        `确定要删除选中的 ${selectedIds.value.length} 个考试吗？删除后不可恢复`,
        '提示',
        { type: 'warning' }
      )
      const count = selectedIds.value.length
      await examApi.batchDelete(selectedIds.value)
      ElMessage.success(`已删除 ${count} 个考试`)
      // 删除后当前页可能为空，回退一页
      if (tableData.value.length === count && pagination.page > 1) {
        pagination.page -= 1
      }
      selectedIds.value = []
      loadExamList()
    } catch (error: any) {
      if (error !== 'cancel') ElMessage.error(error.message || '批量删除失败')
    }
  }
  // 列表在每次进入/从创建编辑页返回时刷新（本页 keepAlive，onMounted 不会重复触发）
  onActivated(() => {
    loadExamList()
  })
</script>

<style lang="scss" scoped>
  .exam {
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: 100%;

    /*
      「更多」下拉触发器。

      不用 ElButton：按钮自带 padding 与行高，和同排的 link 按钮对不齐，
      故用 span 手写成与 link 按钮同字号同色，只多一个下拉箭头。
      与试卷列表页（views/paper/index.vue）保持同一实现。
    */
    .more-trigger {
      display: inline-flex;
      gap: 2px;
      align-items: center;
      font-size: var(--el-font-size-base);
      line-height: 1;
      color: var(--el-color-primary);
      cursor: pointer;

      &:hover {
        color: var(--el-color-primary-light-3);
      }
    }

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

      .pagination-container {
        display: flex;
        flex-shrink: 0;
        justify-content: flex-end;
        margin-top: 16px;
      }
    }
  }

  // 指派弹窗顶部的考试名，让考务确认改的是哪一场
  .staff-dialog-exam {
    padding: 8px 12px;
    margin-bottom: 12px;
    font-weight: 500;
    color: var(--art-gray-800);
    background-color: var(--art-gray-100);
    border-radius: 8px;
  }
</style>
