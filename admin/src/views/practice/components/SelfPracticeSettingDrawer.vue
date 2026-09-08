<!--
  自主练习设置抽屉：开放范围 + 抽题范围 + 练习设置。
  开放范围决定谁能练（全员 / 指定员工），抽题范围限定可练知识点与单次题数上限，
  练习设置与岗位练兵同构（反复练习 / 题目反馈 / 单题对错与答案解析）。
-->
<template>
  <ElDrawer
    :model-value="modelValue"
    :title="`自主练习设置${form.bankName ? ' - ' + form.bankName : ''}`"
    size="600px"
    :close-on-click-modal="false"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    @open="handleOpen"
  >
    <div v-loading="loading" class="setting-body">
      <ElForm :model="form" label-width="120px">
        <section class="panel">
          <div class="panel-head">
            <span class="panel-title">开放范围</span>
            <span class="panel-sub">谁能练这个题库</span>
          </div>
          <div class="panel-body">
            <ElFormItem label="开放状态">
              <ElSwitch v-model="form.isOpen" />
              <span class="field-tip">关闭后学员端不展示本题库</span>
            </ElFormItem>
            <ElFormItem label="开放对象">
              <ElRadioGroup v-model="form.openScope">
                <ElRadio v-for="o in OPEN_SCOPE_OPTIONS" :key="o.value" :value="o.value">
                  {{ o.label }}
                </ElRadio>
              </ElRadioGroup>
            </ElFormItem>
            <ElFormItem v-if="form.openScope === 'specified'" label="指定人员">
              <div class="picker-field">
                <ElButton :icon="Plus" @click="userPickerVisible = true">选择人员</ElButton>
                <span class="field-tip">已选 {{ pickedUsers.length }} 人</span>
              </div>
              <div v-if="pickedUsers.length" class="picked-tags">
                <ElTag
                  v-for="u in pickedUsers"
                  :key="`${u.type}:${u.id}`"
                  closable
                  size="small"
                  :type="u.type === 'internal' ? 'primary' : 'warning'"
                  @close="removeUser(u)"
                >
                  {{ u.name }}
                </ElTag>
              </div>
            </ElFormItem>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <span class="panel-title">抽题范围</span>
            <span class="panel-sub">能练哪些题、一次练多少</span>
          </div>
          <div class="panel-body">
            <ElFormItem label="可练知识点">
              <ElTreeSelect
                v-model="form.knowledgePointIds"
                :data="kpTree"
                :props="{ label: 'name', children: 'children' }"
                node-key="id"
                value-key="id"
                multiple
                check-strictly
                show-checkbox
                collapse-tags
                collapse-tags-tooltip
                clearable
                filterable
                :render-after-expand="false"
                placeholder="不限（可练题库全部题目）"
                style="width: 100%"
              />
              <span class="field-tip">留空表示不限，学员可练题库内全部题目</span>
            </ElFormItem>
            <ElFormItem label="单次题数上限">
              <ElInputNumber
                v-model="form.maxQuestionsPerRound"
                :min="0"
                :precision="0"
                controls-position="right"
                style="width: 160px"
              />
              <span class="field-tip">0 表示不限</span>
            </ElFormItem>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <span class="panel-title">练习设置</span>
            <span class="panel-sub">练习过程中的行为</span>
          </div>
          <div class="panel-body">
            <ElFormItem label="允许反复练习">
              <ElSwitch v-model="form.allowRepeat" />
              <span class="field-tip">关闭后每人只能完成一次</span>
            </ElFormItem>
            <ElFormItem label="单题展示对错">
              <ElSwitch v-model="form.showResultPerQuestion" />
              <span class="field-tip">每答一题即时告知正误</span>
            </ElFormItem>
            <!-- 答案与解析依附于「展示对错」：关掉对错却给答案是矛盾组合，故一并禁用 -->
            <ElFormItem label="展示答案">
              <ElSwitch v-model="form.showAnswer" :disabled="!form.showResultPerQuestion" />
            </ElFormItem>
            <ElFormItem label="展示解析">
              <ElSwitch v-model="form.showAnalysis" :disabled="!form.showResultPerQuestion" />
            </ElFormItem>
          </div>
        </section>
      </ElForm>
    </div>

    <template #footer>
      <ElButton @click="emit('update:modelValue', false)">取消</ElButton>
      <ElButton type="primary" :loading="saving" @click="handleSave">保存</ElButton>
    </template>

    <CandidatePickerDialog
      v-model="userPickerVisible"
      :selected="pickedUsers"
      title="选择开放人员"
      empty-text="尚未选择人员"
      @confirm="handleUserConfirm"
    />
  </ElDrawer>
</template>

