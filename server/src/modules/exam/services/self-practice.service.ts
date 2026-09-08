import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma.service';
import { BaseService } from '@/common/crud';
import { OrgScopeService, type AdminPayload } from './org-scope.service';
import { ParticipantResolverService } from './participant-resolver.service';

/** 自主练习题库列表筛选条件 */
export interface SelfPracticeListFilter {
  keyword?: string;
  /** 开放状态筛选：true 仅已开放 / false 仅未开放 / undefined 全部 */
  isOpen?: boolean;
}

/** 开放人员输入项 */
export interface OpenUserInput {
  userType: string;
  internalUserId?: number;
  externalCandidateId?: number;
}

/** 题库开放配置输入 */
export interface SelfPracticeConfigInput {
  bankId: number;
  isOpen?: boolean;
  openScope: string;
  maxQuestionsPerRound?: number;
  knowledgePointIds?: number[];
  users?: OpenUserInput[];
  allowRepeat?: boolean;
  showResultPerQuestion?: boolean;
  showAnswer?: boolean;
  showAnalysis?: boolean;
}

/** 开放范围为「全员」时开放人数的哨兵值，前端据此展示「全员」 */
const ALL_USERS = -1;

/**
 * 自主练习服务
 * 自主练习不建独立的练习安排，而是给题库挂「开放配置」：
 * 管理员选择开放哪些题库、开放给谁、可练哪些知识点、单次题数上限与练习行为。
 * 学员端据此自主选择题库练习。
 */
@Injectable()
export class SelfPracticeService extends BaseService {
  constructor(
    protected prisma: PrismaService,
    private readonly orgScope: OrgScopeService,
    private readonly participantResolver: ParticipantResolverService,
  ) {
    // modelName 指向开放配置表；本服务不用基类默认 CRUD，仅为满足控制器基类契约
    super(prisma, 'selfPracticeConfig');
  }

  /**
   * 分页查询可开放的题库（含开放配置状态）
   *
   * 以题库为主体列出：尚未配置过开放的题库同样出现，此时 isOpen=false、各计数为 0，
   * 便于管理员在同一处「选择题库开放」。题库可见范围沿用题库模块的共享权限过滤。
   * @param filter 筛选条件
   * @param page 页码，从 1 开始
   * @param pageSize 每页条数（1-100）
   * @param admin 当前登录管理员，用于可见范围过滤
   */
  async pageList(
    filter: SelfPracticeListFilter,
    page?: number,
    pageSize?: number,
    admin?: AdminPayload,
  ) {
    const p = Math.max(page || 1, 1);
    const ps = Math.min(Math.max(pageSize || 10, 1), 100);
    const skip = (p - 1) * ps;

    const where: Prisma.QuestionBankWhereInput = { status: 1 };
    if (filter.keyword) where.name = { contains: filter.keyword };
    // 开放状态筛选：未配置过的题库视为未开放，故用关联为空或 isOpen=false 表达
    if (filter.isOpen === true) {
      where.selfPracticeConfig = { isOpen: true };
    } else if (filter.isOpen === false) {
      where.OR = [{ selfPracticeConfig: null }, { selfPracticeConfig: { isOpen: false } }];
    }
    // 题库可见范围：复用题库模块的共享权限，非超管只看可见的题库
    if (admin && !this.orgScope.isSuperAdmin(admin)) {
      const visibleOr = await this.orgScope.buildVisibleOr(admin);
      if (visibleOr) {
        // 与开放状态的 OR 并存时须收进 AND，避免两个 OR 互相覆盖
        where.AND = [...(Array.isArray(where.AND) ? where.AND : []), { OR: visibleOr }];
      }
    }

    const include = {
      selfPracticeConfig: {
        select: {
          isOpen: true,
          openScope: true,
          _count: { select: { users: true, knowledgePoints: true } },
        },
      },
    } as const;

    const [rows, total] = await Promise.all([
      this.prisma.questionBank.findMany({
        where,
        skip,
        take: ps,
        orderBy: { id: 'desc' },
        include,
      }),
      this.prisma.questionBank.count({ where }),
    ]);

    // 正式题目数须单独统计：_count.questions 含待审题目，与列表「试题数」语义不符
    const bankIds = rows.map((r) => r.id);
    const formalCounts = bankIds.length
      ? await this.prisma.question.groupBy({
          by: ['questionBankId'],
          // parentId: null 排除小题：小题不能被独立抽取，计入会虚报可练题量
          where: { questionBankId: { in: bankIds }, status: 'formal', parentId: null },
          _count: { _all: true },
        })
      : [];
    const formalMap = new Map(
      formalCounts.map((g) => [g.questionBankId as number, g._count._all]),
    );

    const list = rows.map((bank) => {
      const cfg = bank.selfPracticeConfig;
      return {
        bankId: bank.id,
        bankName: bank.name,
        createBy: bank.createBy,
        createByName: '',
        questionCount: formalMap.get(bank.id) || 0,
        // 全员开放不落人员记录，用哨兵值让前端展示「全员」而非 0
        openUserCount: cfg?.openScope === 'all' ? ALL_USERS : (cfg?._count.users ?? 0),
        knowledgePointCount: cfg?._count.knowledgePoints ?? 0,
        isOpen: cfg?.isOpen ?? false,
        openScope: cfg?.openScope ?? 'all',
      };
    });
    await this.fillCreateByNames(list);
    return { list, pagination: { page: p, pageSize: ps, total } };
  }

