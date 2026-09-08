/**
 * 试卷结构工具：把扁平题目列表按题型分「大题」，供组卷页结构预览与纸质试卷预览复用。
 * 分组顺序按传入的题型字典 value 顺序（single/multiple/judge/blank/qa/essay），未知题型排末尾。
 */
import { stripHtml } from '@/utils/richText'

/** 中文大题序号（一、二、三…），超出用「第 N」兜底 */
const CN_NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二']

/**
 * 分值规整到两位小数，与服务端 round2 同口径
 *
 * 分值按最多两位小数存储，逐题累加会浮出二进制尾数（如 7.05 累出 7.050000000000001），
 * 直接插值就把这串暴露给用户。注意规整过的值再相加仍会出尾数
 * （1.05 + 1.1 得 2.1500000000000004），所以每一层求和后都要再规整一次。
 * @param value 待规整的分值
 * @returns 保留两位小数的分值
 */
export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** 取第 index（0 基）个中文序号 */
export function cnNumeral(index: number): string {
  return CN_NUMERALS[index] ?? `第${index + 1}`
}

/** 按题型分组后的一个「大题」 */
export interface PaperSection<T> {
  /** 题型字典 value */
  type: string
  /** 该题型题目数 */
  count: number
  /** 该题型合计分值 */
  totalScore: number
  /** 组内题目（保持原顺序） */
  items: T[]
}

/**
 * 把题目列表按题型分组为大题
 * @param items 题目列表
 * @param getType 取题型 value
 * @param getScore 取每题分值
 * @param typeOrder 题型 value 的期望顺序（通常为字典 value 顺序）；不在其中的题型排末尾
 */
export function groupByType<T>(
  items: T[],
  getType: (item: T) => string,
  getScore: (item: T) => number,
  typeOrder: string[]
): PaperSection<T>[] {
  const map = new Map<string, PaperSection<T>>()
  for (const item of items) {
    const type = getType(item) || ''
    let section = map.get(type)
    if (!section) {
      section = { type, count: 0, totalScore: 0, items: [] }
      map.set(type, section)
    }
    section.items.push(item)
    section.count += 1
    section.totalScore += getScore(item) || 0
  }
  // 累加完成后统一规整，避免卷面把浮点尾数暴露给用户
  for (const section of map.values()) {
    section.totalScore = round2(section.totalScore)
  }
  const orderIndex = (type: string) => {
    const i = typeOrder.indexOf(type)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  return [...map.values()].sort((a, b) => orderIndex(a.type) - orderIndex(b.type))
}

/**
 * 拆分选项原文为可直接展示的字符串数组
 *
 * 库里 options 有两种格式并存，与后端 `common/utils/question-option.util.ts` 口径一致：
 * - 新格式：JSON 数组 `[{"key":"A","value":"内容"}]`，题目管理页保存选择题小题时写入
 * - 旧格式：一行一个，`single/multiple` 存「A. 内容\nB. 内容」、`judge` 存「正确\n错误」
 *
 * 两种都要认：只按换行切会把 JSON 整串当成一个选项直出到卷面。
 * blank/qa 无选项，传空值返回空数组。
 *
 * @param options 选项原文（可空）
 * @returns 形如 `['A. 内容', 'B. 内容']` 的展示用数组
 */
export function splitOptions(options: string | null | undefined): string[] {
  if (!options) return []
  const trimmed = options.trim()
  if (trimmed.startsWith('[')) {
    const parsed = parseJsonOptions(trimmed)
    // 解析失败（脏数据恰好以 [ 开头）时落回按行切，不抛错
    if (parsed) return parsed
  }
  return trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

/**
 * 按 JSON 数组格式解析选项并拼成「A. 内容」
 * @returns 格式不符或解析失败返回 null，由调用方回退旧格式
 */
function parseJsonOptions(raw: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const result: string[] = []
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) return null
      const { key, value } = item as Record<string, unknown>
      if (typeof key !== 'string' || !key) return null
      const text = typeof value === 'string' ? stripHtml(value).trim() : ''
      // 判断题这类选项本身就是完整文本，没有 key 前缀的必要；有 key 才拼序号
      result.push(text ? `${key}. ${text}` : key)
    }
    return result
  } catch {
    return null
  }
}

/** 卷面预览用的一个选项：序号与富文本内容分开，便于序号用纯文本、内容用 v-html */
export interface RichOption {
  /** 选项序号（A/B/C…）；判断题这类无序号选项为空串 */
  key: string
  /** 选项内容的富文本 HTML（已由服务端净化，可安全 v-html） */
  html: string
}

/**
 * 拆分选项并保留富文本，供卷面预览渲染图文选项
 *
 * 与 splitOptions 的分工：splitOptions 走 stripHtml 产出纯文本，用于 Excel 导出
 * （单元格放不了图）与搜索；本函数保留 HTML，用于预览渲染。两者不可互换 ——
 * 预览用纯文本会把选项里的图片吃掉，导出用 HTML 会把标签写进单元格。
 *
 * 仅 JSON 格式的选项可能带富文本（富文本编辑器产出）。旧的按行存储格式是纯文本，
 * 原样返回即可，此时 key 留空、html 承载整行。
 *
 * @param options 选项原始值（JSON 数组字符串或按行分隔的纯文本）
 * @returns 选项列表；空值返回空数组
 */
export function splitOptionsRich(options: string | null | undefined): RichOption[] {
  if (!options) return []
  const trimmed = options.trim()
  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        const result: RichOption[] = []
        let valid = true
        for (const item of parsed) {
          if (typeof item !== 'object' || item === null) {
            valid = false
            break
          }
          const { key, value } = item as Record<string, unknown>
          if (typeof key !== 'string' || !key) {
            valid = false
            break
          }
          result.push({ key, html: typeof value === 'string' ? value : '' })
        }
        // 与 splitOptions 一致：格式不符时落回按行切，不抛错也不半途返回脏数据
        if (valid) return result
      }
    } catch {
      /* 解析失败落回按行切 */
    }
  }
  /*
    按行存的旧格式是纯文本，且写入路径归一成 JSON 之前的存量数据没走过服务端净化，
    直接交给 v-html 会把其中的 < 当标签解析（既可能错乱排版，也是个 XSS 口子）。
    这里转义成实体，让它以字面量渲染。
  */
  return trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ key: '', html: escapeHtml(line) }))
}

/** 转义纯文本中的 HTML 特殊字符，供只能走 v-html 的位置安全渲染字面量 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
