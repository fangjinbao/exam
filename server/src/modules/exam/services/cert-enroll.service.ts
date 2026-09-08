import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import { OrgScopeService, type AdminPayload } from './org-scope.service';
import { OCCUPYING_STATUS } from '../utils/cert-application-status';
// 直接复用 VO 的形状，不另建一份同字段的 interface——两份早晚会改歪
import type { MyQuotaVo } from '../vo/cert-enroll.vo';

/**
 * 鉴定报名服务（单位管理员按名额报人）
 *
 * 与「考生自主报考」共用 CertApplication 表和同一套审核状态机，
 * 区别是这条路径由单位管理员代报、且占用 CertProjectQuota 的名额，
 * 故记录上会带 orgId/deptId/submitterId。
 *
 * 名额口径：pending 与 approved 都算占用，rejected 释放。
 * 即驳回后该名额可以补报别人（也可以补报同一个人）。
 */
@Injectable()
export class CertEnrollService {
  constructor(
    private prisma: PrismaService,
    private orgScope: OrgScopeService,
  ) {}

  /**
   * 可报名的项目列表（已发布且启用，且给我的单位分了名额）
   *
   * 超管看全部已发布项目；其余按所属单位过滤——没分到名额的项目
   * 对该单位没有意义，列出来只会让人点进去发现无处可报。
   *
   * @param admin 当前登录管理员
   * @param page 页码
   * @param pageSize 每页条数
   */
  async pageProjects(admin: AdminPayload, page?: number, pageSize?: number) {
    const isSuper = this.orgScope.isSuperAdmin(admin);
    const myOrgId = await this.orgScope.getAdminOrgId(admin);

    // 非超管且推不出所属单位：无从判断能报哪个名额，返回空而不是全部
    if (!isSuper && myOrgId == null) {
      return { list: [], pagination: { page: 1, pageSize: pageSize || 10, total: 0 } };
    }

    /*
      筛选与汇总分开处理。筛选：普通管理员只看分到本单位名额的项目，超管不加这层限制
      （否则他只能看到给集团分了名额的那些，总览角色反而看得最少）。汇总：一律按本人
      所属单位算，超管也不例外——曾给超管跳过汇总，结果列表显示「—」而抽屉里
      resolveOrgId 又回退到他的单位、列出了集团的名额行，两处自相矛盾。
    */
    const where = {
      status: 1,
      publishStatus: 'published',
      ...(isSuper ? {} : { quotas: { some: { orgId: myOrgId! } } }),
    };

    const p = Math.max(page || 1, 1);
    const ps = Math.min(Math.max(pageSize || 10, 1), 100);
    const [rows, total] = await Promise.all([
      this.prisma.certProject.findMany({
        where,
        skip: (p - 1) * ps,
        take: ps,
        orderBy: { id: 'desc' },
        select: {
          id: true,
          name: true,
          applyDeadline: true,
          startTime: true,
          endTime: true,
          contactPhone: true,
          publishTime: true,
          occupation: { select: { name: true } },
          level: { select: { name: true } },
          manager: { select: { name: true } },
        },
      }),
      this.prisma.certProject.count({ where }),
    ]);

    // 每个项目带上「我的单位」的名额汇总，列表上直接能看出还能报几个
    const list = await Promise.all(
      rows.map(async (r) => {
        const { occupation, level, manager, ...rest } = r;
        const sum = myOrgId != null ? await this.sumMyQuota(r.id, myOrgId) : null;
        return {
          ...rest,
          occupationName: occupation?.name ?? '',
          levelName: level?.name ?? '',
          managerName: manager?.name ?? '',
          /** 报名是否已截止（到截止时刻即关闭，之前一直开着） */
          closed: this.isClosed(r.applyDeadline),
          quotaTotal: sum?.total ?? null,
          quotaUsed: sum?.used ?? null,
          quotaRemain: sum?.remain ?? null,
        };
      }),
    );
    return { list, pagination: { page: p, pageSize: ps, total } };
  }

