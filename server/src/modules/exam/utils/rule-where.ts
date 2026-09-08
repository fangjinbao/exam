import type { Prisma } from '@prisma/client';

/** 抽题规则中参与筛选的三个维度 */
export interface RuleFilter {
  questionType: string;
  /** 空串表示不限难度 */
  difficulty: string;
  /** 0 表示不限知识点 */
  knowledgePointId: number;
}

/**
 * 由抽题规则拼出题目筛选条件（正式状态 + 指定题库范围）。
 *
 * 注意：实现「考生开考时按规则抽题」时，多条规则必须共享一个已抽题目集合、
 * 逐条抽取时排除已抽中的 ID——同一道题不允许进同一份卷两次。
 * 校验侧见 PaperService.findRuleShortage（逐条 + 全集去重 + 同题型两两），
 * 它是可行性的必要条件而非充分条件：三条以上规则「两两不冲突但合起来冲突」仍会漏判。
 *
 * 难度传空串、知识点传 0 时视为「不限」，对应条件整体省略而不是拿空值去比对：
 * - `difficulty: ''` 会被当成「难度等于空串」，匹配不到任何题；
 * - `knowledgePoints: { some: { knowledgePointId: 0 } }` 同样匹配不到，
 *   而写成 `some: {}` 又会退化成「至少挂了一个知识点」，把未挂知识点的题排除在外。
 */
/**
 * 只取根节点（独立题与材料题），排除挂在材料题下的小题
 *
 * 判别准则是**查询意图**，不是所在文件：
 * - 「从题池挑新题」的查询必须并入本片段，漏了小题会以独立题身份进卷；
 * - 「回查已有作答记录对应的题目」（错题本、练习复盘）**绝不能**并入——
 *   那里的 questionId 来自 AnswerItem / PracticeAnswer，按设计本就是小题 id，
 *   加了会把所有材料题小题的记录过滤掉，错题本对材料题彻底失效。
 */
export const ROOT_ONLY = { parentId: null } as const;

/**
 * 按权重把一条规则的抽取数量拆分到各题库（最大余数法）。
 *
 * 合计必须严格等于 total：少一题会让实际满分低于 Paper.totalScore，
 * 而及格线仍按原总分判定，成绩就失真了。所以先按权重向下取整，
 * 再把余下的题按小数部分从大到小依次补 1，凑满为止。
 *
 * 权重全为 0 或缺失时退化为均分——存量试卷没有权重字段，
 * 不能因此抽不出题。
 *
 * @example 6 题、两库各 0.5 → 各 3 题
 * @example 7 题、两库各 0.5 → 4 题 + 3 题（小数部分相同时靠前的库先补）
 */
export function allocateByWeight(
  banks: Array<{ bankId: number; weight?: number | null }>,
  total: number,
): Array<{ bankId: number; quota: number }> {
  if (banks.length === 0 || total <= 0) return [];

  const weights = banks.map((b) => (typeof b.weight === 'number' && b.weight > 0 ? b.weight : 0));
  const sum = weights.reduce((a, b) => a + b, 0);
  // 无有效权重时均分，保证存量数据仍可组卷
  const normalized = sum > 0 ? weights.map((w) => w / sum) : banks.map(() => 1 / banks.length);

  const exact = normalized.map((w) => w * total);
  const quotas = exact.map((v) => Math.floor(v));
  let remain = total - quotas.reduce((a, b) => a + b, 0);

  // 余数按小数部分降序补；同值时下标小的先拿，结果可预期
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; remain > 0; k = (k + 1) % order.length) {
    quotas[order[k].i] += 1;
    remain -= 1;
  }

  return banks.map((b, i) => ({ bankId: b.bankId, quota: quotas[i] }));
}

/**
 * 从数组里随机取 n 个（Fisher-Yates 部分洗牌）。
 *
 * 不用 `sort(() => Math.random() - 0.5)`：那不是均匀洗牌，
 * V8 的排序实现会让结果明显偏向原顺序，抽题会反复抽到同一批题。
 */
export function pickRandom<T>(list: T[], n: number): T[] {
  const arr = [...list];
  const take = Math.min(n, arr.length);
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(Math.random() * (arr.length - i));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, take);
}

export function buildRuleWhere(bankIds: number[], rule: RuleFilter): Prisma.QuestionWhereInput {
  const where: Prisma.QuestionWhereInput = {
    questionBankId: { in: bankIds },
    type: rule.questionType,
    status: 'formal',
    // 抽题一律只认根节点
    ...ROOT_ONLY,
  };
  if (rule.difficulty) where.difficulty = rule.difficulty;
  if (rule.knowledgePointId > 0) {
    where.knowledgePoints = { some: { knowledgePointId: rule.knowledgePointId } };
  }
  return where;
}
