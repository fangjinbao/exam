import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma.service';
import { BaseService } from '@/common/crud';
import { OrgScopeService, type AdminPayload } from './org-scope.service';
import { ParticipantResolverService } from './participant-resolver.service';
import { computePracticeStatus } from '../utils/practice-status';

/** 练习列表筛选条件 */
export interface PracticeListFilter {
  keyword?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

/** 参与人员输入项 */
export interface ParticipantInput {
  participantType: string;
  internalUserId?: number;
  externalCandidateId?: number;
}

/** 抽题规则输入项 */
export interface PracticeRuleInput {
  questionType: string;
  difficulty: string;
  knowledgePointId: number;
  drawCount: number;
}

/** 练习设置输入 */
export interface PracticeSettingInput {
  allowRepeat?: boolean;
  showResultPerQuestion?: boolean;
  showAnswer?: boolean;
  showAnalysis?: boolean;
}

/** 创建/编辑练习输入 */
export interface PracticeInput {
  name: string;
  code?: string;
  description?: string;
  drawMode: string;
  bankIds: number[];
  startTime?: string;
  endTime?: string;
  autoFinish?: boolean;
  participantScope: string;
  rules?: PracticeRuleInput[];
  participants?: ParticipantInput[];
  setting?: PracticeSettingInput;
}

/** 参与范围为「全员」时列表页参与人数的哨兵值，前端据此展示「全员」 */
const ALL_PARTICIPANTS = -1;

/**
 * 练习服务（岗位练兵）
 * 承载练习 CRUD、题库范围与抽题规则维护、参与人员分配、发布/撤回，
 * 以及「已发布→进行中→已结束」的按练习时间惰性状态判定（查询时计算真实状态并回写）。
 * 编辑仅限未发布；练习不计分，故无及格线与分值概念。
 */
@Injectable()
export class PracticeService extends BaseService {
  constructor(
    protected prisma: PrismaService,
    private readonly orgScope: OrgScopeService,
    private readonly participantResolver: ParticipantResolverService,
  ) {
    super(prisma, 'practice');
  }

  /**
   * 分页查询练习（惰性回写时间驱动的状态；带题库名称与参与人数）
   * @param filter 筛选条件
   * @param page 页码，从 1 开始
   * @param pageSize 每页条数（1-100）
   * @param admin 当前登录管理员，用于创建人隔离
   */
  async pageList(
    filter: PracticeListFilter,
    page?: number,
    pageSize?: number,
    admin?: AdminPayload,
  ) {
    const p = Math.max(page || 1, 1);
    const ps = Math.min(Math.max(pageSize || 10, 1), 100);
    const skip = (p - 1) * ps;

    const where: Prisma.PracticeWhereInput = {};
    if (filter.keyword) where.name = { contains: filter.keyword };
    if (filter.startDate || filter.endDate) {
      where.startTime = {};
      if (filter.startDate) where.startTime.gte = new Date(filter.startDate);
      if (filter.endDate) where.startTime.lte = new Date(`${filter.endDate}T23:59:59.999`);
    }
    // 创建人隔离：非超管只能看自己创建的练习。存量 createBy 为 null 归属不明，只对超管可见
    if (admin && !this.orgScope.isSuperAdmin(admin)) {
      where.createBy = admin.userId;
    }

    const now = new Date();
    const include = {
      banks: { select: { bankId: true, bank: { select: { name: true } } } },
      rules: { select: { drawCount: true } },
      _count: { select: { participants: true } },
    } as const;

    // 组装单条列表项：计算真实状态并惰性回写。createByName 由外层批量预取后回填，避免 N+1
    const toItem = async ({ banks, rules, _count, ...practice }: any) => {
      const realStatus = computePracticeStatus(practice, now);
      if (realStatus !== practice.status) {
        await this.prisma.practice.update({
          where: { id: practice.id },
          data: { status: realStatus },
        });
      }
      return {
        ...practice,
        status: realStatus,
        bankIds: banks.map((b: any) => b.bankId),
        bankNames: banks.map((b: any) => b.bank?.name ?? ''),
        // 全员参与时不落人员记录，用哨兵值让前端展示「全员」而非 0
        participantCount:
          practice.participantScope === 'all' ? ALL_PARTICIPANTS : _count.participants,
        questionCount: 0,
        createByName: '',
      };
    };

    // status 为惰性计算值，无法进 DB where。有 status 筛选时全量取出→按真实状态过滤→应用层分页，
    // 保证 total 与列表一致、跨页不丢记录；无 status 筛选时走 DB 分页
    if (filter.status) {
      const rows = await this.prisma.practice.findMany({ where, orderBy: { id: 'desc' }, include });
      const all = await Promise.all(rows.map(toItem));
      const filtered = all.filter((e) => e.status === filter.status);
      const pageList = filtered.slice(skip, skip + ps);
      await this.fillQuestionCounts(pageList);
      await this.fillCreateByNames(pageList);
      return { list: pageList, pagination: { page: p, pageSize: ps, total: filtered.length } };
    }

    const [rows, total] = await Promise.all([
      this.prisma.practice.findMany({ where, skip, take: ps, orderBy: { id: 'desc' }, include }),
      this.prisma.practice.count({ where }),
    ]);
    const list = await Promise.all(rows.map(toItem));
    await this.fillQuestionCounts(list);
    await this.fillCreateByNames(list);
    return { list, pagination: { page: p, pageSize: ps, total } };
  }

