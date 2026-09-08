<!--
  组件名称：AppSkeleton - 骨架屏

  为什么不用 van-skeleton：
    Vant 的骨架屏只有「头像 + 若干等宽段落」一种形态，套在本项目的卡片上
    与真实内容的块位对不上，数据到位时会整体重排，反而比转圈更跳。

  为什么替换 van-loading：
    转圈只表示「在等」，不提示将要出现什么，且从转圈切到整页内容是一次突变。
    骨架屏提前把版式占住，数据到位时只是「灰块变文字」，没有位移。

  变体（variant）与对应页面：
    card-list   标题+标签、描述、四项信息网格   考试列表
    text-card   标题+标签、两行文字             消息列表、证书列表、错题本
    split-card  左信息 + 右数值块               成绩列表、任务列表
    detail      左标题+标签+描述 + 信息行       考试详情
    score       居中大号数值 + 信息行           成绩详情、交卷详情
    article     标题 + 元信息行 + 正文段落      消息详情
    image       大图占位 + 信息行               证书详情
    form        若干「标签 + 输入框」           资料编辑、练习设置
    row-list    图标 + 两行 + 右值              首页待考提醒（配 bare 用）

  新增变体前先确认现有的哪个与目标页块位一致；宁可复用近似的，
  也不要留一个块位对不上的骨架——那会在加载完成时产生可见跳动。
-->

<template>
  <div
    class="skeleton"
    :class="[`skeleton--${variant}`, { 'skeleton--bare': bare }]"
    role="status"
    aria-busy="true"
  >
    <!-- 骨架块是纯占位，读屏无需逐块念，用一句话概括加载状态 -->
    <span class="skeleton-sr">内容加载中</span>

    <template v-if="variant === 'card-list'">
      <div v-for="i in count" :key="i" class="sk-card">
        <div class="sk-head">
          <span class="sk-bar sk-title"></span>
          <span class="sk-bar sk-tag"></span>
        </div>
        <span class="sk-bar sk-line sk-line--long"></span>
        <div class="sk-meta">
          <span v-for="m in 4" :key="m" class="sk-meta-item">
            <span class="sk-bar sk-meta-label"></span>
            <span class="sk-bar sk-meta-value"></span>
          </span>
        </div>
      </div>
    </template>

    <template v-else-if="variant === 'text-card'">
      <div v-for="i in count" :key="i" class="sk-card">
        <div class="sk-head">
          <span class="sk-bar sk-title"></span>
          <span class="sk-bar sk-tag"></span>
        </div>
        <span class="sk-bar sk-line sk-line--long"></span>
        <span class="sk-bar sk-line sk-line--short"></span>
      </div>
    </template>

    <template v-else-if="variant === 'split-card'">
      <div v-for="i in count" :key="i" class="sk-card sk-split">
        <span class="sk-split-main">
          <span class="sk-bar sk-title"></span>
          <span class="sk-bar sk-line sk-line--long"></span>
        </span>
        <span class="sk-split-side">
          <span class="sk-bar sk-side-num"></span>
          <span class="sk-bar sk-side-tag"></span>
        </span>
      </div>
    </template>

    <template v-else-if="variant === 'detail'">
      <div class="sk-card">
        <span class="sk-bar sk-title sk-title--wide"></span>
        <span class="sk-bar sk-tag sk-tag--block"></span>
        <span class="sk-bar sk-line sk-line--long"></span>
        <span class="sk-bar sk-line sk-line--short"></span>
      </div>
      <div class="sk-card">
        <span v-for="i in count" :key="i" class="sk-cell">
          <span class="sk-bar sk-cell-label"></span>
          <span class="sk-bar sk-cell-value"></span>
        </span>
      </div>
    </template>

    <template v-else-if="variant === 'score'">
      <div class="sk-card sk-center">
        <span class="sk-bar sk-title sk-title--center"></span>
        <span class="sk-bar sk-big"></span>
        <span class="sk-bar sk-pill"></span>
      </div>
      <div class="sk-card">
        <span v-for="i in count" :key="i" class="sk-cell">
          <span class="sk-bar sk-cell-label"></span>
          <span class="sk-bar sk-cell-value"></span>
        </span>
      </div>
    </template>

    <template v-else-if="variant === 'article'">
      <div class="sk-card">
        <span class="sk-bar sk-title sk-title--wide"></span>
        <span class="sk-bar sk-tag sk-tag--block"></span>
        <!-- 正文段落：末行收窄，读作一段自然结束的文字而非等宽色块 -->
        <span
          v-for="i in count"
          :key="i"
          class="sk-bar sk-para"
          :class="{ 'sk-para--last': i === count }"
        ></span>
      </div>
    </template>

    <template v-else-if="variant === 'image'">
      <div class="sk-stage"></div>
      <div class="sk-card">
        <span v-for="i in count" :key="i" class="sk-cell">
          <span class="sk-bar sk-cell-label"></span>
          <span class="sk-bar sk-cell-value"></span>
        </span>
      </div>
    </template>

    <template v-else-if="variant === 'row-list'">
      <div class="sk-rows">
        <div v-for="i in count" :key="i" class="sk-row">
          <span class="sk-icon"></span>
          <span class="sk-row-main">
            <span class="sk-bar sk-row-title"></span>
            <span class="sk-bar sk-row-sub"></span>
          </span>
          <span class="sk-bar sk-row-value"></span>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="sk-card">
        <span v-for="i in count" :key="i" class="sk-field">
          <span class="sk-bar sk-field-label"></span>
          <span class="sk-bar sk-field-input"></span>
        </span>
      </div>
    </template>
  </div>
