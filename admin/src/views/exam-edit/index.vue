<!--
  创建/编辑考试独立页：左右双栏单页表单。
  左栏为「考什么」——基础信息 / 考生设置 / 试卷设置 / 发证设置；
  右栏为「怎么考」——考试设置（防作弊、重考次数、考前/考中/考后约束）。
  原三步向导改为单页：字段间存在互相参照（如时长与试卷建议时长、及格分与总分），分步反而要来回切。
  考生用弹窗选择器，应对几百人规模。编辑态附 id 走 query。
-->
<template>
  <div class="exam-edit">
    <!-- 顶部：返回 + 标题。不套 ElCard，避免只为一行按钮多出一层卡片背景与间距 -->
    <div class="page-header">
      <ElButton link :icon="ArrowLeft" class="back-btn" @click="handleBack">返回考试列表</ElButton>
      <span class="header-divider" />
      <span class="page-title">{{ pageTitle }}</span>
    </div>

    <!-- 表单主体：左右双栏 -->
    <div v-loading="pageLoading" class="body-columns">
      <!-- scroll-to-error：单页长表单去掉步骤向导后，校验失败需自动定位到首个错误项 -->
      <ElForm
        ref="formRef"
        :model="form"
        :rules="formRules"
        label-width="100px"
        class="edit-form"
        scroll-to-error
      >
        <!-- ===== 左栏：考什么 ===== -->
        <div class="col col-left">
          <!-- 基础信息 -->
          <section class="panel">
            <div class="panel-head">
              <span class="panel-title">基础信息</span>
              <span class="panel-sub">考试类型、名称与时间安排</span>
            </div>
            <div class="panel-body">
              <!--
                类型放第一行：它决定后面几块的形态（名称与时间会被项目自动填、
                考生区变只读）。放在名称之后会出现「填好了名称时间、选完类型全被覆盖」。
              -->
              <!--
                与下方「发证方式」同款的等宽卡片，而不是 ElRadioButton 的实心分段按钮：
                同一页两套单选样式读起来是两种控件，且本页约定是「选中态用主色描边
                而非整块填充」。两个类型的差别也正需要一句说明，卡片装得下。
              -->
              <ElFormItem label="考试类型" prop="examType">
                <div class="cert-modes type-modes" role="radiogroup" aria-label="考试类型">
                  <button
                    v-for="(opt, i) in EXAM_TYPE_OPTIONS"
                    :key="opt.value"
                    type="button"
                    role="radio"
                    class="cert-mode"
                    :class="{ 'is-active': form.examType === opt.value }"
                    :aria-checked="form.examType === opt.value"
                    :tabindex="form.examType === opt.value ? 0 : -1"
                    @click="handleExamTypeChange(opt.value)"
                    @keydown.left.prevent="handleExamTypeArrow(i, -1)"
                    @keydown.up.prevent="handleExamTypeArrow(i, -1)"
                    @keydown.right.prevent="handleExamTypeArrow(i, 1)"
                    @keydown.down.prevent="handleExamTypeArrow(i, 1)"
                  >
                    <span class="mode-label">{{ opt.label }}</span>
                    <span class="mode-desc">{{ opt.desc }}</span>
                  </button>
                </div>
              </ElFormItem>
              <ElFormItem v-if="form.examType === 'skill'" label="鉴定项目" prop="certProjectId">
                <ElSelect
                  v-model="form.certProjectId"
                  placeholder="请选择鉴定项目"
                  filterable
                  style="width: 100%"
                  @change="handleCertProjectChange"
                >
                  <ElOption
                    v-for="p in certProjectOptions"
                    :key="p.id"
                    :label="p.name"
                    :value="p.id"
                  />
                </ElSelect>
                <div class="form-tip">
                  选定后自动填充考试名称与起止时间，并带入该项目审核通过的人员
                </div>
              </ElFormItem>
              <!--
                maxlength 与后端 DTO 及 DB 列宽对齐（name VarChar(50)、
                description VarChar(500)）。原先写 80 / 300 两头都不对：
                名称填到 60 字前端放行、提交被后端 @MaxLength(50) 拒绝；
                说明限 300 又白丢了 200 字的余量
              -->
              <ElFormItem label="考试名称" prop="name">
                <ElInput
                  v-model="form.name"
                  placeholder="请输入考试名称"
                  maxlength="50"
                  show-word-limit
                />
              </ElFormItem>
              <ElFormItem label="考试说明" prop="description">
                <ElInput
                  v-model="form.description"
                  type="textarea"
                  :rows="2"
                  placeholder="请输入考试说明（可空）"
                  maxlength="500"
                  show-word-limit
                />
              </ElFormItem>
              <ElFormItem label="开始时间" prop="startTime">
                <ElDatePicker
                  v-model="form.startTime"
                  type="datetime"
                  placeholder="请选择开始时间"
                  value-format="YYYY-MM-DDTHH:mm:ss"
                  style="width: 100%"
                />
              </ElFormItem>
              <ElFormItem label="结束时间" prop="endTime">
                <ElDatePicker
                  v-model="form.endTime"
                  type="datetime"
                  placeholder="请选择结束时间"
                  value-format="YYYY-MM-DDTHH:mm:ss"
                  style="width: 100%"
                />
              </ElFormItem>
              <ElFormItem label="考试时长" prop="duration">
                <ElInputNumber
                  v-model="form.duration"
                  :min="1"
                  :precision="0"
                  controls-position="right"
                  placeholder="分钟"
                  style="width: 160px"
                />
                <span class="unit-tip">分钟</span>
              </ElFormItem>
            </div>
          </section>

          <!-- 试卷设置 -->
          <section class="panel">
            <div class="panel-head">
              <span class="panel-title">试卷设置</span>
              <span class="panel-sub">选卷与及格线</span>
            </div>
            <div class="panel-body">
              <!-- 选卷改抽屉：下拉受 pageSize 限制取不全，也没法按类型筛与看题数 -->
              <ElFormItem label="选择试卷" prop="paperId">
                <div v-if="currentPaper" class="paper-picked">
                  <div class="picked-main">
                    <span class="picked-name" :title="currentPaper.name">{{
                      currentPaper.name
                    }}</span>
                    <ElTag
                      :type="currentPaper.type === 'random' ? 'warning' : 'primary'"
                      size="small"
                      disable-transitions
                    >
                      {{ currentPaper.type === 'random' ? '随机' : '固定' }}
                    </ElTag>
                  </div>
                  <!-- 回显总分与建议时长，方便对照着填时长和及格分 -->
                  <span class="picked-meta">
                    总分 {{ currentPaper.totalScore }} 分 · 建议时长
                    {{ currentPaper.suggestDuration }} 分钟
                  </span>
                  <ElButton
                    link
                    type="primary"
                    class="picked-change"
                    @click="paperPickerVisible = true"
                    >更换</ElButton
                  >
                </div>
                <ElButton v-else :icon="Plus" @click="paperPickerVisible = true">选择试卷</ElButton>
              </ElFormItem>
              <ElFormItem label="及格分数" prop="passScore">
                <ElInputNumber
                  v-model="form.passScore"
                  :min="0"
                  :precision="1"
                  controls-position="right"
                  placeholder="及格分"
                  style="width: 160px"
                />
                <span v-if="currentPaper" class="unit-tip">/ {{ currentPaper.totalScore }} 分</span>
              </ElFormItem>
            </div>
          </section>

          <!-- 发证设置 -->
          <section class="panel">
            <div class="panel-head">
              <span class="panel-title">发证设置</span>
              <span class="panel-sub">通过后如何发放证书</span>
            </div>
            <div class="panel-body">
              <!--
                两选一。原有第三项「按认证项目」已下线：鉴定项目上没有证书模板与
                有效期字段，后端发证只认 certTemplateId，选它必然发不出证。
                项目关联已上移为「考试类型」，与发证无关——技能鉴定考试要发证
                同样在这里指定模板。
              -->
              <ElFormItem label="发证方式">
                <!-- 单选语义用 radiogroup 而非 toggle button：未选中项移出 Tab 序，组内用方向键切换 -->
                <div class="cert-modes" role="radiogroup" aria-label="发证方式">
                  <button
                    v-for="(opt, i) in CERT_MODE_OPTIONS"
                    :key="opt.value"
                    type="button"
                    role="radio"
                    class="cert-mode"
                    :class="{ 'is-active': certMode === opt.value }"
                    :aria-checked="certMode === opt.value"
                    :tabindex="certMode === opt.value ? 0 : -1"
                    @click="handleCertModeChange(opt.value)"
                    @keydown.left.prevent="handleCertModeArrow(i, -1)"
                    @keydown.up.prevent="handleCertModeArrow(i, -1)"
                    @keydown.right.prevent="handleCertModeArrow(i, 1)"
                    @keydown.down.prevent="handleCertModeArrow(i, 1)"
                  >
                    <span class="mode-label">{{ opt.label }}</span>
                    <span class="mode-desc">{{ opt.desc }}</span>
                  </button>
                </div>
              </ElFormItem>
              <ElFormItem v-if="certMode === 'template'" label="证书模板" prop="certTemplateId">
                <ElSelect
                  v-model="form.certTemplateId"
                  placeholder="请选择证书模板"
                  filterable
                  style="width: 100%"
                >
                  <ElOption
                    v-for="t in certTemplateOptions"
                    :key="t.id"
                    :label="t.name"
                    :value="t.id"
                  />
                </ElSelect>
              </ElFormItem>
            </div>
          </section>

          <!-- 考点设置：线下考试才需要，不设必填校验；考点量大故用抽屉而非下拉 -->
          <section class="panel">
            <div class="panel-head">
              <span class="panel-title">考点设置</span>
              <span class="panel-sub">线下考试的地点安排</span>
            </div>
            <div class="panel-body">
              <ElFormItem label="考点">
                <div v-if="currentSite" class="paper-picked">
                  <div class="picked-main">
                    <span class="picked-name" :title="currentSite.name">{{
                      currentSite.name
                    }}</span>
                    <span v-if="siteCapacityWarn" class="site-warn">{{ siteCapacityWarn }}</span>
                  </div>
                  <span class="picked-meta">
                    {{ currentSite.address || '未填地址' }}
                    {{ currentSite.capacity ? `· 可容纳 ${currentSite.capacity} 人` : '' }}
                  </span>
                  <ElButton
                    link
                    type="primary"
                    class="picked-change"
                    @click="sitePickerVisible = true"
                    >更换</ElButton
                  >
                </div>
                <ElButton v-else :icon="Plus" @click="sitePickerVisible = true">选择考点</ElButton>
                <span v-if="!currentSite" class="site-hint">线上考试可不选</span>
                <!-- 本页只能整场指定一个考点：存量按人分配的数据一改就会被抹平，故显式告知 -->
                <ElAlert
                  v-if="multiSiteDetected"
                  class="site-alert"
                  type="warning"
                  show-icon
                  :closable="false"
                  title="该考试的考生考点分布不一致"
                  description="考生分属多个考点，或部分考生未分配考点。本页只能为全场指定同一个考点：不改动此项则保留各人原考点；一旦更换，全场将统一为新考点。"
                />
              </ElFormItem>
            </div>
          </section>

          <!-- 考生设置 -->
          <section class="panel">
            <div class="panel-head">
              <span class="panel-title">考生设置</span>
              <span class="panel-sub">{{
                isSkillExam ? '由鉴定项目审核结果自动带入，不可手工调整' : '选择参考人员'
              }}</span>
            </div>
            <div class="panel-body step-candidate" :class="{ 'is-empty': !selectedList.length }">
              <div class="cand-toolbar">
                <!-- 空态与监考/阅卷面板同款：不另起灰块，状态文字与按钮同处一行 -->
                <div v-if="selectedList.length" class="cand-stat">
                  {{ isSkillExam ? '已同步' : '已选' }} <b>{{ selectedList.length }}</b> 人
                  <span class="stat-sub"
                    >（内部 {{ internalCount }} · 外部 {{ externalCount }}）</span
                  >
                </div>
                <!--
                  三态而非两态：技能鉴定但还没选项目是新建时的必经状态，
                  此时说「该项目下暂无通过人员」会把用户指向一个不存在的问题
                -->
                <div v-else class="cand-stat is-empty">
                  <span class="stat-empty-text">{{ candEmptyText }}</span>
                  <span class="stat-empty-hint">{{ candEmptyHint }}</span>
                </div>
                <!--
                  区块内的动作一律用描边权重：实心主色留给底部「保存」，
                  否则页面里出现多个同等强度的实心蓝，主次读不出来。

                  技能鉴定考试整块隐藏：名单由项目审核结果派生，三个动作都无意义。
                  后端同样拦了这三个接口，不只靠这里不渲染。
                -->
                <div v-if="!isSkillExam" class="cand-actions">
                  <ElButton :icon="Upload" @click="importVisible = true">导入考生</ElButton>
                  <ElButton :icon="Plus" @click="pickerVisible = true">选择考生</ElButton>
                  <!-- 竖线把破坏性动作与上面两个添加动作隔开，红字紧贴实心按钮显得突兀 -->
                  <span v-if="selectedList.length" class="action-sep" aria-hidden="true"></span>
                  <ElButton v-if="selectedList.length" link type="danger" @click="clearSelected"
                    >清空</ElButton
                  >
                </div>
              </div>
              <!--
                名单会在每次保存时按项目最新审核结果重算（后端先删后插）。
                不写出来的话，用户改个别的字段点保存、名单跟着变了，会被当成 bug
              -->
              <ElAlert
                v-if="isSkillExam"
                type="info"
                :closable="false"
                show-icon
                class="cand-derive-tip"
                title="名单随鉴定项目的审核结果变动：每次保存都会按最新的审核通过人员重新同步"
              />
              <!-- 空态不渲染表格：否则表头会悬在一行灰字上方 -->
              <ElTable
                v-if="selectedList.length"
                :data="pagedSelected"
                max-height="300"
                class="selected-table"
              >
                <ElTableColumn
                  type="index"
                  label="#"
                  width="56"
                  align="center"
                  :index="selectedIndexBase"
                />
                <ElTableColumn prop="name" label="姓名" min-width="90" show-overflow-tooltip />
                <!--
                  账号/身份证/手机号三列只在普通考试下渲染。

                  技能鉴定的名单派生自报名记录，那边只存姓名快照——cert-application
                  刻意不联表查账号以规避敏感字段泄露，所以这三列在鉴定考试下取不到值，
                  留着就是三列整列的「-」。人工挑名单才需要这几列防挑错人；派生名单
                  的身份已在报名审核环节核对过。
                -->
                <!-- 账号含义内外部不同，表头挂提示，与选择考生/考生名单弹窗同口径 -->
                <ElTableColumn v-if="!isSkillExam" min-width="120" show-overflow-tooltip>
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
                <ElTableColumn
                  v-if="!isSkillExam"
                  label="身份证号"
                  min-width="150"
                  show-overflow-tooltip
                >
                  <template #default="{ row }">{{ row.idCard || '-' }}</template>
                </ElTableColumn>
                <ElTableColumn
                  v-if="!isSkillExam"
                  label="手机号"
                  min-width="115"
                  show-overflow-tooltip
                >
                  <template #default="{ row }">{{ row.phone || '-' }}</template>
                </ElTableColumn>
                <ElTableColumn label="类型" width="80" align="center">
                  <template #default="{ row }">
                    <ElTag
                      :type="row.type === 'internal' ? 'primary' : 'warning'"
                      size="small"
                      disable-transitions
                    >
                      {{ row.type === 'internal' ? '内部' : '外部' }}
                    </ElTag>
                  </template>
                </ElTableColumn>
                <ElTableColumn label="所属" min-width="140" show-overflow-tooltip>
                  <template #default="{ row }">{{ row.belong || '-' }}</template>
                </ElTableColumn>
                <ElTableColumn v-if="!isSkillExam" label="操作" width="80" align="center">
                  <template #default="{ row }">
                    <ElButton link type="danger" @click="removeSelected(row)">移除</ElButton>
                  </template>
                </ElTableColumn>
              </ElTable>
              <ElPagination
                v-if="selectedList.length > selectedPageSize"
                class="cand-pager"
                layout="total, prev, pager, next"
                :current-page="selectedPage"
                :page-size="selectedPageSize"
                :total="selectedList.length"
                @current-change="(p: number) => (selectedPage = p)"
              />
            </div>
          </section>

          <!-- 监考人员设置 -->
          <StaffSettingPanel
            v-model="proctors"
            title="监考人员设置"
            sub="指派本场考试的监考人"
            empty-text="尚未指派监考人员"
            picker-title="选择监考人员"
            pick-button-text="选择监考人员"
          />

          <!-- 阅卷人员设置：指派后阅卷中心只对被指派人放出本场答卷 -->
          <StaffSettingPanel
            v-model="graders"
            title="阅卷人员设置"
            sub="指派本场考试的阅卷人"
            empty-text="尚未指派阅卷人员"
            empty-hint="不指派则本场答卷对全部有阅卷权限的人可见"
            picker-title="选择阅卷人员"
            pick-button-text="选择阅卷人员"
          />
        </div>
        <!-- ===== 右栏：怎么考 ===== -->
        <div class="col col-right">
          <section class="panel">
            <div class="panel-head">
              <span class="panel-title">考试设置</span>
              <span class="panel-sub">监考约束与考试流程规则</span>
            </div>
            <div class="panel-body">
              <!-- 防作弊 -->
              <div class="group-title">防作弊</div>
              <ElFormItem label="防切屏">
                <ElSwitch v-model="form.setting.screenSwitchDetect" />
                <template v-if="form.setting.screenSwitchDetect">
                  <span class="switch-extra-label">允许切屏次数</span>
                  <ElInputNumber
                    v-model="form.setting.allowSwitchTimes"
                    :min="0"
                    :precision="0"
                    controls-position="right"
                    style="width: 120px"
                  />
                  <span class="unit-tip">次</span>
                </template>
              </ElFormItem>
              <ElFormItem label="题目乱序">
                <ElSwitch v-model="form.setting.shuffleQuestions" />
                <span class="switch-tip">每人打乱题序与选项序</span>
              </ElFormItem>
              <ElFormItem label="操作限制">
                <ElSwitch v-model="form.setting.operationRestrict" />
                <span class="switch-tip">禁复制粘贴、右键与多屏</span>
              </ElFormItem>

              <!-- 重考 -->
              <div class="group-title">重考</div>
              <ElFormItem label="重考次数">
                <ElInputNumber
                  v-model="form.setting.retakeLimit"
                  :min="0"
                  :precision="0"
                  controls-position="right"
                  style="width: 120px"
                />
                <span class="unit-tip">次</span>
                <span class="switch-tip">{{
                  form.setting.retakeLimit ? '未通过可重考' : '0 = 不允许重考'
                }}</span>
              </ElFormItem>

              <!-- 考前 -->
              <div class="group-title">考前</div>
              <ElFormItem label="提前进场">
                <ElInputNumber
                  v-model="form.setting.earlyEnterMinutes"
                  :min="0"
                  :precision="0"
                  controls-position="right"
                  style="width: 120px"
                />
                <span class="unit-tip">分钟</span>
                <span class="switch-tip">{{
                  form.setting.earlyEnterMinutes ? '开考前可提前进入考场等待' : '0 = 到点才能进入'
                }}</span>
              </ElFormItem>
              <ElFormItem label="考试承诺书">
                <ElSwitch v-model="form.setting.requireCommitment" />
                <span class="switch-tip">开考前需签署方可作答</span>
              </ElFormItem>

              <!-- 考中 -->
              <div class="group-title">考中</div>
              <ElFormItem label="提前交卷">
                <ElSwitch v-model="form.setting.allowEarlySubmit" />
                <template v-if="form.setting.allowEarlySubmit">
                  <span class="switch-extra-label">最短作答</span>
                  <ElInputNumber
                    v-model="form.setting.minAnswerMinutes"
                    :min="0"
                    :precision="0"
                    controls-position="right"
                    style="width: 120px"
                  />
                  <span class="unit-tip">分钟</span>
                </template>
              </ElFormItem>
              <ElFormItem label="剩余时间">
                <ElSwitch v-model="form.setting.showRemainingTime" />
                <span class="switch-tip">答题页显示倒计时</span>
              </ElFormItem>

              <!-- 考后 -->
              <div class="group-title">考后</div>
              <ElFormItem label="查看成绩">
                <ElSwitch v-model="form.setting.allowViewScore" />
              </ElFormItem>
              <ElFormItem label="查看解析">
                <ElSwitch v-model="form.setting.allowViewAnalysis" />
                <span class="switch-tip">可见正确答案与解析</span>
              </ElFormItem>
              <!--
                这里原有一个「成绩公布」下拉（立即/阅卷完成后/手动）。已移除：
                该字段从未参与任何发布判定，配了也不生效。

                实际公布规则不是可配项，分两种情形：
                · 纯客观题：交卷即自动判分并发布，无需人工干预
                  （AppExamService.submitExam 的 `scorePublished: !hasSubjective`）
                · 含主观题：交卷后进入待阅卷。全部评完只是能发布的前提，
                  仍需在阅卷中心点「发布成绩」才对考生可见
                  （GradingService.publishScore），发布后也可撤回（withdrawScore）
              -->
            </div>
          </section>
        </div>
      </ElForm>
    </div>

    <!-- 底部操作条 -->
    <!--
      按钮靠右（与弹窗、抽屉、列表页同侧），左侧通栏空白用来摊发布条件：
      发布有硬前置，提前告知比让人点下去被弹窗拒回要好。
    -->
    <div class="footer-bar">
      <p class="footer-hint" :class="canPublish ? 'is-ready' : 'is-blocked'">
        <ElIcon><component :is="canPublish ? CircleCheck : WarningFilled" /></ElIcon>
        <span v-if="canPublish">已选 {{ selectedList.length }} 名考生，可发布</span>
        <span v-else>{{ publishBlockReason }}</span>
      </p>
      <div class="footer-actions">
        <ElButton text :disabled="anyLoading" @click="handleBack">取消</ElButton>
        <ElButton :loading="submitLoading" :disabled="publishLoading" @click="handleSubmit(false)">
          保存
        </ElButton>
        <!-- 存草稿只是中途状态，建考试的完整意图是开考，故发布占实心主色位 -->
        <ElButton
          type="primary"
          :loading="publishLoading"
          :disabled="!canPublish || submitLoading"
          @click="handleSubmit(true)"
        >
          保存并发布
        </ElButton>
      </div>
    </div>

    <!--
      考生选择弹窗。技能鉴定考试下连组件都不挂：入口按钮已隐藏，
      但别处若有代码把 visible 置 true，弹窗仍会弹出来
    -->
    <template v-if="!isSkillExam">
      <CandidatePickerDialog
        v-model="pickerVisible"
        :selected="selectedList"
        @confirm="handlePickerConfirm"
      />
      <CandidateImportDialog v-model="importVisible" @imported="handleImported" />
    </template>
    <PaperPickerDrawer
      v-model="paperPickerVisible"
      :selected="currentPaper"
      @confirm="handlePaperConfirm"
    />
    <ExamSitePickerDrawer
      v-model="sitePickerVisible"
      :selected="currentSite"
      :candidate-count="selectedList.length"
      @confirm="handleSiteConfirm"
    />
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive, computed, nextTick, watch } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
  import {
    ArrowLeft,
    Plus,
    Upload,
    QuestionFilled,
    CircleCheck,
    WarningFilled
  } from '@element-plus/icons-vue'
  import {
    examApi,
    CERT_MODE_OPTIONS,
    EXAM_TYPE_OPTIONS,
    deriveCertMode,
    type CertMode,
    type ExamCandidateItem,
    type ExamSetting
  } from '@/api/exam'
  import { certProjectApi } from '@/api/certProject'
  import { certificateTemplateApi } from '@/api/certificateTemplate'
  import CandidatePickerDialog, {
    type PickedCandidate
  } from '@/components/business/pickers/CandidatePickerDialog.vue'
  import CandidateImportDialog from './components/CandidateImportDialog.vue'
  import StaffSettingPanel, { type StaffItem } from './components/StaffSettingPanel.vue'
  import PaperPickerDrawer, { type PickedPaper } from './components/PaperPickerDrawer.vue'
  import ExamSitePickerDrawer, { type PickedSite } from './components/ExamSitePickerDrawer.vue'

  defineOptions({ name: 'ExamEdit' })

  const route = useRoute()
  const router = useRouter()

  // 编辑态：id 走 query
  const editingId = computed(() => {
    const v = Number(route.query.id)
    return Number.isFinite(v) && v > 0 ? v : undefined
  })
  const isEditing = computed(() => editingId.value !== undefined)
  const pageTitle = computed(() => (isEditing.value ? '编辑考试' : '创建考试'))

  const pageLoading = ref(false)
  const submitLoading = ref(false)
  /* 与 submitLoading 分开：只让被点的那个按钮转圈，另一个仅置灰 */
  const publishLoading = ref(false)
  const anyLoading = computed(() => submitLoading.value || publishLoading.value)
  const formRef = ref<FormInstance>()
  /**
   * 页面初始化自增序号：只有最后一次 initPage 可以写表单。
   * 快速连切两场考试时两次 initPage 并发，若旧场详情后到会覆盖新场已回填的数据，
   * 而 editingId 跟着 URL 始终是新场 id —— 此时保存就会把旧场内容提交进新场。
   * 与 paper-edit 的 pageSeq 同款做法。
   */
  let pageSeq = 0

  // 发证设置下拉：认证项目与证书模板
  const certProjectOptions = ref<Array<{ id: number; name: string }>>([])
  const certTemplateOptions = ref<Array<{ id: number; name: string }>>([])
  /** 当前已选考点（抽屉选择，回显名称与容量；null = 不使用考点） */
  const currentSite = ref<PickedSite | null>(null)
  const sitePickerVisible = ref(false)
  /** 编辑态各考生的原考点（key 同 selectedMap），用于未改考点时保留按人分配的原值 */
  const originSiteMap = new Map<string, number | undefined>()
  /** 用户本次是否动过考点：动过才整场覆盖，否则沿用原值 */
  const siteTouched = ref(false)
  /** 编辑态载入时是否检测到多考点（提示用户本页保存会统一为一个考点） */
  const multiSiteDetected = ref(false)

  /**
   * 发证方式（互斥）。两个后端字段由它派生：
   * none → certTemplateId=null、autoIssueCert=false；template → autoIssueCert=true 且带模板 id。
   *
   * 不再管 certProjectId：项目绑定已归考试类型，与发证无关。
   */
  const certMode = ref<CertMode>('none')

  /**
   * 当前所选试卷，用于回显名称与总分/建议时长（填时长与及格分的参照）。
   * 抽屉选卷后由 confirm 写入，编辑态由详情接口回填，不再整表拉下拉数据。
   */
  const currentPaper = ref<PickedPaper | null>(null)
  const paperPickerVisible = ref(false)

  /** 表单结构（考生独立用 Map 管理，提交时组装 candidates） */
  interface ExamForm {
    id?: number
    /** 考试类型 normal/skill；skill 时 certProjectId 必填、考生名单派生 */
    examType: string
    name: string
    description: string
    paperId: number | undefined
    startTime: string
    endTime: string
    duration: number | undefined
    passScore: number | undefined
    certProjectId: number | undefined
    autoIssueCert: boolean
    certTemplateId: number | undefined
    /** 考点 ID（可空，线下考试用；提交时统一写给本场全部考生） */
    examSiteId: number | undefined
    setting: ExamSetting
  }

  const createForm = (): ExamForm => ({
    id: undefined,
    examType: 'normal',
    name: '',
    description: '',
    paperId: undefined,
    startTime: '',
    endTime: '',
    duration: undefined,
    passScore: undefined,
    certProjectId: undefined,
    examSiteId: undefined,
    autoIssueCert: false,
    certTemplateId: undefined,
    // 默认值与后端 buildSetting / schema 默认保持一致
    setting: {
      screenSwitchDetect: false,
      allowSwitchTimes: 0,
      shuffleQuestions: false,
      operationRestrict: false,
      retakeLimit: 0,
      earlyEnterMinutes: 0,
      requireCommitment: false,
      allowEarlySubmit: true,
      minAnswerMinutes: 0,
      showRemainingTime: true,
      allowViewScore: true,
      allowViewAnalysis: false
    }
  })
  const form = reactive<ExamForm>(createForm())

  // ===== 考生：Map 单一数据源，Step2 表格与弹窗共享 =====
  const selectedMap = reactive(new Map<string, PickedCandidate>())
  const keyOf = (type: 'internal' | 'external', id: number) => `${type}:${id}`
  const selectedList = computed(() => Array.from(selectedMap.values()))
  /** 技能鉴定考试：名单派生、不可手工增删，多处 UI 据此收敛 */
  const isSkillExam = computed(() => form.examType === 'skill')

  /** 考生空态主文案：技能鉴定分「未选项目」与「项目下无人」两种，指向的操作不同 */
  const candEmptyText = computed(() => {
    if (!isSkillExam.value) return '尚未选择考生'
    return form.certProjectId ? '该鉴定项目下暂无审核通过的报名人员' : '请先选择鉴定项目'
  })

  const candEmptyHint = computed(() => {
    if (!isSkillExam.value) return '可从内部人员选择，或用表格批量导入'
    return form.certProjectId
      ? '需先在「报名审核」中通过报名，人员才会出现在此'
      : '选定项目后将自动带入该项目审核通过的人员'
  })
  const internalCount = computed(
    () => selectedList.value.filter((i) => i.type === 'internal').length
  )
  const externalCount = computed(
    () => selectedList.value.filter((i) => i.type === 'external').length
  )

  /*
    发布前置条件（与后端 ExamService.publish 的校验对齐）。

    这里只镜像前端能判定的两条：考生数与结束时间。后端另有两条前端无从得知——
    所选试卷是否仍为已发布（试卷抽屉只列已发布卷，但编辑态下那张卷可能事后被撤回）、
    随机卷各抽题组合的可用题量是否充足；那两条只能等后端返回错误再照实提示。

    做这层前置的目的是把「点了才被拒」提前成「点之前就看得见」，
    不是替代后端校验。
  */
  const publishBlockReason = computed<string | null>(() => {
    // 鉴定考试没有「选择考生」这个动作，照搬原文案会让人去找不存在的入口。
    // 与后端 publish 的分支文案对齐；未选项目时先指向选项目这一步
    if (!selectedList.value.length) {
      if (!isSkillExam.value) return '尚未选择考生，不能发布'
      return form.certProjectId
        ? '该鉴定项目下暂无审核通过的报名人员，不能发布'
        : '请先选择鉴定项目，不能发布'
    }
    // 后端会拦掉结束时间已过的发布：那样状态会被立刻推成已结束，考试当场废掉
    if (form.endTime && new Date(form.endTime).getTime() <= Date.now()) {
      return '结束时间已过，请先改考试时间'
    }
    return null
  })
  const canPublish = computed(() => !publishBlockReason.value)

  // ===== 监考 / 阅卷人员：与考生分开管理，各自独立名单 =====
  const proctors = ref<StaffItem[]>([])
  const graders = ref<StaffItem[]>([])

  // Step2 已选表格前端分页
  const selectedPage = ref(1)
  const selectedPageSize = ref(10)
  const pagedSelected = computed(() => {
    const start = (selectedPage.value - 1) * selectedPageSize.value
    return selectedList.value.slice(start, start + selectedPageSize.value)
  })
  const selectedIndexBase = (i: number) => (selectedPage.value - 1) * selectedPageSize.value + i + 1

  // 弹窗
  const pickerVisible = ref(false)
  const importVisible = ref(false)
  function handlePickerConfirm(list: PickedCandidate[]) {
    selectedMap.clear()
    list.forEach((it) => selectedMap.set(keyOf(it.type, it.id), it))
    selectedPage.value = 1
  }

  /**
   * 合并导入结果：与选择器的「全量替换」不同，导入是往已选列表里追加，
   * 便于「先勾一批再导一批」，同 key 覆盖以保证不出现重复行。
   */
  function handleImported(list: PickedCandidate[]) {
    list.forEach((it) => selectedMap.set(keyOf(it.type, it.id), it))
    selectedPage.value = 1
  }
  function removeSelected(row: PickedCandidate) {
    selectedMap.delete(keyOf(row.type, row.id))
    const maxPage = Math.max(1, Math.ceil(selectedList.value.length / selectedPageSize.value))
    if (selectedPage.value > maxPage) selectedPage.value = maxPage
  }
  function clearSelected() {
    selectedMap.clear()
    selectedPage.value = 1
  }

  /** 结束时间必须晚于开始时间 */
  const validateEndTime = (_rule: unknown, value: string, callback: (e?: Error) => void) => {
    if (!value) return callback(new Error('请选择结束时间'))
    if (form.startTime && value <= form.startTime) {
      return callback(new Error('结束时间必须晚于开始时间'))
    }
    return callback()
  }

  const formRules: FormRules = {
    name: [{ required: true, message: '请输入考试名称', trigger: 'blur' }],
    paperId: [{ required: true, message: '请选择试卷', trigger: 'change' }],
    startTime: [{ required: true, message: '请选择开始时间', trigger: 'change' }],
    endTime: [{ required: true, validator: validateEndTime, trigger: 'change' }],
    duration: [{ required: true, message: '请输入考试时长', trigger: 'blur' }],
    passScore: [{ required: true, message: '请输入及格分数', trigger: 'blur' }],
    // 项目只在技能鉴定类型下必填、模板只在按模板发证时必填，故用 validator 而非 required
    certProjectId: [
      {
        validator: (_r: unknown, _v: unknown, cb: (e?: Error) => void) =>
          form.examType === 'skill' && !form.certProjectId ? cb(new Error('请选择鉴定项目')) : cb(),
        trigger: 'change'
      }
    ],
    certTemplateId: [
      {
        validator: (_r: unknown, _v: unknown, cb: (e?: Error) => void) =>
          certMode.value === 'template' && !form.certTemplateId
            ? cb(new Error('请选择证书模板'))
            : cb(),
        trigger: 'change'
      }
    ]
  }

  /**
   * 方向键在选项间循环切换，并把焦点移到新选中项。
   * radiogroup 内只有选中项在 Tab 序里，故切换后须手动移焦，否则焦点留在已移出 Tab 序的旧项上。
   */
  function handleCertModeArrow(index: number, step: number) {
    const len = CERT_MODE_OPTIONS.length
    const next = CERT_MODE_OPTIONS[(index + step + len) % len]
    handleCertModeChange(next.value)
    void nextTick(() => {
      document.querySelector<HTMLButtonElement>('.cert-mode.is-active')?.focus()
    })
  }

  /**
   * 切换发证方式：不发证时清掉模板并关掉 autoIssueCert
   *
   * 不再碰 certProjectId——项目绑定归考试类型管，发证方式无权清它。
   * 以前这里有 `if (mode !== 'project') form.certProjectId = undefined`，
   * 留着会让「切一下发证方式就把绑定的鉴定项目清空」。
   */
  function handleCertModeChange(mode: CertMode) {
    if (mode === certMode.value) return
    certMode.value = mode
    if (mode !== 'template') form.certTemplateId = undefined
    form.autoIssueCert = mode !== 'none'
    formRef.value?.clearValidate(['certTemplateId'])
  }

  /**
   * 切换考试类型：切回普通考试时清掉项目绑定，并只清项目派生的那份名单
   *
   * 必须清 certProjectId，否则后端 assertTypeAndCertConsistency 会拦
   * 「普通考试不能绑定鉴定项目」。
   *
   * 名单则要看来源：只有绑过项目（切换前 certProjectId 还是旧值）时那批人才是
   * 派生来的、该跟着项目一起清。用户在普通考试下自己导入或勾选的名单填的是同一个
   * selectedMap，无条件 clear 会让「误点一下类型再切回来」把手工选的人全丢掉——
   * 而这里是切单选按钮的副作用，没有二次确认也没有撤销入口，导入 200 人只能重导。
   */
  function handleExamTypeChange(type: string) {
    if (type === form.examType) return
    form.examType = type
    if (type !== 'skill') {
      if (form.certProjectId) selectedMap.clear()
      form.certProjectId = undefined
      // 名单条数变了就回第一页，否则停在已不存在的页码上会看到空表格
      selectedPage.value = 1
      formRef.value?.clearValidate(['certProjectId'])
    }
  }

  /**
   * 方向键在类型间循环切换并移焦，同 handleCertModeArrow
   * radiogroup 内只有选中项在 Tab 序里，切换后须手动移焦
   */
  function handleExamTypeArrow(index: number, step: number) {
    const len = EXAM_TYPE_OPTIONS.length
    const next = EXAM_TYPE_OPTIONS[(index + step + len) % len]
    handleExamTypeChange(next.value)
    void nextTick(() => {
      document.querySelector<HTMLButtonElement>('.type-modes .cert-mode.is-active')?.focus()
    })
  }

  /**
   * 选定鉴定项目：填充考试信息并带入审核通过的人员
   *
   * 无条件覆盖名称/时间/描述，并给出提示。换项目意味着换了整场考试的依据，
   * 保留手改过的旧值会得到一场「名称还是上个项目、名单已是新项目」的考试。
   * 这与选试卷时「只填空」的口径不同，是刻意的。
   */
  /** 项目填充的请求序号：快切项目时只认最后一次的响应，口径同 loadForEdit 的 seq */
  let certFillSeq = 0

  async function handleCertProjectChange(projectId: number | undefined) {
    const seq = ++certFillSeq
    if (!projectId) {
      selectedMap.clear()
      selectedPage.value = 1
      return
    }
    try {
      const [detail, candidates] = await Promise.all([
        certProjectApi.getDetail(projectId),
        examApi.getCertProjectCandidates(projectId)
      ])
      // 先发后至的旧响应会覆盖新项目的填充，故过期响应直接丢弃
      if (seq !== certFillSeq) return
      const p = detail.data
      if (p) {
        form.name = p.name ?? ''
        form.startTime = p.startTime ?? ''
        form.endTime = p.endTime ?? ''
        form.description = p.description ?? ''
      }
      // 名单全量替换：这批人由项目审核结果决定，不与上一个项目的残留合并。
      // key 用 keyOf 而非报名记录 ID，与手工选人的名单同一套键，避免同一个人
      // 因两条路径进来而在表格里出现两行
      selectedMap.clear()
      ;(candidates.data ?? []).forEach((c) => {
        const type = c.candidateType === 'external' ? 'external' : 'internal'
        // candidateId 为 0 表示这条报名关联不到真实账号，塞进去会提交出
        // internalUserId: 0 的脏数据，直接跳过
        if (!c.candidateId) return
        selectedMap.set(keyOf(type, c.candidateId), {
          type,
          id: c.candidateId,
          name: c.candidateName,
          belong: type === 'internal' ? c.deptName : c.orgName
        })
      })
      // 换项目后名单条数变了，停在旧页码上会看到空表格，且分页器此时可能不渲染、
      // 用户连回第一页的入口都没有
      selectedPage.value = 1
      // 数字取 selectedMap.size 而非响应条数：跳过的 0 值行与同一人的重复报名
      // 都不会进 Map，用原始条数会出现「提示说 N 人、表格少几行」
      ElMessage.info(
        `已按鉴定项目填充名称与时间，带入 ${selectedMap.size} 名审核通过人员，可继续修改考试信息`
      )
      formRef.value?.clearValidate(['name', 'startTime', 'endTime', 'certProjectId'])
    } catch {
      if (seq !== certFillSeq) return
      ElMessage.error('读取鉴定项目信息失败，请重试')
    }
  }

  /**
   * 抽屉确认选卷：写入表单并补默认值。
   * 及格分为空时按总分 60% 预填，时长为空时取试卷建议时长——
   * 只在字段为空时填，避免覆盖用户已录入的值。
   */
  function handlePaperConfirm(paper: PickedPaper) {
    currentPaper.value = paper
    form.paperId = paper.id
    // 手动改了绑定值，需触发校验清掉「请选择试卷」的报错
    void formRef.value?.validateField('paperId')
    if (form.passScore == null) form.passScore = Math.round(paper.totalScore * 0.6 * 10) / 10
    if (form.duration == null) form.duration = paper.suggestDuration
  }

  /** 返回列表页 */
  function handleBack() {
    router.push({ path: '/exam' })
  }

  /**
   * 加载发证设置的两个下拉
   * 认证项目与证书模板属于辅助信息，任一失败不阻塞主表单，只留空下拉。
   *
   * 只拉一次：两个下拉的内容与当前编辑哪一场考试无关，而 initPage 会在每次
   * id 变化时重跑，不设这道闸就会白发一轮请求。
   *
   * 用 allSettled 逐个判成败，而不是各自 .catch 兜空数组：后者会把失败吞成
   * 「成功拿到空列表」，闸门照样关上，于是两个接口一起抖一次就让下拉永久为空，
   * 且发证方式选「项目」或「模板」时该项是必填，用户会卡在选不出来又没有提示的状态，
   * 只能整页刷新。只有两个都成功才置位，任一失败留给下次 initPage 重试。
   */
  let certOptionsLoaded = false
  async function loadCertOptions() {
    if (certOptionsLoaded) return
    const [projects, templates] = await Promise.allSettled([
      certProjectApi.getOptions(),
      certificateTemplateApi.getOptions()
    ])
    if (projects.status === 'fulfilled') certProjectOptions.value = projects.value.data ?? []
    if (templates.status === 'fulfilled') certTemplateOptions.value = templates.value.data ?? []
    certOptionsLoaded = projects.status === 'fulfilled' && templates.status === 'fulfilled'
  }

  /**
   * 考点容量提示：已选人数超过考点容量时给出软提示。
   * 只提示不拦截——容量是参考值，实际可加座，且考点未填容量时无从判断。
   */
  const siteCapacityWarn = computed(() => {
    const cap = currentSite.value?.capacity
    if (!cap) return ''
    const picked = selectedList.value.length
    return picked > cap ? `已选 ${picked} 人，超出容量 ${cap} 人` : ''
  })

  /**
   * 抽屉确认：null 表示不使用考点。
   * 仅在考点实际变化时标记 touched——「打开抽屉原样确定」不应触发整场覆盖，
   * 否则存量多考点数据会被无意抹平。
   */
  function handleSiteConfirm(site: PickedSite | null) {
    const nextId = site?.id
    if (nextId !== form.examSiteId) siteTouched.value = true
    currentSite.value = site
    form.examSiteId = nextId
  }

  /**
   * 编辑态：拉取详情并回填表单（含考生与防作弊策略）
   * @param id 考试 id
   * @param seq initPage 传入的 pageSeq 快照。详情响应回来时若已不是最新一次初始化，
   *   必须在写表单之前退出——否则先发后至的旧响应会把上一场考试的数据（含 form.id）
   *   盖到已经显示新考试的表单上，保存时就按错的 id 提交。
   */
  async function loadForEdit(id: number, seq: number) {
    const { data } = await examApi.getDetail(id)
    if (seq !== pageSeq) return
    proctors.value = data.proctors ?? []
    graders.value = data.graders ?? []
    selectedMap.clear()
    originSiteMap.clear()
    siteTouched.value = false
    multiSiteDetected.value = false
    data.candidates?.forEach((c) => {
      if (c.candidateType === 'external' && c.externalCandidateId) {
        const key = keyOf('external', c.externalCandidateId)
        selectedMap.set(key, {
          type: 'external',
          id: c.externalCandidateId,
          name: c.candidateName || `考生${c.externalCandidateId}`,
          belong: '',
          account: c.account ?? null,
          idCard: c.idCard ?? null,
          phone: c.phone ?? null
        })
        originSiteMap.set(key, c.examSiteId ?? undefined)
      } else if (c.candidateType === 'internal' && c.internalUserId) {
        const key = keyOf('internal', c.internalUserId)
        selectedMap.set(key, {
          type: 'internal',
          id: c.internalUserId,
          name: c.candidateName || `用户${c.internalUserId}`,
          belong: '',
          account: c.account ?? null,
          idCard: c.idCard ?? null,
          phone: c.phone ?? null
        })
        originSiteMap.set(key, c.examSiteId ?? undefined)
      }
    })
    // 考点存在考生记录上而非考试主表，取首条带考点的考生记录回显（本页按整场统一指定）
    const siteRecord = data.candidates?.find((c) => c.examSiteId)
    // 考点分布不一致检测：本页只能整场指定一个考点，一旦用户改动就会抹平按人分配，须提前告知。
    // 含「空值」一起计数，故「部分人有考点、部分人没有」的混合态同样会告警——
    // 这种情况下改考点会把原本无考点（线上参考）的人也一并填上，用户需要知情。
    const distinctSites = new Set((data.candidates ?? []).map((c) => c.examSiteId ?? null))
    multiSiteDetected.value = distinctSites.size > 1
    currentSite.value = siteRecord?.examSiteId
      ? {
          id: siteRecord.examSiteId,
          name: siteRecord.examSiteName || `考点 #${siteRecord.examSiteId}`,
          address: siteRecord.examSiteAddress ?? '',
          capacity: siteRecord.examSiteCapacity ?? null
        }
      : null
    // 试卷回显直接取详情带出的字段，不再整表拉下拉（试卷多时下拉取不全会显示为空）
    currentPaper.value = data.paperId
      ? {
          id: data.paperId,
          name: data.paperName || `试卷 #${data.paperId}`,
          type: data.paperType || 'fixed',
          totalScore: data.paperTotalScore ?? 0,
          suggestDuration: data.paperSuggestDuration ?? 0
        }
      : null
    Object.assign(form, {
      id: data.id,
      // 存量考试没有这个字段，缺省按普通考试处理（与 DB 列默认值一致）
      examType: data.examType ?? 'normal',
      name: data.name,
      description: data.description ?? '',
      paperId: data.paperId,
      startTime: data.startTime,
      endTime: data.endTime,
      duration: data.duration,
      passScore: data.passScore,
      certProjectId: data.certProjectId ?? undefined,
      examSiteId: siteRecord?.examSiteId ?? undefined,
      autoIssueCert: data.autoIssueCert ?? false,
      certTemplateId: data.certTemplateId ?? undefined,
      // 与默认值合并：后端新增字段时老数据缺字段也不会出现 undefined 绑定
      setting: data.setting ? { ...createForm().setting, ...data.setting } : createForm().setting
    })
    // 反推口径与详情页共用（deriveCertMode）：有模板即按模板发，否则不发证
    // 换考试进来时清掉上一场遗留的校验红字：值已整体替换，但 el-form 的校验态是独立维护的，
    // 不会因为值变化自动消失，否则新考试的表单一进来就带着上一场的错误提示
    formRef.value?.clearValidate()
    certMode.value = deriveCertMode(data)
    // 原先此处有「同时关联项目与模板」的矛盾态提示并清掉模板。现在项目归考试类型、
    // 模板归发证方式，二者本就可以并存，不再是矛盾，故不做任何规范化
    form.autoIssueCert = certMode.value !== 'none'
  }

  /**
   * 组装考生数组（内部 + 外部）
   * 考点存在每条考生记录上（支持按人分考场），本页只能整场统一指定。
   * 更新是全量覆盖（后端先删后建），若考生原本分属不同考点，整场写同一值会静默抹平，
   * 故未动过考点时按 originSiteMap 保留各人原值，只有用户主动改过才整场覆盖。
   */
  function buildCandidates(): ExamCandidateItem[] {
    const unified = form.examSiteId
    return selectedList.value.map((it) => {
      const key = keyOf(it.type, it.id)
      const examSiteId = siteTouched.value ? unified : (originSiteMap.get(key) ?? unified)
      return it.type === 'internal'
        ? { candidateType: 'internal', internalUserId: it.id, examSiteId }
        : { candidateType: 'external', externalCandidateId: it.id, examSiteId }
    })
  }

  /** 提交创建/编辑（整体校验，有错跳回第一步） */
  async function handleSubmit(publish = false) {
    const valid = await formRef.value?.validate().catch(() => false)
    if (!valid) {
      ElMessage.warning('请先完善必填项')
      return
    }
    // 兜底：按钮在不满足时已禁用，但快捷路径（回车提交等）仍可能走到这
    if (publish && publishBlockReason.value) {
      ElMessage.warning(publishBlockReason.value)
      return
    }
    try {
      if (publish) publishLoading.value = true
      else submitLoading.value = true
      const payload = {
        examType: form.examType,
        name: form.name.trim(),
        description: form.description?.trim() || undefined,
        paperId: form.paperId!,
        startTime: form.startTime,
        endTime: form.endTime,
        duration: form.duration!,
        passScore: form.passScore!,
        // 项目绑定跟考试类型走，普通考试显式给 null 覆盖存量值
        // （后端 assertTypeAndCertConsistency 会拦「普通考试带项目」）
        certProjectId: form.examType === 'skill' ? form.certProjectId : null,
        // 发证两字段由发证方式派生，不发证时显式给 null
        autoIssueCert: certMode.value !== 'none',
        certTemplateId: certMode.value === 'template' ? form.certTemplateId : null,
        // 技能鉴定考试的这批会被后端整体忽略、按项目重查；仍要传是为了把考点带过去
        candidates: buildCandidates(),
        // 始终提交（含空数组）：后端按「字段缺省=不改动」处理，
        // 缺省会导致本页清空名单的操作存不下去
        proctors: proctors.value.map((s) => ({ userId: s.userId })),
        graders: graders.value.map((s) => ({ userId: s.userId })),
        setting: { ...form.setting }
      }
      // 先落库拿到 id，发布是紧接着的第二步请求（后端没有「建并发布」的合并接口）
      let examId: number | undefined
      if (isEditing.value && form.id) {
        await examApi.update({ id: form.id, ...payload })
        examId = form.id
      } else {
        const res = await examApi.add(payload)
        examId = res?.data?.id
      }

      if (!publish) {
        ElMessage.success(isEditing.value ? '编辑成功' : '创建成功')
        handleBack()
        return
      }

      /*
        保存成功、发布失败时不能当作整体失败：考试已经落库了。
        此时必须离开本页——新建态留在原地再点保存会建出第二场考试。
        统一退回列表并照实说明「已保存但未发布」，列表里可修好后重新发布。

        失败原因多是前端判不出的那两条（试卷被撤回 / 随机卷题量不足）。
      */
      if (!examId) {
        ElMessage.warning('考试已保存，但未能取到考试编号，请在列表中手动发布')
        handleBack()
        return
      }
      try {
        await examApi.publish(examId)
      } catch (publishError: any) {
        ElMessage.warning(
          `考试已保存，但发布失败：${publishError?.message || '未知原因'}，可在列表中重新发布`
        )
        handleBack()
        return
      }
      ElMessage.success(isEditing.value ? '已保存并发布' : '已创建并发布')
      handleBack()
    } catch (error: any) {
      ElMessage.error(error.message || '操作失败')
    } finally {
      submitLoading.value = false
      publishLoading.value = false
    }
  }

  /** 新建态复位：从「编辑某场」切到「新建」时，必须清掉上一场残留的表单与名单 */
  function resetToCreate() {
    Object.assign(form, createForm())
    // 同 loadForEdit：值换了但 el-form 的校验态不会自动清，否则新建表单一进来就带红字
    formRef.value?.clearValidate()
    selectedMap.clear()
    originSiteMap.clear()
    proctors.value = []
    graders.value = []
    currentPaper.value = null
    currentSite.value = null
    siteTouched.value = false
    multiSiteDetected.value = false
    certMode.value = 'none'
  }

  /** 按当前 id 初始化页面（有 id 拉详情回填，无 id 回到新建初值） */
  async function initPage(id: number | undefined) {
    const seq = ++pageSeq
    pageLoading.value = true
    try {
      await loadCertOptions()
      if (seq !== pageSeq) return
      if (id) {
        await loadForEdit(id, seq)
      } else {
        resetToCreate()
      }
    } catch (error: any) {
      // 已被更新的初始化取代时不打扰用户
      if (seq !== pageSeq) return
      ElMessage.error(error.message || '加载数据失败')
    } finally {
      // 过期的初始化不该把新一次的 loading 关掉
      if (seq === pageSeq) pageLoading.value = false
    }
  }

  /*
    用 watch(immediate) 而非 onMounted：本页 id 走 query，而布局层的
    <component :key="route.path"> 不含 query，`/exam-edit?id=A` 与 `?id=B`
    在 Vue 看来是同一个 key，组件实例会被复用、onMounted 不再触发。
    那样表单会残留上一场考试的数据（包括隐藏的 form.id），保存时按旧 id 提交——
    复制考试后编辑副本却报「考试已发布，无法编辑」正是这么来的。
    菜单表已同步把 /exam-edit 的 keepAlive 置 0，但那只解决被缓存的情形；
    编辑页之间直接互跳仍会复用实例，故这里按 id 变化重新取数，两层都堵住。
  */
  watch(
    editingId,
    (id) => {
      // 路径守卫同 paper-edit：`?id=` 这个 query key 被多个页面共用（/paper-edit、/exam-detail 等），
      // 从本页跳去那些页面时 editingId 也会变，watch 仍可能被触发一次。
      // 是否真跑到取决于 Vue 内部「父组件卸载」与「本组件 pre-flush watcher」的调度先后，
      // 那是实现细节而非契约，不该指望。跑到了最坏是对别人的 id 白发一次详情请求。
      if (route.path !== '/exam-edit') return
      initPage(id)
    },
    { immediate: true }
  )
