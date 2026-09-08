<!--
  页面名称：ExamResult - 交卷详情

  功能描述：
    展示考生交卷后的结果：交卷时间、成绩与是否通过
    含主观题的考试成绩待阅卷发布，此时不展示分数，只提示待阅卷

  路由信息：
    路径：/exam/result/:id
    名称：ExamResult
    是否缓存：否
-->

<template>
  <div class="exam-result-page">
    <van-nav-bar title="交卷详情" left-arrow fixed placeholder @click-left="handleBack" />

    <AppSkeleton v-if="loading" variant="score" :count="4" />

    <template v-else-if="result">
      <!-- 可重考时底部操作栏多一行剩余机会提示、变高，留白需同步加大 -->
      <div class="content" :class="{ 'content--retake': result.canRetake }">
        <!--
          成绩概览做成浅彩底卡片，而非白卡：
          白卡上颜色只能以小色块出现，分数再大也还是一段黑字，
          读起来像表单而不像成绩。整张卡按判定上浅色底、分数取深色主色，
          状态一眼可辨，同时保住卡片的实体感。
          版式沿用 ScoreDetail.vue 的既有范式：分数与结论徽标同行分列两端，
          考试名与及格线依次退到下方，形成「结论—场次—参照」三级。
          已发布显示分数与通过状态，待阅卷只显示提示。
        -->
        <section class="score-card" :class="scoreStateClass">
          <template v-if="result.scoreReleased">
            <!-- 分数与徽标同行：左端占重心，右端给结论，两者互不争 -->
            <div class="score-head">
              <p class="score-value">
                {{ result.totalScore }}
                <span class="score-unit">分</span>
              </p>

              <!-- 判定缺失时只显示分数不显示结论，不能把「未判定」说成「不合格」 -->
              <span v-if="hasPassState" class="pass-badge">
                <!-- 纯装饰：结论已由紧邻的文字表达，读屏不必重复 -->
                <svg class="badge-icon" viewBox="0 0 16 16" aria-hidden="true">
                  <circle cx="8" cy="8" r="7" fill="currentColor" />
                  <path
                    d="M4.8 8.2l2.1 2.1 4.3-4.3"
                    fill="none"
                    stroke="var(--score-bg)"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                {{ result.passed ? '合格' : '不合格' }}
              </span>
              <span v-else class="pass-badge is-unjudged">合格结果核算中</span>
            </div>

            <p class="exam-name">{{ result.examName }}</p>

            <!--
              及格线用一行小字而非进度条：条平铺在卡里读起来像加载进度，
              而这里要说的是一个阈值。数值本身明细表也有，这里给的是即时参照。
            -->
            <p v-if="showPassMark" class="pass-line">及格线 {{ result.passScore }} 分</p>

            <!--
              右下角水印装饰，纯装饰、不承载信息。压到很低不透明度是必须的：
              它与卡内文字同处一层，画重了会与「及格线」那行抢读。
            -->
            <svg class="card-watermark" viewBox="0 0 64 64" aria-hidden="true">
              <!-- 试卷主体 -->
              <path
                d="M14 8h24l12 12v36H14z"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linejoin="round"
              />
              <!-- 折角 -->
              <path
                d="M38 8v12h12"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linejoin="round"
              />
              <!-- 卷面文字：三道短线读作「有内容」即可 -->
              <path
                d="M21 28h14M21 35h20M21 42h11"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
              />
            </svg>
          </template>

          <div v-else class="pending-block">
            <!--
              纯装饰，信息已由下方文字表达，读屏不必再念一次图形。
              用「试卷 + 时钟」而非沙漏 emoji：沙漏读作「正在加载」，
              而这里的语义是卷子已收到、等着人来批改。
            -->
            <span class="pending-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <!-- 试卷：右下角留出缺口给时钟，避免两个图形叠在一起糊成一团 -->
                <path
                  d="M5 3.8h9.2L18.2 7.8V13"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                />
                <path
                  d="M5 3.8v16.4h6"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                />
                <!-- 折角 -->
                <path
                  d="M13.9 3.9v4.1h4.1"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linejoin="round"
                />
                <!-- 卷面文字：两道短线足够读作「有内容」，画满反而抢过时钟 -->
                <path
                  d="M8 11h5M8 14.2h3"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                />
                <!-- 时钟：表示等待中 -->
                <circle
                  cx="16.6"
                  cy="17.4"
                  r="4.4"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                />
                <path
                  d="M16.6 15.2v2.4l1.7 1"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </span>
            <!--
              两种「看不到分数」要分开说，否则是错误承诺：
              待阅卷是「等一会儿就有」，设置不公开是「本场永远看不到」，
              后者若也显示「待阅卷后发布」，考生会一直回来刷一个不会出现的结果。
            -->
            <p class="pending-text">
              {{ result.scoreWithheld ? '本场成绩不对考生公开' : '成绩待阅卷后发布' }}
            </p>
            <p class="exam-name is-centered">{{ result.examName }}</p>
            <p class="pending-tip">
              {{
                result.scoreWithheld
                  ? '已收到您的答卷，成绩由考务统一处理'
                  : '本场含主观题，请留意消息通知'
              }}
            </p>
          </div>
        </section>

        <!--
          本场所发证书。排在成绩卡之后、交卷明细之前：通过后考生最想确认的是
          「发了什么证」，把它压到明细下面等于让人翻过一堆数字才看见。
        -->
        <!--
          整卡可点，故补 role/tabindex/键盘响应：section 加 @click 只有指针能用，
          键盘 Tab 到不了、读屏也不会报为可交互。
          aria-label 把卡内散落的信息合成一句可读的动作说明。
        -->
        <section
          v-if="result.certificate"
          class="card cert-card"
          role="button"
          tabindex="0"
          :aria-label="`查看证书详情：${result.certificate.name}，编号 ${result.certificate.code}`"
          @click="goCert"
          @keydown.enter.prevent="goCert"
          @keydown.space.prevent="goCert"
        >
          <div class="cert-head">
            <!--
              用 span 而非 h2：整卡是 role=button，可访问名称已由 aria-label 给出，
              再留一个标题元素会让按标题导航的读屏用户多碰到一个无处可去的层级。
            -->
            <span class="cert-title">已获得证书</span>
            <!-- 图形化提示可点，语义由整卡的 role/aria-label 承担 -->
            <van-icon name="arrow" class="cert-arrow" aria-hidden="true" />
          </div>

          <div class="cert-body">
            <!--
              证书小样：与证书详情页共用 CertCanvas 按同一套版式渲染，缩到卡片宽度。
              早先此处只画底图，渲出来是个没有任何文字的空白框，与点进去看到的
              证书判若两物——缩略尺寸下文字确实读不清，但那是「看不清」，
              而空白框是「看起来发错了证」，后者才是问题。
              版式整个缺失（老模板没配）时仍回退到印章图标占位，不留空框。
            -->
            <div
              class="cert-thumb"
              :class="{ 'is-placeholder': !hasCertLayout }"
              :style="thumbStyle"
            >
              <CertCanvas
                v-if="hasCertLayout"
                :canvas-width="result.certificate.canvasWidth"
                :canvas-height="result.certificate.canvasHeight"
                :background-image="result.certificate.backgroundImage"
                :seal-image="result.certificate.sealImage"
                :elements="result.certificate.elements"
                :available-width="CERT_THUMB_WIDTH"
                :bg-alt="`${result.certificate.name}证书图样`"
              />
              <van-icon v-else name="medal-o" class="cert-thumb-icon" aria-hidden="true" />
            </div>

            <div class="cert-meta">
              <p class="cert-name">{{ result.certificate.name }}</p>
              <p class="cert-line">编号 {{ result.certificate.code }}</p>
              <p v-if="result.certificate.issuer" class="cert-line">
                {{ result.certificate.issuer }}
              </p>
              <p class="cert-line">有效期 {{ result.certificate.validPeriod }}</p>
            </div>
          </div>
        </section>

        <!--
          该发未发：开了自动发证且已及格，但证书还没查到。
          发证在成绩发布时触发且失败只记日志、不回滚成绩，故这个状态真实存在。
          此时必须给一句交代——考生看到合格却没有任何证书线索，
          只会以为系统漏发，而不会想到去「我的证书」里等。
        -->
        <section v-else-if="result.certPending" class="card cert-pending">
          <van-icon name="clock-o" class="cert-pending-icon" aria-hidden="true" />
          <div>
            <p class="cert-pending-title">证书发放中</p>
            <!--
              不写成「稍后即可查看」：发证失败没有补发入口，该状态可能永久为真，
              许诺一个不会到来的结果比不说更糟。给出联系管理员这个可行动的出口。

              成绩不公开时（scoreWithheld）不能说「通过后发证」：那句话等于
              直接告知考生已通过，而上方成绩卡刚说了「本场成绩不对考生公开」，
              两句自相矛盾。此时只说证书在发放、去哪儿看，不提及结论。
            -->
            <p class="cert-pending-tip">
              {{
                result.scoreWithheld
                  ? '可在「我的 - 我的证书」查看；如长时间未出请联系管理员'
                  : '本场考试通过后发证，可在「我的 - 我的证书」查看；如长时间未出请联系管理员'
              }}
            </p>
          </div>
        </section>

        <!-- 交卷信息 -->
        <section class="card detail-card">
          <!--
            border 关掉：cell-group 默认给整组加 van-hairline--top-bottom，
            在已有圆角白底的卡片里会多出顶、底两条贴边细线，像卡片裂了一道缝。
            行与行之间的分隔线由 van-cell 自身的 border 提供，不受影响。
          -->
          <van-cell-group :border="false">
            <van-cell title="交卷时间" :value="formatDate(result.submitTime, 'YYYY-MM-DD HH:mm')" />
            <van-cell title="题目数量" :value="`${result.questionCount} 题`" />
            <van-cell title="总分 / 及格分" :value="`${result.fullScore} / ${result.passScore}`" />
            <van-cell v-if="result.scoreReleased" title="客观题得分" :value="`${result.objectiveScore} 分`" />
            <van-cell
              v-if="result.scoreReleased && result.subjectiveScore !== null"
              title="主观题得分"
              :value="`${result.subjectiveScore} 分`"
            />
            <van-cell v-if="result.switchCount > 0" title="切屏次数">
              <template #value>
                <!--
                  切屏是异常项，原先只把数字染橙、与其他行同重，扫一眼分不出来。
                  加淡橙底 + 警示图标把它从常规行里拎出来。
                  图标 aria-hidden：紧邻的「N 次」已表达，读屏不必再念图形。
                -->
                <span class="warn-pill">
                  <van-icon name="warning-o" aria-hidden="true" />
                  {{ result.switchCount }} 次
                </span>
              </template>
            </van-cell>
          </van-cell-group>
        </section>
      </div>

      <!--
        底部操作栏。本场还有作答机会时把「再考一次」摆在这里：
        重考入口原先只在考试列表与首页待考提醒上，考生刚交完卷正停在本页，
        要重考得先退回列表再找到那场考试，白绕一圈。

        可重考时「再考一次」占主按钮、「返回考试列表」降为次按钮：
        这一屏的下一步动作是重考，返回列表随时可做。
      -->
      <div class="footer">
        <template v-if="result.canRetake">
          <p class="retake-hint">
            已考 {{ result.submittedCount }} 次，共 {{ result.allowedAttempts }} 次机会
          </p>
          <div class="footer-actions">
            <van-button plain type="primary" round @click="goList">返回列表</van-button>
            <van-button type="primary" round @click="goRetake">再考一次</van-button>
          </div>
        </template>
        <van-button v-else type="primary" block round @click="goList">返回考试列表</van-button>
      </div>
    </template>

    <van-empty v-else :description="emptyText" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { formatDate } from '@/utils/format'
