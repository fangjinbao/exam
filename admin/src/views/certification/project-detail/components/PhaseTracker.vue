<!--
  阶段进度条（竖排）：左栏进度指示 + 面板导航，两件事合一。

  视觉规格照 Element Plus 自己的竖排步骤条来（node_modules/element-plus 的 el-step.css）：
  24px 级圆点、2px 描边、2px 连线、14px 标题、12px 描述，不自造一套。
  不直接用 ElSteps 的原因：它没有「正在看哪个面板」这层状态，
  且每行要做成可点的整块命中区，改它的内部结构比自己排更绕。

  连线的做法同样照它：线贯穿整行（top/bottom 通到边），由不透明的圆点盖住中段。
  不要给线两端留空隙、也不要给圆点加白色光环——那会把线切成看不出连贯的短条。

  布局分两列：轨道列（圆点 + 连线，定宽无底色）| 文字列（选中/悬停底色只落这里）。
  底色不铺满整行，是为了让它与连线彻底不相交——否则底色会整块压住线，
  得靠 z-index 层层去救，那是把简单问题做复杂了。

  两套独立状态不能混：
  - state（done/current/pending）是业务进度，用圆点与连线颜色表达
  - active 是「正在看哪个面板」，用整行中性灰底表达
  项目停在报名阶段、用户却点开考试面板看安排，是常见情形。
-->

<template>
  <ol class="phase-tracker">
    <li
      v-for="node in nodes"
      :key="node.key"
      class="phase-node"
      :class="[`is-${node.state}`, { 'is-active': node.key === activeKey }]"
      :aria-current="node.state === 'current' ? 'step' : undefined"
    >
      <button type="button" class="node-hit" @click="emit('select', node.key)">
        <!-- 轨道列：只放圆点与连线，定宽，不带任何底色 -->
        <span class="node-rail">
          <span class="node-dot">
            <ElIcon class="dot-icon">
              <!-- 已完成统一换成对勾：过了的步骤不必再区分它原本是哪一步 -->
              <Check v-if="node.state === 'done'" />
              <component :is="node.icon" v-else />
            </ElIcon>
          </span>
        </span>
        <!-- 文字列：选中/悬停的底色只落在这一列上 -->
        <span class="node-body">
          <span class="node-title">{{ node.title }}</span>
          <span class="node-desc">{{ node.desc }}</span>
          <span v-if="node.note" class="node-note">{{ node.note }}</span>
        </span>
        <!-- 状态对视力正常的人靠颜色与图形传达，读屏器需要文字 -->
        <span class="sr-only">{{ STATE_TEXT[node.state] }}</span>
      </button>
    </li>
  </ol>
</template>

<script setup lang="ts">
  import { type Component } from 'vue'
  import { Check } from '@element-plus/icons-vue'

  defineOptions({ name: 'PhaseTracker' })

  export interface PhaseNode {
    key: string
    title: string
    desc: string
    /** 该阶段的业务图标（未完成时显示；已完成统一显示对勾） */
    icon: Component
    /** 节点下方的实时注解，如「已报 8 人」；无则不显示 */
    note?: string
    state: 'done' | 'current' | 'pending'
  }

  defineProps<{
    nodes: PhaseNode[]
    /** 当前展示的面板 key（界面状态，与 node.state 的业务进度无关） */
    activeKey: string
  }>()

  const emit = defineEmits<{ select: [key: string] }>()

  const STATE_TEXT: Record<PhaseNode['state'], string> = {
    done: '（已完成）',
    current: '（当前阶段）',
    pending: '（未开始）'
  }
</script>

