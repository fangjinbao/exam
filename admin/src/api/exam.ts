/**
 * 考试管理 API
 * 对接 /admin/exam/exam/* 接口：列表、详情、创建、编辑、分配考生、发布、撤回、删除。
 * 统一关闭 http 层错误提示（showErrorMessage: false），由页面自行控制提示文案。
 */

import request from '@/utils/http'

/** 考试实体（列表项） */
export interface Exam {
  id: number
  /** 考试类型 normal/skill */
  examType: string
  name: string
  description?: string | null
  paperId: number
  paperName: string
  paperType: string
  startTime: string
  endTime: string
  duration: number
  passScore: number
  certProjectId?: number | null
  /** 通过后自动发证 */
  autoIssueCert?: boolean
  /** 自动发证使用的证书模板 ID */
  certTemplateId?: number | null
  status: string // unpublished | published | ongoing | finished
  candidateCount: number
  /** 创建人用户 ID */
  createBy?: number | null
  /** 创建人姓名（后端关联查询下发） */
  createByName?: string
  /** 创建人所属单位（由创建人部门上溯到公司节点，后端实时派生） */
  createByOrgName?: string
  createTime?: string
  updateTime?: string
}

/** 考生分配项 */
export interface ExamCandidateItem {
  candidateType: string // internal | external
  internalUserId?: number
  externalCandidateId?: number
  examSiteId?: number
}

/** 考生分配项（详情，含姓名） */
export interface ExamCandidateDetail extends ExamCandidateItem {
  id: number
  candidateName: string
  /** 登录账号：内部为统一身份账号，外部考生以手机号登录 */
  account?: string | null
  /** 身份证号：内部人员无此字段，恒为 null */
  idCard?: string | null
  phone?: string | null
  /** 考点名称等随记录带出，考点被停用后编辑态仍能回显 */
  examSiteName?: string | null
  examSiteAddress?: string | null
  examSiteCapacity?: number | null
}

/** 考试工作人员项（监考 / 阅卷共用） */
export interface ExamStaffDetail {
  userId: number
  name: string
  /** 登录账号（统一身份账号） */
  account?: string | null
  /** 所属部门名 */
  belong?: string
}

/*
  原有 ScorePublishMode 类型与 SCORE_PUBLISH_OPTIONS 选项已移除，
  该字段从未参与任何发布判定。

  成绩公布不是可配项：纯客观题交卷即自动判分发布
  （AppExamService.submitExam 的 `scorePublished: !hasSubjective`）；
  含主观题交卷后进入待阅卷，阅完只是发布前提，仍需在阅卷中心手动发布
  （GradingService.publishScore），且发布后可撤回（withdrawScore）。
*/

/** 考试设置：防作弊 + 重考次数 + 考前/考中/考后 */
export interface ExamSetting {
  // 防作弊
  screenSwitchDetect: boolean
  allowSwitchTimes: number
  shuffleQuestions: boolean
  operationRestrict: boolean
  // 重考
  retakeLimit: number
  // 考前
  earlyEnterMinutes: number
  requireCommitment: boolean
  // 考中
  allowEarlySubmit: boolean
  minAnswerMinutes: number
  showRemainingTime: boolean
  // 考后
  allowViewScore: boolean
  allowViewAnalysis: boolean
}

/** 考试详情 */
export interface ExamDetail extends Exam {
  /** 所选试卷总分，编辑页作为及格分参照回显 */
  paperTotalScore?: number
  /** 所选试卷建议时长（分钟），编辑页作为考试时长参照回显 */
  paperSuggestDuration?: number
  /** 关联认证项目名称（未关联或项目已删除为 null） */
  certProjectName?: string | null
  /** 证书模板名称（未指定或模板已删除为 null） */
  certTemplateName?: string | null
  candidates: ExamCandidateDetail[]
  /** 指派的监考人员 */
  proctors?: ExamStaffDetail[]
  /** 指派的阅卷人员 */
  graders?: ExamStaffDetail[]
  setting: ExamSetting | null
}

/** 分页返回结构 */
export interface ExamListResult {
  list: Exam[]
  pagination: { page: number; pageSize: number; total: number }
}

/** 考试状态文案（列表页与详情页共用，避免两处各写一份而分叉） */
export const EXAM_STATUS_TEXT: Record<string, string> = {
  unpublished: '未发布',
  published: '已发布',
  ongoing: '进行中',
  finished: '已结束'
}

/** 考试状态对应的 Tag 类型 */
export function examStatusTagType(status: string): 'info' | 'primary' | 'warning' | 'success' {
  const map: Record<string, 'info' | 'primary' | 'warning' | 'success'> = {
    unpublished: 'info',
    published: 'primary',
    ongoing: 'warning',
    finished: 'success'
  }
  return map[status] || 'info'
}

