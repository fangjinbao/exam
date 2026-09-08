<!-- 试卷管理：试卷的查询、手动/AI/随机组卷、编辑、发布、预览与删除（数据走真实后端） -->
<template>
  <div class="paper">
    <!-- 筛选卡片 -->
    <ElCard shadow="never" class="filter-card">
      <ElForm :model="filterForm" :inline="true" class="filter-form">
        <ElFormItem label="试卷名称">
          <ElInput
            v-model="filterForm.keyword"
            placeholder="输入试卷名称"
            clearable
            class="filter-input"
          />
        </ElFormItem>
        <ElFormItem label="试卷类型">
          <ElSelect v-model="filterForm.type" placeholder="全部" clearable class="filter-input">
            <ElOption label="固定试卷" value="fixed" />
            <ElOption label="随机试卷" value="random" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="状态">
          <ElSelect v-model="filterForm.status" placeholder="全部" clearable class="filter-input">
            <ElOption label="草稿" value="draft" />
            <ElOption label="待生成" value="pending" />
            <ElOption label="已发布" value="published" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="可见范围">
          <ElSelect
            v-model="filterForm.visibleScope"
            placeholder="全部"
            clearable
            class="filter-input"
          >
            <ElOption
              v-for="opt in VISIBLE_SCOPE_OPTIONS"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem>
          <ElCheckbox v-model="filterForm.onlyMine" class="only-mine" @change="handleSearch">
            仅看我创建的
          </ElCheckbox>
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
        <ElDropdown v-auth="'add'" @command="handleAddCommand">
          <ElButton type="primary" :icon="Plus">
            新增试卷<ElIcon class="el-icon--right"><ArrowDown /></ElIcon>
          </ElButton>
          <template #dropdown>
            <ElDropdownMenu>
              <ElDropdownItem command="fixed">手动组卷</ElDropdownItem>
              <!-- AI 组卷入口暂时下线，paper-edit 的 ai 模式与 aiCompose 接口保留 -->
              <ElDropdownItem command="random">随机试卷</ElDropdownItem>
            </ElDropdownMenu>
          </template>
        </ElDropdown>
        <ElButton
          v-auth="'export'"
          type="info"
          plain
          :icon="Download"
          :loading="exporting"
          @click="handleExportList"
        >
          导出
        </ElButton>
        <!-- 未选中时保持中性灰，选中后才转为 danger 提示破坏性 -->
        <ElButton
          v-auth="'batch-delete'"
          :type="selectedIds.length ? 'danger' : 'info'"
          plain
          :icon="Delete"
          :disabled="!selectedIds.length"
          @click="handleBatchDelete"
        >
          批量删除{{ selectedIds.length ? `(${selectedIds.length})` : '' }}
        </ElButton>
      </div>

      <div class="table-container">
        <ElTable
          v-loading="loading"
          :data="tableData"
          height="100%"
          style="width: 100%"
          @selection-change="handleSelectionChange"
        >
          <ElTableColumn type="selection" width="50" align="center" fixed="left" />
          <ElTableColumn
            prop="name"
            label="试卷名称"
            min-width="200"
            show-overflow-tooltip
            fixed="left"
          />
          <ElTableColumn prop="type" label="类型" width="110" align="center">
            <template #default="{ row }">
              <ElTag
                :type="row.type === 'fixed' ? 'primary' : 'warning'"
                size="small"
                disable-transitions
              >
                {{ row.type === 'fixed' ? '固定试卷' : '随机试卷' }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="totalScore" label="总分" width="100" align="center" />
          <ElTableColumn prop="questionCount" label="题目数" width="100" align="center" />
          <ElTableColumn prop="suggestDuration" label="建议时长" width="120" align="center">
            <template #default="{ row }">{{ row.suggestDuration }} 分钟</template>
          </ElTableColumn>
          <ElTableColumn prop="status" label="状态" width="100" align="center">
            <template #default="{ row }">
              <ElTag :type="statusTag(row.status).type" size="small" disable-transitions>
                {{ statusTag(row.status).text }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="createByName" label="创建人" width="110" show-overflow-tooltip>
            <template #default="{ row }">{{ row.createByName || '-' }}</template>
          </ElTableColumn>
          <!-- 所属单位取创建人部门上溯到的公司节点，后端实时派生，未挂部门的账号为空 -->
          <ElTableColumn
            prop="createByOrgName"
            label="所属单位"
            min-width="150"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ row.createByOrgName || '-' }}</template>
          </ElTableColumn>
          <ElTableColumn label="共享" width="170" align="center">
            <template #default="{ row }">
              <ElTag size="small" type="info" disable-transitions>
                {{ scopeLabel(row.visibleScope) }}
              </ElTag>
              <!-- 「仅自己」不涉及他人权限，级别标签无意义故不展示 -->
              <template v-if="row.visibleScope !== 'self'">
                <!-- 三档配色：可管理=success 可查看=warning 取值读不出来=info（中性）。
                     不能把「未知」并进 warning，否则它和合法的「可查看」同色，只能靠文案分辨 -->
                <ElTag
                  size="small"
                  class="level-tag"
                  :type="levelTagType(row.shareLevel)"
                  :effect="levelTagEffect(row.shareLevel)"
                  disable-transitions
                >
                  {{ levelLabel(row.shareLevel) }}
                </ElTag>
              </template>
            </template>
          </ElTableColumn>
          <!-- 操作列间距与对齐由全局 .table-actions 统一（见 assets/styles/el-ui.scss） -->
          <ElTableColumn
            label="操作"
            width="280"
            align="left"
            fixed="right"
            class-name="table-actions"
          >
            <template #default="{ row }">
              <!-- 待生成的随机卷还没有题目，预览无内容可看，禁用并说明原因 -->
              <ElTooltip
                :disabled="row.status !== 'pending'"
                content="尚未生成题目，生成后可预览"
                placement="top"
              >
                <span>
                  <ElButton
                    v-auth="'detail'"
                    link
                    type="primary"
                    :disabled="row.status === 'pending'"
                    @click="handlePreview(row)"
                    >预览</ElButton
                  >
                </span>
              </ElTooltip>
              <!-- 只读共享时禁用而非隐藏，让用户看得到入口也知道自己没权限 -->
              <ElTooltip
                :disabled="row.canManage !== false"
                content="该试卷为只读共享，无权修改"
                placement="top"
              >
                <span>
                  <ElButton
                    v-auth="'update'"
                    link
                    type="primary"
                    :disabled="row.status === 'published' || row.canManage === false"
                    @click="handleEdit(row)"
                  >
                    编辑
                  </ElButton>
                </span>
              </ElTooltip>
              <!--
                主行动位：只放生命周期的下一步，待生成给「生成试卷」、草稿给「发布」。
                已发布的卷子无下一步，此位留空。
              -->
              <ElButton
                v-if="row.type === 'random' && row.status === 'pending'"
                v-auth="'edit'"
                link
                type="primary"
                :disabled="row.canManage === false"
                @click="handleGenerate(row)"
              >
                生成试卷
              </ElButton>
              <ElButton
                v-else-if="row.status === 'draft'"
                v-auth="'publish'"
                link
                type="success"
                :disabled="row.canManage === false"
                @click="handlePublish(row)"
              >
                发布
              </ElButton>
              <!-- 低频与破坏性操作收进下拉，避免七个按钮平铺折行、各行错位 -->
              <ElDropdown
                v-if="moreActions(row).length"
                trigger="click"
                @command="handleMoreCommand"
              >
                <span class="more-trigger">
                  更多<ElIcon><ArrowDown /></ElIcon>
                </span>
                <template #dropdown>
                  <ElDropdownMenu>
                    <ElDropdownItem
                      v-for="action in moreActions(row)"
                      :key="action.command"
                      :command="{ command: action.command, row }"
                      :disabled="action.disabled"
                      :class="{ 'is-danger': action.danger }"
                    >
                      {{ action.label }}
                    </ElDropdownItem>
                  </ElDropdownMenu>
                </template>
              </ElDropdown>
            </template>
          </ElTableColumn>
          <template #empty>暂无试卷数据</template>
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
          @current-change="loadPaperList"
        />
      </div>
    </ElCard>

    <!-- 预览抽屉：试卷正文偏长，侧滑比居中弹窗更适合纵向阅读 -->
    <ElDrawer v-model="previewVisible" title="试卷预览" size="900px" class="preview-drawer">
      <div v-loading="previewLoading" class="preview-body">
        <template v-if="previewData">
          <!-- 有实体题目就走纸质试卷版式：固定卷、以及已生成的随机卷 -->
          <template v-if="hasEntityQuestions">
            <!-- 版本切换：裸开关看不出当前处于哪一版，分段控件把两个态都摊开 -->
            <div class="preview-toolbar">
              <span class="toolbar-label">卷面版本</span>
              <ElSegmented v-model="paperVersion" :options="versionOptions" size="default" />
            </div>
            <div class="paper-doc">
              <!-- 卷头 -->
              <div class="paper-head">
                <h2 class="paper-title">{{ previewData.name }}</h2>
                <div class="paper-meta">
                  总分 {{ previewData.totalScore }} 分 · 共 {{ previewData.questionCount }} 题
                  <!-- 材料题按 1 题计入 questionCount，实际作答位是其小题数之和，两者不等时标出 -->
                  <template v-if="answerSlotCount !== previewData.questionCount">
                    （{{ answerSlotCount }} 个作答位）
                  </template>
                  · 建议时长 {{ previewData.suggestDuration }} 分钟
                </div>
              </div>

              <!-- 按题型分大题 -->
              <div
                v-for="(section, sIdx) in previewSections"
                :key="section.type"
                class="paper-section"
              >
                <div class="section-heading">
                  {{ cnNumeral(sIdx) }}、{{ dictLabel('question_type', section.type) }}（共
                  {{ section.count }} 题，共 {{ section.totalScore }} 分）
                </div>
                <div v-for="(q, qIdx) in section.items" :key="q.id" class="paper-question">
                  <div class="q-stem">
                    <span class="q-no">{{ qIdx + 1 }}.</span>
                    <!--
                      题干走 v-html 渲染富文本：stemText 是服务端 stripHtml 出的纯文本镜像
                      （供搜索与 Excel 导出），拿它渲染会把题干里的图片与格式吃掉，
                      卷面预览就看不到图文题的图。stem 在写入时已由 sanitizeRichText 净化
                      （无 a 标签、img 仅允许 data: 协议、script 连内容一起丢弃），可安全 v-html。
                      stem 缺失时才回退到纯文本镜像。
                    -->
                    <span class="q-text rich-text" v-html="q.stem || q.stemText || ''"></span>
                    <!-- 材料题本身不作答：分值是小题之和，逐题分值标在各小题上 -->
                    <span v-if="!showAnswer && !isComposite(q)" class="q-score"
                      >（{{ q.score }} 分）</span
                    >
                    <span v-if="isComposite(q)" class="q-score">（共 {{ q.score }} 分）</span>
                  </div>
                  <!-- 选项同样可能图文混排，用 splitOptionsRich 保留 HTML；序号仍是纯文本 -->
                  <div v-if="splitOptionsRich(q.options).length" class="q-options">
                    <div
                      v-for="(opt, oIdx) in splitOptionsRich(q.options)"
                      :key="oIdx"
                      class="q-option"
                    >
                      <span v-if="opt.key" class="q-option-key">{{ opt.key }}.</span>
                      <span class="rich-text" v-html="opt.html"></span>
                    </div>
                  </div>
                  <!-- 材料题的小题：材料在上，小题依次排在下面，与实际卷面一致 -->
                  <div v-if="q.children?.length" class="q-children">
                    <div v-for="(c, cIdx) in q.children" :key="c.id" class="q-child">
                      <div class="q-stem">
                        <span class="q-no">（{{ cIdx + 1 }}）</span>
                        <!-- 同题干：富文本渲染，见上方大题处的说明 -->
                        <span class="q-text rich-text" v-html="c.stem || c.stemText || ''"></span>
                        <span class="q-type-tag"
                          >（{{ dictLabel('question_type', c.questionType) }}）</span
                        >
                        <span v-if="!showAnswer" class="q-score">（{{ c.score }} 分）</span>
                      </div>
                      <div v-if="splitOptionsRich(c.options).length" class="q-options">
                        <div
                          v-for="(opt, oIdx) in splitOptionsRich(c.options)"
                          :key="oIdx"
                          class="q-option"
                        >
                          <span v-if="opt.key" class="q-option-key">{{ opt.key }}.</span>
                          <span class="rich-text" v-html="opt.html"></span>
                        </div>
                      </div>
                      <template v-if="showAnswer">
                        <div class="q-answer"
                          >【答案】{{ c.answer || '-' }}　（{{ c.score }} 分）</div
                        >
                        <!-- analysis 服务端同样按富文本净化，插值会把标签当可见文字显示 -->
                        <div v-if="c.analysis" class="q-analysis">
                          【解析】<span class="rich-text" v-html="c.analysis"></span>
                        </div>
                      </template>
                    </div>
                  </div>
                  <!-- 材料题没有自己的答案，不能落进这个分支渲染出「答案 -」 -->
                  <template v-if="showAnswer && !isComposite(q)">
                    <div class="q-answer">【答案】{{ q.answer || '-' }}　（{{ q.score }} 分）</div>
                    <div v-if="q.analysis" class="q-analysis">
                      【解析】<span class="rich-text" v-html="q.analysis"></span>
                    </div>
                  </template>
                  <!-- 材料题的整体解析（若录了）排在所有小题之后 -->
                  <div v-if="showAnswer && isComposite(q) && q.analysis" class="q-analysis">
                    【材料解析】{{ q.analysis }}
                  </div>
                </div>
              </div>
              <div v-if="!previewSections.length" class="paper-empty">该试卷暂无题目</div>
            </div>
          </template>

          <!-- 未生成的随机试卷：只能看抽题规则 -->
          <template v-else>
            <div class="paper-head">
              <h2 class="paper-title">{{ previewData.name }}</h2>
              <div class="paper-meta">
                总分 {{ previewData.totalScore }} 分 · 共 {{ previewData.questionCount }} 题 ·
                建议时长 {{ previewData.suggestDuration }} 分钟 · 待生成
              </div>
            </div>
            <ElAlert
              type="warning"
              :closable="false"
              show-icon
              title="该试卷尚未生成题目，以下为抽题规则。生成后可预览真实卷面。"
              class="preview-alert"
            />
            <div class="section-title">抽题规则</div>
            <div class="rule-table-wrap">
              <ElTable :data="previewData.rules" height="100%">
                <ElTableColumn type="index" label="序号" width="70" align="center" />
                <ElTableColumn
                  label="题型"
                  width="120"
                  align="center"
                  :formatter="(r: PaperRuleDetail) => dictLabel('question_type', r.questionType)"
                />
                <!-- 难度/知识点留空表示不限，避免显示成空白格 -->
                <ElTableColumn
                  label="难度"
                  width="100"
                  align="center"
                  :formatter="
                    (r: PaperRuleDetail) =>
                      r.difficulty ? dictLabel('difficulty', r.difficulty) : '不限'
                  "
                />
                <ElTableColumn
                  label="知识点"
                  min-width="160"
                  show-overflow-tooltip
                  :formatter="(r: PaperRuleDetail) => r.knowledgePointName || '不限'"
                />
                <ElTableColumn prop="drawCount" label="抽取数量" width="110" align="center" />
                <ElTableColumn
                  prop="scorePerQuestion"
                  label="每题分值"
                  width="110"
                  align="center"
                />
                <ElTableColumn label="可用题量" width="110" align="center">
                  <template #default="{ row }">
                    <span :class="{ 'text-danger': row.availableCount < row.drawCount }">{{
                      row.availableCount
                    }}</span>
                  </template>
                </ElTableColumn>
              </ElTable>
            </div>
          </template>
        </template>
      </div>
      <!-- ElDrawer 的 footer 插槽不带按钮间距，自行包一层控制对齐与 gap -->
      <template #footer>
        <div class="preview-footer">
          <ElButton @click="previewVisible = false">关闭</ElButton>
          <ElButton
            v-auth="'export'"
            type="primary"
            :icon="Download"
            :disabled="!previewData"
            @click="handleExportCurrent"
          >
            导出本卷
          </ElButton>
        </div>
      </template>
    </ElDrawer>

    <!-- 共享设置弹窗：独立于编辑，已发布试卷也可调整共享范围 -->
    <ElDialog v-model="shareVisible" title="共享设置" width="460px" @closed="handleShareClosed">
      <ElForm :model="shareForm" label-width="90px">
        <ElFormItem label="试卷名称">
          <span class="share-paper-name">{{ shareForm.name }}</span>
        </ElFormItem>
        <ElFormItem label="可见范围">
          <ElSelect v-model="shareForm.visibleScope" style="width: 100%">
            <ElOption
              v-for="opt in VISIBLE_SCOPE_OPTIONS"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </ElSelect>
        </ElFormItem>
        <!-- 「仅自己」时他人根本看不到，权限级别无意义故隐藏 -->
        <ElFormItem v-if="shareForm.visibleScope !== 'self'" label="权限级别">
          <ElRadioGroup v-model="shareForm.shareLevel">
            <ElRadio v-for="opt in SHARE_LEVEL_OPTIONS" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </ElRadio>
          </ElRadioGroup>
          <div class="share-tip">
            {{
              shareForm.shareLevel === 'manage'
                ? '范围内成员可编辑、发布、删除本试卷'
                : '范围内成员仅可预览，不能编辑、发布或删除'
            }}
          </div>
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="shareVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="shareSaving" @click="handleShareSubmit">保存</ElButton>
      </template>
    </ElDialog>
  </div>
