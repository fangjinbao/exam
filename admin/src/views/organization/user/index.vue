<template>
  <div ref="rootRef" class="organization-user" :style="rootHeightStyle">
    <div class="user-layout">
      <!-- 左侧：部门树卡片 -->
      <ElCard shadow="never" class="dept-tree-card">
        <div class="tree-header">
          <span class="tree-title">部门列表</span>
        </div>
        <ElInput v-model="deptFilterText" placeholder="请输入内容" clearable class="tree-search" />
        <ElScrollbar class="tree-container">
          <ElTree
            ref="treeRef"
            :data="departmentTree"
            :props="{ label: 'name', children: 'children' }"
            :filter-node-method="filterNode"
            node-key="id"
            default-expand-all
            highlight-current
            @node-click="handleDeptClick"
          />
        </ElScrollbar>
      </ElCard>

      <!-- 右侧：筛选 + 表格 -->
      <div class="user-content">
        <!-- 筛选卡片 -->
        <ElCard shadow="never" class="filter-card">
          <ElForm :model="filterForm" :inline="true" class="filter-form">
            <ElFormItem label="员工查询">
              <ElInput
                v-model="filterForm.keyword"
                placeholder="输入姓名/账号/手机号"
                clearable
                class="filter-input"
              />
            </ElFormItem>
            <ElFormItem label="员工状态">
              <ElSelect
                v-model="filterForm.status"
                placeholder="请选择"
                clearable
                class="filter-select"
              >
                <ElOption label="启用" :value="1" />
                <ElOption label="禁用" :value="0" />
              </ElSelect>
            </ElFormItem>
            <ElFormItem class="filter-actions">
              <ElButton type="primary" @click="handleSearch">搜索</ElButton>
              <ElButton @click="handleReset">重置</ElButton>
            </ElFormItem>
          </ElForm>
        </ElCard>

        <!-- 表格卡片 -->
        <ElCard shadow="never" class="table-card">
          <div class="table-header">
            <ElButton v-auth="'add'" type="primary" @click="handleAdd">新增</ElButton>
            <ElButton type="info" plain @click="handleImport">导入</ElButton>
            <ElButton type="info" plain @click="handleExport">导出</ElButton>
            <ElButton type="info" plain :disabled="selectedRows.length === 0" @click="handleBatchSetPosition">设置岗位</ElButton>
            <ElButton type="info" plain :disabled="selectedRows.length === 0" @click="handleBatchSetRole">设置角色</ElButton>
            <!-- 未选中时保持中性灰，选中后才转为 danger 提示破坏性 -->
            <ElButton v-auth="'batch-delete'" :type="selectedRows.length ? 'danger' : 'info'" plain :disabled="selectedRows.length === 0" @click="handleBatchDelete">批量删除</ElButton>
          </div>

          <div class="table-container">
            <ElTable
              ref="tableRef"
              v-loading="loading"
              :data="tableData"
              height="100%"
              @selection-change="handleSelectionChange"
            >
              <ElTableColumn type="selection" width="55" fixed="left" />
              <ElTableColumn prop="name" label="姓名" width="120" fixed="left" />
              <ElTableColumn prop="username" label="账号" width="120" />
              <ElTableColumn label="所属部门" min-width="160">
                <template #default="{ row }">{{ row.department?.name || '-' }}</template>
              </ElTableColumn>
              <ElTableColumn label="岗位" width="120">
                <template #default="{ row }">{{ row.position?.name || '-' }}</template>
              </ElTableColumn>
              <ElTableColumn label="角色" width="140">
                <template #default="{ row }">
                  {{ row.userRoles?.map((ur: any) => ur.role?.name).join(', ') || '-' }}
                </template>
              </ElTableColumn>
              <ElTableColumn label="手机号" width="130">
                <template #default="{ row }">{{ maskPhone(row.phone) }}</template>
              </ElTableColumn>
              <ElTableColumn label="状态" width="100" align="center">
                <template #default="{ row }">
                  <ElSwitch
                    v-model="row.status"
                    :active-value="1"
                    :inactive-value="0"
                    @change="handleStatusChange(row)"
                  />
                </template>
              </ElTableColumn>
              <ElTableColumn label="操作" width="150" align="left" fixed="right" class-name="table-actions">
                <template #default="{ row }">
                  <ElButton v-auth="'update'" link type="primary" @click="handleEdit(row)">编辑</ElButton>
                  <ElButton v-auth="'delete'" link type="danger" @click="handleDelete(row)">删除</ElButton>
                </template>
              </ElTableColumn>
            </ElTable>
          </div>

          <div class="pagination-container">
            <ElPagination
              v-model:current-page="pagination.page"
              v-model:page-size="pagination.pageSize"
              :total="pagination.total"
              :page-sizes="[10, 20, 50, 100]"
              layout="total, sizes, prev, pager, next, jumper"
              @size-change="
                () => {
                  pagination.page = 1
                  loadUserList()
                }
              "
              @current-change="loadUserList"
            />
          </div>
        </ElCard>
      </div>
    </div>

    <!-- 新增/编辑对话框 -->
    <ElDialog v-model="dialogVisible" :title="dialogTitle" width="600px" @closed="resetForm">
      <ElForm ref="formRef" :model="form" :rules="formRules" label-width="100px">
        <ElFormItem label="姓名" prop="name">
          <ElInput v-model="form.name" placeholder="请输入姓名" maxlength="20" />
        </ElFormItem>
        <ElFormItem label="账号" prop="username">
          <ElInput v-model="form.username" :disabled="isEditing" placeholder="请输入账号" />
        </ElFormItem>
        <ElFormItem v-if="!isEditing" label="密码" prop="password">
          <ElInput v-model="form.password" type="password" show-password placeholder="请输入密码" />
        </ElFormItem>
        <ElFormItem label="手机号" prop="phone">
          <ElInput v-model="form.phone" placeholder="请输入手机号" maxlength="11" />
        </ElFormItem>
        <ElFormItem label="所属部门" prop="departmentId">
          <ElTreeSelect
            v-model="form.departmentId"
            :data="departmentTree.filter((d: any) => d.id !== 0)"
            :props="{ label: 'name' }"
            node-key="id"
            placeholder="请选择部门"
            clearable
            check-strictly
            style="width: 100%"
          />
        </ElFormItem>
        <ElFormItem label="岗位">
          <ElSelect v-model="form.positionId" placeholder="请选择岗位" clearable style="width: 100%">
            <ElOption v-for="pos in positionList" :key="pos.id" :label="pos.name" :value="pos.id" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="角色">
          <ElSelect v-model="form.roleIds" multiple placeholder="请选择角色" clearable style="width: 100%">
            <ElOption v-for="role in roleList" :key="role.id" :label="role.name" :value="role.id" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="邮箱" prop="email">
          <ElInput v-model="form.email" placeholder="请输入邮箱" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialogVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="submitLoading" @click="handleSubmit">确定</ElButton>
      </template>
    </ElDialog>

    <!-- 批量设置岗位对话框 -->
    <ElDialog v-model="positionDialogVisible" title="设置岗位" width="400px">
      <ElForm :model="positionForm" label-width="80px">
        <ElFormItem label="岗位">
          <ElInput v-model="positionForm.positionName" placeholder="请输入岗位" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="positionDialogVisible = false">取消</ElButton>
        <ElButton type="primary" @click="handleConfirmSetPosition">确定</ElButton>
      </template>
    </ElDialog>

    <!-- 批量设置角色对话框 -->
    <ElDialog v-model="roleDialogVisible" title="设置角色" width="400px">
      <ElForm :model="roleForm" label-width="80px">
        <ElFormItem label="角色">
          <ElSelect
            v-model="roleForm.roleIds"
            multiple
            placeholder="请选择角色"
            style="width: 100%"
          >
            <ElOption label="系统管理员" :value="1" />
            <ElOption label="普通用户" :value="2" />
          </ElSelect>
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="roleDialogVisible = false">取消</ElButton>
        <ElButton type="primary" @click="handleConfirmSetRole">确定</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
  import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
  import { Search, Plus } from '@element-plus/icons-vue'
  import { userApi, type AdminUser } from '@/api/user'
  import { departmentApi, type Department } from '@/api/department'
  import { getPositionList } from '@/api/organization'
  import { getRoleList } from '@/api/permission'
  import { maskPhone } from '@/utils/dataprocess/format'

  defineOptions({ name: 'OrganizationUser' })

  // 部门树
  const treeRef = ref()

  // ===== 页面可用高度：实测而非硬编码 =====
  // 不能写死 calc(100vh - Npx)：顶部占用随布局模式变化——框架一有独立页签行，
  // 框架二把页签并入 60px 顶栏且多一层 ArtTopHeader；tabStyle 为 tab-card/
  // tab-google 时顶栏还多 20px 下边距。任何固定值都会在某个模式下留出空白。
  // 改为实测本容器在滚动容器内的偏移，与上方有几层、各多高无关。
  const rootRef = ref<HTMLElement | null>(null)
  const measuredHeight = ref(0)
  // 窄屏（<=800px）下 #app-main 变为 height:auto/overflow:visible，
  // 布局本意是整页滚动，此时不锁高度，交给样式里的 max-height 兜树高
  const isNarrow = ref(false)

  const rootHeightStyle = computed(() =>
    !isNarrow.value && measuredHeight.value > 0
      ? { height: `${measuredHeight.value}px` }
      : undefined,
  )

  const measureHeight = () => {
    isNarrow.value = window.innerWidth <= 800
    const el = rootRef.value
    if (!el || isNarrow.value) return

    const wrap = el.closest('.el-scrollbar__wrap') as HTMLElement | null
    // 底部留 20px 呼吸位，与 .art-page-view 的 padding-bottom 对齐
    const gap = 20
    if (wrap) {
      // 加回 scrollTop 抵消滚动位移，否则已滚动时算出的高度会偏大
      const offsetInWrap =
        el.getBoundingClientRect().top - wrap.getBoundingClientRect().top + wrap.scrollTop
      measuredHeight.value = Math.max(wrap.clientHeight - offsetInWrap - gap, 420)
    } else {
      measuredHeight.value = Math.max(
        window.innerHeight - el.getBoundingClientRect().top - gap,
        420,
      )
    }
  }

  let heightObserver: ResizeObserver | null = null
  const deptFilterText = ref('')
  const departmentTree = ref<Department[]>([])
  const selectedDeptId = ref<number>()

  // 表格
  const tableRef = ref()
  const loading = ref(false)
  const tableData = ref<AdminUser[]>([])
  const selectedRows = ref<AdminUser[]>([])

  const filterForm = reactive({ keyword: '', status: '' as any })

  const pagination = reactive({ page: 1, pageSize: 10, total: 0 })

  // 对话框
  const dialogVisible = ref(false)
  const isEditing = ref(false)
  const dialogTitle = computed(() => (isEditing.value ? '编辑用户' : '新增用户'))
  const submitLoading = ref(false)

  const formRef = ref<FormInstance>()
  const form = reactive({
    id: undefined as number | undefined,
    name: '',
    username: '',
    password: '',
    departmentId: undefined as number | undefined,
    positionId: undefined as number | undefined,
    roleIds: [] as number[],
    phone: '',
    email: ''
  })

  const formRules: FormRules = {
    name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
    username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
    password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
    // 手机号、邮箱非必填；邮箱填写时才校验格式（留空自动跳过）
    email: [{ type: 'email', message: '邮箱格式不正确', trigger: 'blur' }],
    departmentId: [{ required: true, message: '请选择部门', trigger: 'change' }]
  }

  // 岗位和角色列表
  const positionList = ref<{ id: number; name: string }[]>([])
  const roleList = ref<{ id: number; name: string }[]>([])

  const positionDialogVisible = ref(false)
  const positionForm = reactive({ positionName: '' })

  const roleDialogVisible = ref(false)
  const roleForm = reactive({ roleIds: [] as number[] })

  // 部门树加载
  async function loadDepartmentList() {
    try {
      const { data } = await departmentApi.getTree()
      const deptList = data || []
      departmentTree.value = [
        { id: 0, name: '全部', children: [], parentId: null } as Department,
        ...deptList
      ]
    } catch {
      // 请求错误由 http 拦截器统一提示，此处不重复弹出
    }
  }

  watch(deptFilterText, (val) => treeRef.value?.filter(val))

  const filterNode = (value: string, data: any) => !value || data.name.includes(value)

  function handleDeptClick(data: Department) {
    selectedDeptId.value = data.id === 0 ? undefined : data.id
    pagination.page = 1
    loadUserList()
  }

  // 用户列表加载
  async function loadUserList() {
    loading.value = true
    try {
      const { data } = await userApi.getList({
        keyword: filterForm.keyword || undefined,
        departmentId: selectedDeptId.value || undefined,
        status: filterForm.status !== '' ? filterForm.status : undefined,
        page: pagination.page,
        pageSize: pagination.pageSize
      })
      tableData.value = data?.list || []
      pagination.total = data?.pagination?.total || 0
    } catch {
      // 请求错误由 http 拦截器统一提示，此处不重复弹出
    } finally {
      loading.value = false
    }
  }

  function handleSearch() {
    pagination.page = 1
    loadUserList()
  }

  function handleReset() {
    filterForm.keyword = ''
    filterForm.status = ''
    pagination.page = 1
    loadUserList()
  }

  function handleSelectionChange(selection: AdminUser[]) {
    selectedRows.value = selection
  }

  function handleAdd() {
    isEditing.value = false
    dialogVisible.value = true
  }

  function handleEdit(row: any) {
    isEditing.value = true
    dialogVisible.value = true
    Object.assign(form, {
      id: row.id,
      name: row.name || '',
      username: row.username,
      password: '',
      departmentId: row.departmentId,
      positionId: row.positionId,
      roleIds: row.userRoles?.map((ur: any) => ur.role?.id) || [],
      phone: row.phone || '',
      email: row.email || ''
    })
  }

  async function handleDelete(row: any) {
    try {
      await ElMessageBox.confirm(`确定要删除用户"${row.name || row.username}"吗？`, '提示', { type: 'warning' })
      await userApi.delete(row.id)
      ElMessage.success('删除成功')
      loadUserList()
    } catch {
      // 取消确认无需提示；请求失败由 http 拦截器统一提示
    }
  }

  async function handleStatusChange(row: AdminUser) {
    try {
      await userApi.updateStatus(row.id, row.status!)
      ElMessage.success('状态更新成功')
    } catch {
      // 请求失败由 http 拦截器统一提示，此处仅回滚开关状态
      row.status = row.status === 1 ? 0 : 1
    }
  }

  async function handleSubmit() {
    try {
      await formRef.value?.validate()
      submitLoading.value = true
      if (isEditing.value && form.id) {
        await userApi.update({
          id: form.id,
          name: form.name,
          phone: form.phone,
          email: form.email,
          departmentId: form.departmentId,
          positionId: form.positionId,
          roleIds: form.roleIds
        })
        ElMessage.success('更新成功')
      } else {
        await userApi.add({
          username: form.username,
          password: form.password,
          name: form.name,
          phone: form.phone,
          email: form.email,
          departmentId: form.departmentId,
          positionId: form.positionId,
          roleIds: form.roleIds
        })
        ElMessage.success('新增成功')
      }
      dialogVisible.value = false
      loadUserList()
    } catch {
      // 表单校验失败由表单内联提示，请求错误由 http 拦截器统一提示，此处无需处理
    } finally {
      submitLoading.value = false
    }
  }

  function resetForm() {
    formRef.value?.resetFields()
    Object.assign(form, {
      id: undefined,
      name: '',
      username: '',
      password: '',
      departmentId: undefined,
      positionId: undefined,
      roleIds: [],
      phone: '',
      email: ''
    })
  }

  async function handleBatchDelete() {
    try {
      await ElMessageBox.confirm(
        `确定要删除选中的 ${selectedRows.value.length} 个用户吗？`,
        '提示',
        { type: 'warning' }
      )
      const ids = selectedRows.value.map((row) => row.id)
      await userApi.batchDelete(ids)
      ElMessage.success('批量删除成功')
      loadUserList()
    } catch {
      // 取消确认无需提示；请求失败由 http 拦截器统一提示
    }
  }

  function handleBatchSetPosition() {
    positionDialogVisible.value = true
  }

  async function handleConfirmSetPosition() {
    if (!positionForm.positionName) {
      ElMessage.warning('请输入岗位')
      return
    }
    ElMessage.info('批量设置岗位功能开发中')
    positionDialogVisible.value = false
    positionForm.positionName = ''
  }

  function handleBatchSetRole() {
    roleDialogVisible.value = true
  }

  async function handleConfirmSetRole() {
    if (roleForm.roleIds.length === 0) {
      ElMessage.warning('请选择角色')
      return
    }
    ElMessage.info('批量设置角色功能开发中')
    roleDialogVisible.value = false
    roleForm.roleIds = []
  }

  function handleImport() {
    ElMessage.info('导入功能开发中')
  }

  function handleExport() {
    ElMessage.info('导出功能开发中')
  }

  async function loadPositionAndRoleList() {
    try {
      const [posRes, roleRes] = await Promise.all([
        getPositionList({ pageSize: 100 }),
        getRoleList({ pageSize: 100 })
      ])
      positionList.value = posRes.data?.list || []
      roleList.value = roleRes.data?.list || []
    } catch {
      // 静默失败，不阻塞页面
    }
  }

  onMounted(async () => {
    await loadDepartmentList()
    await nextTick()
    treeRef.value?.setCurrentKey(0)
    loadUserList()
    loadPositionAndRoleList()

    measureHeight()
    window.addEventListener('resize', measureHeight)
    // 顶栏/页签显隐、布局模式切换都会改变本容器的起始位置，
    // 观察 body 尺寸变化以跟随重算（resize 事件覆盖不到这些场景）
    heightObserver = new ResizeObserver(measureHeight)
    heightObserver.observe(document.body)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', measureHeight)
    heightObserver?.disconnect()
    heightObserver = null
  })
