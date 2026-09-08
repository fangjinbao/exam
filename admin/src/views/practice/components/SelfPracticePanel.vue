<!--
  自主练习面板：以题库为主体，管理员开放题库供学员自主选择练习。
  列表列出全部可见题库（含未开放的），展示试题数 / 开放人数 / 考核点 / 开放状态，
  「设置」进抽屉配开放范围与练习行为；题目维护走「题库管理」，此处不重复给入口。
-->
<template>
  <div class="self-practice">
    <!-- 筛选卡片 -->
    <ElCard shadow="never" class="filter-card">
      <ElForm :model="filterForm" :inline="true" class="filter-form">
        <ElFormItem label="题库名称">
          <ElInput
            v-model="filterForm.keyword"
            placeholder="输入题库名称"
            clearable
            class="filter-input"
          />
        </ElFormItem>
        <ElFormItem label="开放状态">
          <ElSelect v-model="filterForm.isOpen" placeholder="全部" clearable class="filter-select">
            <ElOption label="已开放" :value="true" />
            <ElOption label="未开放" :value="false" />
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
          <ElTableColumn
            prop="bankName"
            label="题库名称"
            min-width="220"
            show-overflow-tooltip
            fixed="left"
          />
          <ElTableColumn prop="createByName" label="创建人" width="120" show-overflow-tooltip>
            <template #default="{ row }">{{ row.createByName || '-' }}</template>
          </ElTableColumn>
          <ElTableColumn prop="questionCount" label="试题数" width="100" align="center" />
          <ElTableColumn label="开放人数" width="110" align="center">
            <template #default="{ row }">{{ openUserText(row) }}</template>
          </ElTableColumn>
          <ElTableColumn label="考核点" width="100" align="center">
            <template #default="{ row }">
              {{ row.knowledgePointCount ? `${row.knowledgePointCount} 个` : '不限' }}
            </template>
          </ElTableColumn>
          <ElTableColumn label="开放状态" width="110" align="center">
            <!-- 说明挂在列头而非顶部常驻提示条：紧邻它解释的对象，且不占版面高度 -->
            <template #header>
              <span class="th-with-tip">
                开放状态
                <ElTooltip placement="top">
                  <template #content>
                    开启后，被授权的学员即可在移动端<br />
                    看到该题库并自主练习
                  </template>
                  <ElIcon class="th-tip-icon"><QuestionFilled /></ElIcon>
                </ElTooltip>
              </span>
            </template>
            <!--
              开关直接落库，比「改完再点保存」少一步；无题库的开启会被后端拦下。
              与「设置」按钮同属写操作，同样挂 v-auth='update'：否则无权用户看得见也点得动，
              只会拿到一个 403，与同页其他操作的展示口径也不一致。
            -->
            <template #default="{ row }">
              <ElSwitch
                v-auth="'update'"
                :model-value="row.isOpen"
                :loading="togglingId === row.bankId"
                @change="(v: string | number | boolean) => handleToggle(row, Boolean(v))"
              />
            </template>
          </ElTableColumn>
          <ElTableColumn
            label="操作"
            width="160"
            align="left"
            fixed="right"
            class-name="table-actions"
          >
            <template #default="{ row }">
              <ElButton v-auth="'update'" link type="primary" @click="handleSetting(row)">
                设置
              </ElButton>
              <ElButton
                v-if="row.isOpen || row.knowledgePointCount || row.openUserCount > 0"
                v-auth="'delete'"
                link
                type="danger"
                @click="handleRemove(row)"
              >
                取消开放
              </ElButton>
            </template>
          </ElTableColumn>
          <template #empty>暂无可开放的题库</template>
        </ElTable>
      </div>

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

    <SelfPracticeSettingDrawer
      v-model="settingVisible"
      :bank-id="settingBankId"
      @saved="loadList"
    />
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive, onMounted, onActivated, onDeactivated } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { Search, QuestionFilled } from '@element-plus/icons-vue'
  import { selfPracticeApi, ALL_OPEN_USERS, type SelfPracticeBank } from '@/api/selfPractice'
  import SelfPracticeSettingDrawer from './SelfPracticeSettingDrawer.vue'

  defineOptions({ name: 'SelfPracticePanel' })

  const loading = ref(false)
  const tableData = ref<SelfPracticeBank[]>([])
  // 正在切换的行，避免重复点击期间开关来回跳
  const togglingId = ref<number>()

  const settingVisible = ref(false)
  const settingBankId = ref<number>()

  const filterForm = reactive({
    keyword: '',
    isOpen: undefined as boolean | undefined
  })

  const pagination = reactive({ page: 1, pageSize: 10, total: 0 })

  /** 开放人数文案：全员开放时后端下发哨兵值 */
  function openUserText(row: SelfPracticeBank) {
    if (!row.isOpen) return '-'
    return row.openUserCount === ALL_OPEN_USERS ? '全员' : `${row.openUserCount} 人`
  }

  /** 加载列表 */
  async function loadList() {
    loading.value = true
    try {
      const { data } = await selfPracticeApi.getList({
        keyword: filterForm.keyword || undefined,
        isOpen: filterForm.isOpen,
        page: pagination.page,
        pageSize: pagination.pageSize
      })
      tableData.value = data.list
      pagination.total = data.pagination.total
    } catch (e: any) {
      ElMessage.error(e?.message || '获取题库列表失败')
    } finally {
      loading.value = false
    }
  }

  function handleSearch() {
    pagination.page = 1
    loadList()
  }

  function handleReset() {
    filterForm.keyword = ''
    filterForm.isOpen = undefined
    pagination.page = 1
    loadList()
  }

  function handleSizeChange() {
    pagination.page = 1
    loadList()
  }

  /** 切换开放状态：失败时重载列表把开关恢复到真实状态 */
  async function handleToggle(row: SelfPracticeBank, next: boolean) {
    togglingId.value = row.bankId
    try {
      await selfPracticeApi.toggleOpen(row.bankId, next)
      ElMessage.success(next ? '已开启' : '已关闭')
      loadList()
    } catch (e: any) {
      ElMessage.error(e?.message || '操作失败')
      loadList()
    } finally {
      togglingId.value = undefined
    }
  }

  function handleSetting(row: SelfPracticeBank) {
    settingBankId.value = row.bankId
    settingVisible.value = true
  }

  /** 取消开放：删除开放配置，题库本身不受影响 */
  async function handleRemove(row: SelfPracticeBank) {
    try {
      await ElMessageBox.confirm(
        `确定取消题库「${row.bankName}」的自主练习开放？开放范围与知识点限定将一并清除，题库和题目不受影响。`,
        '取消开放确认',
        { type: 'warning', confirmButtonClass: 'el-button--danger' }
      )
    } catch {
      return // 用户取消
    }
    try {
      await selfPracticeApi.removeConfig(row.bankId)
      ElMessage.success('已取消开放')
      loadList()
    } catch (e: any) {
      ElMessage.error(e?.message || '操作失败')
    }
  }

  onMounted(loadList)
  /**
   * 切走再回来时刷新试题数等字段（父页配 keepAlive，onMounted 不会再触发）。
   * 题目在「题库管理」里增删后回到本页，试题数需要跟上。
   * 判据与 AssignedList 一致：只有被 deactivate 过再回来才刷新，避开父页首次挂载
   * 连带触发的那次 activated（否则首屏会紧接 onMounted 再打一次同样的请求）。
   */
  let wasDeactivated = false
  onDeactivated(() => {
    wasDeactivated = true
  })
  onActivated(() => {
    if (!wasDeactivated) return
    wasDeactivated = false
    loadList()
  })
</script>

<style lang="scss" scoped>
  .self-practice {
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: 100%;

    // 带说明图标的列头
    .th-with-tip {
      display: inline-flex;
      align-items: center;
      gap: 4px;

      .th-tip-icon {
        font-size: 14px;
        color: var(--el-text-color-placeholder);
        cursor: help;

        &:hover {
          color: var(--el-color-primary);
        }
      }
    }

    .filter-card {
      flex-shrink: 0;
      border: none !important;
      border-radius: 12px;
      box-shadow: none !important;

      :deep(.el-card__body) {
        padding: 12px 20px;
      }

      .filter-form {
        @include responsiveFilterForm();
      }
    }

    .table-card {
      display: flex;
      flex: 1;
      flex-direction: column;
      overflow: hidden;
      border: none !important;
      border-radius: 12px;
      box-shadow: none !important;

      :deep(.el-card__body) {
        display: flex;
        flex-direction: column;
        height: 100%;
        padding: 20px;
      }

      .table-container {
        flex: 1;
        overflow: hidden;
      }

      .pagination-container {
        display: flex;
        flex-shrink: 0;
        justify-content: flex-end;
        margin-top: 16px;
      }
    }
  }
</style>
