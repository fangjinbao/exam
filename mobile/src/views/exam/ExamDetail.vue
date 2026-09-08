<!--
  页面名称：ExamDetail - 考试详情

  功能描述：
    展示考试基本信息与考试须知，作为进入作答前的确认页
    已交卷的考试点主按钮转到交卷详情，未交卷的按状态校验后进入作答

    历史说明：
      早前此页有「人脸核身」信息行，且需核身的考试点按钮先跳 /exam/face-verify/:id。
      该路由、对应页面与接口在本仓库均不存在（跳过去是未注册路由），故已移除。
      mock/data/examData.js 里仍保留 needFaceVerify 字段，若后续要恢复核身，
      需先补齐路由、页面与接口三者，不要只在本页加回跳转。

  路由信息：
    路径：/exam/detail/:id
    名称：ExamDetail
    是否缓存：否
-->

<template>
  <div class="exam-detail-page">
    <van-nav-bar title="考试详情" left-arrow fixed placeholder @click-left="router.back()" />

    <AppSkeleton v-if="loading" variant="detail" :count="5" />

    <template v-else-if="detail">
      <div class="content">
        <!-- 标题区：浅蓝渐变头卡，考试名与状态同行 -->
        <section class="card hero-card">
          <div class="hero-head">
            <h1 class="exam-name">{{ detail.name }}</h1>
            <!--
              不用 van-tag：它是直角实色小方块，压在头卡的浅蓝渐变上过于抢眼且显糙。
              改用与本页其他信息同族的胶囊——淡底 + 压深同色系文字，
              与 ExamResult.vue 的 .warn-pill、成绩卡的合格态是同一套语汇。
              进行中额外带一颗小圆点表示「正在进行」，其余状态无点。
            -->
            <span class="exam-status" :class="`is-${detail.status}`">
              <i v-if="detail.status === EXAM_STATUS.ONGOING" class="status-dot" aria-hidden="true"></i>
              {{ getExamStatusText(detail.status) }}
            </span>
          </div>
          <!-- 描述可能为空，空时不留下一段孤立的间距 -->
          <p v-if="detail.description" class="exam-desc">{{ detail.description }}</p>
        </section>

        <!--
          考试信息合成一张卡：日期按行读，关键数字并排扫。

          原先拆成两张卡，两张各用一套对齐范式——日期是「标签左/值右」、
          数字是「三格居中」，两卡左边缘对不上，整段读起来是散的。
          并到一张卡内、用一道分割线隔开两层，既保住「关键数字要大字号突出」
          的原意（考生一眼判断考多久、多少题、多少分及格），
          又让这块信息收成一个整体。
        -->
        <section class="card">
          <div class="time-row">
            <span class="time-label">开始时间</span>
            <span class="time-value">{{ formatDate(detail.startTime, 'YYYY-MM-DD HH:mm') }}</span>
          </div>
          <div class="time-row time-row--divided">
            <span class="time-label">结束时间</span>
            <span class="time-value">{{ formatDate(detail.endTime, 'YYYY-MM-DD HH:mm') }}</span>
          </div>

          <div class="stat-row">
            <div v-for="item in stats" :key="item.label" class="stat">
              <span class="stat-icon" aria-hidden="true">
                <van-icon :name="item.icon" />
              </span>
              <span class="stat-value">
                {{ item.value }}<span v-if="item.unit" class="stat-unit">{{ item.unit }}</span>
              </span>
              <span class="stat-label">{{ item.label }}</span>
            </div>
          </div>
        </section>

        <!-- 考试须知：序号做成蓝色圆徽标，替代默认的 ol 小数点 -->
        <section class="card">
          <h2 class="card-title">考试须知</h2>
          <!--
            显式 role="list"：Safari/VoiceOver 在 list-style:none 时会去掉 ol 的 list 语义。
            本页可见序号已 aria-hidden，顺序全靠 ol/li 隐式语义传达，
            若语义再被去掉，读屏用户就彻底拿不到「第几条、共几条」。
          -->
          <ol class="notice-list" role="list">
            <li v-for="(text, index) in NOTICES" :key="index" class="notice-item">
              <!-- ol/li 本身已带顺序语义，可见序号是重复信息，对读屏隐藏 -->
              <span class="notice-index" aria-hidden="true">{{ index + 1 }}</span>
              <span class="notice-text">{{ text }}</span>
            </li>
          </ol>
        </section>
      </div>

      <!-- 底部操作栏 -->
      <div class="footer">
        <van-button type="primary" block round :loading="entering" @click="handleEnter">
          {{ detail.submitted ? '查看交卷详情' : '进入考试' }}
        </van-button>
      </div>
    </template>

    <van-empty v-else description="考试不存在" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast, showConfirmDialog } from 'vant'
