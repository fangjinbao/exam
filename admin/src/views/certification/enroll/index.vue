<!--
  鉴定报名：单位管理员按本单位名额给人员报名

  只列已发布、且给本单位分了名额的项目——没分到名额的项目对该单位没有意义，
  列出来只会让人点进去发现无处可报。单位由服务端按登录账号推导，页面不传。
-->
<template>
  <div class="cert-enroll">
    <ElCard shadow="never" class="tip-card">
      <ElAlert type="info" :closable="false" show-icon>
        <template #title>
          下列是已发布且分配了本单位名额的鉴定项目。点「报名」按名额挑选本单位人员，
          提交后进入待审核，可在名额未审前撤销。
        </template>
      </ElAlert>
    </ElCard>

    <ElCard shadow="never" class="table-card">
      <ElTable v-loading="loading" :data="list" stripe>
        <ElTableColumn prop="name" label="鉴定名称" min-width="200" show-overflow-tooltip />
        <ElTableColumn prop="occupationName" label="工种" min-width="130" show-overflow-tooltip />
        <ElTableColumn prop="levelName" label="级别" min-width="110" show-overflow-tooltip />
        <ElTableColumn label="报名截止" width="150" align="center">
          <template #default="{ row }">{{ toMinute(row.applyDeadline) }}</template>
        </ElTableColumn>
        <ElTableColumn label="鉴定时间" min-width="190">
          <template #default="{ row }">
            {{ toMinute(row.startTime) }} ~ {{ toMinute(row.endTime) }}
          </template>
        </ElTableColumn>
        <!-- 名额是该单位全部名额行的合计，具体到部门要点进去看 -->
        <ElTableColumn label="本单位名额" width="140" align="center">
          <template #default="{ row }">
            <!-- 账号没归属单位时后端给 null，与「有单位但没分到名额」(0) 不是一回事 -->
            <span v-if="row.quotaTotal === null" class="muted">—</span>
            <span v-else-if="row.quotaTotal === 0" class="muted">未分配名额</span>
            <span v-else>
              {{ row.quotaUsed }} / {{ row.quotaTotal }}
              <ElTag v-if="row.quotaRemain > 0" type="success" size="small" effect="plain">
                余 {{ row.quotaRemain }}
              </ElTag>
              <ElTag v-else type="info" size="small" effect="plain">已报满</ElTag>
            </span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="状态" width="100" align="center">
          <template #default="{ row }">
            <ElTag v-if="row.closed" type="danger" size="small">已截止</ElTag>
            <ElTag v-else type="success" size="small">报名中</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="managerName" label="负责人" width="100" show-overflow-tooltip />
        <ElTableColumn label="操作" width="150" fixed="right" align="center">
          <template #default="{ row }">
            <ElButton link type="primary" @click="openEnroll(row)">
              {{ row.closed ? '查看' : '报名' }}
            </ElButton>
          </template>
        </ElTableColumn>
        <template #empty>
          <div class="empty">暂无可报名的鉴定项目</div>
        </template>
      </ElTable>

      <div v-if="total > 0" class="pager">
        <ElPagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @change="loadList"
        />
      </div>
    </ElCard>

    <EnrollDrawer v-model="drawerVisible" :project="current" @changed="loadList" />
  </div>
</template>

<script setup lang="ts">
  import { ref, onMounted } from 'vue'
  import { certEnrollApi, type EnrollProject } from '@/api/certEnroll'
  import EnrollDrawer from './components/EnrollDrawer.vue'

  defineOptions({ name: 'CertificationEnroll' })

  const loading = ref(false)
  const list = ref<EnrollProject[]>([])
  const page = ref(1)
  const pageSize = ref(10)
  const total = ref(0)

  const drawerVisible = ref(false)
  const current = ref<EnrollProject | null>(null)

  /**
   * 取到分钟：秒对鉴定时间与报名截止都没有意义，白占宽度
   *
   * 后端响应拦截器已把日期格式化成「YYYY-MM-DD HH:mm:ss」（空格分隔，不是 ISO），
   * 故直接截断即可。用截断而非 new Date 也更稳：不经过时区转换，看到的就是后端给的那刻。
   */
  function toMinute(v: string): string {
    return (v || '').slice(0, 16)
  }

  async function loadList() {
    loading.value = true
    try {
      const { data } = await certEnrollApi.getProjects({
        page: page.value,
        pageSize: pageSize.value
      })
      list.value = data?.list || []
      total.value = data?.pagination?.total || 0
    } finally {
      loading.value = false
    }
  }

  function openEnroll(row: EnrollProject) {
    current.value = row
    drawerVisible.value = true
  }

  onMounted(loadList)
</script>

<style lang="scss" scoped>
  .cert-enroll {
    .tip-card {
      margin-bottom: 12px;
    }

    .pager {
      display: flex;
      justify-content: flex-end;
      margin-top: 14px;
    }

    .empty,
    .muted {
      color: var(--art-text-gray-500);
    }

    .empty {
      padding: 18px 0;
      font-size: 13px;
    }
  }
</style>