/** 发证方式：none 不发证 / template 单独指定证书 */
export type CertMode = 'none' | 'template'

/**
 * 发证方式的标题与说明（编辑页与详情页共用，避免两处各写一份而分叉）
 * 说明直接写在选项里，省掉选完才出现的额外提示行。
 *
 * 原有第三项「按认证项目 / 取项目的模板与有效期」已下线：鉴定项目表上
 * 既没有证书模板字段也没有有效期字段，后端发证只认 exam.certTemplateId，
 * 选它必然发不出证。项目关联现在是考试类型的事（见 EXAM_TYPE_OPTIONS），
 * 与发证无关——技能鉴定考试要发证同样得在这里指定模板。
 */
export const CERT_MODE_OPTIONS: Array<{ value: CertMode; label: string; desc: string }> = [
  { value: 'none', label: '不发证', desc: '需人工发放' },
  { value: 'template', label: '单独指定证书', desc: '仅指定证书模板' }
]

/**
 * 由存量字段反推发证方式：有模板即按模板发，否则不发证。
 *
 * 不再看 certProjectId：它已改为表达「这场考试绑定哪个鉴定项目」，
 * 与发证无关。若这里仍判它，技能鉴定考试会被反推成已不存在的 'project'，
 * 编辑页与详情页的发证区都会渲染空白。
 */
export function deriveCertMode(source: { certTemplateId?: number | null }): CertMode {
  if (source.certTemplateId) return 'template'
  return 'none'
}

/** 考试类型：normal 普通考试 / skill 技能鉴定考试 */
export type ExamType = 'normal' | 'skill'

/** 考试类型文案 */
export const EXAM_TYPE_TEXT: Record<string, string> = {
  normal: '普通考试',
  skill: '技能鉴定考试'
}

/**
 * 考试类型选项（编辑页单选、列表页筛选共用）
 * skill 必须绑定鉴定项目，且考生名单由该项目审核通过的报名派生、不可手工增删。
 *
 * desc 只在编辑页的卡片里显示，列表筛选下拉只取 label。
 */
export const EXAM_TYPE_OPTIONS: Array<{ value: ExamType; label: string; desc: string }> = [
  { value: 'normal', label: '普通考试', desc: '自行选择考生' },
  { value: 'skill', label: '技能鉴定考试', desc: '绑定鉴定项目，考生取审核通过人员' }
]

/** 发证方式文案 */
export function certModeLabel(mode: CertMode): string {
  return CERT_MODE_OPTIONS.find((o) => o.value === mode)?.label || '-'
}

/** 考生成绩状态：与后端 exam-score.service 的 EXAM_SCORE_STATUS 对齐 */
export type ExamScoreStatus = 'not_started' | 'ongoing' | 'pending_grading' | 'completed'

/** 考生成绩状态文案 */
export const EXAM_SCORE_STATUS_TEXT: Record<string, string> = {
  not_started: '未参加',
  ongoing: '考试中',
  pending_grading: '待阅卷',
  completed: '已完成'
}

/** 考生成绩状态筛选项 */
export const EXAM_SCORE_STATUS_OPTIONS: { label: string; value: ExamScoreStatus }[] = [
  { label: '未参加', value: 'not_started' },
  { label: '考试中', value: 'ongoing' },
  { label: '待阅卷', value: 'pending_grading' },
  { label: '已完成', value: 'completed' }
]

/** 考生成绩行 */
export interface ExamScoreItem {
  candidateType: 'internal' | 'external'
  candidateId: number
  name: string
  companyName: string
  departmentName: string
  /** 登录账号：内部为统一身份账号，外部考生以手机号登录 */
  account: string | null
  /** 身份证号：仅外部考生库维护该字段，内部人员恒为 null */
  idCard: string | null
  phone: string | null
  status: ExamScoreStatus
  /** 客观题得分，未判分为 null */
  objectiveScore: number | null
  /** 主观题得分，未阅完为 null */
  subjectiveScore: number | null
  /** 总分，成绩未发布为 null */
  totalScore: number | null
  /** 是否及格，成绩未发布为 null */
  passed: boolean | null
  /** 作答用时（分钟），时间缺失为 null */
  durationMinutes: number | null
  startTime: string | null
  submitTime: string | null
  switchCount: number
}

/** 考生成绩分页返回结构 */
export interface ExamScoreListResult {
  list: ExamScoreItem[]
  pagination: { page: number; pageSize: number; total: number }
}