import { getExamResultApi } from '@/api/modules/examApi'
import AppSkeleton from '@/components/Common/AppSkeleton.vue'
import CertCanvas from '@/components/Business/CertCanvas.vue'

/** 证书小样宽度（px），与样式里 .cert-thumb 的 width 对应，改一处两边都要改 */
const CERT_THUMB_WIDTH = 72

const route = useRoute()
const router = useRouter()

// 考试 ID（来自路由参数）
const examId = route.params.id

// 交卷结果
const result = ref(null)

// 加载状态
const loading = ref(false)

// 空态文案（未交卷或考试不存在时呈现，具体原因由拦截器 toast 提示）
const emptyText = '暂无交卷记录'

/**
 * 是否已有明确的合格判定
 * passed 跨系统边界而来，成绩已发布时理应是布尔值；为空说明判定缺失，
 * 此时按真值兜底会把「未判定」显示成「不合格」，对考生是实质误导，故显式校验类型
 */
const hasPassState = computed(() => typeof result.value?.passed === 'boolean')

/** 证书是否有可渲染的版式：底图或元素至少有一样（与证书详情页同口径） */
const hasCertLayout = computed(() => {
  const c = result.value?.certificate
  if (!c) return false
  return !!c.backgroundImage || (Array.isArray(c.elements) && c.elements.length > 0)
})

