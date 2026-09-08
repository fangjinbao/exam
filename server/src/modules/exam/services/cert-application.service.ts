import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma.service';
import { BaseService } from '@/common/crud';
import { OrgScopeService, type AdminPayload } from './org-scope.service';

// 列表带出认证项目名称的关联白名单
const LIST_INCLUDE = {
  project: { select: { name: true } },
} satisfies Prisma.CertApplicationInclude;

/** 单位/部门名称：orgId、deptId 指向部门树，单独查一次再拼，避免逐条 include */
type DeptNameMap = Map<number, string>;

type ApplicationWithProject = Prisma.CertApplicationGetPayload<{ include: typeof LIST_INCLUDE }>;

/** 报名审核列表筛选条件 */
export interface CertApplicationListFilter {
  projectId?: number;
  status?: string;
  keyword?: string;
  /** 按报名单位筛选（公司节点 ID） */
  orgId?: number;
}

/**
 * 报考审核服务
 * 提供报考申请的分页查询（按项目/状态/考生姓名筛选，带项目名称）与审核（通过/驳回）状态机。
 * 考生姓名取报考时留存的快照字段，不联表查考生账号，天然规避敏感字段泄露。
 */
@Injectable()
export class CertApplicationService extends BaseService {
  constructor(
    protected prisma: PrismaService,
    private readonly orgScope: OrgScopeService,
  ) {
    super(prisma, 'certApplication');
  }

  /**
   * 审核归属过滤：谁负责或谁创建的项目，谁审它的报名
   *
   * 超管返回 null（不加限制，看全部）。其余人只能碰到自己负责或自己建的项目。
   *
   * 两个字段取「或」而非只认一个，是因为二者常不是同一个人：
   * 库里「加油鉴定工」createBy=admin 而 managerId=朱国庆，只认 createBy
   * 会让列表上写着的负责人反而审不了自己的项目；只认 managerId 则存量
   * createBy 项目无人可审。
   *
   * managerId 必填不会为空，createBy 可空——存量项目 createBy 为 null 时该条
   * 不匹配任何人，由 managerId 兜住归属，不会出现谁都审不了的记录。
   *
   * 返回 null 表示不加限制。admin 缺失时**不是**返回 null：控制器那边
   * admin 被基类签名逼成了可选参数，若缺失就放行，漏传一次即全站越权。
   * 故缺失按最严处理——返回永假条件，什么都查不到。
   * 同理不能直接用 admin.userId 拼条件：它为 undefined 时 Prisma 会把
   * 该条件整个忽略，OR 两侧都忽略就等于没有限制。
   */
  private ownerFilter(admin?: AdminPayload): Prisma.CertApplicationWhereInput | null {
    if (admin && this.orgScope.isSuperAdmin(admin)) return null;
    const uid = admin?.userId;
    if (typeof uid !== 'number') return { id: { in: [] } };
    return {
      project: {
        OR: [{ managerId: uid }, { createBy: uid }],
      },
    };
  }

  /** 将嵌套 project.name 扁平化为 projectName，并补上单位/部门名称 */
  private flatten(record: ApplicationWithProject, deptNames?: DeptNameMap) {
    const { project, ...rest } = record;
    return {
      ...rest,
      projectName: project?.name ?? '',
      orgName: rest.orgId ? (deptNames?.get(rest.orgId) ?? '') : '',
      deptName: rest.deptId ? (deptNames?.get(rest.deptId) ?? '') : '',
    };
  }