/** 导入考生的单行数据（对应模板列） */
export interface ImportExamCandidateRow {
  /** 考生类型原文：内部 / 外部 */
  candidateType?: string
  name?: string
  /** 登录账号：内部为统一身份账号，外部为手机号 */
  account?: string
  /** 身份证号，外部考生选填 */
  idCard?: string
}

/** 导入考生匹配结果 */
export interface ResolveImportResult {
  matched: {
    type: 'internal' | 'external'
    id: number
    name: string
    belong: string
    /** 登录账号：内部为统一身份账号，外部为手机号 */
    account?: string | null
    /** 身份证号：内部人员无此字段 */
    idCard?: string | null
    phone?: string | null
  }[]
  errors: { row: number; reason: string }[]
}

/** 创建/编辑考试入参 */
export interface ExamPayload {
  /**
   * 考试类型 normal/skill
   *
   * 后端 DTO 里是必填。ValidationPipe 开了 forbidNonWhitelisted，
   * 这个字段与后端 DTO 必须同批上线：只改一边就是整体 400。
   */
  examType: string
  name: string
  description?: string
  paperId: number
  startTime: string
  endTime: string
  duration: number
  passScore: number
  /**
   * 绑定的鉴定项目 ID：examType=skill 时必填，normal 时传 null 清除
   *
   * 与发证无关（曾作为「按认证项目发证」的载体，该方式已下线）
   */
  certProjectId?: number | null
  /** 通过后自动发证 */
  autoIssueCert?: boolean
  /** 单独指定的证书模板 ID；显式传 null 用于清除存量值 */
  certTemplateId?: number | null
  candidates?: ExamCandidateItem[]
  /** 监考人员（仅传 userId，姓名由后端按库内记录落快照） */
  proctors?: { userId: number }[]
  /** 阅卷人员 */
  graders?: { userId: number }[]
  setting?: Partial<ExamSetting>
}

/** 获取考试列表（分页） */
export function getExamList(params?: {
  keyword?: string
  status?: string
  /** 考试类型 normal/skill */
  examType?: string
  startDate?: string
  endDate?: string
  page?: number
  pageSize?: number
}) {
  return request.get<ExamListResult>({
    url: '/admin/exam/exam/list',
    params,
    showErrorMessage: false
  })
}

/** 考试详情 */
export function getExamDetail(id: number) {
  return request.get<ExamDetail>({
    url: `/admin/exam/exam/detail/${id}`,
    showErrorMessage: false
  })
}

/**
 * 考生成绩分页
 * 以考试已分配的考生为全集，未参加的考生也会返回并标为 not_started。
 */
export function getExamScorePage(
  examId: number,
  params?: { keyword?: string; status?: string; page?: number; pageSize?: number }
) {
  return request.get<ExamScoreListResult>({
    url: `/admin/exam/exam/score/${examId}`,
    params,
    showErrorMessage: false
  })
}

/**
 * 考生成绩全量数据（导出用，不分页）
 * @param params 与列表一致的筛选条件，导出所见即所得
 */
export function getExamScoreExport(examId: number, params?: { keyword?: string; status?: string }) {
  return request.get<ExamScoreItem[]>({
    url: `/admin/exam/exam/score-export/${examId}`,
    params,
    showErrorMessage: false
  })
}

/**
 * 导入考生：把 Excel 行匹配为系统内已存在的人员
 * 只做匹配不落库，匹配结果由页面合并进已选列表，随考试保存时才写入。
 */
export function resolveImportCandidates(rows: ImportExamCandidateRow[]) {
  return request.post<ResolveImportResult>({
    url: '/admin/exam/exam/resolve-import-candidates',
    data: { rows },
    showErrorMessage: false
  })
}

/** 创建考试（返回新建考试，「保存并发布」需要其中的 id） */
export function addExam(data: ExamPayload) {
  return request.post<Exam>({ url: '/admin/exam/exam/add', data, showErrorMessage: false })
}

/** 编辑考试（仅未发布） */
export function updateExam(data: ExamPayload & { id: number }) {
  return request.put({ url: '/admin/exam/exam/update', data, showErrorMessage: false })
}

/**
 * 复制考试
 *
 * 生成一份未发布副本（含试卷、设置、考生、监考），任何状态的考试都可复制。
 * 返回新考试，调用方可用其 id 直接跳编辑页改期。
 */
export function copyExam(id: number) {
  return request.post<Exam>({ url: '/admin/exam/exam/copy', data: { id } })
}

/**
 * 分配/更新考生（全量替换，仅未发布）
 *
 * ⚠️ 提交的是「完整名单」，未列出的考生会被删除。
 * 给已发布/进行中的考试补人请用 appendCandidates，别用这个——
 * 漏传一个人就会删掉他的分配，而他可能正在答题。
 */
