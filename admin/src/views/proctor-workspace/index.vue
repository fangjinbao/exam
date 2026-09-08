<!--
  监考工作台：单场考试的考生监考视图

  一行一名考生，含监考状态、切屏次数与作答进度，可强制交卷 / 解锁续答 / 清空重考。
  三个动作都只在考试进行中可用（后端同样校验），已结束的场次本页只读。

  名单以「已分配考生」为基准而非答卷：还没取卷的人没有答卷行，
  只看答卷会让「谁还没进考场」这个最关键的监考信息消失。
-->

<template>
  <div class="proctor-ws">
    <div class="body-card">
      <!-- 顶部：考试信息 + 手动刷新。轮询由 autoRefresh 控制 -->
      <div class="ws-head">
        <div class="ws-meta">
          <div class="ws-title">
            <ElButton link :icon="ArrowLeft" class="back-btn" @click="handleBack">返回</ElButton>
            <span class="ws-name">{{ examInfo?.name || examName }}</span>
            <ElTag
              v-if="examInfo"
              :type="examStatusTagType(examInfo.status)"
              size="small"
              disable-transitions
            >
              {{ EXAM_STATUS_TEXT[examInfo.status] || examInfo.status }}
            </ElTag>
          </div>
          <div v-if="examInfo" class="ws-sub">
            {{ examInfo.examNo }} · {{ formatTime(examInfo.startTime) }} 至
            {{ formatTime(examInfo.endTime) }} · 时长 {{ examInfo.duration }} 分钟 ·
            <!--
              三种口径要说清，否则切屏那一列的数字会被误读：
              未开检测时列里的数字是开关关闭前的历史残留，不作为异常判定依据。
            -->
            <template v-if="!examInfo.screenSwitchDetect">未开启防切屏检测</template>
            <template v-else-if="examInfo.allowSwitchTimes > 0">
              允许切屏 {{ examInfo.allowSwitchTimes }} 次
            </template>
            <template v-else>切屏不限次（仅记录）</template>
          </div>
        </div>
        <div class="ws-actions">
          <!-- 只在进行中提供自动刷新：已结束的场次数据不再变化，轮询是白跑 -->
          <ElCheckbox v-if="isOngoing" v-model="autoRefresh" class="auto-refresh">
            自动刷新
          </ElCheckbox>
          <ElButton :icon="Refresh" :loading="loading" @click="loadList">刷新</ElButton>
        </div>
      </div>
      <!-- 概览条：四个计数，点「异常」可快速筛出超次数的人 -->
      <div class="ws-stats">
        <div class="stat-item">
          <span class="stat-label">应考</span>
          <span class="stat-value">{{ counts.total }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">未开考</span>
          <span class="stat-value">{{ counts.notStarted }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">进行中</span>
          <span class="stat-value is-ongoing">{{ counts.ongoing }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">已交卷</span>
          <span class="stat-value">{{ counts.submitted }}</span>
        </div>
        <div class="stat-sep" aria-hidden="true"></div>
        <div class="stat-item">
          <span class="stat-label">切屏超次</span>
          <span class="stat-value" :class="{ 'is-danger': counts.exceeded > 0 }">
            {{ counts.exceeded }}
          </span>
        </div>
      </div>

      <!--
        筛选行用 ElForm inline + ElSelect，与全站列表页同款。
        原先用 ElRadioGroup 按钮组做快筛：全项目 18 处 ElRadioGroup 全在
        ElFormItem 里当表单输入项，无一例作表格快筛，且 App.vue 已全局
        ElConfigProvider size="default"，那处 size="small" 是全项目唯一。
      -->
      <ElForm :inline="true" class="ws-filter">
        <ElFormItem label="考生状态">
          <ElSelect v-model="statusFilter" placeholder="全部" clearable class="ws-select">
            <ElOption label="进行中" value="ongoing" />
            <ElOption label="未开考" value="not_started" />
            <ElOption label="已交卷" value="submitted" />
            <ElOption label="切屏超次" value="exceeded" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="姓名 / 账号">
          <ElInput
            v-model="keyword"
            placeholder="输入姓名或账号"
            clearable
            class="ws-search"
            :prefix-icon="Search"
          />
        </ElFormItem>
      </ElForm>

      <div class="table-container">
        <!--
          row-key 用 rowKey 而非 candidateId：一人多次考试会占多行，
          candidateId 不再唯一，会让表格的行状态错乱。
          去掉了 type="index" 序号列——一人多行时序号既不是人数也不是次数，只会误导。
        -->
        <ElTable
          v-loading="loading"
          :data="filteredList"
          row-key="rowKey"
          height="100%"
          style="width: 100%"
        >
          <ElTableColumn label="姓名" min-width="130" fixed="left" show-overflow-tooltip>
            <template #default="{ row }: { row: ProctorCandidate }">
              <span>{{ row.candidateName }}</span>
              <!-- 重考标记跟在姓名后：同一人的多行靠它区分，不必左右对照次数列 -->
              <ElTag
                v-if="row.isRetake"
                type="warning"
                size="small"
                disable-transitions
                class="retake-tag"
              >
                重考
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn label="类型" width="90" align="center">
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
          <ElTableColumn label="账号" prop="account" min-width="130" show-overflow-tooltip>
            <template #default="{ row }">{{ row.account || '-' }}</template>
          </ElTableColumn>
          <ElTableColumn label="所属" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">{{ row.companyName || '-' }}</template>
          </ElTableColumn>
          <ElTableColumn label="状态" width="100" align="center">
            <template #default="{ row }: { row: ProctorCandidate }">
              <ElTag :type="proctorStatusTagType(row.status)" size="small" disable-transitions>
                {{ PROCTOR_STATUS_TEXT[row.status] }}
              </ElTag>
            </template>
          </ElTableColumn>
          <!-- 切屏次数是本页核心：超次数标红加粗，未超但已切过用警示色提示 -->
          <ElTableColumn label="切屏次数" width="110" align="center">
            <template #default="{ row }">
              <span :class="switchClass(row)">{{ row.switchCount }}</span>
              <span v-if="row.switchExceeded" class="exceed-tip">超次</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="作答进度" width="120" align="center">
            <template #default="{ row }">
              <span v-if="row.totalCount">{{ row.answeredCount }}/{{ row.totalCount }}</span>
              <span v-else class="muted">-</span>
            </template>
          </ElTableColumn>
          <!--
            考试次数：分母是总机会数（retakeLimit+1），只有一次机会时不显示「/1」，
            免得每行都挂个无信息量的分母。用尽机会标警示色，便于监考判断能否清空重考。
          -->
          <!--
            次数列只在允许重考时出现：不允许重考的场次人人都是「第 1 次 / 1 次机会」，
            整列没有信息量。已用尽机会的标警示色，便于判断还能否清空重考。
          -->
          <ElTableColumn v-if="retakeEnabled" label="考试次数" width="130" align="center">
            <template #default="{ row }: { row: ProctorCandidate }">
              <template v-if="row.attemptNo > 0">
                <span class="attempt-no">第 {{ row.attemptNo }} 次</span>
                <span class="attempt-quota" :class="{ 'attempt-used-up': attemptUsedUp(row) }">
                  已考 {{ row.attemptUsed }}/{{ row.attemptLimit }}
                </span>
              </template>
              <span v-else class="muted">-</span>
            </template>
          </ElTableColumn>
          <!-- 成绩：待阅卷与「已阅完未发布」要分清，后者是可用分、前者还没算出来 -->
          <ElTableColumn label="成绩" width="110" align="center">
            <template #default="{ row }: { row: ProctorCandidate }">
              <ElTag
                v-if="row.scoreState === 'pending'"
                type="warning"
                size="small"
                disable-transitions
              >
                待阅卷
              </ElTag>
              <template v-else-if="row.score !== null">
                <span class="score-num">{{ row.score }}</span>
                <!-- 未发布的分对考生不可见，标一下避免监考口头告知考生 -->
                <span v-if="row.scoreState === 'graded'" class="unpublished-tip">未发布</span>
              </template>
              <span v-else class="muted">-</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="开考时间" width="170" align="center">
            <template #default="{ row }">{{ formatTime(row.startTime) }}</template>
          </ElTableColumn>
          <ElTableColumn label="交卷时间" width="170" align="center">
            <template #default="{ row }">{{ formatTime(row.submitTime) }}</template>
          </ElTableColumn>
          <ElTableColumn label="操作" width="230" align="left" fixed="right">
            <template #default="{ row }">
              <!--
                未取卷的考生没有答卷，三个动作都无从下手；
                已结束的考试一律只读。两种情况都给出原因而不是静默禁用。
              -->
              <span v-if="!row.sheetId" class="muted">未进入考试</span>
              <template v-else-if="!isOngoing">
                <span class="muted">考试已结束</span>
              </template>
              <!--
                不用 v-auth：本页菜单节点存在但不带 perms（isShow=0），
                authList 结构性恒为空会把三个按钮全部隐藏。
                权限由后端 @Perms('force-submit') / @Perms('reset') 兜底，
                与阅卷工作台「提交批阅」同款处理。
              -->
              <template v-else>
                <ElButton
                  v-if="row.status === 'ongoing'"
                  link
                  type="primary"
                  @click="handleForceSubmit(row)"
                >
                  强制交卷
                </ElButton>
                <!--
                  解锁续答只对已交卷的那次有意义（含超次数被强制交卷的）。
                  本人另有一次进行中时禁用：解锁会造出第二份未交答卷，
                  考生端取 id 最小的那份，会被切回这次旧答卷。后端同样校验。
                -->
                <ElButton
                  v-if="row.status === 'submitted'"
                  link
                  type="warning"
                  :disabled="hasOtherOngoing(row)"
                  :title="hasOtherOngoing(row) ? '该考生另有一次考试正在进行中' : undefined"
                  @click="handleUnlock(row)"
                >
                  解锁续答
                </ElButton>
                <ElButton link type="danger" @click="handleReset(row)">清空重考</ElButton>
              </template>
            </template>
          </ElTableColumn>
          <template #empty>{{ loading ? '加载中' : '没有符合条件的考生' }}</template>
        </ElTable>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { ArrowLeft, Refresh, Search } from '@element-plus/icons-vue'
  import {
    proctorApi,
    PROCTOR_STATUS_TEXT,
    proctorStatusTagType,
    type ProctorCandidate,
    type ProctorCandidatesResult,
    type ProctorStats
  } from '@/api/proctor'
  import { EXAM_STATUS_TEXT, examStatusTagType } from '@/api/exam'

  defineOptions({ name: 'ProctorWorkspace' })

  const route = useRoute()
  const router = useRouter()

  const examId = Number(route.query.id)
  /** 列表页带过来的考试名，用于首屏渲染标题；拉到详情后以接口值为准 */
  const examName = String(route.query.name || '')

  const loading = ref(false)
  const examInfo = ref<ProctorCandidatesResult['exam'] | null>(null)
  const list = ref<ProctorCandidate[]>([])
  /*
    概览计数由后端按「人」给出，不在前端数行数。

    列表已是一行一次考试，重考的人占多行，数行只会得到答卷数，
    「应考」会随重考次数虚增。
  */
  const stats = ref<ProctorStats | null>(null)
  /** 允许重考时才显示次数列与重考标记，单次考试的场次不加这些噪音 */
  const retakeEnabled = computed(() => (examInfo.value?.retakeLimit ?? 0) > 0)

  const statusFilter = ref('')
  const keyword = ref('')
  const autoRefresh = ref(true)

  /** 仅考试进行中允许写动作；已结束/未开始时本页只读 */
  const isOngoing = computed(() => examInfo.value?.status === 'ongoing')

  /* 概览条直接用后端 stats（按人计）；未加载完给全 0，避免模板里到处判空 */
  const counts = computed<ProctorStats>(
    () => stats.value ?? { total: 0, notStarted: 0, ongoing: 0, submitted: 0, exceeded: 0 }
  )

  const filteredList = computed(() => {
    const kw = keyword.value.trim().toLowerCase()
    return list.value.filter((r) => {
      if (statusFilter.value === 'exceeded') {
        if (!r.switchExceeded) return false
      } else if (statusFilter.value && r.status !== statusFilter.value) {
        return false
      }
      if (!kw) return true
      return (
        r.candidateName.toLowerCase().includes(kw) || (r.account || '').toLowerCase().includes(kw)
      )
    })
  })

  function formatTime(value?: string | null) {
    if (!value) return '-'
    return value.replace('T', ' ').slice(0, 16)
  }

  /**
   * 机会是否已用尽
   *
   * 用 >= 而非 ===：强制交卷等操作理论上可能让已交份数超过上限，
   * 用等号判断会在越界时反而不标色。
   */
  function attemptUsedUp(row: ProctorCandidate) {
    return row.attemptLimit > 0 && row.attemptUsed >= row.attemptLimit
  }

  /**
   * 同一考生是否另有一次考试进行中
   *
   * 在完整 list 里找而非 filteredList：筛选后进行中那行可能被过滤掉，
   * 据筛选结果判断会漏判、把不该点的解锁按钮放出来。
   */
  function hasOtherOngoing(row: ProctorCandidate) {
    return list.value.some(
      (r) =>
        r.candidateId === row.candidateId && r.sheetId !== row.sheetId && r.status === 'ongoing'
    )
  }

  /** 切屏次数的着色：超次数标红，切过但未超用警示色，未切过为常规色 */
  function switchClass(row: ProctorCandidate) {
    if (row.switchExceeded) return 'switch-num is-exceeded'
    if (row.switchCount > 0) return 'switch-num is-warn'
    return 'switch-num'
  }

  /*
    名单请求序号，用于丢弃过期响应。

    自动刷新与手动刷新、动作后的重拉可能同时在飞，先发的后返回会把新名单
    覆盖回旧内容——监考页上这意味着刚强制交卷的人又显示成「进行中」。
  */
  let seq = 0

  async function loadList() {
    if (!examId) return
    const mine = ++seq
    loading.value = true
    try {
      const { data } = await proctorApi.getCandidates(examId)
      if (mine !== seq) return
      examInfo.value = data.exam
      list.value = data.list
      stats.value = data.stats
    } catch (error: any) {
      if (mine !== seq) return
      ElMessage.error(error?.message || '加载考生名单失败')
    } finally {
      if (mine === seq) loading.value = false
    }
  }

  /* ===== 自动刷新 ===== */

  /** 轮询间隔：监考要的是「大致实时」，15 秒足够且不给后端压力 */
  const REFRESH_INTERVAL = 15000
  let timer: ReturnType<typeof setInterval> | null = null

  function stopTimer() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  function startTimer() {
    stopTimer()
    timer = setInterval(() => {
      // 上一次请求还没回来就跳过这一轮，避免慢网下请求堆积
      if (!loading.value) void loadList()
    }, REFRESH_INTERVAL)
  }

  /*
    开关与考试状态共同决定是否轮询。

    考试在本页打开期间可能自然结束（endTime 到点），届时数据不再变化，
    继续轮询只是白跑，故 isOngoing 转 false 时一并停掉。
  */
  watch(
    [autoRefresh, isOngoing],
    ([on, ongoing]) => {
      if (on && ongoing) startTimer()
      else stopTimer()
    },
    { immediate: true }
  )

  onBeforeUnmount(stopTimer)

  function handleBack() {
    router.push({ path: '/proctor' })
  }

  /* ===== 三个监考动作 ===== */

  /**
   * 强制交卷
   *
   * 提示里点明「已答内容会按现状判分」：监考人多半在考生离场未交卷时用它，
   * 需要明确这不是作废而是按当前作答提交。
   */
  async function handleForceSubmit(row: ProctorCandidate) {
    if (!row.sheetId) return
    try {
      await ElMessageBox.confirm(
        `确定代「${row.candidateName}」交卷吗？已答的 ${row.answeredCount} 题会按现状判分，未答题按 0 分计。`,
        '强制交卷',
        { type: 'warning', confirmButtonText: '强制交卷', cancelButtonText: '取消' }
      )
      const res = await proctorApi.forceSubmit(examId, row.sheetId)
      ElMessage.success(res.message || '已强制交卷')
      await loadList()
    } catch (error: any) {
      if (error !== 'cancel') ElMessage.error(error?.message || '强制交卷失败')
    }
  }

  /**
   * 解锁续答
   *
   * 说明写清「切屏次数归零 + 撤销交卷 + 已答保留」三件事：
   * 这个动作会连带清掉已判的分数（后端如此），不讲明白会让人以为只是解锁。
   */
  async function handleUnlock(row: ProctorCandidate) {
    if (!row.sheetId) return
    try {
      await ElMessageBox.confirm(
        `将「${row.candidateName}」的切屏次数清零并撤销交卷，已答内容保留、考生可继续答题。` +
          '该操作会清除本次已判的分数与发布状态。',
        '解锁续答',
        { type: 'warning', confirmButtonText: '解锁', cancelButtonText: '取消' }
      )
      const res = await proctorApi.unlock(examId, row.sheetId)
      ElMessage.success(res.message || '已解锁')
      await loadList()
    } catch (error: any) {
      if (error !== 'cancel') ElMessage.error(error?.message || '解锁失败')
    }
  }

  /**
   * 清空重考（不可逆）
   *
   * 用输入姓名确认而非普通确认框：这是本页唯一会丢数据的动作，
   * 与「强制交卷」在同一行相邻，误点代价太大。
   */
  async function handleReset(row: ProctorCandidate) {
    if (!row.sheetId) return
    try {
      await ElMessageBox.prompt(
        `将删除「${row.candidateName}」本场考试的全部作答，考生需重新开考，该操作不可恢复。\n` +
          `如确认，请输入考生姓名「${row.candidateName}」。`,
        '清空重考',
        {
          type: 'error',
          confirmButtonText: '确认清空',
          cancelButtonText: '取消',
          inputPlaceholder: '输入考生姓名',
          // 校验放在弹窗里而不是提交后判断：输错时能原地重试，不必重新走一遍流程
          inputValidator: (v: string) =>
            v?.trim() === row.candidateName ? true : '姓名不一致，请重新输入'
        }
      )
      const res = await proctorApi.reset(examId, row.sheetId)
      ElMessage.success(res.message || '已清空')
      await loadList()
    } catch (error: any) {
      if (error !== 'cancel') ElMessage.error(error?.message || '清空失败')
    }
  }

  onMounted(() => {
    if (!examId) {
      ElMessage.error('缺少考试参数')
      router.replace({ path: '/proctor' })
      return
    }
    void loadList()
  })
</script>

<style lang="scss" scoped>
  .proctor-ws {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  // 与 grading / proctor 的 .body-card 同款：白底 + 12px 圆角，不用 ElCard
  .body-card {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    padding: 20px;
    background: var(--el-bg-color);
    border-radius: 12px;
  }

  .ws-head {
    display: flex;
    flex-shrink: 0;
    gap: 16px;
    align-items: flex-start;
    justify-content: space-between;

    .ws-meta {
      min-width: 0;
    }

    .ws-title {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    /* 返回按钮紧贴标题左侧，抹掉 link 按钮自带的内边距免得与名称拉开空隙 */
    .back-btn {
      padding: 0;
      margin-right: 4px;
    }

    .ws-name {
      overflow: hidden;
      font-size: 16px;
      font-weight: 500;
      color: var(--art-text-gray-800);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ws-sub {
      margin-top: 6px;
      font-size: 13px;
      color: var(--art-text-gray-600);
    }

    .ws-actions {
      display: flex;
      flex-shrink: 0;
      gap: 12px;
      align-items: center;
    }

    /* 复选框默认自带右侧 margin，与相邻按钮的 gap 叠加会显得过宽 */
    .auto-refresh {
      margin-right: 0;
    }
  }

  .ws-stats {
    display: flex;
    flex-shrink: 0;
    gap: 24px;
    align-items: center;
    padding: 12px 16px;
    margin-top: 14px;
    background: var(--art-bg-color);
    border-radius: 8px;

    .stat-item {
      display: flex;
      gap: 6px;
      align-items: baseline;
    }

    .stat-label {
      font-size: 13px;
      color: var(--art-text-gray-600);
    }

    .stat-value {
      font-size: 18px;
      font-weight: 600;
      color: var(--art-text-gray-800);

      &.is-ongoing {
        color: var(--el-color-warning);
      }

      &.is-danger {
        color: var(--el-color-danger);
      }
    }

    /* 把「切屏超次」与前四项计数分开：它是异常项，不与进度并列阅读 */
    .stat-sep {
      width: 1px;
      height: 20px;
      background: var(--el-border-color-lighter);
    }
  }

  /* 筛选行：套全站列表页同款的 responsiveFilterForm，窄屏自动堆叠 */
  .ws-filter {
    flex-shrink: 0;
    margin: 14px 0 2px;

    @include responsiveFilterForm();

    :deep(.el-form-item) {
      margin-bottom: 12px;
    }
  }

  /* 与列表页 .filter-input / .filter-select 同宽，保持跨页一致 */
  .ws-select {
    width: 200px;
  }

  .ws-search {
    width: 200px;
  }

  .table-container {
    flex: 1;
    min-height: 0;
  }

  .switch-num {
    font-weight: 600;

    &.is-warn {
      color: var(--el-color-warning);
    }

    &.is-exceeded {
      color: var(--el-color-danger);
    }
  }

  /* 「超次」小标签紧跟次数，用小字号避免与数字争夺注意力 */
  .exceed-tip {
    margin-left: 4px;
    font-size: 12px;
    color: var(--el-color-danger);
  }

  .retake-tag {
    margin-left: 6px;
  }

  /* 次数列两行：第几次为主信息，已考额度为辅 */
  .attempt-no {
    display: block;
  }

  .attempt-quota {
    display: block;
    font-size: 12px;
    color: var(--art-text-gray-500);
  }

  /* 机会用尽：与切屏超次同一套警示语言，但用 warning 而非 danger——
     用尽机会是正常结果，不是异常 */
  .attempt-used-up {
    font-weight: 600;
    color: var(--el-color-warning);
  }

  .score-num {
    font-weight: 600;
  }

  .unpublished-tip {
    margin-left: 4px;
    font-size: 12px;
    color: var(--art-text-gray-500);
  }

  .muted {
    color: var(--art-text-gray-500);
  }
</style>
