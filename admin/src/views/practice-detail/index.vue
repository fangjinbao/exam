<!--
  练习详情独立页：页内 Tab 切「练习详情 / 练习记录」。
  原为弹窗，但练习记录要分页、要按人下钻看每次作答，弹窗里塞不下也不便回看，故独立成页。
  详情数据在本页拉一次：页头的名称与状态、详情 Tab 的内容共用同一份，避免两处各拉一遍。
-->
<template>
  <div class="practice-detail">
    <!-- 顶部：返回 + 标题（与 practice-edit 同构） -->
    <div class="page-header">
      <ElButton link :icon="ArrowLeft" class="back-btn" @click="handleBack">返回练习列表</ElButton>
      <span class="header-divider" />
      <span class="page-title">{{ detailData?.name || '练习详情' }}</span>
      <ElTag
        v-if="detailData"
        :type="statusTagType(detailData.status)"
        size="small"
        disable-transitions
      >
        {{ PRACTICE_STATUS_TEXT[detailData.status] || detailData.status }}
      </ElTag>
    </div>

    <div class="body-card">
      <ElTabs v-model="activeTab" class="detail-tabs">
        <ElTabPane label="练习详情" name="info">
          <PracticeInfoTab :detail="detailData" :loading="detailLoading" />
        </ElTabPane>
        <!-- lazy 挂在 ElTabPane 上才生效：默认所有 pane 一进页面就渲染，
             记录列表是全量聚合查询，没必要在只看详情时也跑一遍 -->
        <ElTabPane label="练习记录" name="record" lazy>
          <PracticeRecordTab v-if="practiceId" :practice-id="practiceId" />
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
  import {
    practiceApi,
    PRACTICE_STATUS_TEXT,
    practiceStatusTagType as statusTagType,
    type PracticeDetail
  } from '@/api/practice'
  import PracticeInfoTab from './components/PracticeInfoTab.vue'
  import PracticeRecordTab from './components/PracticeRecordTab.vue'

  defineOptions({ name: 'PracticeDetail' })

  const route = useRoute()
  const router = useRouter()

  const activeTab = ref<'info' | 'record'>('info')
  const detailLoading = ref(false)
  const detailData = ref<PracticeDetail | null>(null)

  /** 路由 query 上的练习 ID；非法值视为缺失，交由 onMounted 兜底提示 */
  const practiceId = computed(() => {
    const raw = Number(route.query.id)
    return Number.isInteger(raw) && raw > 0 ? raw : 0
  })

  /*
    回列表指向 /practice/assigned 而非 /practice。

    /practice 现在是目录，其默认子路由 isHide，落在它上面侧边栏不会高亮到「岗位练兵」；
    详情只从岗位练兵列表进入，故直接回那一页。
  */
  function handleBack() {
    router.push('/practice/assigned')
  }

  onMounted(async () => {
    if (!practiceId.value) {
      ElMessage.error('缺少练习 ID')
      router.push('/practice/assigned')
      return
    }
    detailLoading.value = true
    try {
      const { data } = await practiceApi.getDetail(practiceId.value)
      detailData.value = data
    } catch (e: any) {
      ElMessage.error(e?.message || '获取练习详情失败')
    } finally {
      detailLoading.value = false
    }
  })
</script>

<style lang="scss" scoped>
  .practice-detail {
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: 100%;

    // 页头与 practice-edit 保持一致：无卡片，返回按钮 + 竖线 + 标题
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

        // 胶囊式页签：卡片里再画一条贯穿的下划线，会与卡片边框、下方表头线堆成三道横线；
        // 换成分段控件后页签自己成块，与内容区分离得更干净
        @include capsuleTabs(34px);

        // 卡片上内边距只有 8px，页签再贴近一点顶边会显局促，补 4px
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