/**
 * 小样容器的高宽比：按证书实际尺寸给，横版证书才不会被压变形
 * 版式缺失时无尺寸可依，退回 A4 竖版比例
 */
const thumbStyle = computed(() => {
  const c = result.value?.certificate
  const w = c?.canvasWidth || 420
  const h = c?.canvasHeight || 594
  return { aspectRatio: `${w} / ${h}` }
})

/*
  成绩卡底色分三态：合格淡绿、未达标淡橙、判定缺失或待阅卷用中性淡蓝灰。
  待阅卷（scoreReleased 为假）也要有底色，否则成绩卡变成一块白、
  跟下方明细卡糊在一起，两张卡就分不出主次。
*/
const scoreStateClass = computed(() => {
  if (!result.value?.scoreReleased) return 'is-pending'
  if (!hasPassState.value) return 'is-pending'
  return result.value.passed ? 'is-pass' : 'is-fail'
})

/*
  及格线文字只在及格分为有效正数时显示：
  为 0、缺失或非数字时这行没有意义（「及格线 0 分」反而让人困惑）。
*/
const showPassMark = computed(() => Number(result.value?.passScore) > 0)

/**
 * 加载交卷结果
 * 未交卷时后端返回 403，此处仅置空由空态呈现，错误提示由响应拦截器统一处理
 */
