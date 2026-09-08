<!--
  创建/编辑练习独立页：左右双栏单页表单。
  左栏为「练什么」——基础信息 / 练习题库与抽题方式 / 参与人员；
  右栏为「怎么练」——练习设置（反复练习、题目反馈、单题即时反馈）。
  与考试编辑页同构：字段间存在互相参照（抽题数量对照题库可用题量），分步反而要来回切。
  题库与人员用抽屉/弹窗选择器，应对大数据量。编辑态附 id 走 query。
-->
<template>
  <div class="practice-edit">
    <!-- 顶部：返回 + 标题 -->
    <div class="page-header">
      <ElButton link :icon="ArrowLeft" class="back-btn" @click="handleBack">返回练习列表</ElButton>
      <span class="header-divider" />
      <span class="page-title">{{ pageTitle }}</span>
    </div>

    <div v-loading="pageLoading" class="body-columns">
      <ElForm
        ref="formRef"
        :model="form"
        :rules="formRules"
        label-width="110px"
        class="edit-form"
        scroll-to-error
      >
        <!-- ===== 左栏：练什么 ===== -->
        <div class="col col-left">
          <section class="panel">
            <div class="panel-head">
              <span class="panel-title">基础信息</span>
              <span class="panel-sub">练习名称与时间安排</span>
            </div>
            <div class="panel-body">
              <ElFormItem label="练习名称" prop="name">
                <ElInput
                  v-model="form.name"
                  placeholder="请输入练习名称"
                  maxlength="200"
                  show-word-limit
                />
              </ElFormItem>
              <ElFormItem label="练习编号" prop="code">
                <ElInput
                  v-model="form.code"
                  placeholder="留空由系统自动生成"
                  maxlength="30"
                  show-word-limit
                />
              </ElFormItem>
              <ElFormItem label="练习说明" prop="description">
                <ElInput
                  v-model="form.description"
                  type="textarea"
                  :rows="3"
                  placeholder="请输入练习说明（可空）"
                  maxlength="500"
                  show-word-limit
                />
              </ElFormItem>
              <ElFormItem label="练习时间" prop="timeRange">
                <ElDatePicker
                  v-model="form.timeRange"
                  type="datetimerange"
                  range-separator="至"
                  start-placeholder="开始时间"
                  end-placeholder="结束时间"
                  value-format="YYYY-MM-DDTHH:mm:ss"
                  style="width: 100%"
                />
                <span class="field-tip">留空表示不限时，学员随时可练</span>
              </ElFormItem>
              <ElFormItem label="自动结束">
                <ElSwitch v-model="form.autoFinish" />
                <span class="field-tip">到结束时间自动置为已结束；关闭则需手动结束</span>
              </ElFormItem>
            </div>
          </section>

          <!-- 练习题库 + 练习方式 + 抽题规则（三者耦合，可用题量由该组件自管） -->
          <PracticeSourcePanel
            ref="sourcePanelRef"
            v-model:banks="pickedBanks"
            v-model:draw-mode="form.drawMode"
            v-model:rules="rules"
            :question-types="dict.question_type"
            :difficulties="dict.difficulty"
            :kp-tree="kpTree"
          />

          <!-- 参与人员 -->
          <section class="panel">
            <div class="panel-head">
              <span class="panel-title">参与人员</span>
              <span class="panel-sub">谁来练这份练习</span>
            </div>
            <div class="panel-body">
              <ElFormItem label="参与范围">
                <ElRadioGroup v-model="form.participantScope">
                  <ElRadio v-for="o in PARTICIPANT_SCOPE_OPTIONS" :key="o.value" :value="o.value">
                    {{ o.label }}
                  </ElRadio>
                </ElRadioGroup>
              </ElFormItem>
              <!--
                已选人员用表格而非标签墙：与创建考试的考生列表保持一致，
                人数多时标签墙看不出所属部门、也无法分页。同理不套带 label 的
                ElFormItem——110px 的 label 缩进会把表格挤窄。
              -->
              <div
                v-if="form.participantScope === 'specified'"
                class="cand-block"
                :class="{ 'is-empty': !pickedParticipants.length }"
              >
                <div class="cand-toolbar">
                  <!-- 空态与 exam-edit 同款：不显示「已选 0 人」，改为状态文字 + 去处提示 -->
                  <div v-if="pickedParticipants.length" class="cand-stat">
                    已选 <b>{{ pickedParticipants.length }}</b> 人
                    <span class="stat-sub"
                      >（内部 {{ internalCount }} · 外部 {{ externalCount }}）</span
                    >
                  </div>
                  <div v-else class="cand-stat is-empty">
                    <span class="stat-empty-text">尚未选择参与人员</span>
                    <span class="stat-empty-hint">可从内部人员或外部考生中选择</span>
                  </div>
                  <!-- 区块内的动作一律描边：实心主色留给底部「保存」，与 exam-edit 同口径 -->
                  <div class="cand-actions">
                    <ElButton :icon="Plus" @click="participantPickerVisible = true">
                      选择人员
                    </ElButton>
                    <span
                      v-if="pickedParticipants.length"
                      class="action-sep"
                      aria-hidden="true"
                    ></span>
                    <ElButton
                      v-if="pickedParticipants.length"
                      link
                      type="danger"
                      @click="clearParticipants"
                    >
                      清空
                    </ElButton>
                  </div>
                </div>
                <!-- 空态不渲染表格：否则表头会悬在一行灰字上方，与 exam-edit 同口径 -->
                <ElTable
                  v-if="pickedParticipants.length"
                  :data="pagedParticipants"
                  max-height="300"
                >
                  <ElTableColumn
                    type="index"
                    label="#"
                    width="56"
                    align="center"
                    :index="participantIndexBase"
                  />
                  <ElTableColumn prop="name" label="姓名" min-width="110" show-overflow-tooltip />
                  <ElTableColumn label="类型" width="80" align="center">
                    <template #default="{ row }">
                      <ElTag
                        :type="row.type === 'internal' ? 'primary' : 'warning'"
                        size="small"
                        disable-transitions
                      >
                        {{ row.type === 'internal' ? '内部' : '外部' }}
                      </ElTag>
                    </template>
                  </ElTableColumn>
                  <ElTableColumn label="所属" min-width="140" show-overflow-tooltip>
                    <template #default="{ row }">{{ row.belong || '-' }}</template>
                  </ElTableColumn>
                  <ElTableColumn label="操作" width="80" align="center">
                    <template #default="{ row }">
                      <ElButton link type="danger" @click="removeParticipant(row)">移除</ElButton>
                    </template>
                  </ElTableColumn>
                </ElTable>
                <ElPagination
                  v-if="pickedParticipants.length > participantPageSize"
                  class="cand-pager"
                  layout="total, prev, pager, next"
                  :current-page="participantPage"
                  :page-size="participantPageSize"
                  :total="pickedParticipants.length"
                  @current-change="(p: number) => (participantPage = p)"
                />
              </div>
            </div>
          </section>
        </div>

        <!-- ===== 右栏：怎么练 ===== -->
        <div class="col col-right">
          <PracticeSettingPanel v-model:setting="form.setting" />
        </div>
      </ElForm>
    </div>

    <!-- 底部操作条 -->
    <!-- 权重三级：取消纯文字、保存实心主色，与 exam-edit / paper-edit 同口径 -->
    <div class="footer-bar">
      <ElButton text :disabled="submitLoading" @click="handleBack">取消</ElButton>
      <ElButton type="primary" :loading="submitLoading" @click="handleSubmit">保存</ElButton>
    </div>

    <CandidatePickerDialog
      v-model="participantPickerVisible"
      :selected="pickedParticipants"
      title="选择参与人员"
      empty-text="尚未选择人员"
      @confirm="handleParticipantConfirm"
    />
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive, computed, onMounted } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
  import { ArrowLeft, Plus } from '@element-plus/icons-vue'
  import {
    practiceApi,
    PARTICIPANT_SCOPE_OPTIONS,
    type PracticeDrawMode,
    type ParticipantScope,
    type PracticeRuleItem,
    type PracticeParticipantItem
  } from '@/api/practice'
  import { dataDictApi, type DictDataItem } from '@/api/dataDict'
  import { knowledgePointApi, type KnowledgePoint } from '@/api/knowledgePoint'
  import { type PickedBank } from '@/components/business/pickers/BankPickerDrawer.vue'
  import CandidatePickerDialog, {
    type PickedCandidate
  } from '@/components/business/pickers/CandidatePickerDialog.vue'
  import PracticeSourcePanel from './components/PracticeSourcePanel.vue'
  import PracticeSettingPanel from './components/PracticeSettingPanel.vue'

  defineOptions({ name: 'PracticeEdit' })

  const route = useRoute()
  const router = useRouter()

  const formRef = ref<FormInstance>()
  // 详情回填后需要触发子组件补算可用题量
  const sourcePanelRef = ref<InstanceType<typeof PracticeSourcePanel>>()
  const pageLoading = ref(false)
  const submitLoading = ref(false)
  const participantPickerVisible = ref(false)

  const editId = computed(() => (route.query.id ? Number(route.query.id) : undefined))
  const pageTitle = computed(() => (editId.value ? '编辑练习' : '创建练习'))

  const pickedBanks = ref<PickedBank[]>([])
  const pickedParticipants = ref<PickedCandidate[]>([])
  const rules = ref<PracticeRuleItem[]>([])

  const dict = reactive<{ question_type: DictDataItem[]; difficulty: DictDataItem[] }>({
    question_type: [],
    difficulty: []
  })
  const kpTree = ref<KnowledgePoint[]>([])

  const form = reactive({
    name: '',
    code: '',
    description: '',
    drawMode: 'sequential' as PracticeDrawMode,
    // 时间用区间控件，提交时拆成 startTime/endTime
    timeRange: [] as string[],
    autoFinish: false,
    participantScope: 'specified' as ParticipantScope,
    setting: {
      allowRepeat: true,
      showResultPerQuestion: true,
      showAnswer: true,
      showAnalysis: true
    }
  })

  const formRules: FormRules = {
    name: [
      { required: true, message: '请输入练习名称', trigger: 'blur' },
      { max: 200, message: '练习名称不能超过 200 字', trigger: 'blur' }
    ],
    bankIds: [
      {
        // 题库存在 pickedBanks 而非 form 上，用自定义校验读取
        validator: (_r, _v, cb) =>
          pickedBanks.value.length ? cb() : cb(new Error('请至少选择一个题库')),
        trigger: 'change'
      }
    ]
  }

  const internalCount = computed(
    () => pickedParticipants.value.filter((p) => p.type === 'internal').length
  )
  const externalCount = computed(
    () => pickedParticipants.value.filter((p) => p.type === 'external').length
  )

  // 已选人员前端分页（数据全在本地，不再请求后端）
  const participantPage = ref(1)
  const participantPageSize = ref(10)
  const pagedParticipants = computed(() => {
    const start = (participantPage.value - 1) * participantPageSize.value
    return pickedParticipants.value.slice(start, start + participantPageSize.value)
  })
  const participantIndexBase = (i: number) =>
    (participantPage.value - 1) * participantPageSize.value + i + 1

  /** 把页码收敛到有效范围：删到当前页空了要退回上一页，否则表格显示空白 */
  function clampParticipantPage() {
    const maxPage = Math.max(
      1,
      Math.ceil(pickedParticipants.value.length / participantPageSize.value)
    )
    if (participantPage.value > maxPage) participantPage.value = maxPage
  }

  function handleParticipantConfirm(list: PickedCandidate[]) {
    pickedParticipants.value = list
    clampParticipantPage()
  }

  function removeParticipant(target: PickedCandidate) {
    pickedParticipants.value = pickedParticipants.value.filter(
      (p) => !(p.type === target.type && p.id === target.id)
    )
    clampParticipantPage()
  }

  function clearParticipants() {
    pickedParticipants.value = []
    participantPage.value = 1
  }

  /*
    回列表指向 /practice/assigned 而非 /practice：
    /practice 已是目录，其默认子路由 isHide，落在它上面侧边栏不高亮「岗位练兵」。
    创建/编辑只从岗位练兵列表进入，故直接回那一页。
  */
  function handleBack() {
    router.push('/practice/assigned')
  }

  /** 编辑态回填详情 */
  async function loadDetail(id: number) {
    const { data } = await practiceApi.getDetail(id)
    form.name = data.name
    form.code = data.code
    form.description = data.description || ''
    form.drawMode = data.drawMode
    form.timeRange = data.startTime && data.endTime ? [data.startTime, data.endTime] : []
    form.autoFinish = data.autoFinish
    form.participantScope = data.participantScope
    if (data.setting) {
      form.setting.allowRepeat = data.setting.allowRepeat
      form.setting.showResultPerQuestion = data.setting.showResultPerQuestion
      form.setting.showAnswer = data.setting.showAnswer
      form.setting.showAnalysis = data.setting.showAnalysis
    }
    pickedBanks.value = data.banks.map((b) => ({
      id: b.bankId,
      name: b.bankName,
      questionCount: b.questionCount
    }))
    rules.value = data.rules.map((r) => ({
      questionType: r.questionType,
      difficulty: r.difficulty,
      // 后端的 0 表示不限，界面态转回 undefined 才会显示 placeholder「不限」
      knowledgePointId: r.knowledgePointId || undefined,
      drawCount: r.drawCount
    }))
    // 人员回显为 Picker 的统一结构；belong 详情接口未下发，留空不影响勾选
    pickedParticipants.value = data.participants.map((p) => ({
      type: p.participantType,
      id:
        p.participantType === 'internal'
          ? (p.internalUserId as number)
          : (p.externalCandidateId as number),
      name: p.participantName,
      belong: ''
    }))
  }

  /** 提交：校验后按创建/编辑分派 */
  async function handleSubmit() {
    if (!formRef.value) return
    try {
      await formRef.value.validate()
    } catch {
      return // 校验失败已由 scroll-to-error 定位
    }

    if (form.drawMode === 'random' && !rules.value.length) {
      ElMessage.warning('按规则抽题需至少配置一条抽题规则')
      return
    }
    // 题型是规则的必填项，缺了后端会拒
    const badRule = rules.value.findIndex((r) => !r.questionType)
    if (form.drawMode === 'random' && badRule >= 0) {
      ElMessage.warning(`第 ${badRule + 1} 条抽题规则未选择题型`)
      return
    }
    if (form.participantScope === 'specified' && !pickedParticipants.value.length) {
      ElMessage.warning('参与范围为指定员工时请至少选择一名人员')
      return
    }
    if (form.autoFinish && !form.timeRange?.[1]) {
      ElMessage.warning('开启自动结束时请设置练习结束时间')
      return
    }

    const participants: PracticeParticipantItem[] = pickedParticipants.value.map((p) => ({
      participantType: p.type,
      ...(p.type === 'internal' ? { internalUserId: p.id } : { externalCandidateId: p.id })
    }))

    const payload = {
      name: form.name.trim(),
      code: form.code.trim() || undefined,
      description: form.description.trim() || undefined,
      drawMode: form.drawMode,
      bankIds: pickedBanks.value.map((b) => b.id),
      startTime: form.timeRange?.[0] || undefined,
      endTime: form.timeRange?.[1] || undefined,
      autoFinish: form.autoFinish,
      participantScope: form.participantScope,
      // 顺序练不提交规则，避免切换模式后残留
      // 界面态的 knowledgePointId 可能是 undefined（不限），提交前兜成后端约定的 0
      rules:
        form.drawMode === 'random'
          ? rules.value.map((r) => ({ ...r, knowledgePointId: r.knowledgePointId || 0 }))
          : [],
      participants: form.participantScope === 'specified' ? participants : [],
      setting: form.setting
    }

    submitLoading.value = true
    try {
      if (editId.value) {
        await practiceApi.update({ ...payload, id: editId.value })
        ElMessage.success('编辑练习成功')
      } else {
        await practiceApi.add(payload)
        ElMessage.success('创建练习成功')
      }
      router.push('/practice/assigned')
    } catch (e: any) {
      ElMessage.error(e?.message || '保存失败')
    } finally {
      submitLoading.value = false
    }
  }

  onMounted(async () => {
    pageLoading.value = true
    try {
      // 字典与知识点树是编辑规则的前置数据，与详情并行取
      await Promise.all([
        dataDictApi.getData(['question_type', 'difficulty']).then(({ data }) => {
          dict.question_type = data.question_type || []
          dict.difficulty = data.difficulty || []
        }),
        knowledgePointApi.getTree().then(({ data }) => {
          kpTree.value = data
        }),
        editId.value ? loadDetail(editId.value) : Promise.resolve()
      ])
      // 详情回填后再算可用量，此时题库与规则都已就位
      if (editId.value) await sourcePanelRef.value?.refreshAvailability()
    } catch (e: any) {
      ElMessage.error(e?.message || '加载练习信息失败')
    } finally {
      pageLoading.value = false
    }
  })