  /**
   * 批量回填题目总数（就地修改传入数组）
   * 顺序练=题库正式题量合计（跨库去重不适用，题目归属唯一）；规则抽题=各规则抽取数合计。
   * @param items 含 drawMode/bankIds 的列表项
   */
  private async fillQuestionCounts(
    items: Array<{ id: number; drawMode: string; bankIds: number[]; questionCount: number }>,
  ) {
    const seqItems = items.filter((i) => i.drawMode === 'sequential');
    const ruleItems = items.filter((i) => i.drawMode === 'random');

    // 顺序练：一次按题库分组统计题量，再按各练习的题库范围求和
    if (seqItems.length) {
      const allBankIds = [...new Set(seqItems.flatMap((i) => i.bankIds))];
      if (allBankIds.length) {
        // parentId: null 排除小题：题量统计的口径是「可抽取的题目数」，
        // 小题不能被独立抽取（随材料题进卷），计入会虚报可练题量
        const grouped = await this.prisma.question.groupBy({
          by: ['questionBankId'],
          where: { questionBankId: { in: allBankIds }, status: 'formal', parentId: null },
          _count: { _all: true },
        });
        const countMap = new Map(
          grouped.map((g) => [g.questionBankId as number, g._count._all]),
        );
        seqItems.forEach((i) => {
          i.questionCount = i.bankIds.reduce((s, id) => s + (countMap.get(id) || 0), 0);
        });
      }
    }

    // 规则抽题：一次取出相关规则再按练习归组求和
    if (ruleItems.length) {
      const rules = await this.prisma.practiceRule.groupBy({
        by: ['practiceId'],
        where: { practiceId: { in: ruleItems.map((i) => i.id) } },
        _sum: { drawCount: true },
      });
      const sumMap = new Map(rules.map((r) => [r.practiceId, r._sum.drawCount || 0]));
      ruleItems.forEach((i) => {
        i.questionCount = sumMap.get(i.id) || 0;
      });
    }
  }