const loadResult = async () => {
  loading.value = true
  try {
    const res = await getExamResultApi(examId)
    result.value = res.data
  } catch {
    result.value = null
  } finally {
    loading.value = false
  }
}

/**
 * 返回考试列表（底部主操作）
 * 用 replace 而非 push，避免在历史里堆叠出「列表→结果→列表」的往复
 */
const goList = () => {
  router.replace('/exam/list')
}

/**
 * 再考一次
 *
 * 去考试详情页而不是直接跳作答页：承诺书签署、人脸核验、取卷都挂在那一步，
 * 直连作答页会把这些前置环节全绕过（服务端仍会拦，但考生只会看到一句报错）。
 * 与考试列表进入考试走的是同一条路，不另开一条。
 *
 * 用 push 而非 replace：到详情页看了规则又改主意时，要能退回本页看成绩。
 */
const goRetake = () => {
  router.push(`/exam/detail/${examId}`)
}

/**
 * 进证书详情
 *
 * 用 push 而非 replace：从结果页看完证书要能退回来。
 * 路由为 /profile/certificates/:id（与「我的证书」列表进入的是同一页，
 * 证书渲染只在那里维护一份）。
 */
const goCert = () => {
  const id = result.value?.certificate?.id
  if (!id) return
  router.push(`/profile/certificates/${id}`)
}

/**
 * 顶部返回：退回来源页
 *
 * 作答页交卷时用的是 replace，其历史条目已被本页替换，back 不会退回失效的作答页，
 * 因此这里如实 back 即可：从考试详情 push 进来的能回到详情，不会被硬拉到列表。
 * 但深链直达或刷新后会话历史为空，back 会静默无操作把考生困在本页，故先探一下
 * vue-router 记录的上一条历史，没有才退回列表兜底。
 */
