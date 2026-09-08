import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma.service';
import { BaseService } from '@/common/crud';
import { PaperService } from './paper.service';
import { OrgScopeService, type AdminPayload } from './org-scope.service';
import { APPROVED_STATUS } from '../utils/cert-application-status';

/** 考试列表筛选条件 */
export interface ExamListFilter {
  keyword?: string;
  status?: string;
  /** 考试类型 normal/skill：两类考试可操作性不同（鉴定考试改不了名单），列表要能分开看 */
  examType?: string;
  startDate?: string;
  endDate?: string;
}

/** 考生分配项 */
export interface CandidateInput {
  candidateType: string;
  internalUserId?: number;
  externalCandidateId?: number;
  examSiteId?: number;
}

/** 考点摘要（随考生记录带出，供编辑态回显） */
interface SiteBrief {
  id: number;
  name: string;
  address: string;
  capacity: number | null;
}

/** 内部人员摘要（供考生表回显姓名/账号/手机号） */
interface UserBrief {
  id: number;
  name: string | null;
  username: string;
  phone: string | null;
}

/** 外部考生摘要（供考生表回显姓名/身份证号/手机号） */
interface ExternalBrief {
  id: number;
  name: string;
  idCard: string | null;
  phone: string;
}

/** 考试设置输入（防作弊 + 重考 + 考前/考中/考后） */
export interface ExamSettingInput {
  // 防作弊
  screenSwitchDetect?: boolean;
  allowSwitchTimes?: number;
  shuffleQuestions?: boolean;
  operationRestrict?: boolean;
  // 重考
  retakeLimit?: number;
  // 考前
  earlyEnterMinutes?: number;
  requireCommitment?: boolean;
  // 考中
  allowEarlySubmit?: boolean;
  minAnswerMinutes?: number;
  showRemainingTime?: boolean;
  // 考后
  allowViewScore?: boolean;
  allowViewAnalysis?: boolean;
  // 无 scorePublishMode：公布时机按卷内有无主观题自动判定，不可配（见 buildSetting）
}

/**
 * 考试服务
 * 承载考试 CRUD、考生分配、防作弊策略配置、发布/撤回，以及「已发布→进行中→已结束」的
 * 按考试时间惰性状态判定（查询时计算真实状态并回写）。编辑仅限未发布，删除保护已发布/进行中。
 */
@Injectable()
export class ExamService extends BaseService {
  private readonly logger = new Logger(ExamService.name);

  constructor(
    protected prisma: PrismaService,
    private readonly paperService: PaperService,
    private readonly orgScope: OrgScopeService,
  ) {
    super(prisma, 'exam');
  }

  /**
   * 计算考试的「真实状态」：已发布的考试按当前时间推进到进行中/已结束
   * @param row 含 status/startTime/endTime 的考试记录
   * @param now 当前时间
   * @returns 真实状态字符串
   */
  private computeStatus(
    row: { status: string; startTime: Date; endTime: Date },
    now: Date,
  ): string {
    // 未发布保持不变；已发布/进行中/已结束按时间推进
    if (row.status === 'unpublished') return 'unpublished';
    if (now >= row.endTime) return 'finished';
    if (now >= row.startTime) return 'ongoing';
    return 'published';
  }

  /**
   * 分页查询考试（惰性回写时间驱动的状态；带试卷名称/类型与参考人数）
   */
  async pageList(
    filter: ExamListFilter,
    page?: number,
    pageSize?: number,
    admin?: AdminPayload,
  ) {
    const p = Math.max(page || 1, 1);
    const ps = Math.min(Math.max(pageSize || 10, 1), 100);
    const skip = (p - 1) * ps;

    const where: Prisma.ExamWhereInput = {};
    if (filter.keyword) where.name = { contains: filter.keyword };
    if (filter.examType) where.examType = filter.examType;
    if (filter.startDate || filter.endDate) {
      where.startTime = {};
      if (filter.startDate) where.startTime.gte = new Date(filter.startDate);
      if (filter.endDate) where.startTime.lte = new Date(`${filter.endDate}T23:59:59.999`);
    }
    // 创建人隔离：非超管只能看自己组建的考试。存量数据 createBy 为 null，
    // 归属不明，一并只对超管可见，避免误把他人考试暴露给普通管理员。
    if (admin && !this.orgScope.isSuperAdmin(admin)) {
      where.createBy = admin.userId;
    }

    const now = new Date();
    const include = {
      paper: { select: { name: true, type: true } },
      _count: { select: { candidates: true } },
    } as const;

    // 组装单条列表项：计算真实状态并惰性回写。createByName 由外层批量预取后回填，
    // 避免在逐行组装里查库（N+1）
    const toItem = async ({ paper, _count, ...exam }: any) => {
      const realStatus = this.computeStatus(exam, now);
      if (realStatus !== exam.status) {
        await this.prisma.exam.update({ where: { id: exam.id }, data: { status: realStatus } });
      }
      return {
        ...exam,
        status: realStatus,
        paperName: paper?.name ?? '',
        paperType: paper?.type ?? '',
        candidateCount: _count.candidates,
        // 两者都由 fillCreateByNames 批量回填，此处占位保证字段恒存在
        createByName: '',
        createByOrgName: '',
      };
    };

    // status 为惰性计算值，无法进 DB where。有 status 筛选时全量取出→按真实状态过滤→应用层分页，
    // 保证 total 与列表一致、跨页不丢记录；无 status 筛选时走 DB 分页（高效）。
    if (filter.status) {
      const rows = await this.prisma.exam.findMany({ where, orderBy: { id: 'desc' }, include });
      const all = await Promise.all(rows.map(toItem));
      const filtered = all.filter((e) => e.status === filter.status);
      const pageList = filtered.slice(skip, skip + ps);
      // 仅对当前页回填姓名，避免为全量结果查用户表
      await this.fillCreateByNames(pageList);
      return { list: pageList, pagination: { page: p, pageSize: ps, total: filtered.length } };
    }

    const [rows, total] = await Promise.all([
      this.prisma.exam.findMany({ where, skip, take: ps, orderBy: { id: 'desc' }, include }),
      this.prisma.exam.count({ where }),
    ]);
    const list = await Promise.all(rows.map(toItem));
    await this.fillCreateByNames(list);
    return { list, pagination: { page: p, pageSize: ps, total } };
  }

