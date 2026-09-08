<!--
  鉴定项目详情：把一个项目的四个阶段汇总在一页。

  为什么要这一页：报名、审核、考试三段能力本来就有，但分散在「鉴定报名」
  「报名审核」「考试管理」三个菜单里，看不到某个项目整体走到哪一步、
  各单位报了多少、审了多少、考得怎么样。

  阶段不落库，由 applyDeadline / 报名审核状态 / 关联考试运行时推导（见 currentPhase）。
  这个模块刚因为 status 与 publishStatus 两个状态字段语义重叠吃过亏，不再增设第三个状态字段。

  结构与 exam-detail 同构：本页只管页头、阶段导航与数据拉取，各阶段内容拆到 components。
-->
<template>
  <div class="cert-project-detail">
    <div class="page-header">
      <ElButton link :icon="ArrowLeft" class="back-btn" @click="handleBack">返回鉴定项目</ElButton>
      <span class="header-divider" />
      <span class="page-title">{{ project?.name || '鉴定项目详情' }}</span>
      <ElTag v-if="project" :type="phaseTagType" size="small" disable-transitions>
        {{ currentPhase.label }}
      </ElTag>
    </div>

    <!--
      左右布局：左栏竖排进度条兼作导航，右栏放对应面板。
      横排进度条要占掉整条页宽和一大截高度，把面板压到下面去。
    -->
    <div class="detail-body">
      <aside class="phase-side">
        <PhaseTracker
          :nodes="phaseNodes"
          :active-key="activeTab"
          @select="activeTab = $event as TabKey"
        />
      </aside>

      <!--
        右栏只渲染选中的那个面板：v-if 而非 v-show，
        各面板都含表格，没必要在只看其中一个时把四个都挂上。
      -->
      <section class="panel-side">
        <BaseInfoPanel v-if="activeTab === 'base'" :project="project" :loading="loading" />
        <EnrollPanel
          v-else-if="activeTab === 'enroll'"
          :project="project"
          :by-org="data?.byOrg || []"
          :loading="loading"
        />
        <AuditPanel
          v-else-if="activeTab === 'audit'"
          :project-id="projectId"
          :by-status="data?.byStatus || []"
          :loading="loading"
        />
        <ExamPanel v-else :exams="data?.exams || []" :loading="loading" />
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, onMounted, type Component } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { ElMessage } from 'element-plus'
  import { ArrowLeft, EditPen, UserFilled, Stamp, Trophy } from '@element-plus/icons-vue'
  import { certProjectApi, type CertProjectProgress } from '@/api/certProject'
  import PhaseTracker, { type PhaseNode } from './components/PhaseTracker.vue'
  import BaseInfoPanel from './components/BaseInfoPanel.vue'
  import EnrollPanel from './components/EnrollPanel.vue'
  import AuditPanel from './components/AuditPanel.vue'
  import ExamPanel from './components/ExamPanel.vue'

  defineOptions({ name: 'CertificationProjectDetail' })

  const route = useRoute()
  const router = useRouter()

  type TabKey = 'base' | 'enroll' | 'audit' | 'exam'

  /**
   * 阶段四格的固定文案与图标；状态与注解由 phaseNodes 按实时数据算
   *
   * 图标各自对应该阶段的动作：拟定项目 / 上报人员 / 盖章审核 / 考核发证，
   * 比四个序号更快认出这一步在干什么。
   */
  const PHASES: { key: TabKey; title: string; desc: string; icon: Component }[] = [
    { key: 'base', title: '项目创建', desc: '基础信息与名额', icon: EditPen },
    { key: 'enroll', title: '各单位报名', desc: '按名额上报人员', icon: UserFilled },
    { key: 'audit', title: '报名审核', desc: '通过或驳回', icon: Stamp },
    { key: 'exam', title: '组织考试', desc: '关联考试与结果', icon: Trophy }
  ]

  const activeTab = ref<TabKey>('base')
  const loading = ref(false)
  const data = ref<CertProjectProgress | null>(null)
  const project = computed(() => data.value?.project ?? null)

  /** 路由 query 上的项目 ID；非法值视为缺失，由 onMounted 兜底提示 */
  const projectId = computed(() => {
    const raw = Number(route.query.id)
    return Number.isInteger(raw) && raw > 0 ? raw : 0
  })

  /**
   * 当前阶段：由既有数据推导，不读任何 phase 字段
   *
   * 判断顺序即业务顺序，命中即返回：
   * 未发布 → 报名中（未过截止）→ 待审核（有 pending）→ 组织考试（审完了）
   */
  const currentPhase = computed(() => {
    const p = project.value
    if (!p) return { step: 0, label: '加载中', tag: 'info' as const }
    if (p.publishStatus !== 'published') {
      return { step: 0, label: '未发布', tag: 'info' as const }
    }
    const pending = data.value?.byStatus.find((s) => s.status === 'pending')?._count._all ?? 0
    const deadlinePassed = !!p.applyDeadline && new Date(p.applyDeadline).getTime() < Date.now()
    if (!deadlinePassed) return { step: 1, label: '报名中', tag: 'primary' as const }
    if (pending > 0) return { step: 2, label: '待审核', tag: 'warning' as const }
    const exams = data.value?.exams ?? []
    if (exams.length === 0) return { step: 3, label: '待安排考试', tag: 'warning' as const }
    const allFinished = exams.every((e) => e.status === 'finished')
    return allFinished
      ? { step: 4, label: '已完成', tag: 'success' as const }
      : { step: 3, label: '考试阶段', tag: 'primary' as const }
  })

  const phaseTagType = computed(() => currentPhase.value.tag)

  /**
   * 四个阶段节点的状态与实时注解
   *
   * 状态由 currentPhase.step 定位：小于它的已完成、等于它的是当前、大于的未开始。
   * step 4（已完成）大于所有下标，故四格全绿。
   *
   * 注解给的是各阶段的量（报了多少人、待审多少、几场考试），
   * 让人不点进 Tab 也能知道大概情况。
   */
  const phaseNodes = computed<PhaseNode[]>(() => {
    const step = currentPhase.value.step
    const byStatus = data.value?.byStatus ?? []
    const countOf = (k: string) => byStatus.find((s) => s.status === k)?._count._all ?? 0
    const applied = byStatus.reduce((sum, s) => sum + s._count._all, 0)
    const exams = data.value?.exams ?? []
    const quotaTotal = (project.value?.quotas || []).reduce((sum, q) => sum + (q.quota || 0), 0)

    const notes: Record<TabKey, string> = {
      base: quotaTotal > 0 ? `共 ${quotaTotal} 个名额` : '',
      enroll: applied > 0 ? `已报 ${applied} 人` : '',
      audit:
        countOf('pending') > 0
          ? `待审 ${countOf('pending')} 人`
          : countOf('approved') > 0
            ? `通过 ${countOf('approved')} 人`
            : '',
      exam: exams.length > 0 ? `${exams.length} 场考试` : ''
    }

    return PHASES.map((p, i) => ({
      key: p.key,
      title: p.title,
      desc: p.desc,
      icon: p.icon,
      note: notes[p.key],
      state: i < step ? 'done' : i === step ? 'current' : 'pending'
    }))
  })

  async function loadData() {
    if (!projectId.value) return
    loading.value = true
    try {
      // 与本模块其余调用一致：解构出 data，request 返回的是带 code/message 的整包
      const res = await certProjectApi.progress(projectId.value)
      data.value = res.data
    } catch (error: any) {
      ElMessage.error(error?.message || '加载鉴定项目详情失败')
    } finally {
      loading.value = false
    }
  }

  function handleBack() {
    // 按 path 跳：后端菜单驱动下路由名由 router 派生，与静态路由的 name 不一定一致
    router.push({ path: '/certification/project' })
  }

  onMounted(() => {
    if (!projectId.value) {
      ElMessage.error('缺少鉴定项目 ID')
      return
    }
    loadData()
  })
