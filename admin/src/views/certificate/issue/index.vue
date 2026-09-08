<!-- 证书发放台账：证书发放记录的查询、查看与下载 -->
<template>
  <div class="cert-issue">
    <!-- 筛选卡片 -->
    <ElCard shadow="never" class="filter-card">
      <ElForm :model="filterForm" :inline="true" class="filter-form">
        <ElFormItem label="认证项目">
          <ElSelect v-model="filterForm.projectId" placeholder="全部" clearable filterable class="filter-input">
            <ElOption v-for="item in projectOptions" :key="item.id" :label="item.name" :value="item.id" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="考生">
          <ElInput v-model="filterForm.keyword" placeholder="输入考生姓名" clearable class="filter-input" />
        </ElFormItem>
        <ElFormItem label="证书状态">
          <ElSelect v-model="filterForm.certStatus" placeholder="全部" clearable class="filter-input">
            <ElOption label="有效" value="valid" />
            <ElOption label="已过期" value="expired" />
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
      <div class="table-container">
        <ElTable v-loading="loading" :data="tableData" height="100%" style="width: 100%">
          <ElTableColumn prop="certNo" label="证书编号" min-width="180" show-overflow-tooltip fixed="left" />
          <ElTableColumn prop="candidateName" label="考生姓名" min-width="120" show-overflow-tooltip />
          <ElTableColumn prop="projectName" label="认证项目" min-width="180" show-overflow-tooltip />
          <ElTableColumn prop="issueDate" label="颁发日期" min-width="140" show-overflow-tooltip />
          <ElTableColumn prop="expireDate" label="有效期至" min-width="140" show-overflow-tooltip />
          <ElTableColumn prop="certStatus" label="证书状态" width="100" align="center">
            <template #default="{ row }">
              <ElTag :type="row.certStatus === 'valid' ? 'success' : 'info'" size="small" disable-transitions>
                {{ row.certStatus === 'valid' ? '有效' : '已过期' }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn v-if="canView" label="操作" width="140" align="left" fixed="right" class-name="table-actions">
            <template #default="{ row }">
              <ElButton link type="primary" @click="handleView(row)">查看</ElButton>
              <ElButton link type="primary" :loading="downloadingId === row.id" @click="handleDownload(row)">
                下载
              </ElButton>
            </template>
          </ElTableColumn>
          <template #empty>暂无证书发放记录</template>
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

    <!-- 证书详情对话框 -->
    <ElDialog v-model="dialogVisible" title="证书详情" width="560px" @closed="detail = null">
      <div v-if="detail" class="cert-detail">
        <div class="detail-item">
          <span class="detail-label">证书编号</span>
          <span>{{ detail.certNo }}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">考生姓名</span>
          <span>{{ detail.candidateName }}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">认证项目</span>
          <span>{{ detail.projectName }}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">证书标题</span>
          <span>{{ detail.title }}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">颁发机构</span>
          <span>{{ detail.issuingOrg }}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">说明</span>
          <span>{{ detail.templateDescription || '-' }}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">颁发日期</span>
          <span>{{ detail.issueDate }}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">有效期至</span>
          <span>{{ detail.expireDate }}</span>
        </div>
      </div>
    </ElDialog>
  </div>
</template>
<script setup lang="ts">
  import { ref, reactive, computed, onMounted } from 'vue'
  import { ElMessage } from 'element-plus'
  import { Search } from '@element-plus/icons-vue'
  import {
    certificateApi,
    type Certificate,
    type CertStatus,
    type CertificateDetail
  } from '@/api/certificate'
  import { certProjectApi, type IdNameOption } from '@/api/certProject'
  import { useAuth } from '@/composables/useAuth'

  defineOptions({ name: 'CertificateIssue' })

  // 按钮级权限：查看/下载都用 detail 权限
  const { hasAuth } = useAuth()
  const canView = computed(() => hasAuth('detail'))

  const loading = ref(false)
  const tableData = ref<Certificate[]>([])
  // 认证项目下拉
  const projectOptions = ref<IdNameOption[]>([])

  // 筛选条件
  const filterForm = reactive<{ projectId: number | ''; keyword: string; certStatus: CertStatus | '' }>({
    projectId: '',
    keyword: '',
    certStatus: ''
  })
  // 分页信息
  const pagination = reactive({ page: 1, pageSize: 10, total: 0 })

  const dialogVisible = ref(false)
  const detail = ref<CertificateDetail | null>(null)
  // 正在下载的证书 id（行内 loading）
  const downloadingId = ref<number | null>(null)

  /** 加载证书发放列表 */
  async function loadList() {
    loading.value = true
    try {
      const { data } = await certificateApi.getList({
        projectId: filterForm.projectId === '' ? undefined : filterForm.projectId,
        keyword: filterForm.keyword || undefined,
        certStatus: filterForm.certStatus === '' ? undefined : filterForm.certStatus,
        page: pagination.page,
        pageSize: pagination.pageSize
      })
      tableData.value = data.list
      pagination.total = data.pagination.total
    } catch (error: any) {
      ElMessage.error(error.message || '加载证书发放记录失败')
    } finally {
      loading.value = false
    }
  }

  /** 加载认证项目下拉 */
  async function loadProjectOptions() {
    try {
      const { data } = await certProjectApi.getOptions()
      projectOptions.value = data
    } catch (error: any) {
      ElMessage.error(error.message || '加载认证项目下拉失败')
    }
  }

  function handleSearch() {
    pagination.page = 1
    loadList()
  }

  function handleReset() {
    filterForm.projectId = ''
    filterForm.keyword = ''
    filterForm.certStatus = ''
    pagination.page = 1
    loadList()
  }

  function handleSizeChange() {
    pagination.page = 1
    loadList()
  }

  /** 查看证书详情 */
  async function handleView(row: Certificate) {
    try {
      const { data } = await certificateApi.getDetail(row.id)
      detail.value = data
      dialogVisible.value = true
    } catch (error: any) {
      ElMessage.error(error.message || '获取证书详情失败')
    }
  }

  /** 下载证书：拿完整数据后生成文本文件下载 */
  async function handleDownload(row: Certificate) {
    downloadingId.value = row.id
    try {
      const { data } = await certificateApi.download(row.id)
      const content = [
        `证书编号：${data.certNo}`,
        `考生姓名：${data.candidateName}`,
        `认证项目：${data.projectName}`,
        `证书标题：${data.title}`,
        `颁发机构：${data.issuingOrg}`,
        `说明：${data.templateDescription || '-'}`,
        `颁发日期：${data.issueDate}`,
        `有效期至：${data.expireDate}`
      ].join('\n')
      // 生成文本文件并触发浏览器下载
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `证书_${data.certNo}.txt`
      link.click()
      URL.revokeObjectURL(url)
      ElMessage.success('证书下载成功')
    } catch (error: any) {
      ElMessage.error(error.message || '证书下载失败')
    } finally {
      downloadingId.value = null
    }
  }

  onMounted(() => {
    loadList()
    loadProjectOptions()
  })
</script>

<style lang="scss" scoped>
  .cert-issue {
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

    .cert-detail {
      .detail-item {
        display: flex;
        margin-bottom: 12px;

        .detail-label {
          width: 96px;
          flex-shrink: 0;
          color: var(--el-text-color-secondary);
        }
      }
    }
  }
</style>
