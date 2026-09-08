<!--
  鉴定项目新增/编辑弹窗。

  字段对齐业务表单：除「简介」外全部必填，左右两列排布。
  不含关联考试/证书模板/证书有效期——当前业务不做自动发证。

  名额在这里整组维护：没有独立于项目的增删改接口，
  提交时随项目一起发，服务端按「提交的即全部」全量替换。
  故这里的删除只是从本地数组里移除，点确定才真正生效。
-->
<template>
  <ElDialog
    v-model="visible"
    :title="isEditing ? '编辑鉴定项目' : '新增鉴定项目'"
    width="860px"
    :close-on-click-modal="false"
    @closed="handleClosed"
  >
    <ElForm ref="formRef" :model="form" :rules="rules" label-width="110px">
      <ElRow :gutter="20">
        <ElCol :span="12">
          <ElFormItem label="鉴定名称" prop="name">
            <ElInput
              v-model="form.name"
              placeholder="如：电工三级鉴定"
              maxlength="50"
              show-word-limit
            />
          </ElFormItem>
        </ElCol>
        <ElCol :span="12">
          <ElFormItem label="报名截止时间" prop="applyDeadline">
            <!--
              精确到时分秒：允许与鉴定开始同一天（如当天 08:00 截止、09:00 开考），
              故日历只禁开始日之后的整天，同日内的先后由提交前校验兜住。

              default-time 取 23:59:59 而不是默认的 00:00:00：管理员填「10-15」时
              想的是「10-15 那天还能报」，而 00:00:00 意味着这一天一开始就关、
              实际等于 10-14 截止，与直觉相反。不设此项时 Element 默认给 00:00:00。
            -->
            <ElDatePicker
              v-model="form.applyDeadline"
              type="datetime"
              placeholder="选择日期时间"
              value-format="YYYY-MM-DD HH:mm:ss"
              :default-time="DEADLINE_DEFAULT_TIME"
              :disabled-date="disabledDeadline"
              style="width: 100%"
            />
          </ElFormItem>
        </ElCol>
      </ElRow>

      <ElRow :gutter="20">
        <ElCol :span="12">
          <!-- 工种变了要清空级别：级别属于工种，留着上一个工种的级别提交会被服务端拒 -->
          <ElFormItem label="鉴定工种" prop="occupationId">
            <ElSelect
              v-model="form.occupationId"
              placeholder="请选择鉴定工种"
              style="width: 100%"
              @change="handleOccupationChange"
            >
              <ElOption v-for="o in occupations" :key="o.id" :label="o.name" :value="o.id" />
            </ElSelect>
          </ElFormItem>
        </ElCol>
        <ElCol :span="12">
          <ElFormItem label="鉴定开始时间" prop="startTime">
            <ElDatePicker
              v-model="form.startTime"
              type="datetime"
              placeholder="选择开始时间"
              value-format="YYYY-MM-DD HH:mm:ss"
              :disabled-date="disabledStart"
              style="width: 100%"
              @change="handleStartChange"
            />
          </ElFormItem>
        </ElCol>
      </ElRow>

      <ElRow :gutter="20">
        <ElCol :span="12">
          <ElFormItem label="鉴定级别" prop="levelId">
            <ElSelect
              v-model="form.levelId"
              :placeholder="form.occupationId ? '请选择鉴定级别' : '请先选择工种'"
              :disabled="!form.occupationId"
              style="width: 100%"
            >
              <!-- 级别来自详情接口，id 必然存在（CertOccupationLevel.id 可选是为了新增场景） -->
              <ElOption v-for="l in levels" :key="l.id" :label="l.name" :value="l.id!" />
            </ElSelect>
          </ElFormItem>
        </ElCol>
        <ElCol :span="12">
          <ElFormItem label="鉴定结束时间" prop="endTime">
            <ElDatePicker
              v-model="form.endTime"
              type="datetime"
              placeholder="选择结束时间"
              value-format="YYYY-MM-DD HH:mm:ss"
              :disabled-date="disabledEnd"
              style="width: 100%"
            />
          </ElFormItem>
        </ElCol>
      </ElRow>

      <ElRow :gutter="20">
        <ElCol :span="12">
          <ElFormItem label="负责人" prop="managerId">
            <ElSelect
              v-model="form.managerId"
              filterable
              remote
              reserve-keyword
              :remote-method="searchUsers"
              :loading="userLoading"
              placeholder="输入姓名搜索"
              style="width: 100%"
              @change="handleManagerChange"
            >
              <ElOption v-for="u in userOptions" :key="u.id" :label="u.label" :value="u.id" />
            </ElSelect>
          </ElFormItem>
        </ElCol>
        <ElCol :span="12">
          <ElFormItem label="联系电话" prop="contactPhone">
            <ElInput v-model="form.contactPhone" placeholder="手机或座机" maxlength="20" />
          </ElFormItem>
        </ElCol>
      </ElRow>

      <ElFormItem label="简介" prop="description">
        <ElInput
          v-model="form.description"
          type="textarea"
          :rows="3"
          maxlength="500"
          show-word-limit
          placeholder="非必填"
        />
      </ElFormItem>

      <!--
        原先此处有「状态·启用/停用」单选组，已随启停能力一并下线：
        本模块的生命周期只有「未发布 ↔ 已发布」，要停止各单位报名用撤回，
        语义更准且能回到可编辑态。留着它的害处是列表页已不展示该状态，
        存成停用后管理端看着正常、却在「鉴定报名」里静默消失。
      -->

      <!-- 名额列表 -->
      <ElFormItem label="名额分配">
        <div class="quota-block">
          <div class="quota-toolbar">
            <ElButton link type="primary" :icon="Plus" @click="addQuota">添加名额</ElButton>
            <ElButton
              link
              type="danger"
              :icon="Delete"
              :disabled="!selectedQuotaKeys.length"
              @click="removeSelectedQuotas"
            >
              删除所选
            </ElButton>
            <span class="quota-total">合计 {{ totalQuota }} 人</span>
          </div>

          <ElTable
            ref="quotaTableRef"
            :data="form.quotas"
            row-key="_key"
            border
            max-height="280"
            @selection-change="handleQuotaSelectionChange"
          >
            <ElTableColumn type="selection" width="44" reserve-selection />
            <ElTableColumn label="单位名称" min-width="230">
              <template #header><span class="req">*</span>单位名称</template>
              <template #default="{ row }">
                <!--
                  单位是公司（集团/省公司/分公司），用树选而非平铺下拉：
                  共 59 个，平铺成一串很难找。check-strictly 让非叶子节点
                  （集团、省公司）也能选中——它们本身就是能分名额的单位。
                  单位变了要清空部门：部门须挂在所选单位下，否则服务端会拒。
                -->
                <ElTreeSelect
                  v-model="row.orgId"
                  :data="orgTree"
                  :props="orgTreeProps"
                  node-key="id"
                  check-strictly
                  filterable
                  default-expand-all
                  placeholder="选择单位"
                  style="width: 100%"
                  @change="handleOrgChange(row)"
                />
              </template>
            </ElTableColumn>
            <ElTableColumn label="部门" min-width="180">
              <template #default="{ row }">
                <!-- 选填：多数分公司下没有部门，留空表示名额给整个单位 -->
                <ElSelect
                  v-model="row.deptId"
                  :placeholder="deptPlaceholder(row)"
                  :disabled="deptDisabled(row)"
                  :loading="!!row.orgId && deptLoading.has(row.orgId)"
                  clearable
                  style="width: 100%"
                >
                  <ElOption
                    v-for="d in deptMap[row.orgId] || []"
                    :key="d.id"
                    :label="d.name"
                    :value="d.id"
                  />
                </ElSelect>
              </template>
            </ElTableColumn>
            <ElTableColumn label="名额" width="130" align="center">
              <template #header><span class="req">*</span>名额</template>
              <template #default="{ row }">
                <ElInputNumber
                  v-model="row.quota"
                  :min="1"
                  :max="9999"
                  :precision="0"
                  controls-position="right"
                  style="width: 100%"
                />
              </template>
            </ElTableColumn>
            <ElTableColumn label="操作" width="70" align="center">
              <template #default="{ $index }">
                <ElButton link type="danger" @click="removeQuota($index)">删除</ElButton>
              </template>
            </ElTableColumn>
            <template #empty>
              <span class="quota-empty">暂无名额，点击「添加名额」按单位分配</span>
            </template>
          </ElTable>
        </div>
      </ElFormItem>
    </ElForm>

    <template #footer>
      <ElButton @click="visible = false">取消</ElButton>
      <ElButton type="primary" :loading="submitting" @click="handleSubmit">确定</ElButton>
    </template>
  </ElDialog>
