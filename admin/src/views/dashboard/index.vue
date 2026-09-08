<!--
  首页：考务视角的工作台

  当前用静态演示数据（./mock.ts），后端接口尚未落地。
  接后端时只需把 load() 里的赋值换成 gradingApi / analyticsApi 调用——
  mock 的数据结构与真实接口类型一致，页面与子组件均无需改动。

  TODO 接后端时必须一并恢复 403 静默降级，改静态数据时这套逻辑被删掉了。

  两个数据源的权限点不同，要分开判断：
  /admin/exam/grading/exams 需 exam:grading:list，/admin/exam/analytics/overview
  需 exam:analytics:list。seed 只创建「命题人」「考生管理员」等角色而不预授这两个
  权限点，未在角色管理页手动勾选时，这些角色访问首页会各吃一个 403。

  首页是落地页，弹「无权限访问」既无操作指引也解决不了问题。正确做法是静默降级：
  在 load() 的 catch 里判 error.code === ApiStatus.forbidden（来自 @/utils/http/status，
  不要硬编码 403）时置一个标志位，用 v-if 隐藏对应数据区块，
  另渲染一条 ElAlert 说明缺哪个权限。两个接口各自一个标志位、独立判断——
  一个没权限时另一个仍应正常展示。

  注意这是「接口抛 403 后隐藏区块」，不是「后端在 200 响应里带一个 canManage 字段」。
  项目里题库页那种常驻只读提示属于后者，两条路径不要混。

  四张指标卡都可点击跳转到对应模块的筛选态，首页只负责「发现问题」，
  「处理问题」交给各模块自己的页面。
-->

<template>
  <div v-loading="loading" class="dashboard">
    <StatCards
      :pending-sheets="pendingSheets"
      :unpublished-sheets="unpublishedSheets"
      :ongoing-count="ongoingCount"
      :absent-count="absentCount"
      @grading="goGrading"
      @exam="goExam"
    />

    <AnalyticsCharts
      v-model:company="activeCompany"
      :overview="overview"
      :companies="companies"
      :loading="loading"
    />

    <PendingExams
      :rows="needAttention"
      :loading="loading"
      @grading="goGrading"
      @workspace="goWorkspace"
    />
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import type { GradingExam } from '@/api/grading'
  import type { AnalyticsOverview } from '@/api/analytics'
  import StatCards from './components/StatCards.vue'
  import AnalyticsCharts from './components/AnalyticsCharts.vue'
  import PendingExams from './components/PendingExams.vue'
  import { MOCK_EXAMS, MOCK_OVERVIEW } from './mock'

  defineOptions({ name: 'Dashboard' })

  const router = useRouter()
  const loading = ref(false)

  const exams = ref<GradingExam[]>([])
  const overview = ref<AnalyticsOverview | null>(null)
  const activeCompany = ref('')

  /** 公司下拉选项：随概览数据一并给出 */
  const companies = computed(() => overview.value?.companies ?? [])

  /** 待批阅份数合计：仍有未评分主观题的答卷数，是阅卷员的直接待办量 */
  const pendingSheets = computed(() => sum(exams.value.map((e) => e.pendingCount)))

  /**
   * 待发布份数：已交但成绩未发布的答卷
   *
   * 用 sheetCount - publishedCount 而非「已阅完未发布」：未阅完的卷同样属于
   * 「考生还看不到成绩」，从考务视角都是待处理，分开只会让两个数字加不出总量。
   * 已发布数不可能超过已交数，故不会为负。
   *
   * 排除进行中的场次：考试还在跑就发成绩，后面考的人能打听到答案，
   * 实务上不会这么做。把这些卷算进来，这张卡就会被在考的场次顶成一个
   * 无法行动的大数字——考务此刻对它们做不了任何事。
   */
  const unpublishedSheets = computed(() =>
    sum(
      exams.value
        .filter((e) => e.status !== 'ongoing')
        .map((e) => Math.max(0, e.sheetCount - e.publishedCount))
    )
  )

  const ongoingCount = computed(() => exams.value.filter((e) => e.status === 'ongoing').length)

  /**
   * 缺考人数：应考减已交
   *
   * 仅统计已结束的考试——进行中的考试「还没交」是正常状态，
   * 算进缺考会让首页在开考期间显示一个不断下降的虚高数字。
   */
  const absentCount = computed(() =>
    sum(
      exams.value
        .filter((e) => e.status === 'finished')
        .map((e) => Math.max(0, e.candidateCount - e.sheetCount))
    )
  )

  /*
    需要关注的考试：有待批阅或有未发布成绩，按待批阅量降序取前 8。

    注意这里的过滤条件不排除进行中的场次，而上面的「成绩待发布」KPI 排除了。
    当前两处看起来一致，是因为进行中的场次 pendingCount 为 0、按降序排在末位、
    被 slice(0, 8) 截掉了，并非逻辑上的保证。
    若日后有进行中的场次带上待批阅量，它会进入这张表格却不计入那个 KPI——
    届时要把两处口径对齐，而不是任其分裂。
  */
  const needAttention = computed(() =>
    exams.value
      .filter((e) => e.pendingCount > 0 || e.sheetCount > e.publishedCount)
      .sort((a, b) => b.pendingCount - a.pendingCount)
      .slice(0, 8)
  )

  function sum(list: number[]): number {
    return list.reduce((acc, n) => acc + (n || 0), 0)
  }

  /*
    静态数据加载。

    写成 async + try/finally 而非直接赋值：子组件的 loading 分支、空状态分支
    都按异步写好了，这里保持同样的形态，接后端时把两行赋值换成两个 await 请求
    即可，不必再动结构，也不必回头补 loading 的置位。
    403 降级的 catch 见文件头 TODO——那要等真实请求进来才有东西可捕获。
  */
  async function load() {
    loading.value = true
    try {
      exams.value = MOCK_EXAMS
      overview.value = MOCK_OVERVIEW
    } finally {
      loading.value = false
    }
  }

  /** 指标卡点击：带筛选条件跳到对应模块，首页只负责发现问题 */
  function goGrading(progress?: string) {
    router.push({ path: '/grading', query: progress ? { progress } : {} })
  }

  function goExam() {
    router.push('/exam')
  }

  /** 进入某场考试的阅卷工作台，与阅卷中心「快速批阅」同一入口 */
  function goWorkspace(e: GradingExam) {
    router.push({ path: '/grading-workspace', query: { id: e.id, name: e.name, mode: 'quick' } })
  }

  onMounted(load)
</script>

<style lang="scss" scoped>
  // 页面自身不加 padding：外层布局已给，重复加会让卡片离边太远
  .dashboard {
    width: 100%;
  }
</style>
