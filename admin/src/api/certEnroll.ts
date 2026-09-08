import request from '@/utils/http'

/**
 * 鉴定报名接口（单位管理员按名额报人）
 *
 * 单位不由前端传：服务端按当前登录账号的部门上溯到所属公司节点得出，
 * 传了也不认——否则改个入参就能替别的单位报名。超管可用 orgId 指定单位。
 */

/** 可报名项目（已发布且分到本单位名额） */
export interface EnrollProject {
  id: number
  name: string
  occupationName: string
  levelName: string
  managerName: string
  contactPhone: string
  applyDeadline: string
  startTime: string
  endTime: string
  publishTime: string | null
  /** 报名是否已截止（到截止时刻即关闭） */
  closed: boolean
  /** 本单位名额合计/已用/剩余，跨该单位全部名额行 */
  quotaTotal: number | null
  quotaUsed: number | null
  quotaRemain: number | null
}

/**
 * 我的单位在某项目下的一行名额
 *
 * 各行是独立的桶：一个单位可能有多个名额行（按部门分，外加一行整个单位），
 * 某部门的名额不该被别的部门占掉，故 used/remain 按行统计。
 */
export interface MyQuota {
  quotaId: number
  orgId: number
  orgName: string
  /** 为空表示名额分给整个单位、不细分部门 */
  deptId: number | null
  deptName: string
  quota: number
  used: number
  remain: number
}

/** 可选人员（本名额范围内、未在本项目占名额的启用员工） */
export interface EnrollCandidate {
  id: number
  name: string
  workId: string
  phone: string
  deptName: string
}

/** 本单位已报人员 */
export interface MyApplication {
  id: number
  candidateName: string
  internalUserId: number | null
  deptId: number | null
  deptName: string
  /** pending 待审核 / approved 已通过 / rejected 已驳回 */
  status: string
  rejectReason: string | null
  reviewerName: string | null
  reviewTime: string | null
  submitterName: string | null
  applyTime: string
}

export const certEnrollApi = {
  /** 可报名项目分页列表 */
  getProjects(params: { page?: number; pageSize?: number }) {
    return request.get<{
      list: EnrollProject[]
      pagination: { page: number; pageSize: number; total: number }
    }>({ url: '/admin/exam/cert-enroll/projects', params })
  },

  /** 我的单位在该项目下的名额行（含已用/剩余） */
  getMyQuotas(projectId: number, orgId?: number) {
    return request.get<MyQuota[]>({
      url: `/admin/exam/cert-enroll/my-quotas/${projectId}`,
      params: orgId ? { orgId } : undefined
    })
  },

  /** 某名额行可选人员 */
  getCandidates(quotaId: number, keyword?: string) {
    return request.get<EnrollCandidate[]>({
      url: `/admin/exam/cert-enroll/candidates/${quotaId}`,
      params: keyword ? { keyword } : undefined
    })
  },

  /** 我的单位在该项目下已报人员 */
  getMyApplications(projectId: number, orgId?: number) {
    return request.get<MyApplication[]>({
      url: `/admin/exam/cert-enroll/my-applications/${projectId}`,
      params: orgId ? { orgId } : undefined
    })
  },

  /** 提交报名（名额不足时整批拒绝） */
  submit(data: { quotaId: number; userIds: number[] }) {
    return request.post<null>({ url: '/admin/exam/cert-enroll/submit', data })
  },

  /** 撤销报名（仅待审核可撤销） */
  cancel(id: number) {
    return request.del<null>({ url: `/admin/exam/cert-enroll/cancel/${id}` })
  }
}
