<!--
  练习记录下钻抽屉，两级共用一个抽屉：
  一级「历次练习」列该人在此练习下的每一次记录；点某次进二级「逐题作答」，带返回。
  没做成两个抽屉套嵌是为了避免层层叠加的遮罩，连着抽查多个人时也少一次关闭动作。
-->
<template>
  <ElDrawer
    :model-value="modelValue"
    :title="drawerTitle"
    size="720px"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    @open="handleOpen"
    @closed="handleClosed"
  >
    <div v-loading="loading" class="drawer-body">
      <!-- 人员抬头：两级都显示，切到二级时不丢上下文 -->
      <div v-if="user" class="user-head">
        <span class="user-name">{{ user.name }}</span>
        <ElTag
          :type="user.userType === 'internal' ? 'primary' : 'warning'"
          size="small"
          disable-transitions
        >
          {{ user.userType === 'internal' ? '内部' : '外部' }}
        </ElTag>
        <span class="user-belong">{{ belongText }}</span>
      </div>

      <!-- ===== 一级：历次练习 ===== -->
      <template v-if="view === 'list'">
        <ElTable :data="attempts" size="small" max-height="520">
          <ElTableColumn label="次序" width="70" align="center">
            <template #default="{ $index }">第 {{ attempts.length - $index }} 次</template>
          </ElTableColumn>
          <ElTableColumn label="答题" width="90" align="center">
            <template #default="{ row }">{{ row.answeredCount }}/{{ row.totalCount }}</template>
          </ElTableColumn>
          <ElTableColumn label="答对" width="70" align="center" prop="correctCount" />
          <ElTableColumn label="正确率" width="90" align="center">
            <template #default="{ row }">
              <span v-if="row.accuracy !== null">{{ row.accuracy }}%</span>
              <span v-else>-</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="状态" width="90" align="center">
            <template #default="{ row }">
              <ElTag :type="row.finished ? 'success' : 'warning'" size="small" disable-transitions>
                {{ row.finished ? '已完成' : '练习中' }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn label="练习时间" min-width="150" align="center">
            <template #default="{ row }">{{
              formatTime(row.finishTime || row.createTime)
            }}</template>
          </ElTableColumn>
          <ElTableColumn label="操作" width="90" align="center">
            <template #default="{ row }">
              <ElButton link type="primary" @click="openDetail(row.id)">逐题详情</ElButton>
            </template>
          </ElTableColumn>
          <template #empty>该人员暂无练习记录</template>
        </ElTable>
      </template>

      <!-- ===== 二级：逐题作答 ===== -->
      <template v-else>
        <div class="detail-head">
          <ElButton link :icon="ArrowLeft" @click="backToList">返回历次练习</ElButton>
          <span v-if="detail" class="detail-stat">
            答题 {{ detail.answeredCount }}/{{ detail.totalCount }} · 答对
            {{ detail.correctCount }}
            <template v-if="detail.accuracy !== null"> · 正确率 {{ detail.accuracy }}%</template>
          </span>
        </div>
        <!--
          卷面式回看，不用表格：判卷要看的是「这题问什么、他选了什么、对的是哪个」，
          表格把每题压成一行，题干被截断、选项完全看不到，只剩「作答 A / 答案 B」
          这种没有上下文的字母。这里按试卷排版，选项逐行列出并标出他选的与正确的。
        -->
        <div v-if="answerList.length" class="qsheet">
          <div
            v-for="item in answerList"
            :key="item.id"
            class="qitem"
            :class="{ 'qitem--wrong': item.isCorrect === false }"
          >
            <div class="q-stem">
              <span class="q-no">{{ item.questionNo }}.</span>
              <!--
                题干与选项走 v-html：写入时已由 sanitizeRichText 净化，
                与卷面预览（views/paper/index.vue）保持同一渲染方式，
                否则图文题的图会丢。
              -->
              <span class="q-text rich-text" v-html="item.stem || '-'"></span>
              <ElTag size="small" type="info" disable-transitions>
                {{ questionTypeText(item.questionType) }}
              </ElTag>
              <ElTag
                v-if="item.isCorrect !== null"
                :type="item.isCorrect ? 'success' : 'danger'"
                size="small"
                disable-transitions
              >
                {{ item.isCorrect ? '正确' : '错误' }}
              </ElTag>
              <ElTag v-else size="small" disable-transitions>未答</ElTag>
            </div>

            <!-- 客观题：逐项列出，他选的与正确的直接标在选项上 -->
            <div v-if="item.optionList.length" class="q-options">
              <div
                v-for="(opt, oIdx) in item.optionList"
                :key="oIdx"
                class="q-option"
                :class="{
                  'q-option--picked': opt.picked,
                  'q-option--right': opt.right,
                  'q-option--misspick': opt.picked && !opt.right
                }"
              >
                <span class="q-option-key">{{ opt.key || '·' }}</span>
                <span class="rich-text" v-html="opt.html"></span>
                <!--
                  标记同时承载两件事：谁选的（文字）、对不对（图标形状）。
                  只用颜色区分「选对」与「选错」的话，色弱用户看到的是两个
                  语义不明的符号；只用文字则少了可快速扫的形状差异。
                -->
                <span v-if="opt.picked" class="q-mark" :class="markClass(opt)">
                  他选
                  <ElIcon>
                    <Select v-if="opt.right" />
                    <CloseBold v-else />
                  </ElIcon>
                </span>
                <span v-else-if="opt.right" class="q-mark q-mark--right">应选</span>
              </div>
            </div>

            <!-- 主观题或无选项时，答案只能以文本呈现 -->
            <div v-else class="q-plain">
              <div class="q-plain-row">
                <span class="q-plain-label">他的作答</span>
                <span :class="item.candidateAnswer ? '' : 'not-answered'">
                  {{ item.candidateAnswer || '未作答' }}
                </span>
              </div>
              <div class="q-plain-row">
                <span class="q-plain-label">标准答案</span>
                <span>{{ item.standardAnswer || '-' }}</span>
              </div>
            </div>

            <!-- 答错时才展开解析：答对的题不需要占篇幅解释 -->
            <div v-if="item.analysis && item.isCorrect !== true" class="q-analysis">
              <span class="q-analysis-label">解析</span>
              <span class="rich-text" v-html="item.analysis"></span>
            </div>
          </div>
        </div>
        <ElEmpty v-else description="暂无作答明细" :image-size="80" />
      </template>
    </div>
  </ElDrawer>