  /**
   * 校验当前登录人对该考试有操作权（读/改/删/发布共用）
   * 仅创建人本人与超管可操作。列表已按创建人过滤，此处防「知道 id 就能直接改他人考试」。
   * 存量 createBy 为 null 的考试归属不明，只放行超管。
   * @param id 考试 ID
   * @param admin 当前登录管理员；缺省时不校验（内部调用）
   * @throws ForbiddenException 无权操作
   */
  async assertOwned(id: number, admin?: AdminPayload): Promise<void> {
    if (!admin || this.orgScope.isSuperAdmin(admin)) return;
    const row = await this.prisma.exam.findUnique({
      where: { id },
      select: { createBy: true },
    });
    // 不存在交由调用方按「不存在」处理，避免此处抛出与之矛盾的 403
    if (!row) return;
    if (row.createBy !== admin.userId) {
      throw new ForbiddenException('无权操作他人创建的考试');
    }
  }

  /**
   * 批量回填创建人姓名与所属单位（就地修改传入数组）
   * 一次查出本页涉及的用户，避免逐行查库。
   *
   * 所属单位由创建人的部门实时上溯得出，不存在考试表上——口径与可见性判定同源，
   * 详见 OrgScopeService.getOrgNamesByUserIds。
   *
   * @param items 含 createBy 字段的列表项
   */
  private async fillCreateByNames(
    items: Array<{ createBy?: number | null; createByName?: string; createByOrgName?: string }>,
  ) {
    const ids = [...new Set(items.map((i) => i.createBy).filter((v): v is number => !!v))];
    if (!ids.length) return;
    const [users, orgMap] = await Promise.all([
      this.prisma.sysUser.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, username: true },
      }),
      this.orgScope.getOrgNamesByUserIds(ids),
    ]);
    const nameMap = new Map(users.map((u) => [u.id, u.name || u.username || '']));
    items.forEach((i) => {
      if (i.createBy) {
        i.createByName = nameMap.get(i.createBy) || '';
        i.createByOrgName = orgMap.get(i.createBy) || '';
      }
    });
  }

  /** 校验考试名称是否已存在 */
  async isNameExists(name: string, excludeId?: number): Promise<boolean> {
    const existing = await this.prisma.exam.findFirst({
      where: { name, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    return !!existing;
  }

  /**
   * 查询考试真实状态（惰性回写）
   * @returns 状态字符串；不存在返回 null
   */
  async getRealStatus(id: number): Promise<string | null> {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      select: { id: true, status: true, startTime: true, endTime: true },
    });
    if (!exam) return null;
    const now = new Date();
    const real = this.computeStatus(exam, now);
    if (real !== exam.status) {
      await this.prisma.exam.update({ where: { id }, data: { status: real } });
    }
    return real;
  }

  /**
   * 查询考试详情（含考生列表[附姓名]与防作弊策略；惰性回写状态）
   * @returns 详情结构；不存在返回 null
   */
  async getDetail(id: number) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: {
        // 编辑页要按试卷总分/建议时长回显参照值，详情多带这两个字段，省一次试卷详情请求
        paper: { select: { name: true, type: true, totalScore: true, suggestDuration: true } },
        /*
          用 omit 排除多余列，不用 `setting: true`，也不用白名单式 select。

          起因：编辑页的回填是 `{ ...默认值, ...data.setting }`，提交时又把整个
          form.setting 原样发回；而 main.ts 的 ValidationPipe 开了
          forbidNonWhitelisted，ExamSettingDto 里没有的字段会让保存直接 400。
          `setting: true` 会带出 examId 与已废弃的 scorePublishMode，
          正是这个原因让「编辑已有考试并保存」一直失败。

          选 omit 而非 select：新增设置列时会自动带出，不需要有人记得来同步字段表。
          白名单漏一个字段的表现是「开关静默恒为默认值」，很难被发现。
        */
        setting: {
          omit: { examId: true, scorePublishMode: true },
        },
        candidates: true,
        _count: { select: { candidates: true } },
      },
    });
    if (!exam) return null;

    const now = new Date();
    const realStatus = this.computeStatus(exam, now);
    if (realStatus !== exam.status) {
      await this.prisma.exam.update({ where: { id }, data: { status: realStatus } });
    }

    const [candidates, cert] = await Promise.all([
      this.attachCandidateNames(exam.candidates),
      this.resolveCertNames(exam.certProjectId, exam.certTemplateId),
    ]);
    const { paper, setting, _count, candidates: _c, ...rest } = exam;
    const item = {
      ...rest,
      status: realStatus,
      paperName: paper?.name ?? '',
      paperType: paper?.type ?? '',
      paperTotalScore: paper?.totalScore ?? 0,
      paperSuggestDuration: paper?.suggestDuration ?? 0,
      candidateCount: _count.candidates,
      createByName: '',
      createByOrgName: '',
      candidates,
      certProjectName: cert.projectName,
      certTemplateName: cert.templateName,
      setting,
    };
    await this.fillCreateByNames([item]);
    return item;
  }

  /**
   * 解析认证项目名与证书模板名
   *
   * certProjectId / certTemplateId 在 schema 上是裸 Int 列、没有正向关联（Exam.certProjects
   * 是 CertProject 指向 Exam 的反向关系，方向相反），故 include 取不到，只能单独查。
   * 详情页要显示名称而不是「认证项目 #3」，所以在服务层解析好再下发。
   *
   * @returns 名称对；对应 id 为空或记录已删除时该项返回 null（前端显示「-」）
   */
  private async resolveCertNames(
    certProjectId: number | null,
    certTemplateId: number | null,
  ): Promise<{ projectName: string | null; templateName: string | null }> {
    const [project, template] = await Promise.all([
      certProjectId
        ? this.prisma.certProject.findUnique({
            where: { id: certProjectId },
            select: { name: true },
          })
        : null,
      certTemplateId
        ? this.prisma.certificateTemplate.findUnique({
            where: { id: certTemplateId },
            select: { name: true },
          })
        : null,
    ]);
    return { projectName: project?.name ?? null, templateName: template?.name ?? null };
  }

  /**
   * 为考生分配记录补充姓名与考点名称
   * 内部取 SysUser.name/username，外部取 ExternalCandidate.name。
   * 考点名称随记录带出（而非让前端查启用考点下拉），否则考点被停用后编辑态回显为空白，
   * 用户一保存就会静默丢掉原考点。
   */
  private async attachCandidateNames(
    rows: Array<{
      id: number;
      candidateType: string;
      internalUserId: number | null;
      externalCandidateId: number | null;
      examSiteId: number | null;
    }>,
  ) {
    const internalIds = rows.filter((r) => r.internalUserId).map((r) => r.internalUserId!);
    const externalIds = rows.filter((r) => r.externalCandidateId).map((r) => r.externalCandidateId!);
    const siteIds = [...new Set(rows.filter((r) => r.examSiteId).map((r) => r.examSiteId!))];
    const [users, externals, sites] = await Promise.all([
      internalIds.length
        ? this.prisma.sysUser.findMany({
            where: { id: { in: internalIds } },
            select: { id: true, name: true, username: true, phone: true },
          })
        : Promise.resolve<UserBrief[]>([]),
      externalIds.length
        ? this.prisma.externalCandidate.findMany({
            where: { id: { in: externalIds } },
            select: { id: true, name: true, idCard: true, phone: true },
          })
        : Promise.resolve<ExternalBrief[]>([]),
      siteIds.length
        ? this.prisma.examSite.findMany({
            where: { id: { in: siteIds } },
            select: { id: true, name: true, address: true, capacity: true },
          })
        : Promise.resolve<SiteBrief[]>([]),
    ]);
    const siteMap = new Map<number, SiteBrief>(sites.map((s) => [s.id, s]));
    const userMap = new Map<number, UserBrief>(users.map((u) => [u.id, u]));
    const extMap = new Map<number, ExternalBrief>(externals.map((e) => [e.id, e]));
    return rows.map((r) => {
      const isInternal = r.candidateType === 'internal';
      const user = isInternal ? userMap.get(r.internalUserId ?? -1) : undefined;
      const ext = isInternal ? undefined : extMap.get(r.externalCandidateId ?? -1);
      return {
        id: r.id,
        candidateType: r.candidateType,
        internalUserId: r.internalUserId,
        externalCandidateId: r.externalCandidateId,
        examSiteId: r.examSiteId,
        examSiteName: r.examSiteId ? siteMap.get(r.examSiteId)?.name ?? null : null,
        examSiteAddress: r.examSiteId ? siteMap.get(r.examSiteId)?.address ?? null : null,
        examSiteCapacity: r.examSiteId ? siteMap.get(r.examSiteId)?.capacity ?? null : null,
        candidateName: isInternal
          ? user?.name || user?.username || '未知用户'
          : ext?.name ?? '未知考生',
        // 登录账号：内部人员用统一身份账号（username），外部考生以手机号登录，故取 phone
        account: isInternal ? user?.username ?? null : ext?.phone ?? null,
        // 身份证号：仅外部考生库有该字段，内部人员表无此列，恒为 null
        idCard: isInternal ? null : ext?.idCard ?? null,
        phone: isInternal ? user?.phone ?? null : ext?.phone ?? null,
      };
    });
  }

  /**
   * 校验试卷是否为「已发布」状态（考试只能选已发布试卷）
   * @returns 合法返回 true
   */
  async isPaperPublished(paperId: number): Promise<boolean> {
    const paper = await this.prisma.paper.findUnique({
      where: { id: paperId },
      select: { status: true },
    });
    return paper?.status === 'published';
  }

  /**
   * 校验考生分配项引用的用户/外部考生是否都真实存在
   * 内部考生 internalUserId 无外键约束，须显式校验；外部考生一并校验以给出友好错误。
   * @returns 校验通过返回 null，否则返回中文错误信息
   */
  async validateCandidatesExist(list: CandidateInput[]): Promise<string | null> {
    const internalIds = [
      ...new Set(list.filter((c) => c.candidateType === 'internal' && c.internalUserId).map((c) => c.internalUserId!)),
    ];
    const externalIds = [
      ...new Set(list.filter((c) => c.candidateType === 'external' && c.externalCandidateId).map((c) => c.externalCandidateId!)),
    ];
    if (internalIds.length) {
      const found = await this.prisma.sysUser.count({ where: { id: { in: internalIds } } });
      if (found !== internalIds.length) return '部分内部考生不存在，请重新选择';
    }
    if (externalIds.length) {
      const found = await this.prisma.externalCandidate.count({ where: { id: { in: externalIds } } });
      if (found !== externalIds.length) return '部分外部考生不存在，请重新选择';
    }
    return null;
  }

  /**
   * 校验「考试类型 ↔ 鉴定项目 ↔ 发证」三者的一致性
   *
   * 前端已用类型单选与发证方式两选一收口，此处兜住绕过页面直调接口的场景。
   *
   * 三条规则的由来：
   *
   * 1、2 守不变式 examType='skill' ⇔ certProjectId IS NOT NULL。第 2 条
   * （普通考试不许带项目）尤其要紧：少了它，前端从鉴定切回普通却漏清
   * certProjectId，就会存下「普通考试却挂着项目、名单却是手工维护的」记录，
   * 而 cert-project.service 的 progress() 按 certProjectId 查关联考试，
   * 这种记录会混进项目详情的考试列表里。
   *
   * 3 由 grading 侧的事实倒推：issueCertificate 无 certTemplateId 直接抛
   * 「考试开启了自动发证但未配置证书模板」。原先这里写的是
   * `!certProjectId && !certTemplateId` 才拦，于是「只绑项目就开自动发证」
   * 能存下来、到发证那一刻才炸——这正是旧「按认证项目发证」必然失败的根因。
   * 鉴定项目上没有证书模板与有效期字段，发证只能看 certTemplateId。
   */
  private assertTypeAndCertConsistency(input: {
    examType: string;
    certProjectId?: number | null;
    certTemplateId?: number | null;
    autoIssueCert?: boolean;
  }) {
    if (input.examType === 'skill' && !input.certProjectId) {
      throw new BadRequestException('技能鉴定考试必须绑定鉴定项目');
    }
    if (input.examType === 'normal' && input.certProjectId) {
      throw new BadRequestException('普通考试不能绑定鉴定项目');
    }
    if (input.autoIssueCert && !input.certTemplateId) {
      throw new BadRequestException('开启自动发证时必须指定证书模板');
    }
  }

  /**
   * 取某鉴定项目下审核通过的报名人员，转成考生分配项
   *
   * 技能鉴定考试的名单不由前端提交，一律在此按 projectId 现查现落——
   * 前端传什么都忽略，这条规则只有这一个落点。
   *
   * 不复用 CertApplicationService 的查询：那是「审核台账」服务，带按登录人
   * 收窄可见范围的 ownerFilter，走它会把不归当前操作人审的人悄悄漏掉。
   * 这里要的是「不管谁在排考，该项目所有已通过的人都得进名单」。
   *
   * internalUserId 无外键约束（见 CertApplication 注释），审核通过后账号
   * 可能已被删，故对内部考生做一次存在性过滤并记日志：静默带进不存在的人，
   * 考生端取卷会出怪问题。
   *
   * @param projectId 鉴定项目 ID
   * @param examSiteId 考点 ID，整场统一，null 表示线上考试
   * @returns 归一化前的考生分配项
   */
  private async buildCandidatesFromCertProject(
    projectId: number,
    examSiteId?: number | null,
  ): Promise<CandidateInput[]> {
    const rows = await this.prisma.certApplication.findMany({
      where: { projectId, status: APPROVED_STATUS },
      select: { candidateType: true, internalUserId: true, externalCandidateId: true },
    });

    const internalIds = rows
      .filter((r) => r.candidateType === 'internal' && r.internalUserId)
      .map((r) => r.internalUserId!);
    const alive = new Set<number>();
    if (internalIds.length) {
      const users = await this.prisma.sysUser.findMany({
        where: { id: { in: internalIds } },
        select: { id: true },
      });
      users.forEach((u) => alive.add(u.id));
    }

    const dropped: number[] = [];
    const list: CandidateInput[] = [];
    for (const r of rows) {
      if (r.candidateType === 'internal') {
        if (!r.internalUserId || !alive.has(r.internalUserId)) {
          if (r.internalUserId) dropped.push(r.internalUserId);
          continue;
        }
      }
      // CandidateInput 的 id 字段是 number? 而 Prisma 给的是 number | null，
      // 用 ?? undefined 归一，不要直接塞 null
      list.push({
        candidateType: r.candidateType,
        internalUserId: r.internalUserId ?? undefined,
        externalCandidateId: r.externalCandidateId ?? undefined,
        examSiteId: examSiteId ?? undefined,
      });
    }
    if (dropped.length) {
      this.logger.warn(
        `鉴定项目 ${projectId} 有 ${dropped.length} 名审核通过人员的账号已不存在，未计入考生：${dropped.join('、')}`,
      );
    }
    return list;
  }

  /**
   * 定名单来源：技能鉴定考试按项目现查，普通考试用前端传的
   *
   * createExam 与 updateExam 都经此，故「鉴定考试的名单不看前端传什么」
   * 这条规则只有这一个落点。updateExam 是先删后插的全量重建，于是每次保存
   * 都会按项目最新审核结果重算名单——这一点必须在页面上写清楚，否则用户
   * 改个别的字段点保存、名单跟着变了，会被当成 bug。
   *
   * 考点从前端传的名单里取：整场统一一个考点，取第一条即可。技能鉴定考试
   * 的考生行由后端重建，若不这样接一下，前端选的考点会连同被忽略的名单
   * 一起丢掉。
   */
  private async resolveCandidates(
    examType: string,
    certProjectId?: number | null,
    fromClient?: CandidateInput[],
  ): Promise<CandidateInput[]> {
    if (examType !== 'skill' || !certProjectId) return fromClient ?? [];
    const examSiteId = fromClient?.find((c) => c.examSiteId != null)?.examSiteId;
    return this.buildCandidatesFromCertProject(certProjectId, examSiteId);
  }

  /**
   * 预览某鉴定项目下审核通过的人员（供编辑页绑定项目时显示带入哪些人）
   *
   * 与 buildCandidatesFromCertProject 的区别：这个给人看，带姓名；
   * 那个给库写，带 id。两者都按 status=approved 取，口径同源。
   *
   * @param projectId 鉴定项目 ID
   * @returns 姓名快照列表，按报名先后
   */
  async previewCertProjectCandidates(projectId: number) {
    const rows = await this.prisma.certApplication.findMany({
      where: { projectId, status: APPROVED_STATUS },
      select: {
        id: true,
        candidateName: true,
        candidateType: true,
        internalUserId: true,
        externalCandidateId: true,
        orgId: true,
        deptId: true,
      },
      orderBy: { id: 'asc' },
    });
    const deptIds = [
      ...new Set(rows.flatMap((r) => [r.orgId, r.deptId]).filter((v): v is number => !!v)),
    ];
    const depts = deptIds.length
      ? await this.prisma.sysDepartment.findMany({
          where: { id: { in: deptIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(depts.map((d) => [d.id, d.name]));
    return rows.map((r) => ({
      /** 报名记录 ID，仅作列表 key */
      applicationId: r.id,
      /** 考生 ID：内部取 internalUserId、外部取 externalCandidateId，与前端 PickedCandidate.id 对齐 */
      candidateId:
        r.candidateType === 'internal' ? (r.internalUserId ?? 0) : (r.externalCandidateId ?? 0),
      candidateName: r.candidateName,
      candidateType: r.candidateType,
      orgName: r.orgId ? (nameById.get(r.orgId) ?? '') : '',
      deptName: r.deptId ? (nameById.get(r.deptId) ?? '') : '',
    }));
  }

  /**
   * 取考试类型
   *
   * 三个手工改名单的接口（assign/append/remove-candidates）据此拒绝技能鉴定考试。
   * 不并进 getRealStatus 的返回：那会改它的签名、波及全部调用点，不划算。
   *
   * @param id 考试 ID
   * @returns 考试类型，考试不存在时返回 null
   */
  async getExamType(id: number): Promise<string | null> {
    const row = await this.prisma.exam.findUnique({
      where: { id },
      select: { examType: true },
    });
    return row?.examType ?? null;
  }

  /** 归一化考生分配项：过滤类型与 ID 不匹配的脏项，去重 */
  private normalizeCandidates(list: CandidateInput[]): CandidateInput[] {
    const seen = new Set<string>();
    const result: CandidateInput[] = [];
    for (const c of list) {
      if (c.candidateType === 'internal' && !c.internalUserId) continue;
      if (c.candidateType === 'external' && !c.externalCandidateId) continue;
      const key =
        c.candidateType === 'internal'
          ? `i-${c.internalUserId}`
          : `e-${c.externalCandidateId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        candidateType: c.candidateType,
        internalUserId: c.candidateType === 'internal' ? c.internalUserId : null,
        externalCandidateId: c.candidateType === 'external' ? c.externalCandidateId : null,
        examSiteId: c.examSiteId ?? null,
      } as CandidateInput);
    }
    return result;
  }

  /** 构造考试设置落库数据（补默认值，与 schema 默认保持一致） */
  private buildSetting(input?: ExamSettingInput) {
    return {
      screenSwitchDetect: input?.screenSwitchDetect ?? false,
      allowSwitchTimes: input?.allowSwitchTimes ?? 0,
      shuffleQuestions: input?.shuffleQuestions ?? false,
      operationRestrict: input?.operationRestrict ?? false,
      retakeLimit: input?.retakeLimit ?? 0,
      earlyEnterMinutes: input?.earlyEnterMinutes ?? 0,
      requireCommitment: input?.requireCommitment ?? false,
      allowEarlySubmit: input?.allowEarlySubmit ?? true,
      minAnswerMinutes: input?.minAnswerMinutes ?? 0,
      showRemainingTime: input?.showRemainingTime ?? true,
      allowViewScore: input?.allowViewScore ?? true,
      allowViewAnalysis: input?.allowViewAnalysis ?? false,
      /*
        刻意不写 scorePublishMode：成绩公布不可配。纯客观题交卷即自动发布
        （submitExam 的 `scorePublished: !hasSubjective`）；含主观题阅完后
        仍需在阅卷中心手动发布（publishScore），且可撤回（withdrawScore）。

        该列仍在库中（有历史值）但已无人读写，待确认后由单独迁移删除。
        此处不写入是有意的：upsert 的 update 分支不含该字段，
        Prisma 便不会碰这一列，历史值（如某场的 immediate）原样保留而非被重置。
      */
    };
  }

  /**
   * 创建考试（事务：主表 + 考生 + 防作弊策略；状态 unpublished）
   * @returns 新建考试
   */
  async createExam(input: {
    examType: string;
    name: string;
    description?: string;
    paperId: number;
    startTime: string;
    endTime: string;
    duration: number;
    passScore: number;
    certProjectId?: number | null;
    autoIssueCert?: boolean;
    certTemplateId?: number | null;
    candidates?: CandidateInput[];
    setting?: ExamSettingInput;
  }, createBy?: number) {
    this.assertTypeAndCertConsistency(input);
    const candidates = this.normalizeCandidates(
      await this.resolveCandidates(input.examType, input.certProjectId, input.candidates),
    );
    return this.prisma.exam.create({
      data: {
        examType: input.examType,
        name: input.name,
        description: input.description ?? null,
        paperId: input.paperId,
        startTime: new Date(input.startTime),
        endTime: new Date(input.endTime),
        duration: input.duration,
        passScore: input.passScore,
        certProjectId: input.certProjectId ?? null,
        autoIssueCert: input.autoIssueCert ?? false,
        certTemplateId: input.certTemplateId ?? null,
        createBy: createBy ?? null,
        status: 'unpublished',
        candidates: { create: candidates.map((c) => ({ ...c })) },
        setting: { create: this.buildSetting(input.setting) },
      },
    });
  }

  /**
   * 复制考试（生成一份未发布的副本，供改期后重新发布）
   *
   * 复制什么：试卷、时长、及格分、发证配置、全部设置、考生名单（含各自考点）、
   * 监考人员。这些正是重开一场同样的考试时最费事的部分。
   *
   * 不复制什么：
   * - 答卷、成绩、证书——那些属于上一场的作答事实，跟着复制就是伪造记录
   * - status 一律为 unpublished，副本必须经人工确认改期后再发布
   * - createBy 记为当前操作人，不是原考试的创建人（谁复制的算谁建的）
   *
   * 时间必须挪到未来，不能原样复制。原样复制会把考试卡死：副本停在 unpublished
   * 时列表上看着正常（computeStatus 对未发布态不看时间），可一旦考务没改期就点了
   * 发布，publish 通过后 computeStatus 立刻按「已过 endTime」推成 finished，
   * 而 update 要求 unpublished、withdraw 要求 published，两条路都走不通，
   * 只剩删除——一场刚复制出来的考试就这么废了。
   * 故这里把整个时间窗平移到未来，窗口长度与当天时刻保持不变，见 shiftWindowToFuture。
   *
   * @param id 源考试 id
   * @param createBy 当前操作人（管理员用户 id）
   * @returns 新建的副本考试
   * @throws 源考试不存在时抛出中文错误
   */
  async copyExam(id: number, createBy?: number) {
    const src = await this.prisma.exam.findUnique({
      where: { id },
      include: {
        setting: true,
        candidates: true,
        staff: true,
      },
    });
    if (!src) throw new Error('考试不存在');

    const { setting, candidates, staff } = src;

    const name = await this.buildCopyName(src.name);
    const { startTime, endTime } = this.shiftWindowToFuture(src.startTime, src.endTime);

    // 监考/阅卷人员的姓名快照按当前库内值重取，账号已注销的直接不带过来
    const staffUserIds = [...new Set(staff.map((s) => s.userId))];
    const staffUsers = staffUserIds.length
      ? await this.prisma.sysUser.findMany({
          where: { id: { in: staffUserIds } },
          select: { id: true, name: true, username: true },
        })
      : [];
    const nameByUserId = new Map(
      staffUsers.map((u) => [u.id, u.name || u.username]),
    );
    const staffRows = staff
      .filter((s) => nameByUserId.has(s.userId))
      .map((s) => ({
        role: s.role,
        userId: s.userId,
        name: nameByUserId.get(s.userId)!,
      }));
    // 丢弃是静默的，考务在副本里看不出「原来还有个已离职的监考」，故留一条日志备查
    if (staffRows.length !== staff.length) {
      const dropped = staff
        .filter((s) => !nameByUserId.has(s.userId))
        .map((s) => `${s.role}:${s.userId}`);
      this.logger.warn(
        `复制考试 ${id} 时丢弃了账号已注销的监考/阅卷人员：${dropped.join(', ')}`,
      );
    }

    return this.prisma.exam.create({
      data: {
        // 类型与项目绑定一起照搬：副本是同一个鉴定项目的下一期。
        // 名单走下面「照搬源考试 candidates」的既有分支，是快照语义而非重查——
        // 副本随后一定要进编辑页改期，保存时 resolveCandidates 自然会按项目重算
        examType: src.examType,
        name,
        description: src.description,
        paperId: src.paperId,
        startTime,
        endTime,
        duration: src.duration,
        passScore: src.passScore,
        certProjectId: src.certProjectId,
        autoIssueCert: src.autoIssueCert,
        certTemplateId: src.certTemplateId,
        /*
          tenantId 沿用源考试，而不是取操作人的——createExam 目前压根不写这个字段
          （现网全部为 NULL，多租户尚未启用），这里刻意跟着源走：
          副本是同一个组织的下一期考试，归属不该因为谁点了复制而改变。
          超管代人复制时也因此仍落在源租户下，只是 createBy 记成超管。
        */
        tenantId: src.tenantId,
        createBy: createBy ?? null,
        status: 'unpublished',
        candidates: {
          create: candidates.map((c) => ({
            candidateType: c.candidateType,
            internalUserId: c.internalUserId,
            externalCandidateId: c.externalCandidateId,
            examSiteId: c.examSiteId,
          })),
        },
        /*
          姓名重新查库落新快照，不搬源考试的旧值——那个值是源考试 assign 那一刻
          写下的，可能已经过期。与 ExamStaffService.assign 的口径保持一致
          （name 取 sysUser 当前值，不信任外部传入）。
          账号已被删除的人员整条丢弃：其 userId 已无对应用户，
          带进副本只会得到一条点不开、也没法重新指派的死记录。
        */
        staff: { create: staffRows },
        /*
          设置整份带过来。源考试没有 setting 行时（id 10 之前的老考试就没有）
          用 buildSetting() 取默认值建一行，而不是让副本也缺这行——
          缺行会让副本继续走各处的 ?? 兜底，行为与页面上显示的开关不一致。
        */
        setting: {
          create: setting
            ? this.buildSetting({
                screenSwitchDetect: setting.screenSwitchDetect,
                allowSwitchTimes: setting.allowSwitchTimes,
                shuffleQuestions: setting.shuffleQuestions,
                operationRestrict: setting.operationRestrict,
                retakeLimit: setting.retakeLimit,
                earlyEnterMinutes: setting.earlyEnterMinutes,
                requireCommitment: setting.requireCommitment,
                allowEarlySubmit: setting.allowEarlySubmit,
                minAnswerMinutes: setting.minAnswerMinutes,
                showRemainingTime: setting.showRemainingTime,
                allowViewScore: setting.allowViewScore,
                allowViewAnalysis: setting.allowViewAnalysis,
              })
            : this.buildSetting(),
        },
      },
    });
  }

  /**
   * 把考试时间窗整体平移到未来，保留窗口长度与原本的当天时刻
   *
   * 用于复制考试：源考试往往已结束，时间落在过去，副本若沿用就会在发布后
   * 立刻变成 finished 而卡死（见 copyExam 注释）。平移规则：
   * - 源考试尚未开始（startTime > 现在）：原样保留，考务本就在排后面的场次
   * - 已开始或已结束：起点挪到「明天」的同一时刻，终点按原窗口长度顺延
   *
   * 判据用 startTime 而不是 endTime：若按 endTime 判，复制一场「正在进行中」的
   * 考试会原样保留其时间窗（起点在过去、终点在未来），这样的副本一发布就被
   * computeStatus 判成 ongoing，而考生端列表只过滤 unpublished/draft、
   * 作答入口也只拦「未到开考」与「已结束」——等于考务还没确认时间，
   * 卷子就已经对考生开放了。按 startTime 判则这种源一律平移到明天。
   *
   * 取明天而不是今天，是因为今天的同一时刻可能也已经过去；
   * 保留当天时刻（如上午 9 点）而不是取现在的钟点，是因为考试时间通常是整点安排，
   * 复制出一场「9:47 开考」的考试反而更需要考务动手改。
   *
   * 时区：getHours/setHours 按运行环境本地时区工作，这里依赖
   * docker/server.Dockerfile 里的 `ENV TZ="Asia/Shanghai"`——库内存 UTC 字面值，
   * 前端展示 +08，Node 也跑在 +08，三者一致，所以「保留原本的钟点」保留的
   * 正是考务在页面上看到的那个钟点。若哪天把容器 TZ 改成 UTC，
   * 这里挪出来的时刻会与页面显示相差 8 小时。Asia/Shanghai 无夏令时，
   * 不存在 setHours 落在不存在/重复本地时刻的问题。
   *
   * @returns 平移后的起止时间
   */
  private shiftWindowToFuture(
    srcStart: Date,
    srcEnd: Date,
  ): { startTime: Date; endTime: Date } {
    const now = new Date();
    if (srcStart.getTime() > now.getTime()) {
      return { startTime: srcStart, endTime: srcEnd };
    }

    // 窗口长度原样保留；源数据若有 end<=start 的脏值，兜底给 1 小时，
    // 避免平移后仍是个不合法的窗口（发布校验会拦，但报错对考务无意义）
    const span = srcEnd.getTime() - srcStart.getTime();
    const safeSpan = span > 0 ? span : 60 * 60 * 1000;

    const start = new Date(now);
    start.setDate(start.getDate() + 1);
    start.setHours(
      srcStart.getHours(),
      srcStart.getMinutes(),
      srcStart.getSeconds(),
      0,
    );

    return { startTime: start, endTime: new Date(start.getTime() + safeSpan) };
  }

  /**
   * 按码点截断字符串，避免把代理对切成半个字符
   *
   * 不用 String.prototype.slice：它按 UTF-16 码元切，考试名里若有 emoji 或
   * CJK 扩展区的生僻字（这些用两个码元的代理对表示），正好切在中间就会产出
   * 一个孤立代理码元，写库变乱码或直接报错。
   * MySQL 的 VARCHAR(n) 按字符计长，与这里按码点计长一致。
   */
  private sliceByCodePoint(s: string, max: number): string {
    return Array.from(s).slice(0, max).join('');
  }

  /**
   * 生成副本名称：原名 + 「-副本」，重名则递增编号
   *
   * name 列是 VarChar(50)，加后缀可能超长，故先按需截断原名再拼后缀，
   * 否则 Prisma 会抛一个考务看不懂的字段超长错误。
   * 长度按字符（码点）算：MySQL 的 VARCHAR(n) 无论什么字符集都以字符计长，
   * 故截断走 sliceByCodePoint 而非 slice，见其注释。
   */
  private async buildCopyName(name: string): Promise<string> {
    const MAX = 50;

    // 已有的同前缀名字，用于挑一个不重复的编号
    const base = name.replace(/-副本(\d+)?$/, '');
    const existing = await this.prisma.exam.findMany({
      where: { name: { startsWith: base.slice(0, 20) } },
      select: { name: true },
    });
    const taken = new Set(existing.map((e) => e.name));

    for (let i = 1; i <= 99; i++) {
      const suffix = i === 1 ? '-副本' : `-副本${i}`;
      // 先留出后缀的位置，再截原名，保证总长不超列宽
      const head = this.sliceByCodePoint(base, MAX - suffix.length);
      const candidate = `${head}${suffix}`;
      if (!taken.has(candidate)) return candidate;
    }

    // 99 个副本都占满：退回带时间戳的名字，保证仍能建出来而不是报错
    const stamp = `-副本${Date.now().toString().slice(-6)}`;
    return `${this.sliceByCodePoint(base, MAX - stamp.length)}${stamp}`;
  }

  /**
   * 编辑考试（事务：更新主表 + 重建考生 + upsert 防作弊策略）
   * 调用方须先校验未发布态。
   */
  async updateExam(id: number, input: {
    examType: string;
    name: string;
    description?: string;
    paperId: number;
    startTime: string;
    endTime: string;
    duration: number;
    passScore: number;
    certProjectId?: number | null;
    autoIssueCert?: boolean;
    certTemplateId?: number | null;
    candidates?: CandidateInput[];
    setting?: ExamSettingInput;
  }) {
    this.assertTypeAndCertConsistency(input);
    const candidates = this.normalizeCandidates(
      await this.resolveCandidates(input.examType, input.certProjectId, input.candidates),
    );
    const st = this.buildSetting(input.setting);
    await this.prisma.$transaction([
      this.prisma.examCandidate.deleteMany({ where: { examId: id } }),
      this.prisma.exam.update({
        where: { id },
        data: {
          examType: input.examType,
          name: input.name,
          description: input.description ?? null,
          paperId: input.paperId,
          startTime: new Date(input.startTime),
          endTime: new Date(input.endTime),
          duration: input.duration,
          passScore: input.passScore,
          certProjectId: input.certProjectId ?? null,
          autoIssueCert: input.autoIssueCert ?? false,
          certTemplateId: input.certTemplateId ?? null,
          candidates: { create: candidates.map((c) => ({ ...c })) },
        },
      }),
      this.prisma.examSetting.upsert({
        where: { examId: id },
        create: { examId: id, ...st },
        update: st,
      }),
    ]);
  }

  /**
   * 分配/更新考生（全量替换）
   * @returns 分配后的考生数量
   */
  async assignCandidates(examId: number, list: CandidateInput[]): Promise<number> {
    const candidates = this.normalizeCandidates(list);
    await this.prisma.$transaction([
      this.prisma.examCandidate.deleteMany({ where: { examId } }),
      ...(candidates.length
        ? [this.prisma.examCandidate.createMany({ data: candidates.map((c) => ({ examId, ...c })) })]
        : []),
    ]);
    return candidates.length;
  }

  /**
   * 查考试的考生名单，并标注每人是否已进入考试
   *
   * 「已进入」的判据是该考生在本场考试有 AnswerSheet 行：该行在考生首次取卷时
   * 创建（见 schema 中 AnswerSheet.startTime 注释），所以有行即已开考。
   * 名单弹窗用它决定哪几行的「移除」可点——已答题的人不能移除，
   * 否则其答卷会失去对应的考生分配（AnswerSheet 挂的是 examId + 考生 id，
   * 不走 ExamCandidate 外键，删分配不会级联删答卷，只会留下无主答卷）。
   *
   * @param examId 考试 ID
   * @returns 名单行，含姓名/账号/考点（复用 attachCandidateNames）与 hasEntered
   */
  async listCandidatesWithEntry(examId: number) {
    const [rows, sheets] = await Promise.all([
      this.prisma.examCandidate.findMany({
        where: { examId },
        select: {
          id: true,
          candidateType: true,
          internalUserId: true,
          externalCandidateId: true,
          examSiteId: true,
        },
        orderBy: { id: 'asc' },
      }),
      this.prisma.answerSheet.findMany({
        where: { examId },
        select: { candidateType: true, internalUserId: true, externalCandidateId: true },
      }),
    ]);
    /*
      键必须带 candidateType 前缀：内部考生 id 与外部考生 id 各自自增，
      internal 的 1 与 external 的 1 不是同一个人，只按数字比会串号。
      与 app-message 侧 candidateWhere 的同款考虑。
    */
    const keyOf = (t: string, iu: number | null, ec: number | null) => {
      const id = t === 'internal' ? iu : ec;
      // 类型与 id 列不匹配的脏行（如 internal 但 internalUserId 为 null）返回 null，
      // 不入 Set 也匹配不上任何行——否则它们会共用 "i-null" 这个键，
      // 让所有同形态的脏分配都被判成已进入考试而永远移不掉
      return id == null ? null : t === 'internal' ? `i-${id}` : `e-${id}`;
    };
    const entered = new Set(
      sheets
        .map((s) => keyOf(s.candidateType, s.internalUserId, s.externalCandidateId))
        .filter((k): k is string => k !== null),
    );
    const named = await this.attachCandidateNames(rows);
    return named.map((r) => {
      const key = keyOf(r.candidateType, r.internalUserId, r.externalCandidateId);
      return { ...r, hasEntered: key !== null && entered.has(key) };
    });
  }

  /**
   * 移除考生（仅未进入考试者）
   *
   * 采用「尽力移除」而非整批失败：管理员打开名单后，某人可能正好开考，
   * 此时让整批操作报错会连带挡住其余本可移除的人。故跳过已进入的，
   * 把他们的姓名回报给调用方提示。
   *
   * 服务端必须重新判定「是否已进入」，不能只靠前端禁用按钮——
   * 绕过前端直接调接口就能删掉正在答题者的分配，留下无主答卷。
   *
   * @param examId 考试 ID
   * @param ids ExamCandidate 行 ID（用行 ID 而非考生 id，避免内外部 id 撞号）
   * @returns removed 实际移除数；blocked 因已进入而跳过的考生姓名
   */
  async removeCandidates(
    examId: number,
    ids: number[],
  ): Promise<{ removed: number; blocked: string[] }> {
    const wanted = [...new Set((ids ?? []).filter((id) => id > 0))];
    if (!wanted.length) return { removed: 0, blocked: [] };
    // 必须按 examId 限定：行 ID 全表自增，不限定会删到别场考试的分配
    const roster = await this.listCandidatesWithEntry(examId);
    const wantedSet = new Set(wanted);
    const target = roster.filter((r) => wantedSet.has(r.id));
    const blocked = target.filter((r) => r.hasEntered).map((r) => r.candidateName);
    const removable = target.filter((r) => !r.hasEntered).map((r) => r.id);
    if (!removable.length) return { removed: 0, blocked };
    /*
      删除条件里再挂一次 NOT EXISTS，而不是直接 deleteMany(id in removable)。

      上面那次 hasEntered 判定与删除之间有毫秒级窗口：考生可能正好在这段时间
      首次取卷、写入 AnswerSheet，于是分配被删掉、答卷成了无主数据——正是本方法
      注释声明要防的事。Prisma 的 deleteMany 无法表达 NOT EXISTS 子查询，
      而放进 $transaction 也不解决：MySQL 默认 REPEATABLE READ 下事务内的读取走
      快照，看不到并发插入的新行。唯一可靠的做法是让条件由数据库在删除的同一语句里求值。

      列名是 camelCase 原样（schema 未对列做 @map，见 migrations 建表语句），
      表名取自 @@map：exam_exam_candidate / exam_answer_sheet。
      内外部考生分两支比对，与 keyOf 同口径——id 各自自增，不能只比数字。
    */
    const removed = await this.prisma.$executeRaw`
      DELETE ec FROM exam_exam_candidate ec
      WHERE ec.examId = ${examId}
        AND ec.id IN (${Prisma.join(removable)})
        AND NOT EXISTS (
          SELECT 1 FROM exam_answer_sheet a
          WHERE a.examId = ec.examId
            AND a.candidateType = ec.candidateType
            AND (
              (ec.candidateType = 'internal' AND a.internalUserId = ec.internalUserId)
              OR (ec.candidateType = 'external' AND a.externalCandidateId = ec.externalCandidateId)
            )
        )
    `;
    /*
      窗口内开考的人不会被删，但也不在上面的 blocked 里（那份是删除前的判定结果）。
      removed < removable.length 即说明发生了这种情况，补查一次把他们的姓名带上，
      否则管理员会看到「已移除 3 名」而实际只删了 2 名，且不知道少的是谁。
    */
    if (removed < removable.length) {
      const after = await this.listCandidatesWithEntry(examId);
      const stillThere = new Set(after.map((r) => r.id));
      const raced = target
        .filter((r) => !r.hasEntered && stillThere.has(r.id))
        .map((r) => r.candidateName);
      blocked.push(...raced);
    }
    return { removed, blocked };
  }

  /**
   * 追加考生（只增不减，供已发布/进行中的考试补人）
   *
   * 与 assignCandidates 的全量替换是两套语义，不能合并：
   * 全量替换会先 deleteMany 清空名单，对一场进行中的考试用它，
   * 前端只要漏传一个人，那人的分配就没了——而他可能正在答题。
   * 故这里只 insert，已在名单里的人靠唯一约束 + skipDuplicates 跳过，
   * 不报错也不改动其原有记录（含已分配的考点 examSiteId）。
   *
   * 待办/消息无需另行补发：app-message 与 app-home 的考试通知是从
   * ExamCandidate + Exam（status != 'unpublished'）实时派生的，
   * 记录落库后考生端自然可见。
   *
   * @param examId 考试 ID
   * @param list 待追加的考生（重复项与已存在项都会被跳过）
   * @returns 实际新增的条数（不含被跳过的重复项）
   */
  async appendCandidates(examId: number, list: CandidateInput[]): Promise<number> {
    const candidates = this.normalizeCandidates(list);
    if (!candidates.length) return 0;
    const { count } = await this.prisma.examCandidate.createMany({
      data: candidates.map((c) => ({ examId, ...c })),
      skipDuplicates: true,
    });
    return count;
  }

  /**
   * 发布考试（未发布→已发布）
   * 校验：已分配考生；随机试卷可用题量充足。
   * @throws 校验失败抛出中文错误
   */
  async publish(id: number): Promise<void> {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      select: {
        id: true,
        examType: true,
        status: true,
        paperId: true,
        endTime: true,
        _count: { select: { candidates: true } },
      },
    });
    if (!exam) throw new Error('考试不存在');
    if (exam.status !== 'unpublished') throw new Error('仅未发布的考试可以发布');
    /*
      拦掉「发布一场时间已过的考试」：放过去会让状态被 computeStatus 立刻推成
      finished，而 finished 既不能编辑（update 要求 unpublished）也不能撤回
      （withdraw 要求 published），考试当场废掉只能删。
      在这里拦而不是只在复制时挪时间，是因为手工把时间填成过去同样能触发。
    */
    if (exam.endTime.getTime() <= Date.now()) {
      throw new Error('考试结束时间已过，请先修改考试时间再发布');
    }
    // 技能鉴定考试的名单是派生的，用户没有「分配考生」这个动作可做，
    // 照搬原文案会让人去找一个不存在的入口
    if (exam._count.candidates === 0) {
      throw new Error(
        exam.examType === 'skill'
          ? '该鉴定项目下暂无审核通过的报名人员，无法发布'
          : '请先分配考生',
      );
    }

    // 随机试卷：校验各抽题组合可用题量充足
    const paper = await this.prisma.paper.findUnique({
      where: { id: exam.paperId },
      include: { paperBanks: { select: { bankId: true } } },
    });
    if (!paper) throw new Error('所选试卷不存在');
    if (paper.status !== 'published') throw new Error('所选试卷未发布，无法用于考试');
    if (paper.type === 'random') {
      const bankIds = paper.paperBanks.map((b) => b.bankId);
      const rules = await this.prisma.paperRule.findMany({ where: { paperId: paper.id } });
      // 复用试卷侧的可行性校验，避免两处口径各自演化
      const err = await this.paperService.findRuleShortage(bankIds, rules);
      if (err) throw new Error(`无法发布考试：${err}`);
    }
    await this.prisma.exam.update({ where: { id }, data: { status: 'published' } });
  }

  /**
   * 撤回考试（已发布且未开始→未发布）
   * @throws 已开始/已结束时抛出中文错误
   */
  async withdraw(id: number): Promise<void> {
    const real = await this.getRealStatus(id);
    if (real === null) throw new Error('考试不存在');
    if (real === 'unpublished') throw new Error('考试尚未发布，无需撤回');
    if (real !== 'published') throw new Error('考试已开始或已结束，无法撤回');
    await this.prisma.exam.update({ where: { id }, data: { status: 'unpublished' } });
  }

  /**
   * 删除前校验：已发布/进行中不可删除；已结束或已存在答卷时也不可硬删除
   * 原因：Exam 硬删会级联抹除 AnswerSheet→AnswerItem→ReviewRecord（append-only 复核审计），
   * 违反「复核记录不可删除」不变量。故只有从未产生答卷的未发布考试才允许物理删除。
   * @throws 命中时抛出中文错误
   */
  async ensureDeletable(id: number): Promise<void> {
    const real = await this.getRealStatus(id);
    if (real === null) throw new Error('考试不存在');
    if (real === 'published' || real === 'ongoing') {
      throw new Error('考试已发布或进行中，无法删除，请先撤回');
    }
    // 已结束考试即便未发布态也可能已有答卷/成绩/复核记录，禁止硬删除以保护审计留痕
    if (real === 'finished') {
      throw new Error('考试已结束，存在成绩与阅卷记录，无法删除');
    }
    const sheet = await this.prisma.answerSheet.findFirst({
      where: { examId: id },
      select: { id: true },
    });
    if (sheet) {
      throw new Error('该考试已存在考生答卷或成绩记录，无法删除');
    }
  }
}