const handleBack = () => {
  if (window.history.state?.back) {
    router.back()
    return
  }
  goList()
}

onMounted(loadResult)
</script>

<style scoped>
.exam-result-page {
  min-height: 100vh;
  background-color: var(--bg-page);
}


.content {
  padding: var(--spacing-md);
  /* 底部为固定操作栏留白，与 ExamDetail 同一档：按钮 44px + 上下 8px + 安全区 */
  padding-bottom: 96px;
}

/*
  可重考时操作栏多出一行剩余机会提示（12px 字号约 17px 行高 + 4px 间距），
  留白同步加高，否则最后一张卡片的末行会被固定栏压住。
*/
.content--retake {
  padding-bottom: 118px;
}

.card {
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-sm);
  background-color: var(--bg-card);
  border-radius: var(--radius-lg);
  /* 与 .score-card 同一阴影，两张卡才读作同一族而非一张浮一张平 */
  box-shadow: 0 4px 16px rgb(31 37 51 / 4%);
}

/*
  强制颜色模式（如 Windows 高对比度）下 box-shadow 被强制为 none、
  background-color 被系统色覆盖，两张卡的边界会同时归零——
  浅彩成绩卡对页底本就只有 1.01:1，全靠阴影分界，此时会与页面糊死。
  按 MDN 建议的补偿写法改用系统色边框，仅在该模式下生效，不动常态观感。
*/
@media (forced-colors: active) {
  .card,
  .score-card {
    border: 1px solid CanvasText;
  }
}

/* ── 成绩卡 ───────────────────────────────── */

/*
  底色与主色按状态定义在成绩卡上，卡内文字与徽标统一取用。

  底色直接用项目既有令牌 --success-light / --unqualified-light，
  不再自造色值：这两个令牌本就是为「浅底 + 同色字」的状态组合而设的，
  ScoreDetail.vue 的成绩标签也用它们，自造等于重复造令牌。

  但文字色没有沿用配套的 --success-color / --unqualified-color：
  这两个压各自浅底只有 2.55:1 / 2.49:1，12px 徽标需 4.5:1，不达标。
  故压深到 #00751a（5.42:1）与 #b25700（4.52:1，且已是本页 .warn-pill 在用的橙），
  保留同一色系观感，只把明度压到达标。
  注：ScoreDetail.vue 的 .verdict 仍是未压深的组合，同样不达标，尚未处理。
*/
.score-card.is-pass {
  --score-bg: var(--success-light);
  --score-accent: #00751a;
}

.score-card.is-fail {
  --score-bg: var(--unqualified-light);
  --score-accent: #b25700;
}

/* 待阅卷/判定缺失：中性灰底，不用绿橙任一档 */
.score-card.is-pending {
  --score-bg: var(--bg-fill);
  --score-accent: #3d4757;
}

/*
  成绩卡：浅彩底 + 四角圆角 + 四边留白，浮在灰底页面上。
  上一版做成通栏（负边距顶到屏幕两侧、不切圆角），色块被摊成一整片背景，
  失去了「一张卡」的实体感。留白与圆角才是卡片成立的条件。
  阴影取 ScoreDetail.vue 同值，同为成绩相关页、保持一致。
*/
.score-card {
  /* 相对定位给右下角装饰图形做定位父级 */
  position: relative;
  overflow: hidden;
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-sm);
  border-radius: var(--radius-lg);
  background-color: var(--score-bg);
  box-shadow: 0 4px 16px rgb(31 37 51 / 4%);
}

/* 分数与徽标同行、分列两端，徽标与分数基线对齐偏上，贴住分数顶部 */
.score-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-sm);
}

/*
  考试名 15px/600 取主文字色，与 ScoreDetail.vue 的 .exam-name 同规格：
  它是场次标识而非弱化说明，压成次级灰会读作附注。
*/
.exam-name {
  margin: var(--spacing-sm) 0 0;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--text-primary);
}

/* 待阅卷分支整体居中，考试名跟随 */
.exam-name.is-centered {
  margin: var(--spacing-xs) 0 var(--spacing-xs);
  text-align: center;
}