</template>

<script setup>
defineProps({
  /** 骨架形态，取值与对应页面见文件头注释 */
  variant: {
    type: String,
    default: 'card-list'
  },
  /**
   * 重复块数（列表为卡片数，detail/score/image 为信息行数，article 为段落数）
   *
   * 默认 3：首屏一般只露出两三条，铺满整屏反而在数据到位时留下大片同时消失的灰块。
   */
  count: {
    type: Number,
    default: 3
  },
  /**
   * 去掉外层内边距与卡片底色
   *
   * 用于嵌进页面已有的卡片里（如首页待考提醒区块）——
   * 不去掉会在既有卡片内再套一层白底和边距，比真实内容多出一圈留白。
   */
  bare: {
    type: Boolean,
    default: false
  }
})
</script>

<style scoped>
.skeleton {
  padding: var(--spacing-md);
}

/* 嵌入既有卡片时：外层不出边距，内层容器也不画白底与圆角 */
.skeleton--bare {
  padding: 0;
}

.skeleton--bare .sk-card,
.skeleton--bare .sk-rows {
  padding: 0;
  border-radius: 0;
  background-color: transparent;
}

/* 读屏专用文本：视觉隐藏但不脱离无障碍树（display:none 会被读屏跳过） */
.skeleton-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

/*
  灰块本体
  背景做一道横向微光扫过，表示「正在加载」而非「加载失败留下的空块」。
  用 background-position 位移而非改宽高或 transform，避免触发重排。
*/
.sk-bar,
.sk-icon,
.sk-stage {
  display: block;
  border-radius: 4px;
  background-color: #eef0f3;
  background-image: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.85), transparent);
  background-repeat: no-repeat;
  background-size: 160px 100%;
  animation: sk-shimmer 1.3s ease-in-out infinite;
}

@keyframes sk-shimmer {
  from {
    background-position: -160px 0;
  }

  to {
    background-position: calc(100% + 160px) 0;
  }
}

/*
  关掉动画而非隐藏骨架：前庭功能敏感的用户仍需知道此处在加载，
  静态灰块配上面的读屏文本已能表达，不必闪动
*/
@media (prefers-reduced-motion: reduce) {
  .sk-bar,
  .sk-icon,
  .sk-stage {
    animation: none;
  }
}

/* 卡片容器：与真实内容卡片同底色、同圆角、同间距，避免加载完成时位移 */
.sk-card {
  padding: var(--spacing-md);
  border-radius: var(--radius-lg);
  background-color: var(--bg-card);
}

/*
  卡间距按变体取值，对齐各自目标页的真实值——差一档会在数据到位时整列上下位移。
  考试列表与考试详情用 16px；消息/证书/错题/成绩列表与交卷详情用 8px。
*/
.sk-card + .sk-card {
  margin-top: var(--spacing-sm);
}

.skeleton--card-list .sk-card + .sk-card,
.skeleton--detail .sk-card + .sk-card {
  margin-top: var(--spacing-md);
}

/* ── 共用块 ───────────────────────────────── */

.sk-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* 宽度用百分比而非定值：标题长度本就不齐，百分比在各屏宽下都自然 */
.sk-title {
  width: 52%;
  height: 18px;
}

.sk-title--wide {
  width: 72%;
}

.sk-title--center {
  width: 60%;
  /* 块级元素不吃父级 text-align，用 auto 左右边距居中 */
  margin: 0 auto;
}

.sk-tag {
  width: 48px;
  height: 20px;
  border-radius: 10px;
}