</script>

<style lang="scss" scoped>
  .organization-user {
    // 高度由脚本实测后以内联 style 注入（见 measureHeight）。
    // 不依赖父级传递高度：外层 .art-page-view 是 flex:1 但没有 min-height:0，
    // 而再外层 .el-scrollbar__view 是 min-height:100%（允许超出视口），
    // 父级高度等于内容高度，此处写 height:100% 会落空，部门树一长就撑开整页。
    // 也不写 calc(100vh - Npx)：顶部占用随布局模式（框架一/框架二）、
    // 页签显隐、tabStyle 边距变化，固定值必然在某些模式下留白。
    min-height: 420px;
    display: flex;
    flex-direction: column;

    // 窄屏下布局本意是整页滚动（#app-main 变 height:auto/overflow:visible），
    // 脚本不再锁高度，仅限制树区高度使其内部滚动，避免树无限长
    @media only screen and (max-width: $device-ipad) {
      min-height: 0;

      .user-layout {
        flex-direction: column;
      }

      .dept-tree-card {
        width: 100%;
        max-height: 50dvh;
      }
    }

    .user-layout {
      display: flex;
      gap: 16px;
      height: 100%;
      min-height: 0;
      overflow: hidden;

      .dept-tree-card {
        width: 280px;
        flex-shrink: 0;
        border-radius: 12px;
        border: none !important;
        box-shadow: none !important;
        display: flex;
        flex-direction: column;
        overflow: hidden;

        :deep(.el-card__body) {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          padding: 20px;
        }

        .tree-header {
          flex-shrink: 0;
          margin-bottom: 16px;

          .tree-title {
            font-size: 16px;
            font-weight: 500;
          }
        }

        .tree-search {
          flex-shrink: 0;
          margin-bottom: 16px;
        }

        // 树区吃掉剩余空间并在内部滚动（ElScrollbar）。
        // min-height:0 是必须的：flex 项默认 min-height:auto 不会小于内容高度，
        // 缺了它 flex:1 形同虚设，树仍会撑开卡片。
        .tree-container {
          flex: 1;
          min-height: 0;

          // 节点横向过长时不换行，改为横向滚动，避免撑破 280px 卡片宽度
          :deep(.el-tree) {
            display: inline-block;
            min-width: 100%;
          }

          :deep(.el-tree-node__label) {
            white-space: nowrap;
          }
        }
      }

      .user-content {
        flex: 1;
        min-width: 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 16px;
        overflow: hidden;

        .filter-card {
          flex-shrink: 0;
          border: none !important;
          box-shadow: none !important;
          border-radius: 12px;

          :deep(.el-card__body) {
            padding: 12px 20px;
          }

          // 筛选表单：宽屏行内、窄屏堆叠（公共 mixin）
          .filter-form {
            @include responsiveFilterForm();
          }
        }

        .table-card {
          flex: 1;
          min-height: 0;
          border: none !important;
          box-shadow: none !important;
          border-radius: 12px;
          overflow: hidden;
          display: flex;
          flex-direction: column;

          :deep(.el-card__body) {
            padding: 20px;
            height: 100%;
            min-height: 0;
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
            min-height: 0;
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
    }
  }
</style>
