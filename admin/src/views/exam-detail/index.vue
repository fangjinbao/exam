<!--
  考试详情独立页：页内 Tab 切「考试详情 / 考生成绩」。
  原为弹窗，但考生成绩要分页、要筛选、还要导出，弹窗里塞不下，故独立成页（与练习详情同构）。
  详情数据在本页拉一次：页头的名称与状态、详情 Tab 的内容、导出文件名共用同一份，避免多处各拉一遍。
-->
<template>
  <div class="exam-detail">
    <div class="page-header">
      <ElButton link :icon="ArrowLeft" class="back-btn" @click="handleBack">返回考试列表</ElButton>
      <span class="header-divider" />
      <span class="page-title">{{ detailData?.name || '考试详情' }}</span>
      <ElTag
        v-if="detailData"
        :type="examStatusTagType(detailData.status)"
        size="small"
        disable-transitions
      >
        {{ EXAM_STATUS_TEXT[detailData.status] || detailData.status }}
      </ElTag>
    </div>

    <div class="body-card">
      <ElTabs v-model="activeTab" class="detail-tabs">
        <ElTabPane label="考试详情" name="info">
          <ExamInfoTab :detail="detailData" :loading="detailLoading" />
        </ElTabPane>
        <!-- lazy 挂在 ElTabPane 上才生效：成绩列表是全量聚合查询，
             没必要在只看详情时也跑一遍 -->
        <ElTabPane label="考生成绩" name="score" lazy>
          <ExamScoreTab v-if="examId" :exam-id="examId" :exam-name="detailData?.name || ''" />
        </ElTabPane>
      </ElTabs>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, onMounted } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { ElMessage } from 'element-plus'
  import { ArrowLeft } from '@element-plus/icons-vue'
  import { examApi, EXAM_STATUS_TEXT, examStatusTagType, type ExamDetail } from '@/api/exam'
  import ExamInfoTab from './components/ExamInfoTab.vue'
  import ExamScoreTab from './components/ExamScoreTab.vue'

  defineOptions({ name: 'ExamDetail' })

  const route = useRoute()
  const router = useRouter()

  const activeTab = ref<'info' | 'score'>('info')
  const detailLoading = ref(false)
  const detailData = ref<ExamDetail | null>(null)

  /** 路由 query 上的考试 ID；非法值视为缺失，交由 onMounted 兜底提示 */
  const examId = computed(() => {
    const raw = Number(route.query.id)
    return Number.isInteger(raw) && raw > 0 ? raw : 0
  })

  function handleBack() {
    router.push('/exam')
  }

  onMounted(async () => {
    if (!examId.value) {
      ElMessage.error('缺少考试 ID')
      router.push('/exam')
      return
    }
    detailLoading.value = true
    try {
      const { data } = await examApi.getDetail(examId.value)
      detailData.value = data
    } catch (e: any) {
      ElMessage.error(e?.message || '获取考试详情失败')
    } finally {
      detailLoading.value = false
    }
  })
</script>

<style lang="scss" scoped>
  .exam-detail {
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: 100%;

    // 页头与 exam-edit 保持一致：无卡片，返回按钮 + 竖线 + 标题
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

    // Tab 内容区独立滚动，页头固定不动
    .body-card {
      flex: 1;
      min-height: 0;
      padding: 8px 20px 20px;
      overflow: hidden;
      background: var(--el-bg-color);
      border-radius: 12px;

      .detail-tabs {
        display: flex;
        flex-direction: column;
        height: 100%;

        // 与 practice-detail 同构：胶囊式页签，见那边的说明
        @include capsuleTabs(34px);

        // 与 practice-detail 同构：补 4px 顶边距，见那边的说明
        :deep(.el-tabs__header) {
          margin-top: 4px;
        }

        :deep(.el-tabs__content) {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
        }

        :deep(.el-tab-pane) {
          height: 100%;
        }
      }
    }
  }
</style>