<script setup lang="ts">
  import { ref, reactive, watch } from 'vue'
  import { ElMessage } from 'element-plus'
  import { Plus } from '@element-plus/icons-vue'
  import {
    selfPracticeApi,
    OPEN_SCOPE_OPTIONS,
    type OpenScope,
    type SelfPracticeUserItem
  } from '@/api/selfPractice'
  import { knowledgePointApi, type KnowledgePoint } from '@/api/knowledgePoint'
  import CandidatePickerDialog, {
    type PickedCandidate
  } from '@/components/business/pickers/CandidatePickerDialog.vue'

  defineOptions({ name: 'SelfPracticeSettingDrawer' })

  const props = defineProps<{
    modelValue: boolean
    /** 待配置的题库 ID */
    bankId?: number
  }>()

  const emit = defineEmits<{
    (e: 'update:modelValue', v: boolean): void
    (e: 'saved'): void
  }>()

  const loading = ref(false)
  const saving = ref(false)
  const userPickerVisible = ref(false)
  const kpTree = ref<KnowledgePoint[]>([])
  const pickedUsers = ref<PickedCandidate[]>([])

  const form = reactive({
    bankName: '',
    isOpen: false,
    openScope: 'all' as OpenScope,
    maxQuestionsPerRound: 0,
    knowledgePointIds: [] as number[],
    allowRepeat: true,
    showResultPerQuestion: true,
    showAnswer: true,
    showAnalysis: true
  })

  // 关掉「单题展示对错」时同步关掉答案与解析，避免保存出矛盾组合
  watch(
    () => form.showResultPerQuestion,
    (v) => {
      if (!v) {
        form.showAnswer = false
        form.showAnalysis = false
      }
    }
  )

  /** 打开时拉配置与知识点树（知识点树仅首次拉） */
  async function handleOpen() {
    if (!props.bankId) return
    loading.value = true
    try {
      const tasks: Promise<unknown>[] = [loadConfig(props.bankId)]
      if (!kpTree.value.length) {
        tasks.push(
          knowledgePointApi.getTree().then(({ data }) => {
            kpTree.value = data
          })
        )
      }
      await Promise.all(tasks)
    } catch (e: any) {
      ElMessage.error(e?.message || '获取配置失败')
    } finally {
      loading.value = false
    }
  }

  /** 拉取并回填配置 */
  async function loadConfig(bankId: number) {
    const { data } = await selfPracticeApi.getConfig(bankId)
    form.bankName = data.bankName
    form.isOpen = data.isOpen
    form.openScope = data.openScope
    form.maxQuestionsPerRound = data.maxQuestionsPerRound
    form.knowledgePointIds = data.knowledgePoints.map((k) => k.knowledgePointId)
    form.allowRepeat = data.allowRepeat
    form.showResultPerQuestion = data.showResultPerQuestion
    form.showAnswer = data.showAnswer
    form.showAnalysis = data.showAnalysis
    // 人员回显为 Picker 的统一结构；belong 详情接口未下发，留空不影响勾选
    pickedUsers.value = data.users.map((u) => ({
      type: u.userType,
      id:
        u.userType === 'internal'
          ? (u.internalUserId as number)
          : (u.externalCandidateId as number),
      name: u.userName,
      belong: ''
    }))
  }

  function handleUserConfirm(list: PickedCandidate[]) {
    pickedUsers.value = list
  }

  function removeUser(target: PickedCandidate) {
    pickedUsers.value = pickedUsers.value.filter(
      (u) => !(u.type === target.type && u.id === target.id)
    )
  }

  /** 保存配置 */
  async function handleSave() {
    if (!props.bankId) return
    if (form.openScope === 'specified' && !pickedUsers.value.length) {
      ElMessage.warning('开放范围为指定员工时请至少选择一名人员')
      return
    }
    saving.value = true
    try {
      const users: SelfPracticeUserItem[] = pickedUsers.value.map((u) => ({
        userType: u.type,
        ...(u.type === 'internal' ? { internalUserId: u.id } : { externalCandidateId: u.id })
      }))
      await selfPracticeApi.saveConfig({
        bankId: props.bankId,
        isOpen: form.isOpen,
        openScope: form.openScope,
        maxQuestionsPerRound: form.maxQuestionsPerRound,
        knowledgePointIds: form.knowledgePointIds,
        users: form.openScope === 'specified' ? users : [],
        allowRepeat: form.allowRepeat,
        showResultPerQuestion: form.showResultPerQuestion,
        showAnswer: form.showAnswer,
        showAnalysis: form.showAnalysis
      })
      ElMessage.success('保存成功')
      emit('saved')
      emit('update:modelValue', false)
    } catch (e: any) {
      ElMessage.error(e?.message || '保存失败')
    } finally {
      saving.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .setting-body {
    .panel {
      margin-bottom: 20px;

      &:last-child {
        margin-bottom: 0;
      }

      .panel-head {
        display: flex;
        align-items: baseline;
        gap: 8px;
        padding-bottom: 10px;
        margin-bottom: 14px;
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
    }

    .field-tip {
      margin-left: 10px;
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }

    .picker-field {
      display: flex;
      align-items: center;
    }

    .picked-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      width: 100%;
      margin-top: 8px;
    }
  }
</style>