</script>

<style lang="scss" scoped>
  // 整体骨架与 exam-detail / practice-detail 同构：页头不带卡片，内容区独立滚动
  .cert-project-detail {
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: 100%;

    .page-header {
      display: flex;
      flex-shrink: 0;
      align-items: center;
      gap: 12px;
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

    // 左右两栏：左栏定宽，右栏吃掉剩余宽度并独立滚动
    .detail-body {
      display: flex;
      flex: 1;
      gap: 16px;
      min-height: 0;
    }

    /*
      左栏：与 InfoPanel 同款白卡（同圆角同边框），避免自成一套观感。

      align-self 收成内容高度：默认 stretch 会把卡片拉到与右栏等高，
      四行进度下面拖一大片空白，看着像没加载完。
    */
    .phase-side {
      flex-shrink: 0;
      align-self: flex-start;
      width: 220px;
      padding: 12px 8px;
      background: var(--el-bg-color-overlay);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: 12px;
    }

    // 右栏独立滚动：左栏进度条与页头始终可见
    .panel-side {
      flex: 1;
      min-width: 0;
      padding-right: 4px; // 留出滚动条位置，免得内容贴边
      overflow-y: auto;
    }

    // 窄屏：左右挤不开，改成上下叠——左栏铺满宽度置顶，面板接在下面
    @media (max-width: 900px) {
      .detail-body {
        flex-direction: column;
      }

      .phase-side {
        width: auto;
      }

      .panel-side {
        overflow: visible;
      }
    }
  }
</style>
