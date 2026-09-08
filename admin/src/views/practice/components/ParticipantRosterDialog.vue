<!--
  参与人员名单弹窗（已发布/进行中的练习用）

  与编辑页的「参与人员」是两套语义，不可混用：
  编辑页提交完整名单（未列出的会被删除），本弹窗把「添加」与「移除」拆成
  两个独立动作各调一个接口。这样做是因为已开始练的人不能被移除——
  用勾选框表达完整名单，会让人以为取消勾选就能移除任何人。

  与考试的 CandidateRosterDialog 结构一致，仅实体与文案不同。
-->
<template>
  <ElDialog
    :model-value="modelValue"
    title="参与人员名单"
    width="1080px"
    append-to-body
    destroy-on-close
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    @open="handleOpen"
  >
    <div class="roster-head">
      <div class="roster-meta">
        <div class="roster-name">{{ practiceName }}</div>
        <div class="roster-count">
          共 {{ list.length }} 人<template v-if="practicedCount">
            ，其中 {{ practicedCount }} 人已开始练习
          </template>
        </div>
      </div>
      <div class="roster-actions">
        <!--
          批量移除只在有勾选时可用。禁用态也保留按钮而不是 v-if 隐藏，
          否则按钮随勾选忽隐忽现会让右上角布局跳动。
        -->
        <ElButton
          type="danger"
          plain
          :icon="Delete"
          :disabled="!selectedRows.length"
          @click="handleBatchRemove"
        >
          批量移除{{ selectedRows.length ? ` (${selectedRows.length})` : '' }}
        </ElButton>
        <ElButton type="primary" :icon="Plus" @click="pickerVisible = true">添加人员</ElButton>
      </div>
    </div>
    <!--
      row-key + reserve-selection：分页是前端切片，翻页会重建行节点，
      不留存勾选的话跨页选中会在翻页时丢失。
    -->
    <ElTable
      ref="tableRef"
      v-loading="loading"
      :data="pagedList"
      row-key="id"
      max-height="420"
      class="roster-table"
      @selection-change="(rows: PracticeParticipantRoster[]) => (selectedRows = rows)"
    >
      <ElTableColumn
        type="selection"
        width="48"
        reserve-selection
        :selectable="(row: PracticeParticipantRoster) => !row.hasPracticed"
      />
      <ElTableColumn label="姓名" prop="participantName" min-width="110" show-overflow-tooltip />
      <ElTableColumn label="类型" width="90">
        <template #default="{ row }">
          {{ row.participantType === 'internal' ? '内部人员' : '外部考生' }}
        </template>
      </ElTableColumn>
      <!-- 账号含义内外部不同，表头挂提示说明，与选择人员弹窗口径一致 -->
      <ElTableColumn prop="account" min-width="130" show-overflow-tooltip>
        <template #header>
          <span class="th-with-tip">
            账号
            <ElTooltip placement="top">
              <template #content>
                内部人员为统一身份账号<br />
                外部考生为账号
              </template>
              <ElIcon class="th-tip-icon"><QuestionFilled /></ElIcon>
            </ElTooltip>
          </span>
        </template>
        <template #default="{ row }">{{ row.account || '-' }}</template>
      </ElTableColumn>
      <ElTableColumn label="身份证号" prop="idCard" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">{{ row.idCard || '-' }}</template>
      </ElTableColumn>
      <ElTableColumn label="手机号" prop="phone" min-width="115" show-overflow-tooltip>
        <template #default="{ row }">{{ row.phone || '-' }}</template>
      </ElTableColumn>
      <ElTableColumn label="所属" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">{{ row.companyName || '-' }}</template>
      </ElTableColumn>
      <ElTableColumn label="状态" width="110">
        <template #default="{ row }">
          <ElTag :type="row.hasPracticed ? 'warning' : 'info'" size="small" effect="light">
            {{ row.hasPracticed ? '已开始练习' : '未开始' }}
          </ElTag>
        </template>
      </ElTableColumn>
      <ElTableColumn label="操作" width="90" align="left" fixed="right">
        <template #default="{ row }">
          <!--
            已开始练习的不给移除：练习记录挂的是 practiceId + 人员定位字段，
            不走 PracticeParticipant 外键，删掉分配不会级联删记录，
            只会留下一份无主记录。
            用 span 包住 disabled 按钮，否则 disabled 元素不触发鼠标事件、tooltip 不显示。
          -->
          <ElTooltip
            :disabled="!row.hasPracticed"
            content="该人员已开始练习，无法移除"
            placement="top"
          >
            <span>
              <ElButton link type="danger" :disabled="row.hasPracticed" @click="handleRemove(row)">
                移除
              </ElButton>
            </span>
          </ElTooltip>
        </template>
      </ElTableColumn>
      <template #empty>该练习尚无参与人员，点右上角「添加人员」</template>
    </ElTable>

    <!-- 前端切片分页：名单接口一次返回全量，不再为翻页往返 -->
    <!--
      不加 small：全局 ElConfigProvider 是 size="default"，且 el-ui.scss 里
      那套分页尺寸调校只挂在 .el-pagination--default 上，写 small 会整段绕开，
      与页面上其他分页条对不齐。
    -->
    <ElPagination
      v-if="list.length > pageSize"
      class="roster-pager"
      layout="total, sizes, prev, pager, next"
      :current-page="page"
      :page-size="pageSize"
      :page-sizes="[10, 20, 50, 100]"
      :total="list.length"
      @current-change="(p: number) => (page = p)"
      @size-change="handleSizeChange"
    />

    <template #footer>
      <ElButton @click="emit('update:modelValue', false)">关闭</ElButton>
    </template>
  </ElDialog>

  <!--
    与上面的 ElDialog 并列而非嵌套：ElDialog 的 append-to-body 会把节点 teleport
    到 body，嵌套写法下两层遮罩的层级容易错乱。
    传 :selected="[]" 是有意的——这里只表达「要新增谁」，不是完整名单。
  -->
  <CandidatePickerDialog
    v-model="pickerVisible"
    :selected="[]"
    title="添加参与人员"
    empty-text="尚未选择要添加的人员"
    @confirm="handleAppend"
  />