import dayjs from 'dayjs'
import { formatDate } from '@/utils/format'
import { getExamStatusText, EXAM_STATUS } from '@/constants/exam'
import { getExamDetailApi } from '@/api/modules/examApi'
import AppSkeleton from '@/components/Common/AppSkeleton.vue'

const route = useRoute()
const router = useRouter()

/**
 * 考试须知文案
 * 描述的是本系统的真实行为（自动保存、切屏告警上报、交卷不可改、到时自动交卷），
 * 不是通用考场纪律，改动前需与作答页/监考逻辑对齐。
 */
const NOTICES = [
  '作答期间答案自动保存，可中断后继续作答。',
  '作答期间系统检测切屏行为，切屏将记录告警并上报监考。',
  '交卷后不可修改答案，请确认无误后再交卷。',
  '考试时间结束将自动交卷。'
]

// 考试 ID（来自路由参数）
const examId = route.params.id

// 考试详情
const detail = ref(null)

// 加载状态
const loading = ref(false)

// 进入考试按钮的加载状态
const entering = ref(false)

/**
 * 三格关键数字
 * 单位与数字拆开：单位小一号跟在数字后，避免「500分钟」整串同字号削弱数字本身。
 * 总分/及格分是一组比值，整串作为数字展示，无单独单位。
 */
const stats = computed(() => {
  if (!detail.value) return []
  return [
    { icon: 'clock-o', value: detail.value.duration, unit: '分钟', label: '考试时长' },
    // 描线版，与同排的 clock-o / medal-o 保持一致；实心的 description 会显得比两侧重
    { icon: 'description-o', value: detail.value.questionCount, unit: '题', label: '题目数量' },
    {
      icon: 'medal-o',
      /*
        斜杠两侧不留空格：这格字符数天然比另两格多，23px 下 375px 屏每格只有约 103px，
        「1000 / 600」带空格约 111px 会溢出，去掉空格降到约 97px。
        下方标签「总分 / 及格分」已带空格表明这是一组比值，值里不留空格不影响读。
      */
      value: `${detail.value.totalScore}/${detail.value.passScore}`,
      unit: '',
      label: '总分 / 及格分'
    }
  ]
})

/**
 * 加载考试详情
 */
const loadDetail = async () => {
  loading.value = true
  try {
    const res = await getExamDetailApi(examId)
    detail.value = res.data
  } catch {
    detail.value = null
  } finally {
    loading.value = false
  }
}

/**
 * 进入考试
 * 校验考试状态与交卷情况，需核身的先进核身页
 */