  /** 批量取部门树节点名称（单位与部门同表） */
  private async loadDeptNames(records: ApplicationWithProject[]): Promise<DeptNameMap> {
    const ids = [
      ...new Set(
        records.flatMap((r) => [r.orgId, r.deptId]).filter((v): v is number => !!v),
      ),
    ];
    if (!ids.length) return new Map();
    const rows = await this.prisma.sysDepartment.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((d) => [d.id, d.name]));
  }

  /**
   * 分页查询报考申请
   * projectId/status 精确匹配，keyword 模糊匹配考生姓名，条件间为"与"关系。
   *
   * admin 决定可见范围，与上面几个筛选条件性质不同：ownerFilter 是安全边界、
   * 由服务端按登录身份算出，orgId 等是前端可控的筛选值。两者取「与」，
   * 故前端传什么 orgId 都越不出自己该审的那批。
   */
  async pageList(
    filter: CertApplicationListFilter,
    page?: number,
    pageSize?: number,
    admin?: AdminPayload,
  ) {
    const and: Prisma.CertApplicationWhereInput[] = [];
    if (filter.projectId !== undefined) and.push({ projectId: filter.projectId });
    if (filter.status) and.push({ status: filter.status });
    if (filter.keyword) and.push({ candidateName: { contains: filter.keyword } });
    if (filter.orgId !== undefined) and.push({ orgId: filter.orgId });
    const owner = this.ownerFilter(admin);
    if (owner) and.push(owner);
    const where: Prisma.CertApplicationWhereInput = and.length ? { AND: and } : {};

    const p = Math.max(page || 1, 1);
    const ps = Math.min(Math.max(pageSize || 10, 1), 100);
    const [rows, total] = await Promise.all([
      this.prisma.certApplication.findMany({
        where,
        skip: (p - 1) * ps,
        take: ps,
        orderBy: { id: 'desc' },
        include: LIST_INCLUDE,
      }),
      this.prisma.certApplication.count({ where }),
    ]);
    const deptNames = await this.loadDeptNames(rows);
    return {
      list: rows.map((r) => this.flatten(r, deptNames)),
      pagination: { page: p, pageSize: ps, total },
    };
  }

  /**
   * 查询单条报考申请详情（带项目、单位、部门名称），不存在或不归自己审时返回 null
   *
   * 用 findFirst 把归属条件并进 where，而不是先查出来再比对：
   * 后者一旦漏写 return，记录已经在手上了。也不区分「不存在」与「不归你」，
   * 两者都返回 null——否则能靠错误文案的差异探出别人有哪些报名记录。
   */
  async detail(id: number, admin?: AdminPayload) {
    const owner = this.ownerFilter(admin);
    const record = await this.prisma.certApplication.findFirst({
      where: owner ? { AND: [{ id }, owner] } : { id },
      include: LIST_INCLUDE,
    });
    if (!record) return null;
    return this.flatten(record, await this.loadDeptNames([record]));
  }

  /**
   * 审核报考申请（通过/驳回）
   * 仅待审核（pending）状态可审核；已通过/已驳回不可重复审核。
   * @param id 报考申请 ID
   * @param result approved 通过 / rejected 驳回
   * @param reviewerId 审核人用户 ID
   * @param reviewerName 审核人姓名
   * @param rejectReason 驳回原因（驳回时必填）
   * @param admin 当前登录管理员，用于校验该项目是否归其审核
   * @throws 状态不合法、缺驳回原因或无权审核时抛出中文错误
   */
  async review(
    id: number,
    result: 'approved' | 'rejected',
    reviewerId: number,
    reviewerName: string,
    rejectReason?: string,
    admin?: AdminPayload,
  ): Promise<void> {
    // 归属条件并进这次查询，省一次查库；查不到就走下面「不存在」那条，
    // 不单独报「无权审核」——那等于告诉调用方这条记录确实存在
    const owner = this.ownerFilter(admin);
    const application = await this.prisma.certApplication.findFirst({
      where: owner ? { AND: [{ id }, owner] } : { id },
      select: { id: true, status: true },
    });
    if (!application) throw new Error('报考记录不存在');
    if (application.status === 'approved') {
      throw new Error('该报考已审核通过，无需重复操作');
    }
    if (application.status === 'rejected') {
      throw new Error('该报考已驳回，无需重复操作');
    }
    if (result === 'rejected' && !rejectReason?.trim()) {
      throw new Error('驳回时必须填写驳回原因');
    }
    await this.prisma.certApplication.update({
      where: { id },
      data: {
        status: result,
        reviewerId,
        reviewerName,
        rejectReason: result === 'rejected' ? rejectReason!.trim() : null,
        reviewTime: new Date(),
      },
    });
  }

  /**
   * 批量审核（通过/驳回）
   *
   * 单位一次报上来几十人，逐条点不现实。
   *
   * 整批要么全成要么全不成：只审通过其中一部分，调用方还得再查一遍才知道
   * 哪几条进了。故先统一校验，有任何一条不合规就整批拒绝。
   *
   * @param ids 报考申请 ID 列表
   * @param result approved 通过 / rejected 驳回
   * @param reviewerId 审核人用户 ID
   * @param reviewerName 审核人姓名
   * @param rejectReason 驳回原因（驳回时必填）
   * @param admin 当前登录管理员，用于校验这批项目是否归其审核
   * @returns 实际审核条数
   * @throws 含已审记录、缺驳回原因或含无权审核的记录时抛出中文错误
   */
  async reviewBatch(
    ids: number[],
    result: 'approved' | 'rejected',
    reviewerId: number,
    reviewerName: string,
    rejectReason?: string,
    admin?: AdminPayload,
  ): Promise<number> {
    if (!ids?.length) throw new Error('请先选择要审核的记录');
    if (result === 'rejected' && !rejectReason?.trim()) {
      throw new Error('驳回时必须填写驳回原因');
    }
    const unique = [...new Set(ids)];

    // 归属条件并进这次查询：不归自己审的记录查不出来，下面的条数比对
    // 会拦下整批。混进别人的记录时报「有已被删除的」而非「无权审核」，
    // 同样是不确认那些 id 到底存不存在
    const owner = this.ownerFilter(admin);
    const rows = await this.prisma.certApplication.findMany({
      where: owner ? { AND: [{ id: { in: unique } }, owner] } : { id: { in: unique } },
      select: { id: true, status: true, candidateName: true },
    });
    if (rows.length !== unique.length) {
      throw new Error('选中的记录里有已被删除的，请刷新后重试');
    }
    const done = rows.filter((r) => r.status !== 'pending');
    if (done.length) {
      const names = done.slice(0, 5).map((d) => d.candidateName).join('、');
      const more = done.length > 5 ? ` 等 ${done.length} 人` : '';
      throw new Error(`${names}${more}的报名已审核过，请只选待审核的记录`);
    }

    /*
      按 rows 里查出来的 id 更新，不用前端传来的 unique。

      上面的条数比对已保证两者此刻相等，但写入边界必须自己立得住：
      updateMany 的 where 里不放 relation 条件（Prisma 对 updateMany 的
      关联过滤支持不一致，写了未必生效），若再用 unique 就等于写入范围
      完全依赖前面那次校验没被绕过。取 rows 的 id 则天然落在归属范围内。
    */
    const scopedIds = rows.map((r) => r.id);
    const { count } = await this.prisma.certApplication.updateMany({
      where: { id: { in: scopedIds }, status: 'pending' },
      data: {
        status: result,
        reviewerId,
        reviewerName,
        rejectReason: result === 'rejected' ? rejectReason!.trim() : null,
        reviewTime: new Date(),
      },
    });
    return count;
  }
}
