import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import { buildRuleWhere } from '../utils/rule-where';
import {
  ParticipantResolverService,
  type ParticipantRef,
} from './participant-resolver.service';

/** 抽题规则的三个筛选维度（difficulty 空串 = 不限，knowledgePointId 0 = 不限） */
export interface RuleInput {
  questionType: string;
  difficulty: string;
  knowledgePointId: number;
  drawCount: number;
}

/**
 * 练习校验服务
 * 承载题库范围、抽题规则、参与人员三类入参的有效性校验，以及抽题可用量统计。
 * 从 PracticeService 拆出：查询/写入与校验各自独立，也便于自主练习复用同一套规则统计。
 */
@Injectable()
export class PracticeValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly participantResolver: ParticipantResolverService,
  ) {}

  /**
   * 统计各抽题规则组合在给定题库范围内的可用题量
   * 供编辑页实时提示「可用 N」，防止抽取数量超过实际题量。
   * 复用 buildRuleWhere，与试卷抽题共享「空串/0 表示不限」的语义。
   * @param bankIds 题库 ID 列表
   * @param rules 规则组合列表
   * @returns 与 rules 下标对齐的可用题量数组
   */
  async ruleAvailability(
    bankIds: number[],
    rules: Array<Omit<RuleInput, 'drawCount'>>,
  ): Promise<number[]> {
    if (!bankIds.length || !rules.length) return rules.map(() => 0);
    // 逐规则并行统计：题型+难度+知识点三者交叉，无法用一次 groupBy 覆盖
    return Promise.all(
      rules.map((r) => this.prisma.question.count({ where: buildRuleWhere(bankIds, r) })),
    );
  }

  /**
   * 校验题库范围有效性：须存在且启用
   * @param bankIds 题库 ID 列表
   * @returns 错误文案；有效时返回 null
   */
  async validateBanks(bankIds: number[]): Promise<string | null> {
    const uniq = [...new Set(bankIds)];
    if (!uniq.length) return '请至少选择一个题库';
    const rows = await this.prisma.questionBank.findMany({
      where: { id: { in: uniq }, status: 1 },
      select: { id: true },
    });
    if (rows.length !== uniq.length) return '所选题库中存在不存在或已停用的题库';
    return null;
  }

  /**
   * 校验抽题规则：知识点须存在，且各组合抽取数不超过可用题量
   *
   * 注意：这里是逐条校验，与 PaperService.findRuleShortage 同样属于必要非充分条件——
   * 多条规则命中同一批题目时，「逐条都够但合起来不够」仍会漏判。练习不计分且允许反复练，
   * 抽题不足时按实际可抽数量出题即可，故不做全集去重的严格校验。
   * @param bankIds 题库 ID 列表
   * @param rules 规则列表
   * @returns 错误文案；有效时返回 null
   */
  async validateRules(bankIds: number[], rules: RuleInput[]): Promise<string | null> {
    if (!rules.length) return '按规则抽题需至少配置一条抽题规则';

    // 知识点传 0 表示不限，不参与存在性校验
    const kpIds = [...new Set(rules.map((r) => r.knowledgePointId).filter((id) => id > 0))];
    if (kpIds.length) {
      const kps = await this.prisma.knowledgePoint.findMany({
        where: { id: { in: kpIds } },
        select: { id: true },
      });
      if (kps.length !== kpIds.length) return '所选知识点中存在已被删除的项';
    }

    const avail = await this.ruleAvailability(bankIds, rules);
    const over = rules.findIndex((r, i) => r.drawCount > avail[i]);
    if (over >= 0) {
      return `第 ${over + 1} 条规则的抽取数量超过题库可用题量（可用 ${avail[over]} 题）`;
    }
    return null;
  }

  /**
   * 校验人员存在且可用（岗位练兵的参与人员、自主练习的开放人员共用）
   * @param refs 人员引用列表
   * @returns 错误文案；有效时返回 null
   */
  async validateParticipants(refs: ParticipantRef[]): Promise<string | null> {
    if (!refs.length) return null;
    return this.participantResolver.validateExist(refs);
  }

  /**
   * 校验练习时间：结束时间须晚于开始时间；开启自动结束时必须有结束时间
   * @param startTime 开始时间（可空）
   * @param endTime 结束时间（可空）
   * @param autoFinish 是否自动结束
   * @returns 错误文案；有效时返回 null
   */
  validateTimeRange(
    startTime?: string,
    endTime?: string,
    autoFinish?: boolean,
  ): string | null {
    if (startTime && endTime && new Date(endTime) <= new Date(startTime)) {
      return '结束时间必须晚于开始时间';
    }
    // 自动结束依赖结束时间做判定，没有结束时间则永远不会触发
    if (autoFinish && !endTime) {
      return '开启自动结束时必须设置练习结束时间';
    }
    return null;
  }
}