</template>
<script setup lang="ts">
  import { ref, reactive, computed, onMounted, onActivated } from 'vue'
  import { useRouter, useRoute } from 'vue-router'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { Search, Plus, Delete, ArrowDown, Download } from '@element-plus/icons-vue'
  import { matchAuthMark } from '@/utils/permission/authMatch'
  import {
    paperApi,
    VISIBLE_SCOPE_OPTIONS,
    SHARE_LEVEL_OPTIONS,
    type Paper,
    type PaperDetail,
    type PaperRuleDetail,
    type VisibleScope,
    type ShareLevel
  } from '@/api/paper'
  import { dataDictApi, type DictDataItem } from '@/api/dataDict'
  import { exportToExcel, type ExcelColumn } from '@/utils/excel'
  // splitOptions 供 Excel 导出（纯文本），splitOptionsRich 供卷面预览（保留图文）
  import { groupByType, cnNumeral, splitOptions, splitOptionsRich } from '@/utils/paperStructure'

  defineOptions({ name: 'Paper' })

  // 组卷类型：fixed 手动组卷 / ai AI 组卷 / random 随机试卷（用于跳转创建页）
  type FormType = 'fixed' | 'ai' | 'random'

  const router = useRouter()
  const route = useRoute()

  /*
    权限判断（供「更多」下拉用）。

    v-auth 指令只切 display:none，套在下拉项上会留下一个空菜单——点开什么都没有。
    故下拉项改由 JS 判权限，无可用项时整个「更多」入口都不渲染。

    权限点在 setup 期一次性快照，不用 computed 跟随 route：本页被 keep-alive 缓存，
    route 是全局响应式对象，切到别的页面后缓存组件若重渲染，会拿新路由的 authList
    误判本页按钮（与 directives/auth.ts 里同一个坑，那边也是挂载时快照）。
  */
  const authCodes = ((route.meta.authList as Array<{ authMark: string }> | undefined) ?? []).map(
    (item) => item.authMark
  )
  /** 当前用户是否有某个操作权限 */
  function can(action: string) {
    return matchAuthMark(authCodes, action)
  }

  const loading = ref(false)
  const tableData = ref<Paper[]>([])
  // 表格勾选的试卷 id（批量删除用）
  const selectedIds = ref<number[]>([])
  // 勾选中无管理权（只读共享）的试卷名，批量删除前用于提示
  const noManageNames = ref<string[]>([])
  const pagination = reactive({ page: 1, pageSize: 10, total: 0 })
  const filterForm = reactive<{
    keyword: string
    type: string
    status: string
    visibleScope: VisibleScope | ''
    onlyMine: boolean
  }>({
    keyword: '',
    type: '',
    status: '',
    visibleScope: '',
    onlyMine: false
  })

  // 取值无法识别时兜底「未知」而不是某个具体档位：
  // 原先兜底「全部组织」「可管理」会把一条读不出来的记录显示成最大权限，
  // 在表格和导出里等于谎报权限；兜底成最小档又会谎报成更严格。都不如直说读不出来。
  /** 可见范围 value 转显示名 */
  const scopeLabel = (v?: string) =>
    VISIBLE_SCOPE_OPTIONS.find((o) => o.value === v)?.label || '未知'
  /** 权限级别 value 转显示名 */
  const levelLabel = (v?: string) => SHARE_LEVEL_OPTIONS.find((o) => o.value === v)?.label || '未知'
  type TagType = 'primary' | 'success' | 'info' | 'warning' | 'danger'
  /**
   * 权限级别标签配色，与 levelLabel 的输出一一对应
   *
   * 用 Record<ShareLevel, TagType> 而非硬编码比对：将来给 ShareLevel 加档位时，
   * 这里会因缺键而编译失败，从而强制同步；写成三元链则会静默把新档位当成未知。
   * 未知档取 danger+plain 而不是 info：左边的可见范围标签固定是 info，
   * 再用 info 两个标签会撞色；脏数据本就是该排查的异常态，用弱警示样式更贴切。
   */
  const LEVEL_TAG_TYPE: Record<ShareLevel, TagType> = {
    manage: 'success',
    view: 'warning'
  }
  /**
   * 用类型守卫而非 `v as ShareLevel` 断言：断言在类型上把非法值也说成合法（索引结果恒非
   * undefined），只是运行时靠兜底救回来。守卫做的是真实存在性检查，Record 的穷尽性不受影响。
   * 下面两个函数共用它，判断口径只有一处，不会出现「配色认它、描边不认它」的分歧。
   * 正常流程走不到非法值（后端 DTO 有 @IsIn 校验），这里防的是绕过应用层写库的脏数据。
   */
  function isShareLevel(v?: string): v is ShareLevel {
    // 刻意不用 `in`（会走原型链，'toString' 这类脏值会被当成合法档位、索引出继承的函数），
    // 也不用 Object.hasOwn（ES2022 运行时 API；本项目构建只转译语法、不打 polyfill，
    // 这类 API 会原样进产物并在旧浏览器抛错）。hasOwnProperty.call 两者都避开。
    return v !== undefined && Object.prototype.hasOwnProperty.call(LEVEL_TAG_TYPE, v)
  }
  const levelTagType = (v?: string): TagType => (isShareLevel(v) ? LEVEL_TAG_TYPE[v] : 'danger')
  /** 未知档用描边样式进一步与正常档位区分 */
  const levelTagEffect = (v?: string): 'light' | 'plain' => (isShareLevel(v) ? 'light' : 'plain')

  // 共享设置弹窗
  const shareVisible = ref(false)
  const shareSaving = ref(false)
  const shareForm = reactive<{
    id: number
    name: string
    visibleScope: VisibleScope
    shareLevel: ShareLevel
  }>({
    id: 0,
    name: '',
    // 初值与兜底同为最小权限（self + view），打开弹窗时会被实际行值覆盖
    visibleScope: 'self',
    shareLevel: 'view'
  })

  // 字典数据源（预览页题型/难度显示名）
  const dict = reactive<{ question_type: DictDataItem[]; difficulty: DictDataItem[] }>({
    question_type: [],
    difficulty: []
  })

  // 预览
  const previewVisible = ref(false)
  const previewLoading = ref(false)
  const previewData = ref<PaperDetail>()
  // 预览卷面版本：学生版只见题、教师版附答案与解析
  const paperVersion = ref<'student' | 'teacher'>('student')
  const versionOptions = [
    { label: '学生版', value: 'student' },
    { label: '教师版', value: 'teacher' }
  ]
  const showAnswer = computed(() => paperVersion.value === 'teacher')
  // 列表导出 loading
  const exporting = ref(false)

  /** 字典 value 转显示名 */
  function dictLabel(key: 'question_type' | 'difficulty', value: string) {
    return dict[key].find((d) => d.value === value)?.name || value
  }

  /**
   * 是否材料题
   *
   * 按 questionType 判定而非 children 长度：一道小题被全部删掉的材料题
   * children 为空，若按长度判会被当成普通题渲染出「答案 -」。
   */
  function isComposite(q: { questionType?: string }) {
    return q.questionType === 'composite'
  }

  /**
   * 卷面实际作答位数
   *
   * questionCount 存的是根节点数（材料题算 1 题），学生端实际作答位则是
   * 材料题展开成小题后的数量，与后端取卷的 expandCompositeSlots 一致。
   * 材料题按其小题数计（无小题即 0 个作答位），普通题恒为 1。
   */
  const answerSlotCount = computed(() =>
    (previewData.value?.questions ?? []).reduce(
      (sum, q) => sum + (isComposite(q) ? (q.children?.length ?? 0) : 1),
      0
    )
  )

  /**
   * 预览的卷子是否已有实体题目
   *
   * 随机卷生成后题目固化进卷面，与固定卷同构，预览/导出都该按真实题目走；
   * 按 type 判断的话生成过的随机卷会一直退回显示抽题规则。
   * 固定卷即使一道题都没有也算这一类，否则空的固定卷会掉进「待生成」分支，
   * 显示一张永远为空的规则表。
   */
  const hasEntityQuestions = computed(
    () => previewData.value?.type === 'fixed' || (previewData.value?.questions?.length ?? 0) > 0
  )

  // 卷面预览：按题型分大题（顺序随字典 question_type 的 value 顺序）
  const previewSections = computed(() => {
    const questions = previewData.value?.questions ?? []
    const typeOrder = dict.question_type.map((d) => d.value)
    return groupByType(
      questions,
      (q) => q.questionType,
      (q) => q.score,
      typeOrder
    )
  })

  // 试卷清单导出列定义
  const PAPER_LIST_COLUMNS: ExcelColumn<Record<string, any>>[] = [
    { header: '试卷名称', field: 'name' },
    { header: '类型', field: 'typeText' },
    { header: '总分', field: 'totalScore' },
    { header: '题目数', field: 'questionCount' },
    { header: '建议时长(分钟)', field: 'suggestDuration' },
    { header: '状态', field: 'statusText' },
    { header: '创建人', field: 'createByName' },
    { header: '所属单位', field: 'createByOrgName' },
    { header: '可见范围', field: 'scopeText' },
    { header: '权限级别', field: 'levelText' }
  ]

  /** 导出试卷清单：按当前筛选拉取全部试卷，前端生成 xlsx 下载 */
  async function handleExportList() {
    exporting.value = true
    try {
      const { data } = await paperApi.export({
        keyword: filterForm.keyword || undefined,
        type: filterForm.type || undefined,
        status: filterForm.status || undefined,
        visibleScope: filterForm.visibleScope || undefined,
        onlyMine: filterForm.onlyMine ? 1 : undefined
      })
      if (!data.length) {
        ElMessage.warning('当前筛选条件下没有可导出的数据')
        return
      }
      const rows = data.map((item) => ({
        ...item,
        typeText: item.type === 'fixed' ? '固定试卷' : '随机试卷',
        statusText: statusTag(item.status).text,
        scopeText: scopeLabel(item.visibleScope),
        levelText: item.visibleScope === 'self' ? '-' : levelLabel(item.shareLevel)
      }))
      exportToExcel(PAPER_LIST_COLUMNS, rows, `试卷清单_${Date.now()}`, '试卷清单')
      ElMessage.success(`已导出 ${rows.length} 份试卷`)
    } catch (error: any) {
      ElMessage.error(error.message || '导出失败')
    } finally {
      exporting.value = false
    }
  }

  // 固定卷题目明细导出列定义
  const FIXED_QUESTION_COLUMNS: ExcelColumn<Record<string, any>>[] = [
    { header: '题号', field: 'no' },
    { header: '题干', field: 'stem' },
    { header: '题型', field: 'typeText' },
    { header: '难度', field: 'difficultyText' },
    { header: '选项', field: 'options' },
    { header: '答案', field: 'answer' },
    { header: '解析', field: 'analysis' },
    { header: '分值', field: 'score' }
  ]

  // 随机卷抽题规则导出列定义
  const RANDOM_RULE_COLUMNS: ExcelColumn<Record<string, any>>[] = [
    { header: '序号', field: 'no' },
    { header: '题型', field: 'typeText' },
    { header: '难度', field: 'difficultyText' },
    { header: '知识点', field: 'knowledgePointName' },
    { header: '抽取数量', field: 'drawCount' },
    { header: '每题分值', field: 'scorePerQuestion' },
    { header: '可用题量', field: 'availableCount' }
  ]

  /**
   * 导出当前预览的试卷明细
   *
   * 有实体题目就导题目（固定卷、已生成的随机卷），
   * 只有规则的待生成随机卷才导抽题规则——与预览显示的内容保持一致。
   */
  function handleExportCurrent() {
    const paper = previewData.value
    if (!paper) return
    const safeName = (paper.name || '试卷').replace(/[\\/:*?"<>|]/g, '_')
    if (hasEntityQuestions.value) {
      // 材料题展开成「材料行 + 各小题行」：小题才是实际作答与判分单位，
      // 只导一行材料会让明细表少掉这份卷子的大部分题目
      const rows = (paper.questions ?? []).flatMap((q, idx) => {
        const head = {
          no: String(idx + 1),
          stem: q.stemText || q.stem,
          typeText: dictLabel('question_type', q.questionType),
          difficultyText: dictLabel('difficulty', q.difficulty),
          // 选项统一转成「A. 内容」逐行文本：库里存量有 JSON 格式，直出会把原始 JSON 导进表格
          options: splitOptions(q.options).join('\n'),
          answer: q.answer,
          analysis: q.analysis ?? '',
          score: q.score
        }
        if (!isComposite(q)) return [head]
        // 材料行自身无选项无答案，留空避免误读
        return [
          { ...head, options: '', answer: '', score: q.score },
          ...(q.children ?? []).map((c, cIdx) => ({
            no: `${idx + 1}-${cIdx + 1}`,
            stem: c.stemText || c.stem,
            typeText: dictLabel('question_type', c.questionType),
            // 小题有自己的难度，不能顶替成材料题的难度
            difficultyText: dictLabel('difficulty', c.difficulty),
            options: splitOptions(c.options).join('\n'),
            answer: c.answer,
            analysis: c.analysis ?? '',
            score: c.score
          }))
        ]
      })
      if (!rows.length) {
        ElMessage.warning('该试卷暂无题目可导出')
        return
      }
      exportToExcel(FIXED_QUESTION_COLUMNS, rows, `${safeName}_题目明细`, '题目明细')
    } else {
      const rows = (paper.rules ?? []).map((r, idx) => ({
        no: idx + 1,
        typeText: dictLabel('question_type', r.questionType),
        difficultyText: r.difficulty ? dictLabel('difficulty', r.difficulty) : '不限',
        knowledgePointName: r.knowledgePointName || '不限',
        drawCount: r.drawCount,
        scorePerQuestion: r.scorePerQuestion,
        availableCount: r.availableCount
      }))
      if (!rows.length) {
        ElMessage.warning('该试卷暂无抽题规则可导出')
        return
      }
      exportToExcel(RANDOM_RULE_COLUMNS, rows, `${safeName}_抽题规则`, '抽题规则')
    }
    ElMessage.success('导出成功')
  }

  /** 加载试卷列表 */
  async function loadPaperList() {
    loading.value = true
    try {
      const { data } = await paperApi.getList({
        keyword: filterForm.keyword || undefined,
        type: filterForm.type || undefined,
        status: filterForm.status || undefined,
        visibleScope: filterForm.visibleScope || undefined,
        onlyMine: filterForm.onlyMine ? 1 : undefined,
        page: pagination.page,
        pageSize: pagination.pageSize
      })
      tableData.value = data.list
      pagination.total = data.pagination.total
    } catch (error: any) {
      ElMessage.error(error.message || '加载试卷列表失败')
    } finally {
      loading.value = false
    }
  }

  /** 加载字典（预览页题型/难度显示名） */
  async function loadBaseData() {
    try {
      const { data } = await dataDictApi.getData(['question_type', 'difficulty'])
      dict.question_type = data.question_type || []
      dict.difficulty = data.difficulty || []
    } catch (error: any) {
      ElMessage.error(error.message || '加载基础数据失败')
    }
  }

  function handleSearch() {
    pagination.page = 1
    loadPaperList()
  }
  function handleReset() {
    filterForm.keyword = ''
    filterForm.type = ''
    filterForm.status = ''
    filterForm.visibleScope = ''
    filterForm.onlyMine = false
    pagination.page = 1
    loadPaperList()
  }
  function handleSizeChange() {
    pagination.page = 1
    loadPaperList()
  }
  function handleSelectionChange(rows: Paper[]) {
    selectedIds.value = rows.map((r) => r.id)
    // 勾选里含只读共享的试卷时，后端会整批拒绝，这里先记下名字提前拦
    noManageNames.value = rows.filter((r) => r.canManage === false).map((r) => r.name)
  }

  /** 打开共享设置弹窗 */
  function handleOpenShare(row: Paper) {
    shareForm.id = row.id
    shareForm.name = row.name
    // 兜底取 self 而非 all：万一后端没下发该字段，弹窗也不该预选「全部组织」，
    // 否则用户顺手点确定就把试卷放开给全组织了（与后端 normalizeShare 的最小可见默认保持一致）
    shareForm.visibleScope = row.visibleScope ?? 'self'
    // shareLevel 同理兜底 view 而非 manage：后端漏下发时若预选「可管理」，
    // 用户把范围一改再点确定，范围内成员就直接拿到编辑/发布/删除权限。
    // 宁可让人发现「权限给少了要手动放开」，也不要静默给出最大权限。
    shareForm.shareLevel = row.shareLevel ?? 'view'
    shareVisible.value = true
  }

  /** 弹窗关闭后复位，避免下次打开残留上一份试卷的值 */
  function handleShareClosed() {
    shareForm.id = 0
    shareForm.name = ''
    shareForm.visibleScope = 'self'
    shareForm.shareLevel = 'view'
  }

  /** 保存共享设置 */
  async function handleShareSubmit() {
    if (!shareForm.id) return
    shareSaving.value = true
    try {
      await paperApi.updateShare({
        id: shareForm.id,
        visibleScope: shareForm.visibleScope,
        // 「仅自己」时级别无意义，统一提交 manage 与后端归一化保持一致
        shareLevel: shareForm.visibleScope === 'self' ? 'manage' : shareForm.shareLevel
      })
      ElMessage.success('共享设置已更新')
      shareVisible.value = false
      loadPaperList()
    } catch (error: any) {
      ElMessage.error(error.message || '保存失败')
    } finally {
      shareSaving.value = false
    }
  }

  /** 新增入口：按命令确定组卷类型，跳转到独立创建页 */
  function handleAddCommand(command: FormType) {
    router.push({ path: '/paper-edit', query: { type: command } })
  }

  // 行操作项：label 显示文案，command 分发标识，danger 用于删除的警示色
  type RowAction = { command: string; label: string; disabled?: boolean; danger?: boolean }

  /**
   * 「更多」下拉里的操作项
   *
   * 操作列固定为「预览 / 编辑 / 主行动 / 更多」四段：主行动只给生命周期的下一步
   * （待生成→生成试卷，草稿→发布），低频与破坏性操作收进这里。
   * 七个按钮平铺会折行，且各行按钮数不同导致同名按钮左右错位。
   */
  function moreActions(row: Paper): RowAction[] {
    const actions: RowAction[] = []
    const readonly = row.canManage === false
    // 已生成的随机卷：重抽题目 + 手工调卷面，都归入低频操作
    if (row.type === 'random' && row.status === 'draft' && can('edit')) {
      actions.push({ command: 'generate', label: '重新生成', disabled: readonly })
      actions.push({ command: 'editQuestions', label: '调整题目', disabled: readonly })
    }
    if (row.canEditShare !== false && can('share')) {
      actions.push({ command: 'share', label: '共享设置' })
    }
    if (can('delete')) {
      actions.push({ command: 'delete', label: '删除', disabled: readonly, danger: true })
    }
    return actions
  }

  /** 「更多」下拉分发：row 随 command 一起传入，避免为每行建闭包 */
  function handleMoreCommand({ command, row }: { command: string; row: Paper }) {
    if (command === 'generate') handleGenerate(row)
    else if (command === 'editQuestions') handleEditQuestions(row)
    else if (command === 'share') handleOpenShare(row)
    else if (command === 'delete') handleDelete(row)
  }

  /** 预览 */
  async function handlePreview(row: Paper) {
    previewVisible.value = true
    previewLoading.value = true
    previewData.value = undefined
    // 每次打开都回到学生版，避免上一份卷子的教师版状态串到下一份
    paperVersion.value = 'student'
    try {
      const { data } = await paperApi.getDetail(row.id)
      previewData.value = data
    } catch (error: any) {
      ElMessage.error(error.message || '加载详情失败')
    } finally {
      previewLoading.value = false
    }
  }

  /** 编辑：跳转到独立编辑页（已发布不可编辑） */
  function handleEdit(row: Paper) {
    if (row.status === 'published') return
    router.push({ path: '/paper-edit', query: { id: row.id } })
  }

  /**
   * 调整已生成随机卷的卷面题目
   *
   * 带 mode=questions 进编辑页，让它走题目编辑界面而不是抽题规则界面
   * ——同一张卷两种编辑目标，靠这个参数区分。
   */
  function handleEditQuestions(row: Paper) {
    if (row.status !== 'draft') return
    router.push({ path: '/paper-edit', query: { id: row.id, mode: 'questions' } })
  }

  /** 发布 */
  async function handlePublish(row: Paper) {
    try {
      await ElMessageBox.confirm('确定要发布该试卷吗？发布后不可再编辑', '提示', {
        type: 'warning'
      })
      await paperApi.publish(row.id)
      ElMessage.success('发布成功')
      loadPaperList()
    } catch (error: any) {
      if (error !== 'cancel') ElMessage.error(error.message || '发布失败')
    }
  }

  /**
   * 状态标签：随机卷多一个「待生成」态（已配规则、尚未抽题固化）
   */
  function statusTag(status: string) {
    if (status === 'published') return { type: 'success' as const, text: '已发布' }
    if (status === 'pending') return { type: 'warning' as const, text: '待生成' }
    return { type: 'info' as const, text: '草稿' }
  }

  /**
   * 生成 / 重新生成随机卷题目
   *
   * 重新生成会覆盖含手工调整在内的全部题目，故先确认；
   * 首次生成没有可覆盖的内容，直接执行。
   */
  async function handleGenerate(row: Paper) {
    try {
      if (row.status !== 'pending') {
        await ElMessageBox.confirm(
          `重新生成会按当前抽题规则重抽，原有 ${row.questionCount} 道题（含手工调整）将被替换。确定继续？`,
          '重新生成试卷',
          { type: 'warning' }
        )
      }
      const { message } = await paperApi.generateRandom(row.id)
      ElMessage.success(message || '生成成功')
      loadPaperList()
    } catch (error: any) {
      if (error !== 'cancel') ElMessage.error(error.message || '生成失败')
    }
  }

  /** 删除 */
  async function handleDelete(row: Paper) {
    try {
      await ElMessageBox.confirm('确定要删除该试卷吗？删除后不可恢复', '提示', { type: 'warning' })
      await paperApi.delete(row.id)
      ElMessage.success('删除成功')
      if (tableData.value.length === 1 && pagination.page > 1) pagination.page -= 1
      loadPaperList()
    } catch (error: any) {
      if (error !== 'cancel') ElMessage.error(error.message || '删除失败')
    }
  }

  /** 批量删除 */
  async function handleBatchDelete() {
    if (!selectedIds.value.length) return
    if (noManageNames.value.length) {
      ElMessage.warning(
        `以下试卷为只读共享，无权删除：${noManageNames.value.join('、')}。请取消勾选后重试`
      )
      return
    }
    try {
      await ElMessageBox.confirm(
        `确定要删除选中的 ${selectedIds.value.length} 份试卷吗？删除后不可恢复`,
        '提示',
        { type: 'warning' }
      )
      const count = selectedIds.value.length
      await paperApi.batchDelete(selectedIds.value)
      ElMessage.success(`已删除 ${count} 份试卷`)
      if (tableData.value.length === count && pagination.page > 1) pagination.page -= 1
      selectedIds.value = []
      loadPaperList()
    } catch (error: any) {
      if (error !== 'cancel') ElMessage.error(error.message || '批量删除失败')
    }
  }

  // 字典仅需加载一次
  onMounted(() => {
    loadBaseData()
  })

  // 列表在每次进入/从创建编辑页返回时刷新（本页 keepAlive，onMounted 不会重复触发）
  onActivated(() => {
    loadPaperList()
  })
</script>
<style lang="scss" scoped>
  .paper {
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: 100%;

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

      // 复选框自带高度比输入框矮，垂直居中对齐到同一行
      .only-mine {
        height: 32px;
      }
    }

    // 共享列两个标签之间留出间距
    .level-tag {
      margin-left: 6px;
    }

    /*
      「更多」下拉触发器。

      不用 ElButton：按钮自带 padding 与行高，和同排的 link 按钮对不齐，
      故用 span 手写成与 link 按钮同字号同色，只多一个下拉箭头。
    */
    .more-trigger {
      display: inline-flex;
      gap: 2px;
      align-items: center;
      font-size: var(--el-font-size-base);
      line-height: 1;
      color: var(--el-color-primary);
      cursor: pointer;

      &:hover {
        color: var(--el-color-primary-light-3);
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

      .table-header {
        display: flex;
        flex-shrink: 0;
        gap: 12px;
        margin-bottom: 16px;
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

  // 待生成随机卷的提示条，与下方规则表拉开距离
  .preview-alert {
    margin-top: 12px;
  }

  // 预览弹窗内小节标题（题目列表/抽题规则）
  .section-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 16px 0 10px;
    font-size: 14px;
    font-weight: 600;
  }

  // 抽屉 body 默认自身滚动，会让内层 height:100% 失效并叠出双滚动条，
  // 故交出滚动权：body 只负责限高，滚动由正文区自己承担
  .preview-drawer {
    :deep(.el-drawer__body) {
      overflow: hidden;
    }
  }

  // 抽屉内是「工具条固定 + 正文内滚」的两段结构，故这里撑满 body 高度
  .preview-body {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 200px;
  }

  // 预览工具条（卷面版本切换）：不参与压缩，始终吸在正文上方
  .preview-toolbar {
    display: flex;
    flex-shrink: 0;
    gap: 10px;
    align-items: center;
    justify-content: flex-end;
    margin-bottom: 12px;

    .toolbar-label {
      font-size: 13px;
      color: var(--el-text-color-secondary);
    }
  }

  // 随机卷抽题规则表：撑满剩余高度，避免抽屉下方大片留白
  .rule-table-wrap {
    flex: 1;
    min-height: 0;
  }

  .preview-footer {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }

  // 纸质试卷版式
  .paper-doc {
    // 高度交给抽屉：正文在此内部滚动，抽屉 body 自身不滚，避免双滚动条
    flex: 1;
    min-height: 0;
    padding: 28px 36px;
    overflow-y: auto;
    font-size: 14px;
    line-height: 1.9;
    color: #1a1a1a;
    background: #fff;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 6px;

    .paper-head {
      margin-bottom: 20px;
      text-align: center;

      .paper-title {
        margin: 0 0 8px;
        font-size: 20px;
        font-weight: 700;
      }

      .paper-meta {
        font-size: 13px;
        color: #666;
      }
    }

    .paper-section {
      margin-bottom: 18px;

      .section-heading {
        margin: 14px 0 8px;
        font-size: 15px;
        font-weight: 700;
      }

      /*
        v-html 渲染的富文本：节点不带 scoped 属性，故用 :deep 命中。
        题干/选项是「题号 内容 （N 分）」的单行排版，而富文本外层自带 <p>（块级），
        不压成 inline 会把分值挤到下一行，故段落内联、边距归零。
        图片则反过来独占一行并限宽，否则原图尺寸会溢出抽屉、把卷面撑横。
      */
      .rich-text {
        :deep(p) {
          display: inline;
          margin: 0;
        }

        :deep(img) {
          display: block;
          max-width: 100%;
          height: auto;
          margin: 6px 0;
        }

        /* 表格类富文本同样限宽，避免宽表把预览撑出横向滚动 */
        :deep(table) {
          max-width: 100%;
          border-collapse: collapse;
        }
      }

      .q-option-key {
        margin-right: 4px;
        font-weight: 600;
      }

      .paper-question {
        margin-bottom: 12px;

        .q-stem {
          .q-no {
            margin-right: 4px;
            font-weight: 600;
          }

          /*
            题干改由 v-html 渲染后不能再用 pre-wrap：HTML 里标签之间的换行与缩进
            会被当成可见空白，题干中间冒出大段空隙。换行交给富文本自己的标签表达。
          */
          .q-text {
            white-space: normal;
          }

          .q-score {
            margin-left: 6px;
            font-size: 13px;
            color: #888;
          }
        }

        .q-options {
          padding-left: 22px;
          margin-top: 2px;

          /* 同题干：选项走 v-html 后不能用 pre-wrap，否则标签间空白会显形 */
          .q-option {
            white-space: normal;
          }
        }

        .q-answer {
          padding-left: 22px;
          margin-top: 4px;
          font-size: 13px;
          color: var(--el-color-primary);
        }

        // 解析可能是长文本，与答案区分色阶并允许换行
        .q-analysis {
          padding-left: 22px;
          margin-top: 2px;
          font-size: 13px;
          line-height: 1.7;
          color: var(--el-text-color-secondary);
          white-space: pre-wrap;
        }

        // 材料题小题：只靠缩进分层，不加竖线/底色。纸质卷面靠「（1）」序号与
        // 缩进体现从属关系，边框和色块打印出来是噪点。
        .q-children {
          margin-top: 6px;

          .q-child {
            margin-bottom: 10px;

            &:last-child {
              margin-bottom: 0;
            }

            // 「（1）」用全角括号，本身自带右侧留白，不再叠加 margin
            .q-no {
              margin-right: 0;
            }

            // 小题的选项/答案对齐到「（1）」之后的题干起始位置
            .q-options,
            .q-answer,
            .q-analysis {
              padding-left: 30px;
            }
          }

          // 小题题型：混合题型的材料题需标出各小题题型，用括注而非徽章，贴近卷面
          .q-type-tag {
            margin-left: 4px;
            font-size: 13px;
            color: var(--el-text-color-secondary);
          }
        }
      }
    }

    .paper-empty {
      padding: 40px 0;
      color: #999;
      text-align: center;
    }
  }

  // 卷头（随机卷也复用）
  .paper-head {
    margin-bottom: 16px;
    text-align: center;

    .paper-title {
      margin: 0 0 8px;
      font-size: 20px;
      font-weight: 700;
    }

    .paper-meta {
      font-size: 13px;
      color: var(--el-text-color-secondary);
    }
  }

  // 可用题量不足时标红提示
  .text-danger {
    font-weight: 600;
    color: var(--el-color-danger);
  }

  // 共享弹窗内容被 teleport 到 body，样式须放在顶层而非嵌在 .paper 下
  .share-paper-name {
    font-weight: 500;
    color: var(--el-text-color-primary);
  }

  .share-tip {
    width: 100%;
    margin-top: 4px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--el-text-color-secondary);
  }
</style>