  /**
   * 批量回填创建人姓名（就地修改传入数组）
   * @param items 含 createBy 字段的列表项
   */
  private async fillCreateByNames(
    items: Array<{ createBy?: number | null; createByName?: string }>,
  ) {
    const ids = [...new Set(items.map((i) => i.createBy).filter((v): v is number => !!v))];
    if (!ids.length) return;
    const users = await this.prisma.sysUser.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, username: true },
    });
    const nameMap = new Map(users.map((u) => [u.id, u.name || u.username || '']));
    items.forEach((i) => {
      if (i.createBy) i.createByName = nameMap.get(i.createBy) || '';
    });
  }

  /**
   * 参与人员名单（带「是否已练过」标记与完整档案字段）
   *
   * 与 getDetail 里的 participants 分开：那份只回填姓名，供编辑页回显；
   * 本方法额外解析账号/身份证/手机号/所属，并标记已练过的人——
   * 名单弹窗要据此禁掉移除按钮，字段与考试的考生名单对齐。
   *
   * @param practiceId 练习 ID
   * @returns 名单行数组，含 hasPracticed
   */
  async listParticipantsWithRecord(practiceId: number) {
    const [rows, records] = await Promise.all([
      this.prisma.practiceParticipant.findMany({
        where: { practiceId },
        select: {
          id: true,
          participantType: true,
          internalUserId: true,
          externalCandidateId: true,
        },
        orderBy: { id: 'asc' },
      }),
      // 只需判定「这个人有没有练过」，取定位字段去重即可，不必拉全量记录
      this.prisma.practiceRecord.findMany({
        where: { practiceId },
        select: { userType: true, internalUserId: true, externalCandidateId: true },
        distinct: ['userType', 'internalUserId', 'externalCandidateId'],
      }),
    ]);

    /*
      键必须带类型前缀：内部人员 id 与外部考生 id 各自自增，
      internal 的 1 与 external 的 1 不是同一个人，只按数字比会串号。
      与 resolver.key / practice-record 的 keyOf 同一口径。
    */
    const keyOf = (type: string, id: number | null) => (id == null ? null : `${type}:${id}`);
    const practiced = new Set(
      records
        .map((r) =>
          keyOf(r.userType, r.userType === 'internal' ? r.internalUserId : r.externalCandidateId),
        )
        .filter((k): k is string => k !== null),
    );

    const refs = rows.map((r) => ({
      type: r.participantType as 'internal' | 'external',
      internalUserId: r.internalUserId,
      externalCandidateId: r.externalCandidateId,
    }));
    const profiles = await this.participantResolver.resolveProfiles(refs);

    return rows.map((r) => {
      const uid = r.participantType === 'internal' ? r.internalUserId : r.externalCandidateId;
      const key = keyOf(r.participantType, uid);
      const p = key ? profiles.get(key) : undefined;
      return {
        id: r.id,
        participantType: r.participantType,
        internalUserId: r.internalUserId,
        externalCandidateId: r.externalCandidateId,
        participantName: p?.name ?? '',
        account: p?.account ?? null,
        idCard: p?.idCard ?? null,
        phone: p?.phone ?? null,
        companyName: p?.companyName ?? '',
        departmentName: p?.departmentName ?? '',
        // 已练过的人不能移除：练习记录不挂 PracticeParticipant 外键，
        // 删掉分配不会级联删记录，只会留下一份无主记录
        hasPracticed: key !== null && practiced.has(key),
      };
    });
  }

  /**
   * 校验当前登录人对该练习有操作权（读/改/删/发布共用）
   * 仅创建人本人与超管可操作。列表已按创建人过滤，此处防「知道 id 就能直接改他人练习」。
   * @param id 练习 ID
   * @param admin 当前登录管理员；缺省时不校验（内部调用）
   * @throws ForbiddenException 无权操作
   */
  async assertOwned(id: number, admin?: AdminPayload): Promise<void> {
    if (!admin || this.orgScope.isSuperAdmin(admin)) return;
    const row = await this.prisma.practice.findUnique({
      where: { id },
      select: { createBy: true },
    });
    // 不存在交由调用方按「不存在」处理，避免此处抛出与之矛盾的 403
    if (!row) return;
    if (row.createBy !== admin.userId) {
      throw new ForbiddenException('无权操作他人创建的练习');
    }
  }

  /** 校验练习名称是否已存在 */
  async isNameExists(name: string, excludeId?: number): Promise<boolean> {
    const existing = await this.prisma.practice.findFirst({
      where: { name, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    return !!existing;
  }

  /** 校验练习编号是否已存在 */
  async isCodeExists(code: string, excludeId?: number): Promise<boolean> {
    const existing = await this.prisma.practice.findFirst({
      where: { code, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    return !!existing;
  }

  /**
   * 练习详情（基础信息 + 题库范围 + 抽题规则 + 参与人员 + 练习设置）
   * @param id 练习 ID
   * @returns 详情对象；练习不存在时返回 null
   */
  async getDetail(id: number) {
    const row = await this.prisma.practice.findUnique({
      where: { id },
      include: {
        banks: { select: { bankId: true, bank: { select: { name: true } } } },
        rules: true,
        participants: true,
        /*
          用 omit 排除 practiceId，不用 `setting: true`，也不用白名单式 select。
          与 exam.service.ts 的 setting 取法同源，理由见那边的长注释。

          main.ts 的 ValidationPipe 开了 forbidNonWhitelisted，
          PracticeSettingDto 里没有 practiceId，一旦编辑页的回填从现在的逐字段赋值
          改成 `{ ...data.setting }` 展开、再把整个 form.setting 原样提交，
          保存会直接 400——考试侧当初就是这么坏掉的。
          现在不报错只是因为回填恰好没用展开式，属于巧合而非设计。

          选 omit 而非 select：新增设置列时会自动带出，不需要有人记得来同步字段表。
          白名单漏一个字段的表现是「开关静默恒为默认值」，很难被发现。
        */
        setting: { omit: { practiceId: true } },
      },
    });
    if (!row) return null;

    const { banks, rules, participants, setting, ...practice } = row;
    const bankIds = banks.map((b) => b.bankId);

    // 题库题量、知识点名称、人员姓名三组关联数据并行取，避免串行往返
    const [bankCounts, kpNames, participantNames] = await Promise.all([
      bankIds.length
        ? this.prisma.question.groupBy({
            by: ['questionBankId'],
            // 同上：小题不计入可抽取题量
            where: { questionBankId: { in: bankIds }, status: 'formal', parentId: null },
            _count: { _all: true },
          })
        : Promise.resolve<Array<{ questionBankId: number | null; _count: { _all: number } }>>([]),
      this.resolveKnowledgePointNames(rules.map((r) => r.knowledgePointId)),
      this.participantResolver.resolveNames(
        participants.map((pt) => ({
          type: pt.participantType,
          internalUserId: pt.internalUserId,
          externalCandidateId: pt.externalCandidateId,
        })),
      ),
    ]);

    const countMap = new Map(bankCounts.map((g) => [g.questionBankId as number, g._count._all]));
    const now = new Date();
    const realStatus = computePracticeStatus(practice, now);

    return {
      ...practice,
      status: realStatus,
      bankIds,
      bankNames: banks.map((b) => b.bank?.name ?? ''),
      participantCount:
        practice.participantScope === 'all' ? ALL_PARTICIPANTS : participants.length,
      questionCount:
        practice.drawMode === 'sequential'
          ? bankIds.reduce((s, bid) => s + (countMap.get(bid) || 0), 0)
          : rules.reduce((s, r) => s + r.drawCount, 0),
      createByName: '',
      banks: banks.map((b) => ({
        bankId: b.bankId,
        bankName: b.bank?.name ?? '',
        questionCount: countMap.get(b.bankId) || 0,
      })),
      rules: rules.map((r) => ({
        id: r.id,
        questionType: r.questionType,
        difficulty: r.difficulty,
        knowledgePointId: r.knowledgePointId,
        knowledgePointName: kpNames.get(r.knowledgePointId) || '',
        drawCount: r.drawCount,
      })),
      participants: participants.map((pt) => ({
        id: pt.id,
        participantType: pt.participantType,
        internalUserId: pt.internalUserId,
        externalCandidateId: pt.externalCandidateId,
        participantName:
          participantNames.get(
            this.participantResolver.key({
              type: pt.participantType,
              internalUserId: pt.internalUserId,
              externalCandidateId: pt.externalCandidateId,
            }),
          ) || '',
      })),
      setting,
    };
  }

  /**
   * 批量取知识点名称
   * @param ids 知识点 ID 列表（可含重复）
   * @returns id → 名称 的映射
   */
  private async resolveKnowledgePointNames(ids: number[]): Promise<Map<number, string>> {
    const uniq = [...new Set(ids)];
    if (!uniq.length) return new Map();
    const rows = await this.prisma.knowledgePoint.findMany({
      where: { id: { in: uniq } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}