</template>

<script setup lang="ts">
  import { ref, computed, watch } from 'vue'
  import { ElMessage, ElMessageBox, type ElTable as ElTableType } from 'element-plus'
  import { Plus, Delete, QuestionFilled } from '@element-plus/icons-vue'
  import { practiceApi, type PracticeParticipantRoster } from '@/api/practice'
  import CandidatePickerDialog, {
    type PickedCandidate
  } from '@/components/business/pickers/CandidatePickerDialog.vue'

  const props = defineProps<{
    modelValue: boolean
    practiceId: number
    practiceName: string
  }>()

  const emit = defineEmits<{
    (e: 'update:modelValue', v: boolean): void
    /** 名单发生增减，通知父页刷新（参与人数列会变） */
    (e: 'changed'): void
  }>()

  const loading = ref(false)
  const list = ref<PracticeParticipantRoster[]>([])
  const pickerVisible = ref(false)
  const tableRef = ref<InstanceType<typeof ElTableType>>()
  const selectedRows = ref<PracticeParticipantRoster[]>([])

  const practicedCount = computed(() => list.value.filter((r) => r.hasPracticed).length)

  /* 分页在前端切片：名单接口一次返回全量，翻页无需再往返后端 */
  const page = ref(1)
  const pageSize = ref(10)
  const pagedList = computed(() => {
    const start = (page.value - 1) * pageSize.value
    return list.value.slice(start, start + pageSize.value)
  })

  /*
    名单长度变化后收敛页码。

    批量移除掉某页全部人之后，page 会停在一个已不存在的页上，
    表格因此显示空白——用户以为名单被清空了。这里把页码拉回最后一页。
  */
  watch(
    () => list.value.length,
    (len) => {
      const maxPage = Math.max(1, Math.ceil(len / pageSize.value))
      if (page.value > maxPage) page.value = maxPage
    }
  )

  /** 改每页条数：回到第一页，否则原页码在新页长下可能已越界 */
  function handleSizeChange(size: number) {
    pageSize.value = size
    page.value = 1
  }

  /**
   * 清空勾选
   *
   * reserve-selection 会跨页留存选中行，增删后不清的话，
   * 已被移除的行仍留在 selectedRows 里，下次批量移除会带上不存在的 id。
   */
  function clearSelection() {
    tableRef.value?.clearSelection()
    selectedRows.value = []
  }

  /*
    名单请求序号，用于丢弃过期响应。

    弹窗可反复开关、且每次增删后都会重新拉取，多个请求在飞时若先发的后返回，
    会把已经刷新出来的新名单覆盖回旧内容。await 回来先比对序号再赋值。
  */
  let seq = 0

  /**
   * 弹窗打开：先清空上一份名单再拉取
   *
   * 父页关闭弹窗时只置 visible=false、不清 practiceId，组件因此一直挂载，
   * `destroy-on-close` 也只销毁 ElDialog 的内容插槽，销毁不到这里的 list。
   * 不清空的话，切到另一个练习时标题已是新练习、表格却还是上一份人员，
   * 慢网下这个错配窗口足够被看清。
   */
  function handleOpen() {
    list.value = []
    // 页码与勾选都是上一个练习留下的状态，不重置会带进这一个
    page.value = 1
    clearSelection()
    void loadRoster()
  }

  /** 拉取名单（弹窗 open 时与每次增删后调用） */
  async function loadRoster() {
    const mine = ++seq
    loading.value = true
    try {
      const { data } = await practiceApi.getParticipants(props.practiceId)
      if (mine !== seq) return
      list.value = data ?? []
    } catch (error: any) {
      if (mine !== seq) return
      ElMessage.error(error?.message || '加载参与人员名单失败')
    } finally {
      // 只有最新一次请求才收掉 loading，否则过期响应会提前解除加载态
      if (mine === seq) loading.value = false
    }
  }

  /** 添加人员（只增不减，已在名单里的由后端跳过） */
  async function handleAppend(picked: PickedCandidate[]) {
    if (!picked.length) return
    try {
      const res = await practiceApi.appendParticipants(
        props.practiceId,
        picked.map((c) => ({
          participantType: c.type,
          internalUserId: c.type === 'internal' ? c.id : undefined,
          externalCandidateId: c.type === 'external' ? c.id : undefined
        }))
      )
      // 后端会区分「已追加 N 名」与「均已在名单中，无新增」，原样透出更准确
      ElMessage.success(res.message || '添加成功')
      clearSelection()
      await loadRoster()
      emit('changed')
    } catch (error: any) {
      ElMessage.error(error?.message || '添加失败')
    }
  }

  /** 移除单个人员（已开始练习的按钮已禁用，此处只处理未开始的） */
  async function handleRemove(row: PracticeParticipantRoster) {
    try {
      await ElMessageBox.confirm(
        `确定将「${row.participantName}」从本练习的参与人员中移除吗？`,
        '移除人员',
        { type: 'warning', confirmButtonText: '移除', cancelButtonText: '取消' }
      )
      const res = await practiceApi.removeParticipants(props.practiceId, [row.id])
      ElMessage.success(res.message || '移除成功')
      /*
        先本地剔除该行，再去拉权威名单。

        只依赖 loadRoster 的话，刷新失败时表格里仍留着这个已被删掉的人，
        用户可以再点一次「移除」，对一个已不存在的行 id 发请求。
      */
      list.value = list.value.filter((r) => r.id !== row.id)
      /*
        单个移除也要清勾选：这一行可能同时处在勾选集里，
        不清的话它会以「已删除的 id」留在 selectedRows，被下一次批量移除带上。
      */
      clearSelection()
      await loadRoster()
      emit('changed')
    } catch (error: any) {
      if (error !== 'cancel') ElMessage.error(error?.message || '移除失败')
    }
  }

  /**
   * 批量移除勾选的人员
   *
   * 勾选列已用 selectable 挡掉已开始练习的人，所以这里的 id 理论上都可移除；
   * 但后端仍会二次判定并跳过已开练者（打开弹窗后有人正好开始练），
   * 故沿用它返回的文案而不是本地拼「已移除 N 人」。
   */
  async function handleBatchRemove() {
    const rows = selectedRows.value
    if (!rows.length) return
    try {
      // 只列前三个名字，几十人时全列会把确认框撑得没法读
      const names = rows
        .slice(0, 3)
        .map((r) => r.participantName)
        .join('、')
      const suffix = rows.length > 3 ? ` 等 ${rows.length} 人` : ''
      await ElMessageBox.confirm(
        `确定将「${names}」${suffix}从本练习的参与人员中移除吗？`,
        '批量移除',
        { type: 'warning', confirmButtonText: '移除', cancelButtonText: '取消' }
      )
      const res = await practiceApi.removeParticipants(
        props.practiceId,
        rows.map((r) => r.id)
      )
      ElMessage.success(res.message || '移除成功')
      clearSelection()
      await loadRoster()
      emit('changed')
    } catch (error: any) {
      if (error !== 'cancel') ElMessage.error(error?.message || '移除失败')
    }
  }
</script>

<style lang="scss" scoped>
  /* 账号列表头挂了问号提示，样式走公共 mixin，与选择人员弹窗同一出口 */
  .roster-table {
    @include tableHeaderTip();
  }

  /* 分页条右对齐，与表格拉开一点距离 */
  .roster-pager {
    justify-content: flex-end;
    margin-top: 12px;
  }

  /* 批量移除 + 添加人员：不随左侧文案换行，flex-shrink 交给左侧的 min-width:0 */
  .roster-actions {
    display: flex;
    flex-shrink: 0;
    gap: 8px;
    align-items: center;
  }

  .roster-head {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 12px;

    .roster-meta {
      min-width: 0;
    }

    .roster-name {
      overflow: hidden;
      font-size: 15px;
      font-weight: 500;
      color: var(--art-text-gray-800);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .roster-count {
      margin-top: 4px;
      font-size: 13px;
      color: var(--art-text-gray-600);
    }
  }
</style>
