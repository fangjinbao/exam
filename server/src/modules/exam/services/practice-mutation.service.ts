import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma.service';
import { computePracticeStatus } from '../utils/practice-status';
import { ParticipantResolverService } from './participant-resolver.service';
import type { PracticeInput, ParticipantInput } from './practice.service';

/**
 * 练习写入服务（岗位练兵）
 * 承载创建、编辑、参与人员分配、发布/撤回、删除。
 * 从 PracticeService 拆出以守单文件行数上限：查询与写入各自独立演进，
 * 状态判定共用 utils/practice-status 的纯函数。
 */
@Injectable()
export class PracticeMutationService {
  constructor(
    private readonly prisma: PrismaService,
    // 移除参与人员时要把「已练过、未移除」的人按姓名报出来，与考试的移除考生同口径
    private readonly participantResolver: ParticipantResolverService,
  ) {}

  /** 校验练习编号是否已存在 */
  private async isCodeExists(code: string): Promise<boolean> {
    const existing = await this.prisma.practice.findFirst({
      where: { code },
      select: { id: true },
    });
    return !!existing;
  }

  /**
   * 生成练习编号：PRA + 时间戳后 6 位 + 2 位随机，冲突则重试
   * @returns 未占用的练习编号
   */
  private async generateCode(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const ts = Date.now().toString().slice(-6);
      const rand = Math.floor(Math.random() * 100)
        .toString()
        .padStart(2, '0');
      const code = `PRA${ts}${rand}`;
      if (!(await this.isCodeExists(code))) return code;
    }
    // 10 次仍冲突的概率极低，兜底用完整时间戳保证唯一
    return `PRA${Date.now()}`;
  }

  /**
   * 创建练习（基础信息 + 题库范围 + 抽题规则 + 参与人员 + 练习设置）
   * 整体走事务：主记录与四类从属数据要么全成功要么全回滚。
   * @param input 练习入参
   * @param createBy 创建人用户 ID
   * @returns 新建的练习主记录
   */
  async createPractice(input: PracticeInput, createBy?: number) {
    const code = input.code?.trim() || (await this.generateCode());

    return this.prisma.$transaction(async (tx) => {
      const practice = await tx.practice.create({
        data: {
          name: input.name.trim(),
          code,
          description: input.description?.trim() || null,
          drawMode: input.drawMode,
          startTime: input.startTime ? new Date(input.startTime) : null,
          endTime: input.endTime ? new Date(input.endTime) : null,
          autoFinish: input.autoFinish ?? false,
          participantScope: input.participantScope,
          createBy: createBy ?? null,
        },
      });

      await this.writeRelations(tx, practice.id, input);
      return practice;
    });
  }

  /**
   * 编辑练习（仅未发布可编辑）
   * 从属数据一律覆盖式重写：先清后插，避免增量对比带来的状态歧义。
   * @param id 练习 ID
   * @param input 练习入参
   * @returns 更新后的练习主记录
   */
  async updatePractice(id: number, input: PracticeInput) {
    return this.prisma.$transaction(async (tx) => {
      const practice = await tx.practice.update({
        where: { id },
        data: {
          name: input.name.trim(),
          ...(input.code?.trim() ? { code: input.code.trim() } : {}),
          description: input.description?.trim() || null,
          drawMode: input.drawMode,
          startTime: input.startTime ? new Date(input.startTime) : null,
          endTime: input.endTime ? new Date(input.endTime) : null,
          autoFinish: input.autoFinish ?? false,
          participantScope: input.participantScope,
        },
      });

      // 覆盖式：清掉旧的题库范围/规则/人员再按新入参写入（设置走 upsert，无需先删）
      await Promise.all([
        tx.practiceBank.deleteMany({ where: { practiceId: id } }),
        tx.practiceRule.deleteMany({ where: { practiceId: id } }),
        tx.practiceParticipant.deleteMany({ where: { practiceId: id } }),
      ]);
      await this.writeRelations(tx, id, input);
      return practice;
    });
  }

  /**
   * 写入练习的四类从属数据（题库范围 / 抽题规则 / 参与人员 / 练习设置）
   * 创建与编辑共用；调用方负责在编辑场景先清理旧数据。
   * @param tx 事务客户端
   * @param practiceId 练习 ID
   * @param input 练习入参
   */
  private async writeRelations(
    tx: Prisma.TransactionClient,
    practiceId: number,
    input: PracticeInput,
  ) {
    // 题库范围：去重后写入，防同一题库重复选入导致复合主键冲突
    const bankIds = [...new Set(input.bankIds)];
    if (bankIds.length) {
      await tx.practiceBank.createMany({
        data: bankIds.map((bankId) => ({ practiceId, bankId })),
      });
    }

    // 抽题规则仅在按规则抽题时落库；顺序练模式下即使前端传了也不存，避免切换模式后残留脏规则
    if (input.drawMode === 'random' && input.rules?.length) {
      await tx.practiceRule.createMany({
        data: input.rules.map((r) => ({
          practiceId,
          questionType: r.questionType,
          difficulty: r.difficulty,
          knowledgePointId: r.knowledgePointId,
          drawCount: r.drawCount,
        })),
      });
    }

    // 参与人员仅在指定员工时落库；全员参与不落记录，由学员端按「全员」放行
    if (input.participantScope === 'specified' && input.participants?.length) {
      await tx.practiceParticipant.createMany({
        data: input.participants.map((pt) => ({
          practiceId,
          participantType: pt.participantType,
          internalUserId: pt.participantType === 'internal' ? pt.internalUserId : null,
          externalCandidateId: pt.participantType === 'external' ? pt.externalCandidateId : null,
        })),
        skipDuplicates: true,
      });
    }

    // 练习设置：单题反馈关闭时强制关掉答案与解析，避免「不展示对错却展示答案」的矛盾组合
    const st = input.setting ?? {};
    const showResult = st.showResultPerQuestion ?? true;
    const settingData = {
      allowRepeat: st.allowRepeat ?? true,
      showResultPerQuestion: showResult,
      showAnswer: showResult ? (st.showAnswer ?? true) : false,
      showAnalysis: showResult ? (st.showAnalysis ?? true) : false,
    };
    await tx.practiceSetting.upsert({
      where: { practiceId },
      create: { practiceId, ...settingData },
      update: settingData,
    });
  }

  /**
   * 追加参与人员（只增不减）
   *
   * 已在名单里的靠唯一索引 + skipDuplicates 跳过，不报错也不重复插。
   * 与 assignParticipants 的区别见 AppendParticipantsDto 的注释。
   *
   * @param practiceId 练习 ID
   * @param participants 要追加的人员
   * @returns 实际新增条数
   */
  async appendParticipants(
    practiceId: number,
    participants: ParticipantInput[],
  ): Promise<number> {
    if (!participants.length) return 0;
    const res = await this.prisma.practiceParticipant.createMany({
      data: participants.map((pt) => ({
        practiceId,
        participantType: pt.participantType,
        internalUserId: pt.participantType === 'internal' ? pt.internalUserId : null,
        externalCandidateId: pt.participantType === 'external' ? pt.externalCandidateId : null,
      })),
      skipDuplicates: true,
    });
    /*
      不动 participantScope：调用方（append-participants 接口）已挡掉全员参与的练习，
      进到这里的必然已是 specified。

      这里若顺手把 scope 改成 specified，就等于允许「加人」这个动作把受众
      从全员收窄到刚加的几个人，方向与管理员意图相反。范围变更必须显式走编辑页。
    */
    return res.count;
  }

  /**
   * 移除参与人员（仅未练过者）
   *
   * 采用「尽力移除」而非整批失败：管理员打开名单后，某人可能正好开始练，
   * 整批回滚会让另外几个可移除的人也白跑一趟。
   *
   * @param practiceId 练习 ID
   * @param ids PracticeParticipant 行 id
   * @returns removed 实际移除数；blocked 因已练过而跳过的姓名
   */
  async removeParticipants(
    practiceId: number,
    ids: number[],
  ): Promise<{ removed: number; blocked: string[] }> {
    if (!ids.length) return { removed: 0, blocked: [] };
    // 限定 practiceId：防止传入别的练习的行 id 而跨练习删数据
    const rows = await this.prisma.practiceParticipant.findMany({
      where: { id: { in: ids }, practiceId },
      select: {
        id: true,
        participantType: true,
        internalUserId: true,
        externalCandidateId: true,
      },
    });
    if (!rows.length) return { removed: 0, blocked: [] };

    const records = await this.prisma.practiceRecord.findMany({
      where: { practiceId },
      select: { userType: true, internalUserId: true, externalCandidateId: true },
      distinct: ['userType', 'internalUserId', 'externalCandidateId'],
    });
    const practiced = new Set(
      records
        .map((r) => {
          const uid = r.userType === 'internal' ? r.internalUserId : r.externalCandidateId;
          return uid == null ? null : `${r.userType}:${uid}`;
        })
        .filter((k): k is string => k !== null),
    );

    const removable: number[] = [];
    const blockedRows: typeof rows = [];
    for (const r of rows) {
      const uid = r.participantType === 'internal' ? r.internalUserId : r.externalCandidateId;
      // 类型与 id 列不匹配的脏行按「可移除」处理：它匹配不上任何记录，
      // 留着也只是一条无效分配
      const key = uid == null ? null : `${r.participantType}:${uid}`;
      if (key && practiced.has(key)) blockedRows.push(r);
      else removable.push(r.id);
    }

    // 姓名只为被拦下的人解析，可移除的人不需要
    let blocked: string[] = [];
    if (blockedRows.length) {
      const refs = blockedRows.map((r) => ({
        type: r.participantType as 'internal' | 'external',
        internalUserId: r.internalUserId,
        externalCandidateId: r.externalCandidateId,
      }));
      const names = await this.participantResolver.resolveNames(refs);
      blocked = refs.map((ref) => names.get(this.participantResolver.key(ref)) || '未知人员');
    }

    if (!removable.length) return { removed: 0, blocked };
    const res = await this.prisma.practiceParticipant.deleteMany({
      where: { id: { in: removable }, practiceId },
    });
    return { removed: res.count, blocked };
  }

  /**
   * 分配/更新参与人员（覆盖式：先清后插）
   * @param practiceId 练习 ID
   * @param participants 人员列表（空数组表示清空并转为全员参与）
   */
  async assignParticipants(practiceId: number, participants: ParticipantInput[]) {
    await this.prisma.$transaction(async (tx) => {
      await tx.practiceParticipant.deleteMany({ where: { practiceId } });
      if (participants.length) {
        await tx.practiceParticipant.createMany({
          data: participants.map((pt) => ({
            practiceId,
            participantType: pt.participantType,
            internalUserId: pt.participantType === 'internal' ? pt.internalUserId : null,
            externalCandidateId: pt.participantType === 'external' ? pt.externalCandidateId : null,
          })),
          skipDuplicates: true,
        });
      }
      // 保持范围字段与实际数据一致：选了人即指定范围，清空即全员
      await tx.practice.update({
        where: { id: practiceId },
        data: { participantScope: participants.length ? 'specified' : 'all' },
      });
    });
  }

  /**
   * 发布练习：未发布 → 已发布
   * @param id 练习 ID
   * @returns 错误文案；成功时返回 null
   */
  async publish(id: number): Promise<string | null> {
    const row = await this.prisma.practice.findUnique({
      where: { id },
      select: {
        status: true,
        participantScope: true,
        _count: { select: { participants: true, banks: true } },
      },
    });
    if (!row) return '练习不存在';
    if (row.status !== 'unpublished') return '只有未发布的练习可以发布';
    // 没有题库范围的练习发布后学员无题可练
    if (row._count.banks === 0) return '请先选择练习题库再发布';
    // 指定员工却没选人，发布后无人可见，等于空发布
    if (row.participantScope === 'specified' && row._count.participants === 0) {
      return '请先指定参与人员再发布';
    }
    await this.prisma.practice.update({ where: { id }, data: { status: 'published' } });
    return null;
  }

  /**
   * 撤回练习：已发布/进行中 → 未发布
   * 已结束的不允许撤回，避免历史记录被改写。
   * @param id 练习 ID
   * @returns 错误文案；成功时返回 null
   */
  async withdraw(id: number): Promise<string | null> {
    const row = await this.prisma.practice.findUnique({
      where: { id },
      select: { status: true, startTime: true, endTime: true, autoFinish: true },
    });
    if (!row) return '练习不存在';
    const real = computePracticeStatus(row, new Date());
    if (real === 'unpublished') return '练习尚未发布';
    if (real === 'finished') return '已结束的练习不可撤回';
    await this.prisma.practice.update({ where: { id }, data: { status: 'unpublished' } });
    return null;
  }

  /**
   * 手动结束练习：已发布/进行中 → 已结束
   * 未开启自动结束的练习靠此收尾。
   * @param id 练习 ID
   * @returns 错误文案；成功时返回 null
   */
  async finish(id: number): Promise<string | null> {
    const row = await this.prisma.practice.findUnique({
      where: { id },
      select: { status: true, startTime: true, endTime: true, autoFinish: true },
    });
    if (!row) return '练习不存在';
    const real = computePracticeStatus(row, new Date());
    if (real === 'unpublished') return '未发布的练习无需结束';
    if (real === 'finished') return '练习已结束';
    await this.prisma.practice.update({ where: { id }, data: { status: 'finished' } });
    return null;
  }

  /**
   * 删除练习（进行中不可删）
   * 从属数据由外键级联删除，无需逐表清理。
   * @param id 练习 ID
   * @returns 错误文案；成功时返回 null
   */
  async removePractice(id: number): Promise<string | null> {
    const row = await this.prisma.practice.findUnique({
      where: { id },
      select: { status: true, startTime: true, endTime: true, autoFinish: true },
    });
    if (!row) return '练习不存在';
    if (computePracticeStatus(row, new Date()) === 'ongoing') {
      return '进行中的练习不可删除，请先撤回';
    }
    await this.prisma.practice.delete({ where: { id } });
    return null;
  }

  /**
   * 批量删除练习：逐个走单删校验，返回失败原因汇总
   * @param ids 练习 ID 列表
   * @returns 成功数与失败明细
   */
  async batchRemove(ids: number[]): Promise<{ success: number; failed: string[] }> {
    const failed: string[] = [];
    let success = 0;
    for (const id of ids) {
      const err = await this.removePractice(id);
      if (err) failed.push(`ID ${id}：${err}`);
      else success++;
    }
    return { success, failed };
  }
}