  /**
   * 批量回填题库创建人姓名（就地修改传入数组）
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
   * 题库开放配置详情（含开放人员与可练知识点）
   * 尚未配置过的题库返回一份全默认配置，前端设置抽屉据此初始化。
   * @param bankId 题库 ID
   * @returns 配置详情；题库不存在时返回 null
   */
  async getConfig(bankId: number) {
    const bank = await this.prisma.questionBank.findUnique({
      where: { id: bankId },
      select: { id: true, name: true },
    });
    if (!bank) return null;

    const cfg = await this.prisma.selfPracticeConfig.findUnique({
      where: { bankId },
      include: {
        users: true,
        knowledgePoints: {
          include: { knowledgePoint: { select: { name: true } } },
        },
      },
    });

    // 未配置过：返回默认值，避免前端为「有无配置」分两套初始化逻辑
    if (!cfg) {
      return {
        bankId: bank.id,
        bankName: bank.name,
        isOpen: false,
        openScope: 'all',
        maxQuestionsPerRound: 0,
        allowRepeat: true,
        showResultPerQuestion: true,
        showAnswer: true,
        showAnalysis: true,
        users: [],
        knowledgePoints: [],
      };
    }

    const names = await this.participantResolver.resolveNames(
      cfg.users.map((u) => ({
        type: u.userType,
        internalUserId: u.internalUserId,
        externalCandidateId: u.externalCandidateId,
      })),
    );

    return {
      bankId: cfg.bankId,
      bankName: bank.name,
      isOpen: cfg.isOpen,
      openScope: cfg.openScope,
      maxQuestionsPerRound: cfg.maxQuestionsPerRound,
      allowRepeat: cfg.allowRepeat,
      showResultPerQuestion: cfg.showResultPerQuestion,
      showAnswer: cfg.showAnswer,
      showAnalysis: cfg.showAnalysis,
      users: cfg.users.map((u) => ({
        id: u.id,
        userType: u.userType,
        internalUserId: u.internalUserId,
        externalCandidateId: u.externalCandidateId,
        userName:
          names.get(
            this.participantResolver.key({
              type: u.userType,
              internalUserId: u.internalUserId,
              externalCandidateId: u.externalCandidateId,
            }),
          ) || '',
      })),
      knowledgePoints: cfg.knowledgePoints.map((kp) => ({
        knowledgePointId: kp.knowledgePointId,
        knowledgePointName: kp.knowledgePoint?.name ?? '',
      })),
    };
  }