export function assignCandidates(examId: number, candidates: ExamCandidateItem[]) {
  return request.post({
    url: '/admin/exam/exam/assign-candidates',
    data: { examId, candidates },
    showErrorMessage: false
  })
}

/**
 * 追加考生（只增不减，已发布/进行中可用）
 *
 * 与 assignCandidates 语义相反：这里提交的是「要新增的人」，
 * 已在名单中的会被后端跳过，现有考生不受影响。
 * 考生端待办无需另行补发——考试通知由后端从考生分配实时派生。
 */
export function appendCandidates(examId: number, candidates: ExamCandidateItem[]) {
  return request.post({
    url: '/admin/exam/exam/append-candidates',
    data: { examId, candidates },
    showErrorMessage: false
  })
}

/** 考生名单项（带「是否已进入考试」标记） */
export interface ExamCandidateRoster extends ExamCandidateDetail {
  /** 是否已进入考试（有答卷行即已开考，此时不可移除） */
  hasEntered: boolean
}

/**
 * 考生名单（含是否已进入考试，供名单弹窗展示与判断可否移除）
 *
 * showErrorMessage: false 与本文件其余接口一致——把提示权交给调用方。
 * 不关的话失败时会弹两条：拦截器一条后端文案，调用方 catch 再一条。
 */
export function getExamCandidates(examId: number) {
  return request.get<ExamCandidateRoster[]>({
    url: `/admin/exam/exam/candidates/${examId}`,
    showErrorMessage: false
  })
}

/** 鉴定项目下审核通过的人员（技能鉴定考试的考生名单预览项） */
export interface CertProjectCandidate {
  /** 报名记录 ID，仅作列表 key */
  applicationId: number
  /** 考生 ID：内部人员 ID 或外部考生 ID */
  candidateId: number
  candidateName: string
  candidateType: string
  orgName: string
  deptName: string
}

/**
 * 鉴定项目下审核通过的人员（绑定项目时预览将带入哪些人）
 *
 * 只是预览：保存时后端按 projectId 自己重查，不信前端传的名单。
 */
export function getCertProjectCandidates(projectId: number) {
  return request.get<CertProjectCandidate[]>({
    url: `/admin/exam/exam/cert-project-candidates/${projectId}`,
    showErrorMessage: false
  })
}

/**
 * 移除考生（仅未进入考试者）
 *
 * 传 ExamCandidate 行 id（名单接口返回的 id），不是考生本人的 id——
 * 内外部考生 id 各自自增会撞号。已进入考试的人后端会跳过并在文案里回报。
 */
export function removeExamCandidates(examId: number, ids: number[]) {
  return request.post({
    url: '/admin/exam/exam/remove-candidates',
    data: { examId, ids },
    showErrorMessage: false
  })
}

/**
 * 指派监考人/阅卷人（全量替换该岗位名单，任何阶段可用）
 *
 * 单次只处理一个岗位：要同时改监考和阅卷需调用两次。
 * 传空数组即清空该岗位名单。
 */
export function assignStaff(
  examId: number,
  role: 'proctor' | 'grader',
  staff: { userId: number }[]
) {
  return request.post({
    url: '/admin/exam/exam/assign-staff',
    data: { examId, role, staff },
    showErrorMessage: false
  })
}

/** 发布考试 */
export function publishExam(id: number) {
  return request.post({ url: `/admin/exam/exam/publish/${id}`, showErrorMessage: false })
}

/** 撤回考试 */
export function withdrawExam(id: number) {
  return request.post({ url: `/admin/exam/exam/withdraw/${id}`, showErrorMessage: false })
}

/** 删除考试 */
export function deleteExam(id: number) {
  return request.del({ url: `/admin/exam/exam/delete/${id}`, showErrorMessage: false })
}

/** 批量删除考试 */
export function batchDeleteExams(ids: number[]) {
  return request.post({
    url: '/admin/exam/exam/batch-delete',
    data: { ids },
    showErrorMessage: false
  })
}

/** 考试 API 聚合导出 */
export const examApi = {
  getList: getExamList,
  getDetail: getExamDetail,
  getScorePage: getExamScorePage,
  getScoreExport: getExamScoreExport,
  resolveImportCandidates,
  add: addExam,
  update: updateExam,
  copy: copyExam,
  assignCandidates,
  appendCandidates,
  getCandidates: getExamCandidates,
  getCertProjectCandidates,
  removeCandidates: removeExamCandidates,
  assignStaff,
  publish: publishExam,
  withdraw: withdrawExam,
  delete: deleteExam,
  batchDelete: batchDeleteExams
}
