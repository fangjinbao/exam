import type { PrismaService } from '@/common/prisma.service';

/** 展开后的一个作答位 */
export interface ExpandedSlot {
  /** 实际作答的题目 id（独立题为自身，材料题下的小题为小题 id） */
  questionId: number;
  /** 所属材料题 id；独立题为 null。用于答题卡分组与材料展示 */
  parentId: number | null;
  /** 标准答案快照（材料题小题取小题自己的答案） */
  answer: string;
  /** 该作答位的分值 */
  score: number;
}

/**
 * 把「抽中的根节点 id 列表」展开为实际的作答位列表
 *
 * 材料题（type=composite）本身不可作答——它只承载共享材料，答案与选项都为空。
 * 若直接拿材料题 id 建答题记录，会得到一条永远判不了分的空记录，
 * 而该材料题的小题完全不会出现在卷里。故取卷时必须在此展开。
 *
 * 顺序保证：按传入的根节点顺序排列，材料题的小题紧随其后按 sortNo 升序，
 * 这样答题卡与卷面顺序才与组卷时一致。
 *
 * @param prisma Prisma 实例
 * @param rootIds 抽中的根节点 id（独立题或材料题），顺序即卷面顺序
 * @returns 展开后的作答位列表；材料题若没有任何小题则被跳过（不产生作答位）
 */
export async function expandCompositeSlots(
  prisma: PrismaService,
  rootIds: number[],
): Promise<ExpandedSlot[]> {
  if (rootIds.length === 0) return [];

  const roots = await prisma.question.findMany({
    where: { id: { in: rootIds } },
    select: {
      id: true,
      type: true,
      answer: true,
      suggestedScore: true,
      children: {
        select: { id: true, answer: true, suggestedScore: true },
        orderBy: { sortNo: 'asc' },
      },
    },
  });
  const byId = new Map(roots.map((r) => [r.id, r]));

  const slots: ExpandedSlot[] = [];
  for (const rootId of rootIds) {
    const root = byId.get(rootId);
    // 题目可能已被删除，静默跳过而不是整份取卷失败
    if (!root) continue;

    if (root.type === 'composite') {
      for (const child of root.children) {
        slots.push({
          questionId: child.id,
          parentId: root.id,
          answer: child.answer ?? '',
          score: child.suggestedScore,
        });
      }
      continue;
    }

    slots.push({
      questionId: root.id,
      parentId: null,
      answer: root.answer ?? '',
      score: root.suggestedScore,
    });
  }
  return slots;
}

/**
 * 计算一批根节点展开后的实际题量
 *
 * 组卷/取卷时「抽 10 题」若含材料题，实际作答位会多于 10——材料题按 1 题计入抽取数量，
 * 展开后是它的 N 个小题。展示预估题量与计算试卷总分都需要展开后的数字。
 *
 * @param prisma Prisma 实例
 * @param rootIds 根节点 id 列表
 * @returns 展开后的作答位数量
 */
export async function countExpandedSlots(
  prisma: PrismaService,
  rootIds: number[],
): Promise<number> {
  const slots = await expandCompositeSlots(prisma, rootIds);
  return slots.length;
}
