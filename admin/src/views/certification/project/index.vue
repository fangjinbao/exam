<!--
  鉴定项目：查询、新增、编辑、删除与发布/撤回。

  生命周期只有「未发布 ↔ 已发布」：已发布则名额已下发、各单位据此报人，
  此时编辑与删除的按钮直接不渲染，只留「撤回」，与考试管理的口径一致。
  原先另有一套启用/停用，与发布重叠且撤回已能停止报名，已整体下线
  （含状态列、筛选、按钮、后端路由与权限点）。

  表单字段较多（工种/级别/负责人/三个时间点/名额分配），拆到 ProjectDialog 里，
  本页只管列表与行操作。名额随项目整组提交，故编辑一律走详情接口拉全量。
-->
<template>
  <div class="cert-project">
    <!-- 筛选卡片 -->
    <ElCard shadow="never" class="filter-card">
      <ElForm :model="filterForm" :inline="true" class="filter-form">
        <ElFormItem label="鉴定名称">
          <ElInput
            v-model="filterForm.name"
            placeholder="输入鉴定名称"
            clearable
            class="filter-input"
          />
        </ElFormItem>
        <!-- 按发布状态筛选：项目的生命周期就是「未发布 ↔ 已发布」，
             启用/停用那套已由发布/撤回取代（撤回即停止各单位报名） -->
        <ElFormItem label="发布状态">
          <ElSelect
            v-model="filterForm.publishStatus"
            placeholder="全部"
            clearable
            class="filter-input"
          >
            <ElOption label="未发布" value="unpublished" />
            <ElOption label="已发布" value="published" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem>
          <ElButton type="primary" :icon="Search" @click="handleSearch">搜索</ElButton>
          <ElButton @click="handleReset">重置</ElButton>
        </ElFormItem>
      </ElForm>
    </ElCard>
    <!-- 表格卡片 -->
    <ElCard shadow="never" class="table-card">
      <div class="table-header">
        <ElButton v-if="canAdd" type="primary" :icon="Plus" @click="handleAdd">新增</ElButton>
      </div>

      <div class="table-container">
        <ElTable v-loading="loading" :data="tableData" height="100%" style="width: 100%">
          <!--
            序号按当前页偏移算，不用 type="index"：那个只给页内下标，
            第二页会又从 1 开始，跟分页信息对不上。
          -->
          <ElTableColumn label="序号" width="70" align="center" fixed="left">
            <template #default="{ $index }">
              {{ (pagination.page - 1) * pagination.pageSize + $index + 1 }}
            </template>
          </ElTableColumn>
          <ElTableColumn
            prop="name"
            label="鉴定名称"
            min-width="160"
            show-overflow-tooltip
            fixed="left"
          />
          <ElTableColumn
            prop="occupationName"
            label="鉴定工种"
            min-width="140"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ row.occupationName || '-' }}</template>
          </ElTableColumn>
          <ElTableColumn prop="levelName" label="鉴定级别" min-width="120" show-overflow-tooltip>
            <template #default="{ row }">{{ row.levelName || '-' }}</template>
          </ElTableColumn>
          <ElTableColumn label="鉴定时间" min-width="190">
            <template #default="{ row }">
              <span v-if="row.startTime">
                {{ fmtDate(row.startTime) }} 至 {{ fmtDate(row.endTime) }}
              </span>
              <span v-else>-</span>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="applyDeadline" label="报名截止" width="150" align="center">
            <template #default="{ row }">{{ fmtMinute(row.applyDeadline) }}</template>
          </ElTableColumn>
          <ElTableColumn prop="managerName" label="负责人" width="110" show-overflow-tooltip>
            <template #default="{ row }">{{ row.managerName || '-' }}</template>
          </ElTableColumn>
          <ElTableColumn prop="contactPhone" label="联系电话" width="130" show-overflow-tooltip>
            <template #default="{ row }">{{ row.contactPhone || '-' }}</template>
          </ElTableColumn>
          <!--
            发布状态是本模块唯一的生命周期：未发布可改可删，已发布则名额已下发、
            各单位据此报人，此时改名额或工种级别会让已报的人对不上账，故锁定。
            要改先撤回。原先另有一套启用/停用，与发布重叠且撤回已能停止报名，已去掉。
          -->
          <ElTableColumn prop="publishStatus" label="发布状态" width="110" align="center">
            <template #default="{ row }">
              <ElTag
                :type="row.publishStatus === 'published' ? 'success' : 'info'"
                size="small"
                effect="plain"
                disable-transitions
              >
                {{ row.publishStatus === 'published' ? '已发布' : '未发布' }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="createByName" label="创建人" width="110" show-overflow-tooltip>
            <template #default="{ row }">{{ row.createByName || '-' }}</template>
          </ElTableColumn>
          <ElTableColumn
            prop="createByOrgName"
            label="创建人单位"
            min-width="150"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ row.createByOrgName || '-' }}</template>
          </ElTableColumn>
          <ElTableColumn prop="createTime" label="创建时间" min-width="170" show-overflow-tooltip />
          <ElTableColumn
            v-if="canOperate"
            label="操作"
            width="260"
            align="left"
            fixed="right"
            class-name="table-actions"
          >
            <template #default="{ row }">
              <!--
                已发布即锁定：编辑与删除直接不渲染，与考试管理一致（见 views/exam/index.vue，
                它同样只在未发布态放出「编辑考试」）。

                此前是禁用+tooltip 说明原因，改成隐藏：已发布行的主行动位是「撤回」，
                撤回后编辑与删除自然回来，动作路径本身就说明了先后关系；
                摆一个点不动的按钮反而让人以为是权限不足或者页面坏了。
              -->
              <!-- 详情不分发布状态：两态都要能看进展 -->
              <ElButton link type="primary" @click="handleDetail(row)">详情</ElButton>
              <ElButton
                v-if="canUpdate && row.publishStatus !== 'published'"
                link
                type="primary"
                @click="handleEdit(row)"
                >编辑</ElButton
              >
              <ElButton
                v-if="canPublish && row.publishStatus !== 'published'"
                link
                type="success"
                @click="handlePublish(row)"
                >发布</ElButton
              >
              <ElButton
                v-if="canWithdraw && row.publishStatus === 'published'"
                link
                type="warning"
                @click="handleWithdraw(row)"
                >撤回</ElButton
              >
              <ElButton
                v-if="canDelete && row.publishStatus !== 'published'"
                link
                type="danger"
                @click="handleDelete(row)"
                >删除</ElButton
              >
            </template>
          </ElTableColumn>
          <template #empty>暂无鉴定项目数据</template>
        </ElTable>
      </div>

      <!-- 分页 -->
      <div class="pagination-container">
        <ElPagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="loadList"
        />
      </div>
    </ElCard>

    <ProjectDialog ref="dialogRef" @saved="loadList" />
  </div>