const handleEnter = () => {
  if (!detail.value) return

  // 已交卷的直接看交卷详情，不再拦在入口页
  if (detail.value.submitted) {
    router.push(`/exam/result/${examId}`)
    return
  }
  if (detail.value.status === EXAM_STATUS.PUBLISHED) {
    /*
      未开始时按「提前进场」设置决定是拦还是放。
      earlyEnterMinutes 为 0 保持原行为（到点才能进）；为 N 时开考前 N 分钟即可进。
      服务端 getExamPaper 用同一个值做权威校验，此处只为把提示做准、
      避免考生点进去才吃一个 403。
    */
    const earlyMin = Number(detail.value.earlyEnterMinutes ?? 0)
    /*
      必须用 dayjs 解析，不能用 new Date()。

      接口返回的是 '2026-08-20 00:00:00' 这种空格分隔的裸串，不是 ISO 8601。
      V8 宽容能解析，iOS Safari 会返回 Invalid Date —— 而考生端就跑在手机上。
      一旦得到 NaN，`Date.now() < NaN` 恒为 false，这道判定会静默失效、永远放行，
      比报错更糟。dayjs 自带解析器不依赖宿主实现，两端一致。
    */
    const startMs = dayjs(detail.value.startTime).valueOf()
    const openAt = startMs - earlyMin * 60 * 1000
    // 时间解析不出来时不拦：宁可放行让服务端权威校验去拒，也不要凭一个
    // NaN 把考生挡在门外（服务端 getExamPaper 用同一套规则兜底）
    if (Number.isFinite(startMs) && Date.now() < openAt) {
      showToast(
        earlyMin > 0
          ? `考试尚未开始，开考前 ${earlyMin} 分钟可进入`
          : '考试尚未开始'
      )
      return
    }
  }
  if (detail.value.status === EXAM_STATUS.FINISHED) {
    showToast('本场考试已结束')
    return
  }

  // 承诺书：开考前需签署时先弹确认，考生同意后才取卷
  if (detail.value.requireCommitment) {
    confirmCommitment()
    return
  }

  goAnswer()
}

/**
 * 跳转到作答页
 * 从 handleEnter 抽出：承诺书确认后也走这里，两条路径共用同一段跳转
 */
const goAnswer = () => {
  entering.value = true
  try {
    router.push(`/exam/answer/${examId}`)
  } finally {
    entering.value = false
  }
}

/**
 * 考试承诺书确认
 *
 * 用 Dialog 而非独立页面：这一项的语义是「开考前让考生确认一次」，
 * 不留签署痕迹（服务端也不校验，见 AppExamDetailVo.requireCommitment 说明），
 * 为一次性确认单开一个路由页不划算。
 *
 * 取消按钮文案用「返回」而非「取消」：考生此时的选择是「先不考」，
 * 说「取消」容易被理解为取消这场考试。
 */
const confirmCommitment = () => {
  showConfirmDialog({
    title: '考试承诺书',
    message:
      '本人承诺：\n' +
      '1. 由本人独立完成本场考试，不接受他人代考；\n' +
      '2. 不查阅资料、不使用通讯工具，不以任何方式作弊；\n' +
      '3. 遵守考场纪律，服从监考安排；\n' +
      '4. 如有违反，接受成绩作废及相应处理。',
    confirmButtonText: '同意并开始考试',
    cancelButtonText: '返回',
    messageAlign: 'left'
  })
    .then(goAnswer)
    .catch(() => {
      // 考生选择返回：停在详情页，不做任何跳转
    })
}

onMounted(loadDetail)
</script>

<style scoped>
.exam-detail-page {
  min-height: 100vh;
  background-color: var(--bg-page);
}

.content {
  padding: var(--spacing-md);
  /* 底部为固定操作栏留白 */
  padding-bottom: 96px;
}

.card {
  background-color: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: var(--spacing-md);
}

.card + .card {
  margin-top: var(--spacing-md);
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: var(--spacing-sm);
}

/*
  头卡浅蓝渐变：与下方三张纯白卡拉开层次，让考试名成为进页面第一落点。
  渐变收在很浅的区间（#eef4ff → 白），深了会把标题的黑字压下去。
*/
.hero-card {
  background-image: linear-gradient(160deg, #eef4ff 0%, #fbfcff 62%, var(--bg-card) 100%);
}

/*
  标题与状态同行：状态标签不换行独占一行，省下一段纵向空间。
  align-items 用 flex-start，标题折行时标签跟首行对齐而不是垂直居中。
*/
.hero-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-sm);
}

/*
  overflow-wrap 兜住无断点长串：中文本身逐字换行不会出问题，
  但考试名若是拼接 ID 一类的长英文数字串（无空格可断），
  默认不换行会溢出、视觉上挨上右侧的状态标签。
*/
.exam-name {
  flex: 1;
  min-width: 0;
  font-size: 22px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--text-primary);
  overflow-wrap: break-word;
}