</template>

<script setup lang="ts">
  import { ref, computed } from 'vue'
  import { ElMessage } from 'element-plus'
  import { ArrowLeft, Select, CloseBold } from '@element-plus/icons-vue'
  import { splitOptionsRich } from '@/utils/paperStructure'
  import {
    practiceApi,
    type PracticeRecordUser,
    type PracticeRecordAttempt,
    type PracticeRecordDetail
  } from '@/api/practice'
  import { dataDictApi, type DictDataItem } from '@/api/dataDict'

  defineOptions({ name: 'RecordDetailDrawer' })

  const props = defineProps<{
    modelValue: boolean
    practiceId: number
    /** 当前查看的人员；为 null 时不请求 */
    user: PracticeRecordUser | null
  }>()

  const emit = defineEmits<{
    (e: 'update:modelValue', v: boolean): void
    (e: 'closed'): void
  }>()

  /** 当前层级：list 历次练习 / detail 逐题作答 */
  const view = ref<'list' | 'detail'>('list')
  const loading = ref(false)
  const attempts = ref<PracticeRecordAttempt[]>([])

  /**
   * 请求序号：连着抽查多个人时，先发的请求可能晚回
   * （点 A 后立刻关掉再点 B，A 的响应回来会把 A 的记录写进 B 的抽屉，
   * 抬头是 B、列表却是 A 的数据）。每次发起递增，回调只认最后一次。
   */
  let requestSeq = 0
  const detail = ref<PracticeRecordDetail | null>(null)
  const typeDict = ref<DictDataItem[]>([])

  const drawerTitle = computed(() => (view.value === 'list' ? '历次练习' : '逐题作答'))

  /** 抬头里的所属：公司与部门用「·」相连，外部考生只有公司 */
  const belongText = computed(() => {
    if (!props.user) return '-'
    const parts = [props.user.companyName, props.user.departmentName].filter(Boolean)
    return parts.length ? parts.join(' · ') : '-'
  })

  /**
   * 把答案串拆成选项字母集合
   *
   * 多选存成 "A,C,D"。也兼容 "ACD" 与 "A、C"：存量数据里两种都出现过，
   * 判卷时把 "ACD" 整串当一个选项去比对会导致每一项都判成未选。
   */
  function answerKeys(raw: string | null): Set<string> {
    if (!raw) return new Set()
    const trimmed = raw.trim()
    if (!trimmed) return new Set()
    // 有分隔符时按分隔符切，否则按单字符切（仅限纯字母串，避免切碎文本答案）
    const parts = /[,，、;；\s]/.test(trimmed)
      ? trimmed.split(/[,，、;；\s]+/)
      : /^[A-Za-z]+$/.test(trimmed)
        ? trimmed.split('')
        : [trimmed]
    return new Set(parts.map((p) => p.trim().toUpperCase()).filter(Boolean))
  }

  /**
   * 逐题作答的展示模型
   *
   * 选项在这里一次算好「他选了没」「是不是正确答案」，模板只读标记。
   * 放 computed 而非模板内调用：splitOptionsRich 要解析 JSON，
   * 一份卷子几十题、每题四五个选项，模板里每次渲染都重算不划算。
   */
  const answerList = computed(() => {
    const rows = detail.value?.answers || []
    return rows.map((a) => {
      const picked = answerKeys(a.candidateAnswer)
      const right = answerKeys(a.standardAnswer)
      return {
        ...a,
        optionList: splitOptionsRich(a.options).map((opt) => {
          const key = opt.key.trim().toUpperCase()
          return {
            key: opt.key,
            html: opt.html,
            picked: key ? picked.has(key) : false,
            right: key ? right.has(key) : false
          }
        })
      }
    })
  })

  /** 选项标记的配色：选对走绿、选错走红 */
  function markClass(opt: { right: boolean }) {
    return opt.right ? 'q-mark--right' : 'q-mark--wrong'
  }

  function formatTime(value?: string | null) {
    if (!value) return '-'
    return value.replace('T', ' ').slice(0, 16)
  }

  /** 题型 value → 字典名称；字典缺项时回退显示原值 */
  function questionTypeText(value: string) {
    return typeDict.value.find((d) => d.value === value)?.name || value
  }

  /** 打开时拉该人的历次记录；题型字典仅首次拉 */
  async function handleOpen() {
    if (!props.user) return
    view.value = 'list'
    loading.value = true
    const seq = ++requestSeq
    try {
      const tasks: Promise<unknown>[] = [
        practiceApi
          .getRecordList(props.practiceId, props.user.userType, props.user.userId)
          .then(({ data }) => {
            if (seq !== requestSeq) return
            attempts.value = data
          })
      ]
      if (!typeDict.value.length) {
        tasks.push(
          dataDictApi.getData(['question_type']).then(({ data }) => {
            typeDict.value = data.question_type || []
          })
        )
      }
      await Promise.all(tasks)
    } catch (e: any) {
      // 已被后一次打开取代时不弹错，否则旧请求的失败会污染新抽屉
      if (seq === requestSeq) ElMessage.error(e?.message || '获取练习记录失败')
    } finally {
      // 同理不关新请求的遮罩
      if (seq === requestSeq) loading.value = false
    }
  }

  async function openDetail(recordId: number) {
    loading.value = true
    const seq = ++requestSeq
    try {
      const { data } = await practiceApi.getRecordDetail(recordId)
      if (seq !== requestSeq) return
      detail.value = data
      view.value = 'detail'
    } catch (e: any) {
      if (seq === requestSeq) ElMessage.error(e?.message || '获取作答明细失败')
    } finally {
      if (seq === requestSeq) loading.value = false
    }
  }

  function backToList() {
    view.value = 'list'
    detail.value = null
  }

  /** 关闭后清空，避免下次打开先闪上一个人的数据 */
  function handleClosed() {
    // 递增序号让在途请求作废，否则关闭后晚回的响应会把数据重填回已清空的列表
    requestSeq += 1
    view.value = 'list'
    attempts.value = []
    detail.value = null
    loading.value = false
    emit('closed')
  }
