<!--
  首页图表区：四张卡，公司维度是核心

  各公司都要能在同一张图上互相比，所以公司维度的两张图都用同一组
  topCompanies 数据，不各自截取，避免两张图公司数量不一致。
-->

<template>
  <div>
    <div class="chart-row">
      <!-- 宽度由 .chart-row 的 2fr 1fr 按 DOM 顺序决定，此处不需要额外的宽度类 -->
      <ElCard shadow="never" class="chart-card">
        <template #header>
          <div class="card-head">
            <span class="card-title">各公司参考与及格人数</span>
            <ElSelect
              :model-value="company"
              placeholder="全部公司"
              clearable
              size="small"
              class="company-select"
              @update:model-value="emit('update:company', $event ?? '')"
            >
              <ElOption v-for="c in companies" :key="c" :label="c" :value="c" />
            </ElSelect>
          </div>
        </template>
        <ArtBarChart
          v-if="hasCompanyData"
          :data="companyChartData"
          :x-axis-data="companyChartX"
          :loading="loading"
          height="300px"
          show-legend
          :show-data-label="showCompanyLabel"
        />
        <ElEmpty v-else-if="!loading" description="暂无答卷数据" :image-size="80" />
      </ElCard>

      <ElCard shadow="never" class="chart-card">
        <template #header>
          <span class="card-title">考试状态构成</span>
        </template>
        <!--
          图例自己用 HTML 写而不开组件的 show-legend：
          需要「名称 + 场次 + 占比」三段信息，ECharts 图例只给名称，
          而占比正是这张图要回答的问题，不写出来就得让用户去量弧长。

          同时关掉组件的 tooltip：tooltip 的 {d}% 由 ECharts 按最大余数法算，
          与本组件自算的百分比在舍入上可能差一位，两个数字同页出现会显得页面不严谨。
          图例已把每段的场次与占比全部列出，tooltip 不再提供额外信息。
        -->
        <div v-if="totalExamCount > 0" class="ring-wrap">
          <ArtRingChart
            :data="statusPieData"
            :loading="loading"
            height="240px"
            :center-text="`${totalExamCount} 场`"
            :show-tooltip="false"
            class="ring-chart"
          />
          <ul class="ring-legend">
            <li v-for="(s, i) in statusLegend" :key="s.name">
              <span class="dot" :style="{ background: ringColors[i % ringColors.length] }" />
              <span class="legend-name">{{ s.name }}</span>
              <span class="legend-value">{{ s.value }} 场</span>
              <span class="legend-pct">{{ s.percent }}%</span>
            </li>
          </ul>
        </div>
        <ElEmpty v-else-if="!loading" description="暂无考试" :image-size="80" />
      </ElCard>
    </div>

    <div class="chart-row">
      <ElCard shadow="never" class="chart-card">
        <template #header>
          <div class="card-head">
            <span class="card-title">成绩分布</span>
            <!-- 标注样本量：不写清楚基数，分布图容易被当成全量结论 -->
            <span class="card-note">{{ sampleNote }}</span>
          </div>
        </template>
        <ArtBarChart
          v-if="hasScoreData"
          :data="scoreDistData"
          :x-axis-data="scoreDistX"
          :loading="loading"
          height="280px"
          show-data-label
        />
        <ElEmpty v-else-if="!loading" description="暂无已发布成绩" :image-size="80" />
      </ElCard>

      <ElCard shadow="never" class="chart-card">
        <template #header>
          <div class="card-head">
            <span class="card-title">各公司及格率</span>
            <span class="card-note">按已发布成绩计</span>
          </div>
        </template>
        <!--
          横向而非纵向：纵轴放公司名后再长也不会像 X 轴那样被挤成斜排或省略号，
          公司简称长短不齐时横向排布可读性明显更好。
        -->
        <ArtHBarChart
          v-if="hasCompanyData"
          :data="passRateData"
          :x-axis-data="companyChartX"
          :loading="loading"
          height="280px"
          bar-width="52%"
          show-data-label
          :data-label-formatter="formatPercent"
        />
        <ElEmpty v-else-if="!loading" description="暂无已发布成绩" :image-size="80" />
      </ElCard>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useChartOps } from '@/composables/useChart'
  import { EXAM_STATUS_TEXT } from '@/api/exam'
  import type { AnalyticsOverview } from '@/api/analytics'

  defineOptions({ name: 'DashboardAnalyticsCharts' })

  const props = defineProps<{
    overview: AnalyticsOverview | null
    companies: string[]
    company: string
    loading: boolean
  }>()

  const emit = defineEmits<{ 'update:company': [value: string] }>()

  /*
    只取前 10 家公司：柱图超过这个数量后 X 轴标签会挤成一团无法辨认，
    真要看全部应该去统计分析模块的表格页，那里能排序和分页。
  */
  const TOP_COMPANY_LIMIT = 10

  const topCompanies = computed(() =>
    (props.overview?.companyStats ?? []).slice(0, TOP_COMPANY_LIMIT)
  )

  /** 公司维度：参考人数与及格人数双系列对比 */
  const companyChartX = computed(() => topCompanies.value.map((c) => c.companyName))

  const companyChartData = computed(() => [
    { name: '参考人数', data: topCompanies.value.map((c) => c.examinees) },
    { name: '及格人数', data: topCompanies.value.map((c) => c.passed) }
  ])

  /**
   * 各公司及格率（横向柱图）
   *
   * 分母用 published 而非 examinees：未发布成绩的人 passed 是 null，
   * 拿他们当分母会把及格率算低，看起来像成绩差，实际是还没发布。
   */
  const passRateData = computed(() =>
    topCompanies.value.map((c) => (c.published ? Math.round((c.passed / c.published) * 100) : 0))
  )

  /*
    定义在顶层而非模板内联：该函数作为 prop 传入图表组件后会被 watch 监听，
    内联写法每次重渲染都产生新引用，会触发多余的图表重建。
  */
  const formatPercent = (v: number) => `${v}%`

  /*
    参考/及格人数的柱顶数值按公司数量自动开关。

    该图每家公司两根柱，公司多了之后相邻柱顶的标签会横向叠在一起，
    显示成一片糊字不如不显示——超过 6 家就关掉，具体数值仍可悬停查看。
  */
  const COMPANY_LABEL_LIMIT = 6
  const showCompanyLabel = computed(() => topCompanies.value.length <= COMPANY_LABEL_LIMIT)

  /*
    样本量说明。

    ratedTotal 是实际进图的人数，publishedTotal 是已发布人数，两者可能不等——
    试卷满分缺失时算不出得分率，那份答卷不进任何分桶。
    只写「已发布 N 人」会让用户数不出图里的人数，差额必须显式讲出来。
  */
  const sampleNote = computed(() => {
    const o = props.overview
    if (!o) return ''
    const skipped = o.publishedTotal - o.ratedTotal
    return skipped > 0
      ? `已发布 ${o.publishedTotal} 人，${skipped} 人因试卷满分缺失未计入`
      : `已发布 ${o.publishedTotal} 人`
  })

  /** 得分率分布 */
  const scoreDistX = computed(() => (props.overview?.scoreDistribution ?? []).map((b) => b.label))

  const scoreDistData = computed(() =>
    (props.overview?.scoreDistribution ?? []).map((b) => b.count)
  )

  /** 考试状态构成（环图） */
  const statusPieData = computed(() =>
    (props.overview?.examStatusCount ?? []).map((s) => ({
      name: EXAM_STATUS_TEXT[s.status] || s.status,
      value: s.count
    }))
  )

  /*
    自绘图例的配色取自图表组件的同一份色板，保证色块与环上的分段一一对应。
    若在此另写一组颜色，组件换色板后两边就会错开。
  */
  const ringColors = useChartOps().colors

  /** 环图中心显示考试总场次 */
  const totalExamCount = computed(() => sum(statusPieData.value.map((s) => s.value)))

  /**
   * 图例条目：在名称之外补上场次与占比
   *
   * 百分比用最大余数法而非逐项四舍五入：逐项舍入后各行相加可能得到 99.9%
   * 或 100.1%，而这张图的每一行都摆在一起，用户会顺手把它们加一遍。
   */
  const statusLegend = computed(() => {
    const items = statusPieData.value
    const total = totalExamCount.value
    if (!total) return items.map((s) => ({ ...s, percent: 0 }))

    // 以「千分之一」为整数单位计算，最后除以 10 得到一位小数
    const raw = items.map((s) => (s.value / total) * 1000)
    const floored = raw.map((r) => Math.floor(r))
    let rest = 1000 - floored.reduce((a, b) => a + b, 0)

    // 小数部分最大的先补，补完余量为止
    const order = raw
      .map((r, i) => ({ i, frac: r - Math.floor(r) }))
      .sort((a, b) => b.frac - a.frac)

    const tenths = [...floored]
    for (const { i } of order) {
      if (rest <= 0) break
      tenths[i] += 1
      rest -= 1
    }

    return items.map((s, i) => ({ ...s, percent: tenths[i] / 10 }))
  })

  /** 图表是否有数据：全为 0 时显示空状态而非一张空坐标系 */
  const hasCompanyData = computed(() => topCompanies.value.length > 0)
  const hasScoreData = computed(() => sum(scoreDistData.value) > 0)

  function sum(list: number[]): number {
    return list.reduce((acc, n) => acc + (n || 0), 0)
  }