/*
  状态胶囊。flex-shrink 0 让它不参与压缩：考试名过长时先挤标题，
  不把「进行中」压成两行。

  margin-top 4px 是估值，不是精确解。取值依据：.exam-name 为 22px/1.35，
  行盒 29.7px、半行距 (29.7-22)/2 ≈ 3.85px，胶囊高 22px 中心在自身顶下 11px，
  故 4px 上下能让两者中心大致对齐。

  说是估值而非算得，因为它依赖「中文字形在 em 盒内的垂直位置」，
  而字体栈跨平台 fallback（iOS 走 PingFang SC、Windows 走 Microsoft YaHei 等），
  各字体的 ascent/descent 度量不同，字形并不保证居中于 em 盒——
  真实最优值会随渲染字体在 1-2px 内浮动，3px 与 4px 在多数平台上看不出差别。
  不必再纠结这个数值；真要精确对齐只能等 text-box-trim 之类的能力普及。

  这个偏移必须自己给：.hero-head 是 align-items: flex-start，
  为的是标题折行时胶囊跟首行走而非整段居中。
  （给胶囊设与标题相同 line-height 不能替代——它是固定 height 22px
  的 inline-flex，内容靠 flex 居中，line-height 改不动其盒子几何位置。）
*/
.exam-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  margin-top: 4px;
  padding: 0 10px;
  height: 22px;
  font-size: 12px;
  font-weight: 500;
  /* 全圆角：直角小方块在这张圆角卡上显得生硬 */
  border-radius: 11px;
  white-space: nowrap;
  /*
    中性色放在基类兜底：已结束用它，出现预期外的状态值（如 unpublished）
    也仍是一枚完整胶囊，不会掉成没有底色的裸文字。
  */
  background-color: var(--bg-fill);
  color: var(--text-secondary);
}

/* 圆点只在进行中出现，尺寸压到 5px——它是辅助信号，不该跟文字抢注意力 */
.status-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background-color: currentColor;
}

/*
  三态配色都用「淡底 + 压深同色系文字」。
  文字色不直接取 --success-color(#00b42a)/--warning-color(#ff7d00)：
  压在各自淡底上只有 2.55:1 / 2.35:1，而 12px/500 不算 large text、门槛是 4.5:1。
  压深到 #00751a(5.42:1) 与 #b25700(4.52:1)，注意后者只高出门槛 0.02，
  若日后调淡底色需重算。

  这两个压深值目前是硬编码，全仓共 4 处、没有任何机制保证同步：
  本文件 2 处（下方 is-ongoing/is-published），
  ExamResult.vue 2 处（--score-accent 与 .warn-pill 各自独立写了 #b25700）。

  另有两处该压深但还没压：ScoreDetail.vue 与 ScoreList.vue 的
  .verdict--pass/--fail，仍直接用 --success-color / --unqualified-color，
  实测 2.55:1 / 2.49:1，均不达 4.5:1。即漂移已经发生，且是两处而非一处。

  注意本文件与它们语义不同：这里是考试的时间状态（进行中/未开始），
  那几处是合格判定。此处只是借用「绿=正向、橙=需留意」的视觉权重，
  并非同一概念。所以若日后收敛，应按语义各立一套 token
  （合格判定一套、考试状态一套，即便两套恰好取同色），
  而不是一个 token 名同时服务两种含义。
*/
.exam-status.is-ongoing {
  background-color: var(--success-light);
  color: #00751a;
}

.exam-status.is-published {
  background-color: var(--unqualified-light);
  color: #b25700;
}

/* 已结束是终态，沿用基类的中性灰，不占用语义色，故无需单独声明 */

.exam-desc {
  margin-top: 10px;
  font-size: 14px;
  line-height: 1.65;
  color: var(--text-secondary);
}

/* ── 起止时间 ─────────────────────────────── */
.time-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 30px;
  padding: 7px 0;
}

.time-row--divided {
  border-top: 1px solid var(--divider-color);
}

.time-label {
  font-size: 14px;
  color: var(--text-secondary);
}