</script>

<style lang="scss" scoped>
  .drawer-body {
    min-height: 200px;

    // 人员抬头：两级共用，切层级时保留「在看谁」
    .user-head {
      display: flex;
      align-items: center;
      gap: 8px;
      padding-bottom: 12px;
      margin-bottom: 12px;
      border-bottom: 1px solid var(--el-border-color-lighter);

      .user-name {
        font-size: 15px;
        font-weight: 600;
      }

      .user-belong {
        font-size: 13px;
        color: var(--el-text-color-secondary);
      }
    }

    .detail-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;

      .detail-stat {
        font-size: 13px;
        color: var(--el-text-color-regular);
      }
    }

    .not-answered {
      font-size: 13px;
      color: var(--el-text-color-secondary);
    }

    // ── 卷面式逐题回看 ──
    .qsheet {
      max-height: 480px;
      overflow-y: auto;
      // 给滚动条留出间距，否则贴着答错题的左侧色条
      padding-right: 4px;
    }

    .qitem {
      padding: 12px 14px;
      margin-bottom: 10px;
      background: var(--el-fill-color-blank);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: 6px;

      &:last-child {
        margin-bottom: 0;
      }

      // 答错的题左侧加色条：抽查时要能快速扫到错题，
      // 用左边框而非整块染红，避免大面积红底压过题干文字
      &--wrong {
        border-left: 3px solid var(--el-color-danger);
      }
    }

    .q-stem {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 6px;
      margin-bottom: 10px;
      font-size: 14px;
      line-height: 22px;
      color: var(--el-text-color-primary);

      .q-no {
        font-weight: 600;
      }

      // 题干占满剩余宽度，标签被挤到下一行也不断开题干
      .q-text {
        flex: 1 1 auto;
        min-width: 0;
      }
    }

    .q-options {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .q-option {
      display: flex;
      align-items: baseline;
      gap: 8px;
      padding: 6px 10px;
      font-size: 13px;
      line-height: 20px;
      color: var(--el-text-color-regular);
      border: 1px solid transparent;
      border-radius: 4px;

      .q-option-key {
        flex: 0 0 auto;
        font-weight: 600;
      }

      // 正确答案：绿底。无论他有没有选，都要能看出对的是哪个
      &--right {
        color: var(--el-color-success);
        background: var(--el-color-success-light-9);
        border-color: var(--el-color-success-light-7);
      }

      // 他选错的那项：红底。与上面的绿底并存，一眼看出「选了这个、其实该选那个」
      &--misspick {
        color: var(--el-color-danger);
        background: var(--el-color-danger-light-9);
        border-color: var(--el-color-danger-light-7);
      }

      // 选对的项同时命中 --right 与 --picked，加粗以区别于「没选但正确」
      &--picked.q-option--right {
        font-weight: 600;
      }

      // 标记靠右对齐成一列，逐题往下扫时位置固定
      .q-mark {
        display: inline-flex;
        flex: 0 0 auto;
        gap: 2px;
        align-items: center;
        margin-left: auto;
        font-size: 12px;
        font-weight: 400;
        white-space: nowrap;

        &--right {
          color: var(--el-color-success);
        }

        &--wrong {
          color: var(--el-color-danger);
        }
      }
    }

    .q-plain {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 13px;
      line-height: 20px;

      .q-plain-row {
        display: flex;
        gap: 8px;
      }

      .q-plain-label {
        flex: 0 0 64px;
        color: var(--el-text-color-secondary);
      }
    }

    .q-analysis {
      display: flex;
      gap: 8px;
      padding-top: 8px;
      margin-top: 10px;
      font-size: 13px;
      line-height: 20px;
      color: var(--el-text-color-regular);
      border-top: 1px dashed var(--el-border-color-lighter);

      .q-analysis-label {
        flex: 0 0 auto;
        color: var(--el-text-color-secondary);
      }
    }

    // 富文本内的图片不能撑破抽屉
    .rich-text {
      :deep(img) {
        max-width: 100%;
        height: auto;
      }

      :deep(p) {
        margin: 0;
      }
    }
  }
</style>