  /**
   * 报名是否已截止
   *
   * applyDeadline 精确到时分秒，按时刻比：到点即关，之前一直开着。
   *
   * 「截止日当天算不算开着」由前端选择器的 default-time 决定，取 23:59:59
   * （见 ProjectDialog 的 DEADLINE_DEFAULT_TIME）：管理员填「10-15」即 10-15 整天可报。
   * 这里只做时刻比较，不替选择器补默认值——两处都塞默认值必然对不上。
   *
   * 历史遗留提示：更早的版本前端只提交纯日期串，而 new Date('2026-10-15') 按 ES
   * 规范走 UTC 解析、落库为 00:00Z（东八区实为当天 08:00）。现库中已无这类行
   * （筛选特征是时分秒恰为 UTC 00:00:00，已核对为 0 行），故无需回填；
   * DTO 侧也已用 DATETIME_PATTERN 强制到秒，纯日期串进不来。
   */
  private isClosed(deadline: Date): boolean {
    return Date.now() >= new Date(deadline).getTime();
  }

  /**
   * 汇总某项目下我的单位的名额总数/已用/剩余
   *
   * 跨该单位全部名额行的合计，仅供列表上一眼看进度。校验能否再报必须按单行算
   * （见 listMyQuotas）：各行是独立的桶，某部门的名额不该被别的部门占掉。
   */
  private async sumMyQuota(projectId: number, orgId: number) {
    const [quotas, used] = await Promise.all([
      this.prisma.certProjectQuota.findMany({
        where: { projectId, orgId },
        select: { quota: true },
      }),
      this.prisma.certApplication.count({
        where: { projectId, orgId, status: { in: OCCUPYING_STATUS } },
      }),
    ]);
    const total = quotas.reduce((s, q) => s + q.quota, 0);
    return { total, used, remain: Math.max(total - used, 0) };
  }