/*
  日期用等宽数字：两行的年月日时分位数相同，
  比例数字下 08-20 与 08-21 的字宽会有细微差，右对齐时看着没对齐。
*/
.time-value {
  font-size: 14px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

/* ── 关键数字三格 ─────────────────────────── */
/* 纵向比通用卡片宽松些：三格是本页视觉重心，挤在 16px 内会显局促 */
/*
  数字层与上方日期层之间用实线分隔并留出更大间距：
  同卡内的两层信息读法不同（逐行 vs 并排扫），
  分隔比日期两行之间的 divider 重一档，才能读出「换了一种排布」。
*/
.stat-row {
  display: flex;
  align-items: stretch;
  /*
    9px 而非整数感更强的 14px：末行 .time-row 自带 7px 下内边距，
    9 + 7 = 16px 恰好与线下方的 padding-top 16px 相等，分隔线居中。
    数字区自身的上下留白也是对称的 16px（下方由 .card 的 padding 提供）。
  */
  margin-top: 9px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}

.stat {
  display: flex;
  flex: 1;
  /* 三格等分且允许收缩：总分/及格分那格字串最长，不设 min-width:0 会把另两格挤窄 */
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  /*
    兜底裁切。min-width:0 只解决 flex 层面的等分，管不了内容本身超宽——
    .stat-value 是 nowrap，极端分值（如 1000/1000）仍会横向撑出格子、压到邻格上。
    裁在格子边界比盖住旁边的数字好；这里不用 text-overflow：
    .stat-value 是 flex 容器，省略号对其内的文本节点不生效，
    且分数被截成「1000/6…」会读出错误信息，宁可整体裁掉一截。
  */
  overflow: hidden;
}

/* 竖分隔线用 border 而非独立元素，避免多出三个空节点 */
.stat + .stat {
  border-left: 1px solid var(--divider-color);
}

.stat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background-color: var(--primary-light);
  font-size: 18px;
  color: var(--primary-color);
}

/*
  数字与单位共用一行基线：单位 baseline 对齐而非居中，
  居中会让「分钟」浮在 500 的腰部。
*/
/*
  数值用近黑而非主色蓝：本页蓝色原本出现在图标底板、三个数值、须知序号、
  底部按钮四处，蓝同时担着品牌色与行动色，数值染蓝会跟「进入考试」抢焦点。
  23px/600 的字重字号本身已足够突出，不需要再靠颜色加码。
*/
.stat-value {
  display: flex;
  align-items: baseline;
  gap: 2px;
  font-size: 23px;
  font-weight: 600;
  line-height: 1.15;
  color: var(--text-primary);
  white-space: nowrap;
}

/*
  单位降到次级灰，与下方 .stat-label 同色：数值转近黑后，
  单位若留蓝会变成格子里唯一的蓝字、比数字本身更扎眼。
  同时顺带解决了原先的对比度问题——不再需要为 12px 小字另挑深一档的蓝。
*/
.stat-unit {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.stat-label {
  font-size: 12px;
  line-height: 1.35;
  color: var(--text-secondary);
  text-align: center;
}

/* ── 须知列表 ─────────────────────────────── */
/* 序号改用自绘徽标，故去掉 ol 默认的标记与缩进 */
.notice-list {
  padding-left: 0;
  list-style: none;
}

.notice-item {
  display: flex;
  gap: 9px;
}

.notice-item + .notice-item {
  margin-top: 11px;
}

/*
  序号徽标：固定 18px 圆形，flex-shrink:0 防止长文案把圆压成椭圆。
  margin-top 让圆心对齐首行文字的视觉中线（13px 字 × 1.7 行高）。
*/
.notice-index {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  border-radius: 50%;
  /* 11px 白字压蓝底要 4.5:1，--primary-color(#1171F8) 只有 4.43，故用深一档的 #0c66f2 */
  background-color: #0c66f2;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
}

.notice-text {
  flex: 1;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
}

/* 底部固定操作栏，含安全区 */
/*
  与交卷详情页同一套：底栏取页面底色、去掉硬边框，
  上方垫一段渐变让滚动内容淡入而不是在底栏边缘被截断。
  白底 + 硬边框在内容少时会显成一条脱离页面的白条。
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

/* 信息项已改为自绘布局，不再有 van-cell 需要覆盖内边距 */
</style>