</script>

<style lang="scss" scoped>
  /*
    图表两列：宽卡占 2 份、窄卡占 1 份。
    1100px 以下降为单列——公司维度柱图在窄容器里 X 轴标签会重叠，
    与其压缩到不可读，不如让它独占整行宽度。
  */
  .chart-row {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 16px;
    margin-top: 16px;

    @media (width <= 1100px) {
      grid-template-columns: 1fr;
    }
  }

  // 第二行两张卡等宽：成绩分布与及格率没有主次关系
  .chart-row:nth-of-type(2) {
    grid-template-columns: 1fr 1fr;

    @media (width <= 1100px) {
      grid-template-columns: 1fr;
    }
  }

  .chart-card {
    border: none !important;
    border-radius: 12px;
    box-shadow: none !important;
  }

  .card-head {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
  }

  .card-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .card-note {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  .company-select {
    width: 140px;
  }

  /*
    环图与自绘图例左右并排。
    900px 以下改为上下排布——并排时两边都太窄，环会缩得看不出分段。
  */
  .ring-wrap {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .ring-chart {
    flex: 1 1 55%;
    min-width: 0;
  }

  .ring-legend {
    flex: 0 0 auto;
    padding: 0;
    margin: 0;
    list-style: none;

    li {
      display: flex;
      gap: 8px;
      align-items: center;
      padding: 5px 0;
      font-size: 13px;
      line-height: 1.4;
    }

    .dot {
      flex-shrink: 0;
      width: 8px;
      height: 8px;
      border-radius: 2px;
    }

    .legend-name {
      color: var(--el-text-color-regular);
    }

    // 场次与占比右对齐成一列：等宽数字 + 固定宽度，条目间数字不会参差
    .legend-value {
      min-width: 44px;
      font-variant-numeric: tabular-nums;
      color: var(--el-text-color-primary);
      text-align: right;
    }

    .legend-pct {
      min-width: 46px;
      font-variant-numeric: tabular-nums;
      color: var(--el-text-color-secondary);
      text-align: right;
    }
  }

  @media (width <= 900px) {
    .ring-wrap {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