  /**
   * 我的单位在某项目下的各个名额行（含每行已用/剩余）
   *
   * 按行统计而非合计：各行是独立的桶。deptId 为空那行是「整个单位」，数它的已用时
   * 也要用 deptId: null 精确匹配，否则会把各部门的报名算进来。
   *
   * @param projectId 项目 ID
   * @param admin 当前登录管理员
   * @param orgId 指定单位（仅超管可传，用于代任意单位报名）
   */
  async listMyQuotas(
    projectId: number,
    admin: AdminPayload,
    orgId?: number,
  ): Promise<MyQuotaVo[]> {
    const targetOrgId = await this.resolveOrgId(admin, orgId);
    if (targetOrgId == null) return [];

    const rows = await this.prisma.certProjectQuota.findMany({
      where: { projectId, orgId: targetOrgId },
      orderBy: [{ deptId: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        orgId: true,
        deptId: true,
        quota: true,
        org: { select: { name: true } },
        dept: { select: { name: true } },
      },
    });

    return Promise.all(
      rows.map(async (r) => {
        const used = await this.prisma.certApplication.count({
          where: {
            projectId,
            orgId: r.orgId,
            deptId: r.deptId, // null 也要精确匹配，代表「整个单位」那一桶
            status: { in: OCCUPYING_STATUS },
          },
        });
        return {
          quotaId: r.id,
          orgId: r.orgId,
          orgName: r.org?.name ?? '',
          deptId: r.deptId,
          deptName: r.dept?.name ?? '',
          quota: r.quota,
          used,
          remain: Math.max(r.quota - used, 0),
        };
      }),
    );
  }

  /**
   * 定位本次操作针对哪个单位
   *
   * 普通管理员只能是自己所属单位，传了别的一律忽略——否则改个入参
   * 就能替别的单位报名。超管可以指定任意单位。
   */
  private async resolveOrgId(admin: AdminPayload, orgId?: number): Promise<number | null> {
    if (this.orgScope.isSuperAdmin(admin)) {
      return orgId ?? (await this.orgScope.getAdminOrgId(admin));
    }
    return this.orgScope.getAdminOrgId(admin);
  }

  /**
   * 某名额行可选的人员
   *
   * 范围取决于名额行：指定了部门则只能选该部门的人（部门都是叶子节点，无需下钻）；
   * 未指定部门（名额给整个单位）则取本单位范围内的人，即含单位节点自身与其下的部门，
   * 但不进入子公司（子公司自有名额行，并入会撞车）。
   *
   * 已在本项目占名额的人（pending/approved）排除掉；被驳回的不排除，允许补报。
   *
   * @param quotaId 名额行 ID
   * @param admin 当前登录管理员
   * @param keyword 姓名/工号模糊搜索
   * @throws 名额行不属于当前管理员的单位时抛出中文错误
   */
  async listCandidates(quotaId: number, admin: AdminPayload, keyword?: string) {
    const quota = await this.assertMyQuota(quotaId, admin);

    const deptIds = quota.deptId
      ? [quota.deptId]
      : await this.orgScope.getOwnDeptIds(quota.orgId);

    // 已占名额的人（整个项目范围内，不限本名额行）：同一人不该在一个项目里报两次
    const taken = await this.prisma.certApplication.findMany({
      where: {
        projectId: quota.projectId,
        status: { in: OCCUPYING_STATUS },
        internalUserId: { not: null },
      },
      select: { internalUserId: true },
    });
    const takenIds = taken.map((t) => t.internalUserId!).filter(Boolean);

    const users = await this.prisma.sysUser.findMany({
      where: {
        status: 1,
        departmentId: { in: deptIds },
        ...(takenIds.length ? { id: { notIn: takenIds } } : {}),
        ...(keyword
          ? {
              OR: [
                { name: { contains: keyword } },
                { workId: { contains: keyword } },
              ],
            }
          : {}),
      },
      orderBy: { id: 'asc' },
      /*
        不分页一次给全：单位口径是「本单位及其下的部门、不含子公司」，
        现网最大单位也只有几十人（启用员工共 163），一屏可选完；分页反而引入
        「跨页勾选累积」的复杂度。500 是防脏数据的兜底，不是业务上限——
        组织规模涨到接近这个数时这里会静默截断，届时应改分页，或反过来去扩展
        components/business/pickers/CandidatePickerDialog（它有跨页累积，
        但取数写死在通用用户列表，表达不了本处的部门范围与去重约束，故当前未复用）。
      */
      take: 500,
      select: {
        id: true,
        name: true,
        workId: true,
        phone: true,
        department: { select: { name: true } },
      },
    });

    return users.map((u) => ({
      id: u.id,
      name: u.name ?? '',
      workId: u.workId ?? '',
      phone: u.phone ?? '',
      deptName: u.department?.name ?? '',
    }));
  }

  /**
   * 校验名额行属于当前管理员的单位，并返回该行
   *
   * 不校验就能凭 quotaId 替别的单位报名。
   * @throws 名额行不存在或不属于本单位时抛出中文错误
   */
  private async assertMyQuota(quotaId: number, admin: AdminPayload) {
    const quota = await this.prisma.certProjectQuota.findUnique({
      where: { id: quotaId },
      select: { id: true, projectId: true, orgId: true, deptId: true, quota: true },
    });
    if (!quota) throw new Error('名额记录不存在');

    if (!this.orgScope.isSuperAdmin(admin)) {
      const myOrgId = await this.orgScope.getAdminOrgId(admin);
      if (myOrgId == null) throw new Error('当前账号未归属任何单位，无法报名');
      if (quota.orgId !== myOrgId) throw new Error('无权操作其他单位的名额');
    }
    return quota;
  }

  /**
   * 提交报名：把选中的人员报到指定名额行下
   *
   * 名额硬拦：本行剩余不足时整批拒绝，不做「能报几个报几个」的部分成功——
   * 部分成功会让调用方以为全报上了，且哪几个进了得再查一遍才知道。
   *
   * 并发安全靠事务内对项目行加 FOR UPDATE 排他锁，理由见事务内注释（光把计数
   * 放进事务是挡不住的，实测会超报）。
   *
   * @param quotaId 名额行 ID
   * @param userIds 选中的内部员工 ID
   * @param admin 当前登录管理员
   * @returns 实际写入的条数
   * @throws 项目未发布/已截止、名额不足、人员越界、重复报名时抛出中文错误
   */
  async enroll(quotaId: number, userIds: number[], admin: AdminPayload): Promise<number> {
    if (!userIds?.length) throw new Error('请先选择要报名的人员');
    const ids = [...new Set(userIds)];

    const quota = await this.assertMyQuota(quotaId, admin);

    const project = await this.prisma.certProject.findUnique({
      where: { id: quota.projectId },
      select: { id: true, status: true, publishStatus: true, applyDeadline: true },
    });
    if (!project) throw new Error('鉴定项目不存在');
    if (project.status !== 1) throw new Error('该项目已停用，无法报名');
    if (project.publishStatus !== 'published') throw new Error('该项目尚未发布，无法报名');
    if (this.isClosed(project.applyDeadline)) throw new Error('该项目报名已截止');

    // 人员必须落在本名额行允许的范围内：否则改个入参就能把别的单位的人报进来
    const allowedDeptIds = quota.deptId
      ? [quota.deptId]
      : await this.orgScope.getOwnDeptIds(quota.orgId);
    const users = await this.prisma.sysUser.findMany({
      where: { id: { in: ids }, status: 1, departmentId: { in: allowedDeptIds } },
      select: { id: true, name: true, departmentId: true },
    });
    if (users.length !== ids.length) {
      throw new Error('选中的人员里有不属于该名额范围或已停用的，请重新选择');
    }

    return this.prisma.$transaction(async (tx) => {
      /*
        先锁「项目」行，本项目的并发报名在此排队。三点都是实测结论，别凭直觉改：

        1) 光把 count 放进事务挡不住——6 个请求抢 2 个名额，6 个全都成功、超报 4 个。
           REPEATABLE READ 下 count() 是非锁定读，各事务在自己快照里都数到 0。
        2) 锁项目而非名额行——本事务守两条不变量，范围不同：「名额不超」属单个名额行，
           「同一人在本项目不重复」跨全部名额行。只锁名额行时后者失守：同一人分别向
           「整个单位」和某部门两行并发提交，两条都进去了。项目行锁同时覆盖两者，
           且只有一把锁、无加锁顺序问题。代价是同项目下各单位报名串行——可以接受，
           事务内只有几条查询加一次插入，且这是管理员低频操作，不是抢票。
        3) 计数保持普通读，不要改成 COUNT(*) ... FOR UPDATE——后者对
           (projectId, orgId, status) 索引范围加间隙锁，同单位不同名额行的范围重叠，
           并发时直接撞死锁、Prisma 抛写冲突（数据不坏但报错很难看）。
           普通读在此安全：后到的事务在上面的锁上等待，等到时前一个已提交；而 InnoDB
           的一致性读快照由事务内「第一次普通读」建立，加锁读不建立快照，故这里的
           count 才是第一次普通读，快照已含前一个事务的插入。
      */
      await tx.$queryRawUnsafe(
        'SELECT `id` FROM `exam_cert_project` WHERE `id` = ? FOR UPDATE',
        quota.projectId,
      );

      const used = await tx.certApplication.count({
        where: {
          projectId: quota.projectId,
          orgId: quota.orgId,
          deptId: quota.deptId, // null 也精确匹配，代表「整个单位」那一桶
          status: { in: OCCUPYING_STATUS },
        },
      });

      const remain = quota.quota - used;
      if (remain <= 0) throw new Error('该名额已报满');
      if (ids.length > remain) {
        throw new Error(`该名额还剩 ${remain} 个，本次选了 ${ids.length} 人，请调整后再提交`);
      }

      // 同一人在本项目已占名额则拒绝（含别的名额行）。被驳回的不算，允许补报。
      const dup = await tx.certApplication.findMany({
        where: {
          projectId: quota.projectId,
          internalUserId: { in: ids },
          status: { in: OCCUPYING_STATUS },
        },
        select: { candidateName: true },
      });
      if (dup.length) {
        const names = dup.map((d) => d.candidateName).join('、');
        throw new Error(`${names} 在本项目已有报名记录，无需重复报名`);
      }

      const submitter = await tx.sysUser.findUnique({
        where: { id: admin.userId },
        select: { name: true },
      });

      await tx.certApplication.createMany({
        data: users.map((u) => ({
          projectId: quota.projectId,
          candidateType: 'internal',
          internalUserId: u.id,
          candidateName: u.name ?? '',
          orgId: quota.orgId,
          deptId: quota.deptId,
          submitterId: admin.userId,
          submitterName: submitter?.name ?? admin.username,
          status: 'pending',
        })),
      });
      return users.length;
    });
  }

  /**
   * 撤销报名（只能撤本单位的、且还没审的）
   *
   * 已通过/已驳回的不给撤：那是审核结果，撤掉等于抹掉痕迹。
   *
   * @param id 报名记录 ID
   * @param admin 当前登录管理员
   * @throws 记录不存在、非本单位、已审核时抛出中文错误
   */
  async cancel(id: number, admin: AdminPayload): Promise<void> {
    const app = await this.prisma.certApplication.findUnique({
      where: { id },
      select: { id: true, orgId: true, status: true, candidateName: true },
    });
    if (!app) throw new Error('报名记录不存在');

    if (!this.orgScope.isSuperAdmin(admin)) {
      const myOrgId = await this.orgScope.getAdminOrgId(admin);
      if (myOrgId == null || app.orgId !== myOrgId) {
        throw new Error('无权撤销其他单位的报名');
      }
    }
    if (app.status !== 'pending') {
      throw new Error(
        app.status === 'approved'
          ? '该报名已审核通过，无法撤销'
          : '该报名已被驳回，无需撤销',
      );
    }
    await this.prisma.certApplication.delete({ where: { id } });
  }

  /**
   * 我的单位在某项目下已报的人员列表
   *
   * @param projectId 项目 ID
   * @param admin 当前登录管理员
   * @param orgId 指定单位（仅超管可传）
   */
  async listMyApplications(projectId: number, admin: AdminPayload, orgId?: number) {
    const targetOrgId = await this.resolveOrgId(admin, orgId);
    if (targetOrgId == null) return [];

    const rows = await this.prisma.certApplication.findMany({
      where: { projectId, orgId: targetOrgId },
      orderBy: { id: 'desc' },
      select: {
        id: true,
        candidateName: true,
        internalUserId: true,
        deptId: true,
        status: true,
        rejectReason: true,
        reviewerName: true,
        reviewTime: true,
        submitterName: true,
        applyTime: true,
      },
    });

    // 部门名称单独查一次再拼，避免逐条 include 放大查询次数
    const deptIds = [...new Set(rows.map((r) => r.deptId).filter((v): v is number => !!v))];
    const depts = deptIds.length
      ? await this.prisma.sysDepartment.findMany({
          where: { id: { in: deptIds } },
          select: { id: true, name: true },
        })
      : [];
    const deptMap = new Map(depts.map((d) => [d.id, d.name]));

    return rows.map((r) => ({
      ...r,
      deptName: r.deptId ? (deptMap.get(r.deptId) ?? '') : '',
    }));
  }
}