/*
  分数取状态主色而非近黑：浅底上深色主色本身就够重，
  同时让「什么状态」由颜色一眼说清，不必再靠徽标反复强调。
*/
.score-value {
  margin: 0;
  font-size: 52px;
  /* 800 与 ScoreDetail.vue 的 .total-score 同字重 */
  font-weight: 800;
  line-height: 1.05;
  color: var(--score-accent);
  /* 等宽数字：分数变化时（如 98 → 100）数字不会左右跳 */
  font-variant-numeric: tabular-nums;
}

/* 单位跟随分数取主色，但降字号与字重，不与数字齐平 */
.score-unit {
  font-size: 17px;
  font-weight: 600;
  color: var(--score-accent);
}

/*
  待阅卷分支自行居中：成绩卡整体已改为左对齐（分数在左、徽标在右），
  但待阅卷没有分数与徽标、只有图标加两行字，居中才不显得偏一边。
*/
.pending-block {
  padding: var(--spacing-sm) 0;
  text-align: center;
}

/* 及格线：卡内最弱一档信息，仅作即时参照 */
.pass-line {
  margin: var(--spacing-xs) 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}

/*
  水印：贴卡片右下角、部分溢出由 .score-card 的 overflow:hidden 裁掉，
  形成「嵌在卡里」而非「摆在卡上」。取主色但压到 10% 不透明度，
  与卡底的对比远低于 3:1 是有意的——它是装饰不是图形信息，
  aria-hidden 已隐藏，压淡才不会与文字抢读。
*/
.card-watermark {
  position: absolute;
  right: -6px;
  bottom: -10px;
  width: 92px;
  height: 92px;
  color: var(--score-accent);
  opacity: 0.1;
  pointer-events: none;
}


/*
  明细行的值加重到 500 并转近黑：默认 van-cell 的值是次级灰、
  与左侧标签同重同色，六行扫下来分不出哪边是数据。
*/
.detail-card :deep(.van-cell__value) {
  color: var(--text-primary);
  font-weight: 500;
}

/* 证书卡整卡可点，光标与按下反馈都按可交互元素给 */
.cert-card {
  cursor: pointer;
}

.cert-card:active {
  background-color: var(--bg-fill);
}

/* 键盘焦点必须可见：整卡是 role=button，Tab 到时要能看出落在哪 */
.cert-card:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}

.cert-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-md);
}

/* 卡内小标题，与证书名同字号但靠位置区分层级 */
.cert-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.cert-arrow {
  font-size: 15px;
  color: var(--text-disabled);
}

.cert-body {
  display: flex;
  gap: var(--spacing-md);
}

/*
  证书小样固定宽度而非百分比：右侧文字是变长的证书名与编号，小样跟着变宽会挤掉它们。
  高宽比按证书实际尺寸给（见 thumbStyle），横版证书才不会被压变形；
  版式缺失回退到占位图标时没有尺寸可依，退回 A4 竖版比例。
*/
.cert-thumb {
  flex-shrink: 0;
  width: 72px;
  overflow: hidden;
  border-radius: var(--radius-md);
  /* 底图多为浅色纸面，给一道浅描边免得与白卡底连成一片 */
  border: 1px solid var(--border-color);
}

/* 模板未配底图时的占位：淡主色底 + 奖章图标，不留一块空白 */
.cert-thumb.is-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--primary-light);
  border-color: transparent;
}

.cert-thumb-icon {
  font-size: 28px;
  color: var(--primary-color);
}

.cert-meta {
  flex: 1;
  min-width: 0;
}

/* 证书名是本卡主信息，与考试名同规格 */
.cert-name {
  margin: 0 0 var(--spacing-xs);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--text-primary);
}

.cert-line {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
  /* 证书编号与机构名可能超长，截断而非撑破卡片 */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 发证待出：图标与文案并排，整体比证书卡轻，它只是一句交代 */
.cert-pending {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-sm);
}

.cert-pending-icon {
  flex-shrink: 0;
  margin-top: 2px;
  font-size: 18px;
  color: var(--primary-color);
}

