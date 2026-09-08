/**
 * 判断单个客观题是否正确（按题型区分比对策略，均忽略首尾空格与大小写）
 *
 * - multiple 多选：选项集合全等（无序，漏选/错选即错）
 * - blank 填空：按空位顺序逐空全等（有序，仅按换行拆分，不拆逗号避免误判）
 * - single/judge 及其他：整体严格相等
 *
 * 从管理端 GradingService.judgeObjective 抽出为公共工具，供考试判分与
 * 练习即时判分共用——两处必须同口径，否则同一道题在练习判对、考试判错。
 * 主观题（qa/essay）不适用本函数，需人工或 AI 阅卷。
 *
 * @param candidate 考生作答
 * @param standard 标准答案
 * @param type 题型（字典 question_type 的 value）
 * @returns 是否答对；标准答案为空时一律判错
 */
export function judgeObjective(
  candidate: string | null,
  standard: string | null,
  type?: string,
): boolean {
  const norm = (s: string) => s.trim().toLowerCase();
  const cand = (candidate ?? '').trim();
  const std = (standard ?? '').trim();
  if (!std) return false;

  if (type === 'multiple') {
    // 多选：无序集合比对（选项分隔符 , ; 、 ， ； 或换行）
    const toSet = (s: string) =>
      s
        .split(/[,;\n、，；]/)
        .map((x) => norm(x))
        .filter((x) => x.length > 0)
        .sort();
    const candArr = toSet(cand);
    const stdArr = toSet(std);
    if (candArr.length !== stdArr.length) return false;
    return candArr.every((v, i) => v === stdArr[i]);
  }

  if (type === 'blank') {
    // 填空：有序逐空比对（仅按换行拆分，保留每空原文顺序，不排序、不按逗号拆）
    const toSeq = (s: string) => s.split('\n').map((x) => norm(x));
    const candSeq = toSeq(cand);
    const stdSeq = toSeq(std);
    if (candSeq.length !== stdSeq.length) return false;
    return candSeq.every((v, i) => v === stdSeq[i]);
  }

  // single / judge / 其他：整体严格相等
  return norm(cand) === norm(std);
}

/**
 * 填空题题干的空位标记：连续 3 个及以上下划线
 *
 * 与判分放在同一文件是刻意的：上面 type === 'blank' 的分支按 \n 逐空比对、
 * 段数不等直接判错，而段数取决于题干数出几个空。
 * 两者一旦各自实现就会漂移，考生填的空数与判分期望的段数不等，整题莫名判错。
 */
const BLANK_MARKER_REGEX = /_{3,}/g;

/**
 * 数题干里的空位数量
 *
 * 输入用题干原文（含富文本标签），与建题校验侧保持一致的输入口径——
 * 剥标签后再数会让「下划线中间被标签打断」的题算出不同的数。
 *
 * @param stem 题干原文
 * @returns 空位数量
 */
export function countStemBlanks(stem: string): number {
  return (String(stem ?? '').match(BLANK_MARKER_REGEX) || []).length;
}

/** 需人工或 AI 阅卷的主观题型（练习不即时判分） */
export const SUBJECTIVE_TYPES = new Set(['qa', 'essay']);

/**
 * 该题型是否为可自动判分的客观题
 * @param type 题型（字典 question_type 的 value）
 */
export function isObjectiveType(type: string): boolean {
  return !SUBJECTIVE_TYPES.has(type);
}
