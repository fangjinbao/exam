<!--
  考试详情 Tab：基本信息 / 发证设置 / 考点与人员 / 考试设置四组只读展示。
  内容由父页一次性拉取后传入（页头的名称与状态也用同一份），避免两处各拉一遍详情接口。
  展示用 InfoPanel + InfoField（字段名在上、值在下），不用 ElDescriptions 的带框表格。
-->

<template>
  <div v-loading="loading" class="info-tab">
    <template v-if="detail">
      <InfoPanel title="基本信息">
        <InfoField label="考试名称">{{ detail.name }}</InfoField>
        <InfoField label="状态">
          <ElTag :type="statusTagType(detail.status)" size="small" disable-transitions>
            {{ EXAM_STATUS_TEXT[detail.status] || detail.status }}
          </ElTag>
        </InfoField>
        <InfoField label="试卷">
          {{ detail.paperName }}
          <ElTag
            :type="detail.paperType === 'random' ? 'warning' : 'primary'"
            size="small"
            disable-transitions
            class="inline-tag"
          >
            {{ detail.paperType === 'random' ? '随机' : '固定' }}
          </ElTag>
        </InfoField>
        <InfoField label="考试类型">
          {{ EXAM_TYPE_TEXT[detail.examType] || '普通考试' }}
        </InfoField>
        <!-- 项目关联属于考试类型而非发证方式，故与类型相邻 -->
        <InfoField v-if="detail.examType === 'skill'" label="鉴定项目">
          {{ detail.certProjectName || '-' }}
        </InfoField>
        <InfoField label="创建人">{{ detail.createByName || '-' }}</InfoField>
        <InfoField label="开始时间">{{ formatTime(detail.startTime) }}</InfoField>
        <InfoField label="结束时间">{{ formatTime(detail.endTime) }}</InfoField>
        <!-- 时长与及格分各带试卷参照值：单看设定值判断不出是否偏离建议 -->
        <InfoField label="考试时长">
          {{ detail.duration }} 分钟
          <span v-if="detail.paperSuggestDuration" class="sub-note">
            建议 {{ detail.paperSuggestDuration }} 分钟
          </span>
        </InfoField>
        <InfoField label="及格分数">
          {{ detail.passScore }}
          <span v-if="detail.paperTotalScore" class="sub-note">
            总分 {{ detail.paperTotalScore }}
          </span>
        </InfoField>
        <InfoField label="参考人数">{{ detail.candidateCount }} 人</InfoField>
        <InfoField label="考试说明" full>{{ detail.description || '-' }}</InfoField>
      </InfoPanel>

      <!-- 「认证项目」原在此处，作为发证方式之一；现已随考试类型挪到基本信息面板 -->
      <InfoPanel title="发证设置" :sub="certModeLabel(certMode)">
        <InfoField v-if="certMode === 'template'" label="证书模板">
          {{ detail.certTemplateName || '-' }}
        </InfoField>
        <InfoField v-else label="发放方式" full>
          <span class="placeholder">未配置自动发证，通过后需人工发放</span>
        </InfoField>
      </InfoPanel>

      <InfoPanel title="考点与人员" :columns="1">
        <InfoField label="考点">
          <span v-if="siteNames.length === 0" class="placeholder">未指定（线上参考）</span>
          <!-- 考点存在考生记录上，允许按人不同；多考点时全部列出，不用一个名字掩盖真实分布 -->
          <template v-else>
            <ElTag
              v-for="name in siteNames"
              :key="name"
              size="small"
              type="info"
              disable-transitions
              class="inline-tag"
            >
              {{ name }}
            </ElTag>
            <span v-if="noSiteCount" class="sub-note">另有 {{ noSiteCount }} 人未指定考点</span>
          </template>
        </InfoField>
        <InfoField label="监考人员">
          <StaffNameList :list="detail.proctors" empty-text="未指派" />
        </InfoField>
        <InfoField label="阅卷人员">
          <StaffNameList
            :list="detail.graders"
            empty-text="未指派，本场答卷对全部有阅卷权限的人可见"
          />
        </InfoField>
      </InfoPanel>

      <InfoPanel v-if="detail.setting" title="考试设置" :columns="3">
        <InfoField v-for="item in settingItems" :key="item.label" :label="item.label">
          <!-- 开关类字段用状态点，比十几个「开启/关闭」文字更容易扫读 -->
          <span v-if="item.on !== undefined" class="flag" :class="item.on ? 'is-on' : 'is-off'">
            {{ item.text }}
          </span>
          <template v-else>{{ item.text }}</template>
        </InfoField>
      </InfoPanel>
      <ElEmpty v-else description="未配置考试设置" :image-size="60" />
    </template>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import {
    EXAM_STATUS_TEXT,
    EXAM_TYPE_TEXT,
    examStatusTagType as statusTagType,
    certModeLabel,
    deriveCertMode,
    type ExamDetail
  } from '@/api/exam'
  import InfoPanel from '@/components/business/detail/InfoPanel.vue'
  import InfoField from '@/components/business/detail/InfoField.vue'
  import StaffNameList from './StaffNameList.vue'

  defineOptions({ name: 'ExamInfoTab' })

  const props = defineProps<{
    detail: ExamDetail | null
    loading: boolean
  }>()

  /** 发证方式由存量三字段反推，口径与编辑页共用 */
  const certMode = computed(() => deriveCertMode(props.detail ?? {}))

  /**
   * 实际用到的考点名称（去重）
   * 考点挂在考生记录上而非考试主表，允许按人不同，故这里聚合而非取首条。
   */
  const siteNames = computed(() => {
    const names = (props.detail?.candidates ?? [])
      .filter((c) => c.examSiteId)
      .map((c) => c.examSiteName || `考点 #${c.examSiteId}`)
    return [...new Set(names)]
  })

  /** 未指定考点的考生数：与 siteNames 并存时说明是混合分配，需如实呈现 */
  const noSiteCount = computed(
    () => (props.detail?.candidates ?? []).filter((c) => !c.examSiteId).length
  )

  /**
   * 考试设置的展示项
   * 13 个后端字段收敛成 11 行：allowSwitchTimes 与 minAnswerMinutes 是从属参数，
   * 并进「防切屏」「提前交卷」的文案里，不单独占格。
   * on 为 undefined 表示该项不是开关（不渲染状态点）。
   */
  const settingItems = computed<Array<{ label: string; text: string; on?: boolean }>>(() => {
    const s = props.detail?.setting
    if (!s) return []
    return [
      {
        label: '防切屏',
        on: !!s.screenSwitchDetect,
        text: s.screenSwitchDetect ? `开启（允许 ${s.allowSwitchTimes} 次）` : '关闭'
      },
      { label: '题目乱序', on: !!s.shuffleQuestions, text: boolText(s.shuffleQuestions) },
      { label: '操作限制', on: !!s.operationRestrict, text: boolText(s.operationRestrict) },
      { label: '重考次数', text: s.retakeLimit ? `${s.retakeLimit} 次` : '不允许重考' },
      {
        label: '提前进场',
        text: s.earlyEnterMinutes ? `${s.earlyEnterMinutes} 分钟` : '不允许'
      },
      { label: '考试承诺书', on: !!s.requireCommitment, text: boolText(s.requireCommitment) },
      {
        label: '提前交卷',
        on: !!s.allowEarlySubmit,
        text:
          s.allowEarlySubmit && s.minAnswerMinutes
            ? `开启（最短作答 ${s.minAnswerMinutes} 分钟）`
            : boolText(s.allowEarlySubmit)
      },
      { label: '显示剩余时间', on: !!s.showRemainingTime, text: boolText(s.showRemainingTime) },
      { label: '查看成绩', on: !!s.allowViewScore, text: boolText(s.allowViewScore) },
      { label: '查看解析', on: !!s.allowViewAnalysis, text: boolText(s.allowViewAnalysis) }
      // 「成绩公布」已移除：它从来不生效，展示只会误导考务以为能改。
      // 真实规则：纯客观题交卷即发布；含主观题阅完后仍需在阅卷中心手动发布，
      // 且可撤回。详见 exam-edit/index.vue 内同处注释。
    ]
  })

  function formatTime(value?: string | null) {
    if (!value) return '-'
    return value.replace('T', ' ').slice(0, 16)
  }

  /** 布尔转开启/关闭文案 */
  function boolText(value?: boolean) {
    return value ? '开启' : '关闭'
  }
</script>

<style lang="scss" scoped>
  // 卡片间距由容器统一给，这样空态 ElEmpty 与卡片混排时也不会漏掉间距
  .info-tab {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .inline-tag {
    margin-left: 6px;
  }

  // 附注文字：跟在主值后面的参照值/补充说明，弱化处理避免与主值抢视线
  .sub-note {
    margin-left: 8px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  .placeholder {
    color: var(--el-text-color-placeholder);
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
