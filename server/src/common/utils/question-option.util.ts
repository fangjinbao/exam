import { sanitizeRichText } from './rich-text.util';

/** 前端渲染选项所需的结构：key 参与作答比对，value 用于展示（可含富文本 HTML） */
export interface QuestionOption {
  key: string;
  value: string;
}

/**
 * 无选项的题型（取自字典 question_type：blank 填空 / qa 问答 / essay 论述 /
 * composite 材料题——材料题只存共享材料，作答位由其下小题产生）
 *
 * 注意题型值以字典为准，不是直觉的 fill/short——移动端 constants/exam.js
 * 里的 FILL: 'fill' 与字典不符，属既有缺陷。
 */
const NO_OPTION_TYPES = new Set(['blank', 'qa', 'essay', 'composite']);

/**
 * 判断题选项固定为纯文本，不启用富文本
 *
 * 因为判断题的 answer 直接存选项文本（"正确"/"错误"），选项若变成
 * `<p>正确</p>` 就与 answer 对不上、判分全错。要给判断题配图请放题干。
 */
export const JUDGE_OPTIONS_PLAIN = true;

/**
 * 把库中存储的选项原文解析为 { key, value } 列表（新旧两种格式双读）
 *
 * 选项支持富文本后，「一行一个」的纯文本存法失效了——HTML 里换行无意义，
 * `A. ` 前缀也没法靠正则从标签中间抠出来。故新格式改存 JSON 数组：
 *   `[{ "key": "A", "value": "<p>选项内容</p>" }]`
 *
 * 存量数据不做强制迁移，本函数按首个非空字符是否为 `[` 判别走哪条路径。
 * 判别必须带 try/catch 回退：历史脏数据可能有 `[A] 选项内容` 这类方括号前缀
 * （Word/Excel 粘贴常见，现有正则不认它），误判成 JSON 后 JSON.parse 会抛错，
 * 那样单题脏数据就会让整份取卷失败——与本文件既有的容错取向相悖。
 *
 * 旧格式（下方 parseLegacyOptions）保持原样：两类题型存法不同，必须分开处理，
 * 否则 key 取不到、作答无法与 answer 比对：
 * - 选择题（single/multiple）带字母前缀，形如 "A. 文本"，answer 存字母（"B" / "A,B,C"），
 *   故 key 取字母、value 取其后的文本；
 * - 判断题（judge）无前缀，形如 "正确\n错误"，answer 直接存文本（"错误"），
 *   故 key 与 value 同为该行文本。
 *
 * 前缀分隔符宽容处理（"A. " / "A." / "A、" / "A）"等均可），避免题库导入
 * 时的标点差异导致选项 key 丢失。前缀缺失的行按判断题口径回退，不抛错——
 * 练习与考试都不应因单题脏数据整份取卷失败。
 *
 * @param raw 库中存储的 options 原文，无选项题型为 null
 * @param type 题型 value（single/multiple/judge/fill/short 等）
 * @returns 选项列表，无选项题型返回空数组
 */
export function parseQuestionOptions(raw: string | null, type: string): QuestionOption[] {
  if (!raw || NO_OPTION_TYPES.has(type)) return [];

  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    const parsed = tryParseJsonOptions(trimmed);
    // 解析失败（脏数据恰好以 [ 开头）时落回旧格式，不抛错
    if (parsed) return parsed;
  }

  return parseLegacyOptions(raw, type);
}

/**
 * 尝试按新的 JSON 数组格式解析选项
 * @returns 成功返回选项列表；格式不符或解析失败返回 null，由调用方回退
 */
function tryParseJsonOptions(raw: string): QuestionOption[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const result: QuestionOption[] = [];
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) return null;
      const { key, value } = item as Record<string, unknown>;
      // key 缺失就无法与 answer 比对，视为格式不符整体回退
      if (typeof key !== 'string' || key.length === 0) return null;
      result.push({ key, value: typeof value === 'string' ? value : '' });
    }
    return result;
  } catch {
    return null;
  }
}

/** 按旧的「一行一个」纯文本格式解析选项（存量数据） */
function parseLegacyOptions(raw: string, type: string): QuestionOption[] {
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  // 判断题按整行文本作为 key，与 answer 的存法保持一致
  if (type === 'judge') {
    return lines.map((line) => ({ key: line, value: line }));
  }

  return lines.map((line) => {
    // 匹配行首的单个字母序号及其后的分隔符
    const matched = /^([A-Za-z])\s*[.、．)）:：]\s*(.*)$/.exec(line);
    if (!matched) return { key: line, value: line };
    return { key: matched[1].toUpperCase(), value: matched[2].trim() };
  });
}

/**
 * 把选项列表序列化为入库格式
 *
 * 选择题写新的 JSON 数组格式（value 可含富文本）；判断题仍写旧的换行纯文本，
 * 因为它的 answer 直接存选项文本，改格式会打断判分比对（见 JUDGE_OPTIONS_PLAIN）。
 *
 * @param options 选项列表
 * @param type 题型 value
 * @returns 入库字符串；无选项题型或空列表返回 null
 */
export function serializeQuestionOptions(
  options: QuestionOption[],
  type: string,
): string | null {
  if (NO_OPTION_TYPES.has(type) || options.length === 0) return null;

  if (type === 'judge') {
    // 判断题：key 与 value 同为该行文本，取 key 保证与 answer 口径一致
    return options.map((o) => o.key).join('\n');
  }

  return JSON.stringify(options.map((o) => ({ key: o.key, value: o.value })));
}

/**
 * 净化选项原文中每个选项的富文本 value，再按原题型序列化回入库格式
 *
 * 供题目写入路径统一调用。判断题不应走到这里（其选项须保持纯文本），
 * 调用方需自行排除；此处再兜一层，judge 直接原样返回。
 *
 * @param raw 库/请求中的 options 原文（新 JSON 或旧行格式均可）
 * @param type 题型 value
 * @returns 净化并序列化后的字符串；无选项题型返回 null
 */
export function sanitizeOptionsPayload(raw: string, type: string): string | null {
  if (type === 'judge') return raw;
  const parsed = parseQuestionOptions(raw, type);
  if (parsed.length === 0) return null;
  const cleaned = parsed.map((o) => ({ key: o.key, value: sanitizeRichText(o.value) }));
  return serializeQuestionOptions(cleaned, type);
}
