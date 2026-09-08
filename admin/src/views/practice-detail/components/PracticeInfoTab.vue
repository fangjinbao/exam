<!--
  练习详情 Tab：基本信息 / 练习题库 / 抽题规则 / 参与人员 / 练习设置分组只读展示。
  详情数据由父页以 prop 下传（页头的名称与状态要用同一份，避免两处各拉一遍），
  本组件只负责渲染与题型/难度字典的翻译。
  展示用 InfoPanel + InfoField（字段名在上、值在下），与考试详情同一套卡片语言，
  不用 ElDescriptions 的带框表格 + ElDivider 分隔线。
-->

<template>
  <div v-loading="!!loading" class="info-tab">
    <template v-if="detail">
      <InfoPanel title="基本信息">
        <InfoField label="练习名称">{{ detail.name }}</InfoField>
        <InfoField label="练习编号">{{ detail.code || '-' }}</InfoField>
        <InfoField label="状态">
          <ElTag :type="statusTagType(detail.status)" size="small" disable-transitions>
            {{ PRACTICE_STATUS_TEXT[detail.status] || detail.status }}
          </ElTag>
        </InfoField>
        <InfoField label="练习方式">
          {{ detail.drawMode === 'random' ? '按规则抽题' : '全库顺序练' }}
        </InfoField>
        <InfoField label="开始时间">{{ formatTime(detail.startTime) }}</InfoField>
        <InfoField label="结束时间">
          {{ formatTime(detail.endTime) }}
          <!-- 自动结束是结束时间的从属规则，并进同一格比单独占一格更好理解 -->
          <span class="sub-note">
            {{ detail.autoFinish ? '到点自动结束' : '到点后不自动结束' }}
          </span>
        </InfoField>
        <InfoField label="题目数">{{ detail.questionCount }} 题</InfoField>
        <InfoField label="参与范围">
          {{ detail.participantScope === 'all' ? '全员参与' : '指定员工参与' }}
        </InfoField>
        <InfoField label="参与人数">{{ participantText }}</InfoField>
        <InfoField label="练习说明" full>{{ detail.description || '-' }}</InfoField>
      </InfoPanel>

      <InfoPanel title="练习题库" :sub="bankSub" plain>
        <ElTable :data="detail.banks" size="small" max-height="200">
          <ElTableColumn type="index" label="序号" width="70" align="center" />
          <ElTableColumn prop="bankName" label="题库名称" min-width="240" show-overflow-tooltip />
          <ElTableColumn prop="questionCount" label="题目数" width="100" align="center" />
          <template #empty>暂无题库</template>
        </ElTable>
      </InfoPanel>

      <InfoPanel v-if="detail.drawMode === 'random'" title="抽题规则" :sub="ruleSub" plain>
        <ElTable :data="detail.rules" size="small" max-height="220">
          <ElTableColumn type="index" label="序号" width="70" align="center" />
          <ElTableColumn label="题型" width="110" align="center">
            <template #default="{ row }">{{ questionTypeText(row.questionType) }}</template>
          </ElTableColumn>
          <ElTableColumn label="难度" width="100" align="center">
            <template #default="{ row }">{{ difficultyText(row.difficulty) }}</template>
          </ElTableColumn>
          <ElTableColumn label="知识点" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ row.knowledgePointName || '不限' }}</template>
          </ElTableColumn>
          <ElTableColumn prop="drawCount" label="抽取数量" width="110" align="center" />
          <template #empty>暂无抽题规则</template>
        </ElTable>
      </InfoPanel>

      <InfoPanel v-if="detail.participantScope === 'specified'" title="参与人员" plain>
        <ElTable :data="detail.participants" size="small" max-height="240">
          <ElTableColumn type="index" label="序号" width="70" align="center" />
          <ElTableColumn prop="participantName" label="姓名" min-width="160" />
          <ElTableColumn label="人员类型" width="120" align="center">
            <template #default="{ row }">
              {{ row.participantType === 'external' ? '外部考生' : '内部人员' }}
            </template>
          </ElTableColumn>
          <template #empty>暂无参与人员</template>
        </ElTable>
      </InfoPanel>

      <InfoPanel v-if="detail.setting" title="练习设置" :columns="3">
        <InfoField v-for="item in settingItems" :key="item.label" :label="item.label">
          <!-- 开关类字段用状态点，比一列「开启/关闭」文字更容易扫读 -->
          <span class="flag" :class="item.on ? 'is-on' : 'is-off'">
            {{ item.on ? '开启' : '关闭' }}
          </span>
        </InfoField>
      </InfoPanel>
      <ElEmpty v-else description="未配置练习设置" :image-size="60" />
    </template>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, onMounted } from 'vue'
  import {
    PRACTICE_STATUS_TEXT,
    practiceStatusTagType as statusTagType,
    ALL_PARTICIPANTS,
    type PracticeDetail
  } from '@/api/practice'
  import { dataDictApi, type DictDataItem } from '@/api/dataDict'
  import InfoPanel from '@/components/business/detail/InfoPanel.vue'
  import InfoField from '@/components/business/detail/InfoField.vue'

  defineOptions({ name: 'PracticeInfoTab' })

  const props = defineProps<{
    detail: PracticeDetail | null
    loading?: boolean
  }>()

  // 题型/难度字典：抽题规则表要把 value 翻成中文
  const typeDict = ref<DictDataItem[]>([])
  const difficultyDict = ref<DictDataItem[]>([])

  const participantText = computed(() => {
    if (!props.detail) return '-'
    return props.detail.participantCount === ALL_PARTICIPANTS
      ? '全员'
      : `${props.detail.participantCount} 人`
  })

  /** 题库卡片副标题：库数与题目总量，不必逐行加总也能看出可抽范围 */
  const bankSub = computed(() => {
    const banks = props.detail?.banks ?? []
    if (!banks.length) return ''
    const total = banks.reduce((sum, b) => sum + (b.questionCount || 0), 0)
    return `${banks.length} 个题库，共 ${total} 题`
  })

  /** 抽题规则副标题：各规则抽取数之和，与上方「题目数」对得上才说明规则配全了 */
  const ruleSub = computed(() => {
    const rules = props.detail?.rules ?? []
    if (!rules.length) return ''
    const total = rules.reduce((sum, r) => sum + (r.drawCount || 0), 0)
    return `${rules.length} 条规则，合计抽取 ${total} 题`
  })

  /** 练习设置的展示项：全部是开关，统一用状态点渲染 */
  const settingItems = computed<Array<{ label: string; on: boolean }>>(() => {
    const s = props.detail?.setting
    if (!s) return []
    return [
      { label: '反复练习', on: !!s.allowRepeat },
      { label: '单题展示对错', on: !!s.showResultPerQuestion },
      { label: '展示答案', on: !!s.showAnswer },
      { label: '展示解析', on: !!s.showAnalysis }
    ]
  })

  function formatTime(value?: string | null) {
    if (!value) return '不限'
    return value.replace('T', ' ').slice(0, 16)
  }

  /** 题型 value → 字典名称；字典缺项时回退显示原值 */
  function questionTypeText(value: string) {
    return typeDict.value.find((d) => d.value === value)?.name || value
  }

  /** 难度 value → 字典名称；空串表示不限 */
  function difficultyText(value: string) {
    if (!value) return '不限'
    return difficultyDict.value.find((d) => d.value === value)?.name || value
  }

  onMounted(async () => {
    try {
      const { data } = await dataDictApi.getData(['question_type', 'difficulty'])
      typeDict.value = data.question_type || []
      difficultyDict.value = data.difficulty || []
    } catch {
      // 字典拉取失败不阻断详情展示，questionTypeText/difficultyText 会回退显示原值
    }
  })
</script>

<style lang="scss" scoped>
  // 卡片间距由容器统一给，这样空态 ElEmpty 与卡片混排时也不会漏掉间距
  .info-tab {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: 120px;
  }

  // 附注文字：跟在主值后面的补充说明，弱化处理避免与主值抢视线
  .sub-note {
    margin-left: 8px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  // 开关状态：色点 + 文字，不单靠颜色区分（色弱可读文字）
  .flag::before {
    display: inline-block;
    width: 6px;
    height: 6px;
    margin-right: 6px;
    vertical-align: middle;
    content: '';
    border-radius: 50%;
  }

  .flag.is-on::before {
    background: var(--el-color-success);
  }

  .flag.is-off::before {
    background: var(--el-text-color-disabled);
  }

  .flag.is-off {
    color: var(--el-text-color-secondary);
  }
</style>