</template>

<script setup lang="ts">
  import { ref, reactive, computed, onMounted } from 'vue'
  import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
  import { Plus, Delete } from '@element-plus/icons-vue'
  import { certProjectApi, type IdNameOption, type OrgTreeNode } from '@/api/certProject'
  import { certOccupationApi, type CertOccupationLevel } from '@/api/certOccupation'
  import { getUserList } from '@/api/organization'

  defineOptions({ name: 'ProjectDialog' })

  const emit = defineEmits<{ saved: [] }>()

  /**
   * 表单里的名额行。
   *
   * _key 是本地渲染用的稳定 key：新增的行还没有 id，
   * 用数组下标作 key 会在删除时让 Vue 复用错行（下拉选中值跟着串位）。
   * id 保留原值提交，服务端据此判断是改已有行还是建新的。
   */
  interface QuotaRow {
    _key: string
    id?: number
    orgId?: number
    /** 选填：多数分公司下没有部门，留空表示名额给整个单位 */
    deptId?: number | null
    quota: number
  }

  let keySeq = 0
  const nextKey = () => `q-${++keySeq}`

  const visible = ref(false)
  const isEditing = ref(false)
  const submitting = ref(false)
  const formRef = ref<FormInstance>()
  const quotaTableRef = ref()

  const occupations = ref<IdNameOption[]>([])
  const levels = ref<CertOccupationLevel[]>([])
  const orgTree = ref<OrgTreeNode[]>([])
  const orgTreeProps = { label: 'name', children: 'children' }
  // 单位 → 其部门列表；按单位缓存，避免每次渲染下拉都请求
  const deptMap = reactive<Record<number, IdNameOption[]>>({})
  // 正在查部门的单位；用于把「加载中」和「确实没部门」区分开
  const deptLoading = reactive(new Set<number>())
  // 选项里带上 phone，选中负责人后可直接取，不必再查一次用户
  const userOptions = ref<{ id: number; label: string; phone?: string }[]>([])
  const userLoading = ref(false)
  const selectedQuotaKeys = ref<string[]>([])

  const form = reactive<{
    id?: number
    name: string
    occupationId?: number
    levelId?: number
    managerId?: number
    contactPhone: string
    applyDeadline: string
    startTime: string
    endTime: string
    description: string
    quotas: QuotaRow[]
  }>({
    id: undefined,
    name: '',
    occupationId: undefined,
    levelId: undefined,
    managerId: undefined,
    contactPhone: '',
    applyDeadline: '',
    startTime: '',
    endTime: '',
    description: '',
    quotas: []
  })

  const rules: FormRules = {
    name: [
      { required: true, message: '请输入鉴定名称', trigger: 'blur' },
      { max: 50, message: '鉴定名称不超过 50 字', trigger: 'blur' }
    ],
    occupationId: [{ required: true, message: '请选择鉴定工种', trigger: 'change' }],
    levelId: [{ required: true, message: '请选择鉴定级别', trigger: 'change' }],
    managerId: [{ required: true, message: '请选择负责人', trigger: 'change' }],
    contactPhone: [
      { required: true, message: '请输入联系电话', trigger: 'blur' },
      {
        pattern: /^[0-9+\-() ]+$/,
        message: '只能包含数字、+、-、括号与空格',
        trigger: 'blur'
      }
    ],
    applyDeadline: [{ required: true, message: '请选择报名截止时间', trigger: 'change' }],
    startTime: [{ required: true, message: '请选择鉴定开始时间', trigger: 'change' }],
    endTime: [{ required: true, message: '请选择鉴定结束时间', trigger: 'change' }]
  }

  const totalQuota = computed(() => form.quotas.reduce((sum, q) => sum + (Number(q.quota) || 0), 0))

  /** 工种下拉：只取启用的工种，停用的不该再被新项目选用 */
  async function loadOccupations() {
    try {
      const { data } = await certOccupationApi.getTree({ status: 1 })
      occupations.value = (data || []).map((o) => ({ id: o.id, name: o.name }))
    } catch {
      // 下拉加载失败不阻塞弹窗，用户可重开重试
    }
  }

  async function loadOrgs() {
    try {
      const { data } = await certProjectApi.getOrgOptions()
      orgTree.value = data || []
    } catch {
      // 同上
    }
  }

  /**
   * 部门列的占位文案
   *
   * 四种状态要分清：没选单位 / 正在查 / 该单位确实没部门 / 可选。
   * 不区分「正在查」和「没部门」的话，请求返回前会误报「该单位无部门」。
   */
  function deptPlaceholder(row: QuotaRow): string {
    if (!row.orgId) return '请先选单位'
    if (deptLoading.has(row.orgId)) return '加载中…'
    if (!deptMap[row.orgId]) return '选填'
    if (!deptMap[row.orgId].length) return '该单位无部门'
    return '选填'
  }

  /** 加载中不禁用（禁用会连 loading 都看不见），仅「确实没部门」时禁用 */
  function deptDisabled(row: QuotaRow): boolean {
    if (!row.orgId) return true
    if (deptLoading.has(row.orgId)) return false
    return !!deptMap[row.orgId] && !deptMap[row.orgId].length
  }

  /** 取某工种的级别列表（从工种树里捞，避免再开一个接口） */
  async function loadLevels(occupationId: number) {
    try {
      const { data } = await certOccupationApi.getDetail(occupationId)
      levels.value = data?.levels || []
    } catch {
      levels.value = []
    }
  }

  /** 取某单位下的部门，已缓存或正在查则跳过 */
  async function loadDepts(orgId: number) {
    if (!orgId || deptMap[orgId] || deptLoading.has(orgId)) return
    deptLoading.add(orgId)
    try {
      const { data } = await certProjectApi.getDeptOptions(orgId)
      deptMap[orgId] = data || []
    } catch {
      // 失败不写空数组：否则会被当成「该单位没部门」并永久禁用，
      // 下次换回这个单位还能重试
    } finally {
      deptLoading.delete(orgId)
    }
  }

  async function handleOccupationChange(id: number) {
    form.levelId = undefined
    levels.value = []
    if (id) await loadLevels(id)
  }

  /** 取本地 YYYY-MM-DD。不用 toISOString：那是 UTC，东八区会差一天 */
  function toDay(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  }

  /**
   * 报名截止时间选择器的默认时分秒
   *
   * 管理员在日历上点「10-15」时的意图是「10-15 那天还能报」，若沿用 Element 的
   * 默认 00:00:00，实际是这一天一开始就关、等于 10-14 截止，与直觉相反。
   * 日期部分由用户所选覆盖，此处只提供时分秒，故年月日取任意值即可。
   */
  const DEADLINE_DEFAULT_TIME = new Date(2000, 0, 1, 23, 59, 59)

  /**
   * 报名截止：须早于鉴定开始时刻，允许同一天
   *
   * 截止精确到时分秒后，「10-15 08:00 截止、10-15 09:00 开考」是合法配置，
   * 故日历只禁开始日之后的整天；同日内的时刻先后由 handleSubmit 兜住。
   */
  function disabledDeadline(date: Date): boolean {
    if (!form.startTime) return false
    return toDay(date) > form.startTime.slice(0, 10)
  }

  /** 鉴定开始：须晚于报名截止时刻（允许同日），且不晚于结束时间 */
  function disabledStart(date: Date): boolean {
    const day = toDay(date)
    if (form.applyDeadline && day < form.applyDeadline.slice(0, 10)) return true
    if (form.endTime && day > form.endTime.slice(0, 10)) return true
    return false
  }

  /** 鉴定结束：不早于开始时间 */
  function disabledEnd(date: Date): boolean {
    if (!form.startTime) return false
    return toDay(date) < form.startTime.slice(0, 10)
  }

  /**
   * 改了开始时间后，清掉已失效的截止日期与结束时间
   *
   * disabled-date 只挡后续选择，挡不住「先选好、再回头改开始时间」——
   * 那样留下的旧值是非法的，提交时才报错。
   */
  function handleStartChange() {
    if (!form.startTime) return
    if (form.applyDeadline && form.applyDeadline >= form.startTime) {
      form.applyDeadline = ''
      ElMessage.warning('报名截止时间须早于鉴定开始时间，已清空请重选')
    }
    if (form.endTime && form.endTime < form.startTime) {
      form.endTime = ''
      ElMessage.warning('鉴定结束时间不能早于开始时间，已清空请重选')
    }
  }

  function handleOrgChange(row: QuotaRow) {
    row.deptId = undefined
    if (row.orgId) loadDepts(row.orgId)
  }

  /** 负责人远程搜索（按姓名/登录名） */
  async function searchUsers(keyword: string) {
    userLoading.value = true
    try {
      const { data } = await getUserList({ keyword: keyword || undefined, pageSize: 20 })
      userOptions.value = (data?.list || []).map((u: any) => ({
        id: u.id,
        // 带上部门，同名的人能分清是哪个
        label: u.department?.name
          ? `${u.name || u.username}（${u.department.name}）`
          : u.name || u.username,
        phone: u.phone || undefined
      }))
    } catch {
      userOptions.value = []
    } finally {
      userLoading.value = false
    }
  }

  /**
   * 选了负责人后自动带出他的手机号
   * 只在联系电话还空着时填，避免覆盖用户手动改过的号码
   */
  function handleManagerChange(id: number) {
    if (!id || form.contactPhone.trim()) return
    const hit = userOptions.value.find((u) => u.id === id)
    if (hit?.phone) form.contactPhone = hit.phone
  }

  function addQuota() {
    form.quotas.push({ _key: nextKey(), quota: 1 })
  }

  function removeQuota(idx: number) {
    form.quotas.splice(idx, 1)
  }

  function handleQuotaSelectionChange(rows: QuotaRow[]) {
    selectedQuotaKeys.value = rows.map((r) => r._key)
  }

  function removeSelectedQuotas() {
    const keys = new Set(selectedQuotaKeys.value)
    form.quotas = form.quotas.filter((q) => !keys.has(q._key))
    selectedQuotaKeys.value = []
    quotaTableRef.value?.clearSelection()
  }

  /**
   * 打开弹窗
   * @param id 传 id 为编辑，不传为新增
   */
  async function open(id?: number) {
    isEditing.value = !!id
    visible.value = true
    if (!id) return

    try {
      const { data } = await certProjectApi.getDetail(id)
      if (!data) return
      Object.assign(form, {
        id: data.id,
        name: data.name,
        occupationId: data.occupationId,
        levelId: data.levelId,
        managerId: data.managerId,
        contactPhone: data.contactPhone ?? '',
        // 三个时间都取到秒；接口返回 ISO，这里截成控件要的格式
        applyDeadline: toDateTime(data.applyDeadline),
        startTime: toDateTime(data.startTime),
        endTime: toDateTime(data.endTime),
        description: data.description ?? '',
        quotas: (data.quotas || []).map((q) => ({
          _key: nextKey(),
          id: q.id,
          orgId: q.orgId,
          deptId: q.deptId,
          quota: q.quota
        }))
      })
      // 回填后补齐级别与各单位的部门下拉，否则编辑时只显示 id 不显示名称
      if (data.occupationId) await loadLevels(data.occupationId)
      await Promise.all([...new Set((data.quotas || []).map((q) => q.orgId))].map(loadDepts))
      // 负责人下拉需要有对应 option 才显示名字，用详情里的姓名先垫一条
      if (data.managerId) {
        userOptions.value = [{ id: data.managerId, label: data.managerName || '' }]
      }
    } catch (e: any) {
      ElMessage.error(e?.message || '获取项目详情失败')
    }
  }

  /** ISO 时间串 → 'YYYY-MM-DD HH:mm:ss'（控件的 value-format） */
  function toDateTime(v?: string): string {
    if (!v) return ''
    return v.replace('T', ' ').slice(0, 19)
  }

  async function handleSubmit() {
    try {
      await formRef.value?.validate()
    } catch {
      return
    }

    // 时间先后：disabled-date 只能按整天禁用，同一天内「结束时刻早于开始时刻」
    // 挡不住，故这里再兜一道（服务端也有）
    if (form.endTime < form.startTime) {
      ElMessage.warning('鉴定结束时间不能早于开始时间')
      return
    }
    if (form.applyDeadline >= form.startTime) {
      ElMessage.warning('报名截止时间必须早于鉴定开始时间')
      return
    }

    // 名额在提交前本地先拦一遍：服务端也会拒，但那要等一次往返，
    // 且错误只能整条弹出、指不到具体哪一行。
    // 单位和名额必填，部门选填。
    if (form.quotas.some((q) => !q.orgId)) {
      ElMessage.warning('名额里有没选单位的行，请补齐或删除该行')
      return
    }
    // ElInputNumber 可被清空成 null，故名额也要查
    if (form.quotas.some((q) => !q.quota || q.quota < 1)) {
      ElMessage.warning('名额里有没填数量的行，请补齐或删除该行')
      return
    }
    const seen = new Set<string>()
    for (const q of form.quotas) {
      const key = `${q.orgId}-${q.deptId ?? 'all'}`
      if (seen.has(key)) {
        ElMessage.warning(
          q.deptId
            ? '同一个部门只能分配一行名额，请合并后再提交'
            : '同一个单位只能有一行「不分部门」的名额，请合并后再提交'
        )
        return
      }
      seen.add(key)
    }

    submitting.value = true
    try {
      const payload = {
        name: form.name.trim(),
        occupationId: form.occupationId!,
        levelId: form.levelId!,
        managerId: form.managerId!,
        contactPhone: form.contactPhone.trim(),
        applyDeadline: form.applyDeadline,
        startTime: form.startTime,
        endTime: form.endTime,
        description: form.description.trim() || undefined,
        quotas: form.quotas.map((q) => ({
          id: q.id,
          orgId: q.orgId!,
          // 清空后 ElSelect 给的是空串/undefined，统一成 null 再发
          deptId: q.deptId || null,
          quota: q.quota
        }))
      }
      if (isEditing.value && form.id) {
        await certProjectApi.update({ id: form.id, ...payload })
        ElMessage.success('编辑鉴定项目成功')
      } else {
        await certProjectApi.add(payload)
        ElMessage.success('新增鉴定项目成功')
      }
      visible.value = false
      emit('saved')
    } catch (e: any) {
      ElMessage.error(e?.message || '保存失败')
    } finally {
      submitting.value = false
    }
  }

  /** 关闭后重置，避免下次打开残留上一个项目的数据 */
  function handleClosed() {
    formRef.value?.resetFields()
    Object.assign(form, {
      id: undefined,
      name: '',
      occupationId: undefined,
      levelId: undefined,
      managerId: undefined,
      contactPhone: '',
      applyDeadline: '',
      startTime: '',
      endTime: '',
      description: '',
      quotas: []
    })
    levels.value = []
    userOptions.value = []
    selectedQuotaKeys.value = []
    isEditing.value = false
  }

  onMounted(() => {
    loadOccupations()
    loadOrgs()
    // 预载一页用户，避免不搜索就打不开负责人下拉
    searchUsers('')
  })

  defineExpose({ open })
</script>

<style lang="scss" scoped>
  .quota-block {
    width: 100%;

    .quota-toolbar {
      display: flex;
      gap: 10px;
      align-items: center;
      margin-bottom: 10px;

      .quota-total {
        margin-left: auto;
        font-size: 13px;
        color: var(--art-text-gray-600);
      }
    }

    .quota-empty {
      font-size: 13px;
      color: var(--art-text-gray-500);
    }

    // 表头必填星号：表格内的单位/名额是必填，但它们不是 ElFormItem，
    // 拿不到表单自带的星号，只能在表头自己标（与 PracticeRulePanel 一致）
    .req {
      margin-right: 2px;
      color: var(--el-color-danger);
    }
  }
</style>