  /**
   * 保存题库开放配置（覆盖式：人员与知识点先清后插）
   * @param input 配置入参
   * @param createBy 操作人用户 ID
   */
  async saveConfig(input: SelfPracticeConfigInput, createBy?: number) {
    const { bankId } = input;
    // 单题反馈关闭时强制关掉答案与解析，避免矛盾组合
    const showResult = input.showResultPerQuestion ?? true;
    const configData = {
      isOpen: input.isOpen ?? false,
      openScope: input.openScope,
      maxQuestionsPerRound: input.maxQuestionsPerRound ?? 0,
      allowRepeat: input.allowRepeat ?? true,
      showResultPerQuestion: showResult,
      showAnswer: showResult ? (input.showAnswer ?? true) : false,
      showAnalysis: showResult ? (input.showAnalysis ?? true) : false,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.selfPracticeConfig.upsert({
        where: { bankId },
        create: { bankId, ...configData, createBy: createBy ?? null },
        update: configData,
      });

      // 覆盖式重写人员与知识点范围
      await Promise.all([
        tx.selfPracticeUser.deleteMany({ where: { bankId } }),
        tx.selfPracticeKnowledgePoint.deleteMany({ where: { bankId } }),
      ]);

      // 开放人员仅在指定员工时落库；全员开放不落记录
      if (input.openScope === 'specified' && input.users?.length) {
        await tx.selfPracticeUser.createMany({
          data: input.users.map((u) => ({
            bankId,
            userType: u.userType,
            internalUserId: u.userType === 'internal' ? u.internalUserId : null,
            externalCandidateId: u.userType === 'external' ? u.externalCandidateId : null,
          })),
          skipDuplicates: true,
        });
      }

      // 知识点范围去重后写入；空数组表示不限，不落记录
      const kpIds = [...new Set(input.knowledgePointIds ?? [])];
      if (kpIds.length) {
        await tx.selfPracticeKnowledgePoint.createMany({
          data: kpIds.map((knowledgePointId) => ({ bankId, knowledgePointId })),
        });
      }
    });
  }

  /**
   * 切换题库开放状态
   * 列表页「开启/关闭」快捷操作用；配置不存在时按当前入参建一份默认配置。
   * @param bankId 题库 ID
   * @param isOpen 目标状态
   * @param createBy 操作人用户 ID
   * @returns 错误文案；成功时返回 null
   */
  async toggleOpen(bankId: number, isOpen: boolean, createBy?: number): Promise<string | null> {
    const bank = await this.prisma.questionBank.findUnique({
      where: { id: bankId },
      select: { id: true, status: true },
    });
    if (!bank) return '题库不存在';
    if (bank.status !== 1) return '已停用的题库不可开放自主练习';

    // 开放前确认题库有正式题目，否则学员进去无题可练
    if (isOpen) {
      const count = await this.prisma.question.count({
        // 同上：小题不计入可抽取题量，否则「有小题但无独立题」的题库会被误判为可开放
        where: { questionBankId: bankId, status: 'formal', parentId: null },
      });
      if (count === 0) return '题库内没有正式题目，无法开放';
    }

    await this.prisma.selfPracticeConfig.upsert({
      where: { bankId },
      create: { bankId, isOpen, openScope: 'all', createBy: createBy ?? null },
      update: { isOpen },
    });
    return null;
  }

  /**
   * 取消开放（删除开放配置）
   * 对应列表的「删除」操作：移出自主练习范围，题库本身不受影响。
   * 人员与知识点范围由外键级联删除。
   * @param bankId 题库 ID
   * @returns 错误文案；成功时返回 null
   */
  async removeConfig(bankId: number): Promise<string | null> {
    const cfg = await this.prisma.selfPracticeConfig.findUnique({
      where: { bankId },
      select: { bankId: true },
    });
    if (!cfg) return '该题库尚未配置自主练习';
    await this.prisma.selfPracticeConfig.delete({ where: { bankId } });
    return null;
  }

  /**
   * 校验开放配置入参有效性
   * @param input 配置入参
   * @returns 错误文案；有效时返回 null
   */
  async validateConfig(input: SelfPracticeConfigInput): Promise<string | null> {
    const bank = await this.prisma.questionBank.findUnique({
      where: { id: input.bankId },
      select: { status: true },
    });
    if (!bank) return '题库不存在';
    if (bank.status !== 1) return '已停用的题库不可配置自主练习';

    // 指定员工却没选人，等于开放给零人
    if (input.openScope === 'specified' && !input.users?.length) {
      return '开放范围为指定员工时请至少选择一名人员';
    }

    if (input.users?.length) {
      const err = await this.participantResolver.validateExist(
        input.users.map((u) => ({
          type: u.userType,
          internalUserId: u.internalUserId,
          externalCandidateId: u.externalCandidateId,
        })),
      );
      if (err) return err;
    }

    const kpIds = [...new Set(input.knowledgePointIds ?? [])];
    if (kpIds.length) {
      const kps = await this.prisma.knowledgePoint.findMany({
        where: { id: { in: kpIds } },
        select: { id: true },
      });
      if (kps.length !== kpIds.length) return '所选知识点中存在已被删除的项';
    }

    return null;
  }
}
