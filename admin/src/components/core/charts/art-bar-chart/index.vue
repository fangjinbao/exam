<!-- 柱状图 -->
<template>
  <div ref="chartRef" :style="{ height: props.height }" v-loading="props.loading"> </div>
</template>

<script setup lang="ts">
  import { useChartOps, useChartComponent } from '@/composables/useChart'
  import { getCssVar } from '@/utils/ui'
  import { graphic, type EChartsOption } from '@/utils/echarts'
  import type { BarChartProps, BarDataItem } from '@/types/component/chart'

  defineOptions({ name: 'ArtBarChart' })

  const props = withDefaults(defineProps<BarChartProps>(), {
    // 基础配置
    height: useChartOps().chartHeight,
    loading: false,
    isEmpty: false,
    colors: () => useChartOps().colors,
    borderRadius: 4,

    // 数据配置
    data: () => [0, 0, 0, 0, 0, 0, 0],
    xAxisData: () => [],
    barWidth: '40%',
    stack: false,
    showDataLabel: false,

    // 轴线显示配置
    showAxisLabel: true,
    showAxisLine: true,
    showSplitLine: true,

    // 交互配置
    showTooltip: true,
    showLegend: false,
    legendPosition: 'bottom'
  })

  // 判断是否为多数据
  const isMultipleData = computed(() => {
    return (
      Array.isArray(props.data) &&
      props.data.length > 0 &&
      typeof props.data[0] === 'object' &&
      'name' in props.data[0]
    )
  })

  // 获取颜色配置
  const getColor = (customColor?: string, index?: number) => {
    if (customColor) return customColor

    if (index !== undefined) {
      return props.colors![index % props.colors!.length]
    }

    // 默认渐变色
    return new graphic.LinearGradient(0, 0, 0, 1, [
      {
        offset: 0,
        color: getCssVar('--el-color-primary-light-4')
      },
      {
        offset: 1,
        color: getCssVar('--el-color-primary')
      }
    ])
  }

  // 创建渐变色
  const createGradientColor = (color: string) => {
    return new graphic.LinearGradient(0, 0, 0, 1, [
      {
        offset: 0,
        color: color
      },
      {
        offset: 1,
        color: color
      }
    ])
  }

  // 获取基础样式配置
  const getBaseItemStyle = (
    color: string | InstanceType<typeof graphic.LinearGradient> | undefined
  ) => ({
    borderRadius: props.borderRadius,
    color: typeof color === 'string' ? createGradientColor(color) : color
  })

  // 创建系列配置
  const createSeriesItem = (config: {
    name?: string
    data: number[]
    color?: string | InstanceType<typeof graphic.LinearGradient>
    barWidth?: string | number
    stack?: string
  }) => {
    const animationConfig = getAnimationConfig()

    return {
      name: config.name,
      data: config.data,
      type: 'bar' as const,
      stack: config.stack,
      itemStyle: getBaseItemStyle(config.color),
      barWidth: config.barWidth || props.barWidth,
      label: {
        show: props.showDataLabel,
        position: 'top' as const,
        // 复用图表统一的文字色，与坐标轴标签、其他图表的数值标签同一套
        color: useChartOps().fontColor,
        fontSize: 12,
        formatter: (params: unknown) => {
          const value = Number((params as Record<string, unknown>).value) || 0
          return props.dataLabelFormatter ? props.dataLabelFormatter(value) : String(value)
        }
      },
      ...animationConfig
    }
  }

  // 使用新的图表组件抽象
  const {
    chartRef,
    getAxisLineStyle,
    getAxisLabelStyle,
    getAxisTickStyle,
    getSplitLineStyle,
    getAnimationConfig,
    getTooltipStyle,
    getLegendStyle,
    getGridWithLegend
  } = useChartComponent({
    props,
    checkEmpty: () => {
      // 检查单数据情况
      if (Array.isArray(props.data) && typeof props.data[0] === 'number') {
        const singleData = props.data as number[]
        return !singleData.length || singleData.every((val) => val === 0)
      }

      // 检查多数据情况
      if (Array.isArray(props.data) && typeof props.data[0] === 'object') {
        const multiData = props.data as BarDataItem[]
        return (
          !multiData.length ||
          multiData.every((item) => !item.data?.length || item.data.every((val) => val === 0))
        )
      }

      return true
    },
    /*
      showDataLabel / dataLabelFormatter 必须在监听里。

      它们参与 generateOptions，不监听就只能靠 data 恰好同时变化来间接重绘——
      调用方若单独切换「显示数值」开关（data 引用不变），标签将完全不响应。
    */
    watchSources: [
      () => props.data,
      () => props.xAxisData,
      () => props.colors,
      () => props.showDataLabel,
      () => props.dataLabelFormatter
    ],
    generateOptions: (): EChartsOption => {
      const options: EChartsOption = {
        grid: getGridWithLegend(props.showLegend && isMultipleData.value, props.legendPosition, {
          // 开数值标签时顶部要多留一行，否则最高的那根柱子的数值会被网格上沿裁掉
          top: props.showDataLabel ? 30 : 15,
          right: 0,
          left: 0
        }),
        tooltip: props.showTooltip ? getTooltipStyle() : undefined,
        xAxis: {
          type: 'category',
          data: props.xAxisData,
          axisTick: getAxisTickStyle(),
          axisLine: getAxisLineStyle(props.showAxisLine),
          axisLabel: getAxisLabelStyle(props.showAxisLabel)
        },
        yAxis: {
          type: 'value',
          axisLabel: getAxisLabelStyle(props.showAxisLabel),
          axisLine: getAxisLineStyle(props.showAxisLine),
          splitLine: getSplitLineStyle(props.showSplitLine)
        }
      }

      // 添加图例配置
      if (props.showLegend && isMultipleData.value) {
        options.legend = getLegendStyle(props.legendPosition)
      }

      // 生成系列数据
      if (isMultipleData.value) {
        const multiData = props.data as BarDataItem[]
        options.series = multiData.map((item, index) => {
          const computedColor = getColor(props.colors[index], index)

          return createSeriesItem({
            name: item.name,
            data: item.data,
            color: computedColor,
            barWidth: item.barWidth,
            stack: props.stack ? item.stack || 'total' : undefined
          })
        })
      } else {
        // 单数据情况
        const singleData = props.data as number[]
        const computedColor = getColor()

        options.series = [
          createSeriesItem({
            data: singleData,
            color: computedColor
          })
        ]
      }

      return options
    }
  })
</script>