<style lang="scss" scoped>
  $dot: 26px; // 圆点直径（Element 步骤条是 24px，这里带图标略放大）
  $track: 2px; // 连线粗细，与 Element 一致
  $gap: 14px; // 行间距（连线穿过这段空白连到下一个圆点）
  $rail-gap: 10px; // 轨道列与文字列的间距

  // 文字列的纵向内边距。圆点要与标题首行对齐，故轨道列用同一个值下压，
  // 连线的起点也依赖它——写死数字改一处就错位
  $pad-y: 8px;

  .phase-tracker {
    padding: 0;
    margin: 0;
    list-style: none;
  }

  .phase-node {
    position: relative;
    padding-bottom: $gap;

    &:last-child {
      padding-bottom: 0;
    }
  }

  /*
    连线：从本行圆点顶部一路通到下一行圆点顶部，中段由不透明的圆点盖住。

    这是 Element 竖排步骤条的做法（线 top/bottom 通到边、圆点 z-index 压在上面）。
    关键是别在两端留空隙：留了空隙线就成了一截截悬空的短条，看不出连贯。

    top 取 $pad-y（= 圆点顶）：从 0 起会在第一行圆点上方露出一截。
    bottom 取 -$pad-y：越过本行下边界，正好接到下一行圆点顶部——
    下一行的线也从它自己的 $pad-y 起，两段首尾相接，整条不断。

    横向落在轨道列的中线上：轨道列从行的 x=0 起，故圆心就是半径。
  */
  .phase-node:not(:last-child)::after {
    position: absolute;
    top: $pad-y;
    bottom: calc(-1 * #{$pad-y});
    left: calc(#{$dot} / 2 - #{$track} / 2);
    width: $track;
    content: '';
    background: var(--el-border-color);
    transition: background-color 0.2s;
  }

  // 走过的那段染成主色：与灰色未走段拉开对比，这条线才有「进度」的意思
  .phase-node.is-done:not(:last-child)::after {
    background: var(--el-color-primary);
  }

  // 整行可点：命中区做满整行而不只是圆点，小目标点起来费劲
  // 整行可点：命中区做满整行而不只是圆点，小目标点起来费劲。
  // 本身不带底色——底色在 .node-body 上，避开连线
  .node-hit {
    display: flex;
    gap: $rail-gap;
    width: 100%;
    padding: 0;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;
    background: none;
    border: 0;
  }

  // 轨道列：定宽 = 圆点直径，圆点下压 $pad-y 与文字列的标题首行对齐
  .node-rail {
    flex-shrink: 0;
    width: $dot;
    padding-top: $pad-y;
  }

  .node-dot {
    position: relative;

    // 抬到连线之上：::after 在兄弟中最后绘制，不设层级线会盖在圆点上
    z-index: 1;
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: $dot;
    height: $dot;
    color: var(--el-text-color-placeholder);

    // 不透明且与卡片同底色：靠它盖住穿过来的连线。透明的话线会从圆点里穿出去
    background: var(--el-bg-color-overlay);
    border: $track solid var(--el-border-color);
    border-radius: 50%;
    transition:
      color 0.2s,
      background-color 0.2s,
      border-color 0.2s;
  }

  .dot-icon {
    font-size: 13px;
  }

  // 文字列：内边距、圆角、底色都在这里。横向不与轨道列相交，底色永远碰不到连线
  .node-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    padding: $pad-y 10px calc(#{$pad-y} + 1px);
    border-radius: 6px;
    transition: background-color 0.2s;
  }

  // 标题 14px / 描述 12px，与 Element 步骤条同级
  .node-title {
    font-size: 14px;
    line-height: 26px; // 与圆点等高，两者基线对齐
    color: var(--el-text-color-regular);
    transition: color 0.2s;
  }

  .node-desc {
    font-size: 12px;
    line-height: 1.5;
    color: var(--el-text-color-placeholder);
  }

  // 实时注解：纯文字弱化处理。不做成实心徽标——那在窄栏里过重，抢掉标题
  .node-note {
    margin-top: 3px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--el-text-color-secondary);
  }

  /*
    ---- 业务进度：三态 ----

    照 Element 步骤条的配色约定：
    已完成（is-finish）主色描边 + 主色图标，白底；当前（is-process）主色实心 + 白图标；
    未开始（is-wait）灰描边 + 灰图标。不加渐变、光晕、脉冲——那些是自造视觉，不是主流做法。
  */
  .phase-node.is-done {
    .node-dot {
      color: var(--el-color-primary);
      border-color: var(--el-color-primary);
    }
  }

  .phase-node.is-current {
    .node-dot {
      color: #fff;
      background: var(--el-color-primary);
      border-color: var(--el-color-primary);
    }

    .node-title {
      font-weight: 600;
      color: var(--el-color-primary);
    }
  }

  /*
    ---- 界面状态：正在看的那一行 ----

    用中性灰底，与业务进度的主色分开：
    选中一个未开始的阶段时，若也上主色，会让人以为项目已经走到那里了。
    灰底选中是后台导航的通行做法（Element / Ant Design 的菜单选中项同款）。
  */
  .phase-node.is-active .node-body {
    background: var(--el-fill-color-light);
  }

  .phase-node.is-active .node-title {
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  // 当前阶段被选中时，标题保持主色（进度的表达优先于选中）
  .phase-node.is-active.is-current .node-title {
    color: var(--el-color-primary);
  }

  .node-hit:hover .node-body {
    background: var(--el-fill-color-lighter);
  }

  // 键盘焦点要看得见：命中区是 button，去掉了默认样式，须自己给焦点环。
  // 焦点环画在文字列上，与底色同范围，不越到轨道列去圈住连线
  .node-hit:focus-visible {
    outline: none;
  }

  .node-hit:focus-visible .node-body {
    outline: 2px solid var(--el-color-primary);
    outline-offset: 1px;
  }

  // 无障碍：只给读屏器的文字，视觉上不占位
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
</style>