/* 详情页里标签独占一行（不与标题同行），需要自己的上边距 */
.sk-tag--block {
  margin-top: 12px;
}

.sk-line {
  height: 13px;
  margin-top: 12px;
}

.sk-line--long {
  width: 70%;
}

.sk-line--short {
  width: 44%;
}

/* ── card-list：考试列表 ──────────────────── */

/* 间距对齐 ExamList 的 .exam-meta：xs 行距、sm 列距、sm 上边距 */
.sk-meta {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-xs) var(--spacing-sm);
  margin-top: var(--spacing-sm);
  padding-top: var(--spacing-sm);
  border-top: 1px solid var(--border-color);
}

/* 真实内容是「标签 值」同行并排（.meta-item 为 flex），骨架须同构，否则加载完成时整块重排 */
.sk-meta-item {
  display: flex;
  gap: 4px;
}

.sk-meta-label {
  flex-shrink: 0;
  width: 40px;
  height: 13px;
}

.sk-meta-value {
  flex: 1;
  min-width: 0;
  height: 13px;
}

/* ── split-card：成绩/任务列表 ────────────── */

.sk-split {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sk-split-main {
  display: block;
  flex: 1;
  /* 右侧数值块定宽，左侧需能被压缩，否则长标题会把数值挤出卡片 */
  min-width: 0;
  margin-right: var(--spacing-md);
}

/* 左侧已被右侧数值块限宽，标题再取 52% 会短得不成比例 */
.sk-split .sk-title {
  width: 78%;
}

.sk-split-side {
  display: block;
  flex-shrink: 0;
}

.sk-side-num {
  width: 62px;
  height: 26px;
}

.sk-side-tag {
  width: 44px;
  height: 18px;
  margin-top: 8px;
  /* 顶到右侧与真实卡片的右对齐一致 */
  margin-left: auto;
  border-radius: 9px;
}

/* ── row-list：首页待考提醒 ───────────────── */

/* 多行共处一张卡内，用卡内分隔线而非逐行独立卡，与真实列表一致 */
.sk-rows {
  padding: 0 var(--spacing-md);
  border-radius: var(--radius-lg);
  background-color: var(--bg-card);
}

.sk-row {
  display: flex;
  align-items: center;
  height: 68px;
}

.sk-row + .sk-row {
  border-top: 1px solid var(--border-color);
}

.sk-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 10px;
}

.sk-row-main {
  display: block;
  flex: 1;
  min-width: 0;
  margin-left: 12px;
}

.sk-row-title {
  width: 58%;
  height: 16px;
}

.sk-row-sub {
  width: 36%;
  height: 12px;
  margin-top: 8px;
}

.sk-row-value {
  flex-shrink: 0;
  width: 40px;
  height: 14px;
  margin-left: 8px;
}

/* ── score：成绩详情 / 交卷详情 ───────────── */

.sk-center {
  text-align: center;
}

/* 对应真实页面的大号分数，比其他块明显高一档 */
.sk-big {
  width: 96px;
  height: 34px;
  margin: 16px auto 0;
}

.sk-pill {
  width: 72px;
  height: 22px;
  margin: 14px auto 0;
  border-radius: 11px;
}

/* ── detail / score / image 共用的信息行 ──── */

.sk-cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
}

.sk-cell + .sk-cell {
  border-top: 1px solid var(--border-color);
}

.sk-cell-label {
  width: 76px;
  height: 14px;
}

.sk-cell-value {
  width: 56px;
  height: 14px;
}

/* ── article：消息详情 ────────────────────── */

.sk-para {
  width: 100%;
  height: 13px;
  margin-top: 14px;
}

/* 末段收窄，读作一段自然结束的文字而非等宽色块 */
.sk-para--last {
  width: 52%;
}

/* ── image：证书详情 ──────────────────────── */

/*
  证书按 A4 竖版比例（420:594）占位。
  用 aspect-ratio 而非固定高度：证书图本身是等比缩放到屏宽的，
  写死高度在不同屏宽下会与真实图差出一截，加载完成时整页上下跳。
*/
.sk-stage {
  width: 100%;
  aspect-ratio: 420 / 594;
  margin-bottom: var(--spacing-md);
  border-radius: var(--radius-lg);
}

/* ── form：资料编辑 / 练习设置 ────────────── */

.sk-field {
  display: block;
}

.sk-field + .sk-field {
  margin-top: var(--spacing-lg);
}

.sk-field-label {
  width: 64px;
  height: 13px;
}

.sk-field-input {
  width: 100%;
  height: 40px;
  margin-top: 10px;
  border-radius: 8px;
}



</style>