</script>

<style lang="scss" scoped>
  /* 已选考生表：账号列表头挂了问号提示，样式走公共 mixin */
  .selected-table {
    @include tableHeaderTip();
  }

  /*
    不设 height: 100%。外层 .el-scrollbar__view 用的是 min-height: 100%，
    内容一长它就跟着长，本页的 100% 于是解析到被撑长的高度——底部条被推到
    折叠线以下，成了「内容短才固定」。改为让本页在外层滚动条里自然流动，
    底部条用 sticky 钉住（见 .footer-bar），不依赖任何祖先的确定高度。
  */
  .exam-edit {
    display: flex;
    flex-direction: column;
    gap: 16px;

    // 页头与 paper-edit 保持一致：无卡片，返回按钮 + 竖线 + 标题
    .page-header {
      display: flex;
      flex-shrink: 0;
      gap: 12px;
      align-items: center;
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

    /*
      双栏主体不再自成滚动容器（原有 flex:1 + overflow-y:auto 已移除），
      交给外层滚动条统一滚：页内再套一层会出现双滚动条，滚轮停在内层时外层不动。
      底部条改用 sticky 后，也不再需要靠内层滚动把它挤在视口内。
    */
    .edit-form {
      display: grid;
      // 左栏略宽：内含考生表格；右栏为设置项，窄一些即可
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
      gap: 16px;
      align-items: start;

      // 窄屏堆叠为单列，避免两栏都被压得放不下控件
      @media only screen and (max-width: $device-ipad-pro) {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    .col {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }

    // 分区卡片
    .panel {
      overflow: hidden;
      background: var(--el-bg-color-overlay);
      border-radius: 12px;

      .panel-head {
        display: flex;
        gap: 8px;
        align-items: baseline;
        padding: 14px 20px;
        border-bottom: 1px solid var(--el-border-color-lighter);

        .panel-title {
          font-size: 15px;
          font-weight: 600;
        }

        .panel-sub {
          font-size: 12px;
          color: var(--el-text-color-secondary);
        }
      }

      /*
        底部只留 4px 是因为表单类面板末个 ElFormItem 自带 18px 下边距。
        工具栏+表格型的面板没这层垫底，单独补，见 .step-candidate。
      */
      .panel-body {
        padding: 18px 20px 4px;

        &.step-candidate {
          padding-bottom: 18px;
        }

        /* 空态下工具栏后面没有表格，抹掉它的下边距免得底部空一截 */
        &.is-empty .cand-toolbar {
          margin-bottom: 0;
        }
      }
    }

    // 右栏内的分组小标题（防作弊 / 重考 / 考前 / 考中 / 考后）
    .group-title {
      padding-left: 8px;
      margin: 4px 0 14px;
      font-size: 13px;
      font-weight: 600;
      color: var(--el-text-color-regular);
      border-left: 3px solid var(--el-color-primary);

      // 首个分组紧贴卡片内边距，无需额外上间距
      &:not(:first-child) {
        margin-top: 18px;
      }
    }

    // 试卷/发证等字段下方的辅助说明
    .field-hint {
      width: 100%;
      margin-top: 4px;
      font-size: 12px;
      line-height: 1.5;
      color: var(--el-text-color-secondary);
    }

    // 开关右侧的状态说明
    .switch-tip {
      margin-left: 10px;
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }

    // 发证方式三选一：等宽卡片，说明写进选项内，选中态用主色描边而非整块填充
    .cert-modes {
      display: flex;
      gap: 10px;
      width: 100%;
    }

    .cert-mode {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 2px;
      padding: 9px 12px;
      font: inherit;
      line-height: 1.4;
      text-align: left;
      cursor: pointer;
      background: var(--el-fill-color-blank);
      border: 1px solid var(--el-border-color);
      border-radius: 8px;
      transition:
        border-color 0.2s,
        background-color 0.2s;

      &:hover {
        border-color: var(--el-color-primary-light-5);
      }

      // 键盘操作需要可见焦点，鼠标点击不显示
      &:focus-visible {
        outline: 2px solid var(--el-color-primary);
        outline-offset: 2px;
      }

      .mode-label {
        font-size: 13px;
        color: var(--el-text-color-regular);
      }

      .mode-desc {
        font-size: 12px;
        color: var(--el-text-color-placeholder);
      }

      &.is-active {
        background: var(--el-color-primary-light-9);
        border-color: var(--el-color-primary);

        .mode-label {
          font-weight: 500;
          color: var(--el-color-primary);
        }

        /*
          不用 primary-light-3：浅蓝底上的浅蓝字对比度不足 2:1，12px 小字读不清。
          主色是运行时注入、用户可改，挑不出一个恒定安全的同色相值，
          故用与色相无关的常规文字色；选中感由上面的标签色和边框承担。
        */
        .mode-desc {
          color: var(--el-text-color-regular);
        }
      }
    }

    // 已选试卷卡片：名称 + 类型标签一行，总分与建议时长次行，右侧「更换」入口
    .paper-picked {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 10px;
      align-items: center;
      width: 100%;
      padding: 8px 12px;
      background: var(--el-fill-color-light);
      border-radius: 8px;

      .picked-main {
        display: flex;
        flex: 1;
        gap: 8px;
        align-items: center;
        min-width: 0;
      }

      .picked-name {
        overflow: hidden;
        font-weight: 500;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .picked-meta {
        flex-shrink: 0;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }

      .picked-change {
        flex-shrink: 0;
      }
    }

    .site-alert {
      margin-top: 8px;
    }

    .site-hint {
      margin-left: 12px;
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }

    .site-warn {
      margin-left: 12px;
      font-size: 12px;
      color: var(--el-color-warning);
    }

    /* 表单项下方的补充说明，与 el-form-item 的错误提示同一缩进 */
    .form-tip {
      margin-top: 4px;
      font-size: 12px;
      line-height: 1.5;
      color: var(--el-text-color-secondary);
    }

    /* 派生名单的说明条：紧贴工具栏下方，与表格留出间距 */
    .cand-derive-tip {
      margin-bottom: 12px;
    }

    .cand-toolbar {
      display: flex;
      gap: 16px;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;

      .cand-stat {
        min-width: 0;
        font-size: 14px;
        color: var(--el-text-color-regular);

        b {
          margin: 0 2px;
          font-size: 16px;
          color: var(--el-color-primary);
        }

        .stat-sub {
          font-size: 13px;
          color: var(--el-text-color-secondary);
        }

        /* 空态：状态与补充说明竖排在按钮左侧，整块只占一行按钮的高度 */
        &.is-empty {
          display: flex;
          flex-direction: column;
          gap: 2px;
          line-height: 1.4;
        }

        .stat-empty-text {
          font-size: 13px;
          color: var(--el-text-color-secondary);
        }

        .stat-empty-hint {
          font-size: 12px;
          color: var(--el-text-color-placeholder);
        }
      }

      .cand-actions {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      /* 添加动作与「清空」之间的竖线分隔 */
      .action-sep {
        width: 1px;
        height: 16px;
        margin: 0 2px;
        background: var(--el-border-color-lighter);
      }
    }

    .cand-pager {
      justify-content: flex-end;
      margin-top: 10px;
    }

    /*
      底部操作条：按钮靠右，左侧放发布条件。
      原先按钮居中——通栏 1200px 上下，居中既不贴内容也不贴屏幕边缘，
      落点没有参照物，看着像浮在一片空白里。
    */
    .footer-bar {
      position: sticky;

      /*
        20px 悬浮间距，取值刻意等于父级 .art-page-view 的 padding-bottom：
        两者相等时，悬浮位置与滚到底的停靠位置重合，到底那一刻不会跳一下。
        换成别的值就会在触底瞬间位移 |20 - bottom| 的距离。
      */
      bottom: 20px;
      z-index: 10;
      display: flex;
      flex-shrink: 0;
      gap: 16px;
      align-items: center;
      justify-content: space-between;
      padding: 12px 20px;

      /*
        内容不足一屏时把自己顶到底部。本页主体已不再 flex:1 撑满，
        少了这行，短内容下底部条会紧跟在内容后面、下方空一片。
        内容超出一屏时自由空间为 0，这行自动失效，不影响 sticky。
      */
      margin-top: auto;

      // 必须不透明：内容从下面穿过
      background: var(--el-bg-color);

      /*
        整圈边框 + 四散投影：离开底缘后它是块悬浮卡片，上下都有内容穿过，
        只描上边界会缺一半。边框主题感知（亮 #eaebf1 / 暗 #26272f）——
        投影在暗色模式下读不出来（项目暗色投影值与亮色相同），不能只靠投影。
      */
      border: 1px solid var(--art-border-color);
      border-radius: 12px;
      box-shadow: 0 2px 16px rgb(0 0 0 / 10%);

      // 窄屏收成两行：条件提示在上、按钮在下靠右，免得把按钮挤变形
      @media only screen and (max-width: $device-ipad) {
        flex-direction: column;
        align-items: stretch;
      }
    }

    .footer-hint {
      display: flex;
      gap: 6px;
      align-items: center;
      min-width: 0;
      font-size: 13px;

      .el-icon {
        flex-shrink: 0;
        font-size: 15px;
      }

      &.is-ready {
        color: var(--el-text-color-secondary);

        .el-icon {
          color: var(--el-color-success);
        }
      }

      // 未满足发布条件不算错误：保存仍然可用，故用 warning 而非 danger
      &.is-blocked {
        color: var(--el-color-warning);
      }
    }

    .footer-actions {
      display: flex;
      flex-shrink: 0;
      gap: 12px;
      justify-content: flex-end;
    }

    .switch-extra-label {
      margin: 0 8px 0 16px;
      color: var(--el-text-color-regular);
    }

    .unit-tip {
      margin-left: 8px;
      color: var(--el-text-color-secondary);
    }
  }
</style>