</script>

<style lang="scss" scoped>
  /*
    不设 height: 100%。外层 .el-scrollbar__view 用的是 min-height: 100%，
    内容一长它就跟着长，本页的 100% 于是解析到被撑长的高度——底部条被推到
    折叠线以下，成了「内容短才固定」。改为让本页在外层滚动条里自然流动，
    底部条用 sticky 钉住（见 .footer-bar），与 exam-edit 同口径。
  */
  .practice-edit {
    display: flex;
    flex-direction: column;
    gap: 16px;

    // 页头与 exam-edit 保持一致：无卡片，返回按钮 + 竖线 + 标题
    .page-header {
      display: flex;
      flex-shrink: 0;
      gap: 12px;
      align-items: center;
      padding: 0 4px;

      .back-btn {
        font-size: 14px;
        color: var(--el-text-color-regular);

        &:hover {
          color: var(--el-color-primary);
        }
      }

      .header-divider {
        width: 1px;
        height: 14px;
        background: var(--el-border-color);
      }

      .page-title {
        font-size: 16px;
        font-weight: 600;
      }
    }

    /*
      双栏主体不再自成滚动容器（原有 flex:1 + overflow-y:auto 已移除），
      交给外层滚动条统一滚：页内再套一层会出现双滚动条，滚轮停在内层时外层不动。
    */
    .edit-form {
      display: grid;
      // 左栏略宽：内含抽题规则表格；右栏为设置项，窄一些即可
      grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
      gap: 16px;
      align-items: start;

      // 窄屏堆叠为单列，避免两栏都被压得放不下控件
      @media only screen and (max-width: $device-ipad-pro) {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    .col {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }

    // 分区卡片
    .panel {
      overflow: hidden;
      background: var(--el-bg-color-overlay);
      border-radius: 12px;

      .panel-head {
        display: flex;
        gap: 8px;
        align-items: baseline;
        padding: 14px 20px;
        border-bottom: 1px solid var(--el-border-color-lighter);

        .panel-title {
          font-size: 15px;
          font-weight: 600;
        }

        .panel-sub {
          font-size: 12px;
          color: var(--el-text-color-secondary);
        }
      }

      .panel-body {
        padding: 18px 20px 4px;
      }
    }

    .field-tip {
      margin-left: 10px;
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }

    // 已选人员表格整块：与创建考试的考生列表同一套样式
    .cand-block {
      margin-bottom: 18px;

      /* 空态下工具栏后面没有表格，抹掉它的下边距免得底部空一截 */
      &.is-empty .cand-toolbar {
        margin-bottom: 0;
      }
    }

    .cand-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;

      .cand-stat {
        min-width: 0;
        font-size: 14px;
        color: var(--el-text-color-regular);

        b {
          margin: 0 2px;
          font-size: 16px;
          color: var(--el-color-primary);
        }

        .stat-sub {
          font-size: 13px;
          color: var(--el-text-color-secondary);
        }

        /* 空态：状态与补充说明竖排在按钮左侧，整块只占一行按钮的高度 */
        &.is-empty {
          display: flex;
          flex-direction: column;
          gap: 2px;
          line-height: 1.4;
        }

        .stat-empty-text {
          font-size: 13px;
          color: var(--el-text-color-secondary);
        }

        .stat-empty-hint {
          font-size: 12px;
          color: var(--el-text-color-placeholder);
        }
      }

      .cand-actions {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      /* 添加动作与「清空」之间的竖线分隔 */
      .action-sep {
        width: 1px;
        height: 16px;
        margin: 0 2px;
        background: var(--el-border-color-lighter);
      }
    }

    .cand-pager {
      justify-content: flex-end;
      margin-top: 10px;
    }

    /* 与 exam-edit 同口径：sticky 钉住，按钮靠右 */
    .footer-bar {
      position: sticky;

      /* 20px 与父级 .art-page-view 的 padding-bottom 相等，触底时不跳动，同 exam-edit */
      bottom: 20px;
      z-index: 10;
      display: flex;
      flex-shrink: 0;
      gap: 12px;
      justify-content: flex-end;
      padding: 12px 20px;

      /* 内容不足一屏时顶到底部：主体已不再 flex:1 撑满，少了这行短内容下会浮在中间 */
      margin-top: auto;

      /* 必须不透明：内容从下面穿过 */
      background: var(--el-bg-color);

      /* 整圈边框：悬浮卡片上下都有内容穿过；投影在暗色模式下读不出来，不能只靠投影 */
      border: 1px solid var(--art-border-color);
      border-radius: 12px;
      box-shadow: 0 2px 16px rgb(0 0 0 / 10%);
    }
  }
</style>