</template>
<script setup lang="ts">
  import { ref, reactive, computed, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { Search, Plus } from '@element-plus/icons-vue'
  import { certProjectApi, type CertProject } from '@/api/certProject'
  import { useAuth } from '@/composables/useAuth'
  import ProjectDialog from './components/ProjectDialog.vue'

  defineOptions({ name: 'CertificationProject' })

  const router = useRouter()

  // 按钮级权限：只传动作名，hasAuth 按末段匹配当前模块权限点
  const { hasAuth } = useAuth()
  const canAdd = computed(() => hasAuth('add'))
  const canUpdate = computed(() => hasAuth('update'))
  const canDelete = computed(() => hasAuth('delete'))
  const canPublish = computed(() => hasAuth('publish'))
  const canWithdraw = computed(() => hasAuth('withdraw'))
  const canOperate = computed(
    () => canUpdate.value || canDelete.value || canPublish.value || canWithdraw.value
  )

  const loading = ref(false)
  const tableData = ref<CertProject[]>([])

  // 筛选条件
  const filterForm = reactive<{ name: string; publishStatus: string }>({
    name: '',
    publishStatus: ''
  })
  // 分页信息
  const pagination = reactive({ page: 1, pageSize: 10, total: 0 })

  const dialogRef = ref<InstanceType<typeof ProjectDialog>>()

  /** 时间串 → YYYY-MM-DD（鉴定起止只显示到天，够看且不挤） */
  function fmtDate(v?: string): string {
    return v ? v.slice(0, 10) : '-'
  }

  /** 时间串 → YYYY-MM-DD HH:mm（报名截止到点即关，必须显示时分；秒无意义不显示） */
  function fmtMinute(v?: string): string {
    return v ? v.slice(0, 16) : '-'
  }

  /** 加载鉴定项目列表 */
  async function loadList() {
    loading.value = true
    try {
      const { data } = await certProjectApi.getList({
        name: filterForm.name || undefined,
        publishStatus: filterForm.publishStatus || undefined,
        page: pagination.page,
        pageSize: pagination.pageSize
      })
      tableData.value = data.list
      pagination.total = data.pagination.total
    } catch (error: any) {
      ElMessage.error(error.message || '加载鉴定项目列表失败')
    } finally {
      loading.value = false
    }
  }

  function handleSearch() {
    pagination.page = 1
    loadList()
  }

  function handleReset() {
    filterForm.name = ''
    filterForm.publishStatus = ''
    pagination.page = 1
    loadList()
  }

  function handleSizeChange() {
    pagination.page = 1
    loadList()
  }

  function handleAdd() {
    dialogRef.value?.open()
  }

  /** 编辑走详情接口拉全量（列表不带名额），故只传 id */
  function handleEdit(row: CertProject) {
    dialogRef.value?.open(row.id)
  }

  /**
   * 详情页看各阶段进展（报名/审核/考试），id 走 query
   *
   * 按 path 跳而非按 name：非 mock 模式下路由来自后端菜单，
   * 名字由 MenuService.routerToName 从 router 派生，连字符不会转驼峰
   * （/certification/project-detail → CertificationProject-detail），
   * 与前端静态路由里写的 name 对不上。项目其余跳转（exam-detail 等）同样按 path。
   */
  function handleDetail(row: CertProject) {
    router.push({ path: '/certification/project-detail', query: { id: row.id } })
  }

  async function handlePublish(row: CertProject) {
    try {
      await ElMessageBox.confirm(
        `发布后各单位即可在「鉴定报名」中按名额报人，且项目将被锁定（要改需先撤回）。确定发布「${row.name}」？`,
        '发布鉴定项目',
        { type: 'warning' }
      )
      await certProjectApi.publish(row.id)
      ElMessage.success('鉴定项目已发布')
      loadList()
    } catch (error: any) {
      // 未配名额、重复发布、历史停用数据等由服务端拦回，提示直接用服务端文案
      if (error !== 'cancel') ElMessage.error(error?.message || '发布失败')
    }
  }

  async function handleWithdraw(row: CertProject) {
    try {
      await ElMessageBox.confirm(
        `撤回后各单位无法继续报名，项目回到可编辑状态。确定撤回「${row.name}」？`,
        '撤回鉴定项目',
        { type: 'warning' }
      )
      await certProjectApi.withdraw(row.id)
      ElMessage.success('鉴定项目已撤回')
      loadList()
    } catch (error: any) {
      // 已有报名记录时服务端拒绝并说明条数，照搬其文案
      if (error !== 'cancel') ElMessage.error(error?.message || '撤回失败')
    }
  }

  async function handleDelete(row: CertProject) {
    try {
      await ElMessageBox.confirm('确定要删除该鉴定项目吗？删除后不可恢复', '提示', {
        type: 'warning'
      })
      await certProjectApi.delete(row.id)
      ElMessage.success('删除鉴定项目成功')
      if (tableData.value.length === 1 && pagination.page > 1) pagination.page -= 1
      loadList()
    } catch (error: any) {
      if (error !== 'cancel') ElMessage.error(error.message || '删除失败')
    }
  }

  onMounted(loadList)
</script>

<style lang="scss" scoped>
  .cert-project {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 16px;

    .filter-card {
      flex-shrink: 0;
      border: none !important;
      box-shadow: none !important;
      border-radius: 12px;

      :deep(.el-card__body) {
        padding: 12px 20px;
      }

      .filter-form {
        @include responsiveFilterForm();
      }
    }

    .table-card {
      flex: 1;
      border: none !important;
      box-shadow: none !important;
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      flex-direction: column;

      :deep(.el-card__body) {
        padding: 20px;
        height: 100%;
        display: flex;
        flex-direction: column;
      }

      .table-header {
        flex-shrink: 0;
        margin-bottom: 16px;
        display: flex;
        gap: 12px;
      }

      .table-container {
        flex: 1;
        overflow: hidden;
      }

      .pagination-container {
        flex-shrink: 0;
        display: flex;
        justify-content: flex-end;
        margin-top: 16px;
      }
    }
  }
</style>
