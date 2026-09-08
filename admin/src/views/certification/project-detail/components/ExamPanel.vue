<!--
  考试安排 Tab：列出关联到本鉴定项目的考试。

  关联关系来自 Exam.certProjectId：在「考试管理」建考试时选「技能鉴定考试」
  并绑定本项目，这里就会出现。绑定后该场考试的考生名单由本项目审核通过的
  报名记录派生，不接受手工增删。
-->

<template>
  <div v-loading="loading" class="info-tab">
    <InfoPanel title="关联考试" :sub="examSub" plain>
      <ElTable :data="exams" size="small" style="width: 100%">
        <ElTableColumn prop="name" label="考试名称" min-width="220" show-overflow-tooltip />
        <ElTableColumn label="状态" width="100" align="center">
          <template #default="{ row }">
            <ElTag :type="tagType(row.status)" size="small" disable-transitions>
              {{ STATUS_TEXT[row.status] || row.status }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="开始时间" min-width="170" show-overflow-tooltip>
          <template #default="{ row }">{{ row.startTime }}</template>
        </ElTableColumn>
        <ElTableColumn label="结束时间" min-width="170" show-overflow-tooltip>
          <template #default="{ row }">{{ row.endTime }}</template>
        </ElTableColumn>
        <ElTableColumn prop="passScore" label="及格分" width="90" align="center" />
        <ElTableColumn label="操作" width="90" align="center" fixed="right">
          <template #default="{ row }">
            <ElButton link type="primary" @click="goExamDetail(row.id)">查看</ElButton>
          </template>
        </ElTableColumn>
        <template #empty>
          <span class="placeholder">
            尚未关联考试。在「考试管理」创建考试时选择「技能鉴定考试」并绑定本项目即可在此看到。
          </span>
        </template>
      </ElTable>
    </InfoPanel>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useRouter } from 'vue-router'
  import InfoPanel from '@/components/business/detail/InfoPanel.vue'
  import type { CertProgressExam } from '@/api/certProject'

  const props = defineProps<{
    exams: CertProgressExam[]
    loading: boolean
  }>()

  const router = useRouter()

  /** 与 Exam.status 的四态对齐（见 schema：unpublished/published/ongoing/finished） */
  const STATUS_TEXT: Record<string, string> = {
    unpublished: '未发布',
    published: '已发布',
    ongoing: '进行中',
    finished: '已结束'
  }

  function tagType(status: string) {
    if (status === 'finished') return 'success'
    if (status === 'ongoing') return 'primary'
    if (status === 'published') return 'warning'
    return 'info'
  }

  const examSub = computed(() => {
    const n = props.exams.length
    if (n === 0) return ''
    const finished = props.exams.filter((e) => e.status === 'finished').length
    return finished > 0 ? `${n} 场 · ${finished} 场已结束` : `${n} 场`
  })

  /** 按 path 跳：后端菜单驱动下路由名由 router 派生（/exam-detail → Exam-detail） */
  function goExamDetail(id: number) {
    router.push({ path: '/exam-detail', query: { id } })
  }
</script>

<style lang="scss" scoped>
  .info-tab {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .placeholder {
    color: var(--el-text-color-placeholder);
  }
</style>