.cert-pending-title {
  margin: 0 0 2px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.cert-pending-tip {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}


/*
  结论徽标自绘而非 van-tag：原先不合格用 van-tag type="danger" 的红，
  与 variables.css 里「及格判定不用红、未达标单列一档橙」的约定冲突。
  徽标规格对齐 ScoreDetail.vue 的 .verdict：12px/600、--radius-sm 直角感圆角，
  而非药丸。底用比卡底更白一档的半透明白，使它在同色系卡底上仍分出一个面
  （纯白 1.10:1 太弱，实色主底又过重、与右上角的次要位置不符）。
*/
.pass-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  background-color: rgb(255 255 255 / 70%);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--score-accent);
  white-space: nowrap;
}

.badge-icon {
  display: block;
  width: 13px;
  height: 13px;
  flex-shrink: 0;
}

/*
  判定缺失时徽标降级为纯文字说明：去掉勾选图标与实底，
  避免「核算中」被读成一个已成立的结论。
*/
.pass-badge.is-unjudged {
  background-color: transparent;
  padding-inline: 0;
  color: var(--text-secondary);
  font-weight: 400;
}


/*
  与首页空态图形同一套做法：圆角底 + currentColor 描边，只在这里定一次色。
  待阅卷时成绩卡走 is-pending 的淡蓝灰而非灰白，
  因为待阅卷是「流程正在推进」，纯灰会读作「什么都没有」。
  主色线 #3d4757 压纯白 9.39:1，远过图形元素 3:1。
*/
.pending-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  margin: 0 0 var(--spacing-sm);
  border-radius: 16px;
  /* 白底 + 主色线：图标是线稿，实色底会把细线吃掉，故与徽标反向处理 */
  background-color: #fff;
  color: var(--score-accent);
}

.pending-icon svg {
  display: block;
  width: 30px;
  height: 30px;
}

.pending-text {
  margin: 0 0 var(--spacing-xs);
  font-size: 17px;
  font-weight: 500;
  color: var(--text-primary);
}

.pending-tip {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
}

/*
  切屏次数属于异常信息：淡橙底 + 图标 + 警示色，从常规行里拎出来。
  文字色不用 --warning-color(#ff7d00)：它压白底只 2.57:1、压这里的淡橙底
  更低（2.35:1），而 13px 正文要 4.5:1。压暗到 #b25700 得 4.52:1，同色系。
*/
.warn-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 999px;
  background-color: var(--unqualified-light);
  font-size: 13px;
  font-weight: 500;
  color: #b25700;
}

/* 底部固定操作栏，含安全区（与 ExamDetail 保持一致） */
/*
  底栏取页面底色而非白色：白底压在灰色页面上还带一道硬边框，
  内容少时下方留出大片灰，白条就成了一块脱离页面的浮层。
  同色 + 无边框后只有按钮本身可见，底栏「消失」在页面里。
*/
.footer {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  padding: var(--spacing-sm) var(--spacing-md);
  padding-bottom: calc(var(--spacing-sm) + env(safe-area-inset-bottom));
  background-color: var(--bg-page);
}

/*
  剩余机会数放在按钮上方而非写进按钮文案：
  「再考一次（还剩 1 次）」会把按钮撑长且在窄屏折行，
  而这行信息是决策依据，独立一行更好读。
*/
.retake-hint {
  margin-bottom: var(--spacing-xs);
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
}

/*
  两按钮等宽并排。次按钮在左、主按钮在右，顺手位置留给「再考一次」。
  用 grid 而非 flex+flex:1：两列严格等宽，不受各自文案长短影响
  （「返回列表」四字与「再考一次」四字目前等长，但文案改动后不该错位）。
*/
.footer-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-sm);
}

/*
  底栏上方的渐变：底栏不透明，内容长时会在它的上边缘被生生截断。
  垫一段由透明到页面底色的渐变，让滚动内容淡入底栏而不是硬切。
  pointer-events: none 保证这层不吃掉按钮周边的点击。
*/
.footer::before {
  content: '';
  position: absolute;
  right: 0;
  bottom: 100%;
  left: 0;
  height: 16px;
  background: linear-gradient(to top, var(--bg-page), transparent);
  pointer-events: none;
}
</style>
