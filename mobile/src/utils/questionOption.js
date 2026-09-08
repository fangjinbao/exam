/**
 * 文件名称：utils/questionOption.js - 题目选项解析
 *
 * 功能描述：
 *   把考试取卷接口下发的选项原文解析为 QuestionCard 需要的 { key, value } 列表。
 *
 * 存在原因：
 *   两个取卷接口给前端的形状不一致，而 QuestionCard 是两页共用的、只认解析后的形状：
 *   - 练习（app-practice.service）：服务端调 parseQuestionOptions 解析成 [{key, value}]，
 *     题干字段映射为 content 后下发；
 *   - 考试（app-exam.service）：题干字段是 stem；选项只经 parseOptions 按换行切成
 *     string[]，未拆出 key/value。
 *   故考试页需在接入处补齐这两处差异。
 *
 * 解析规则与服务端 common/utils/question-option.util.ts 保持一致，改动须同步两侧。
 */

/** 无选项的题型（与服务端 NO_OPTION_TYPES 一致） */
const NO_OPTION_TYPES = new Set(['blank', 'qa', 'essay', 'composite'])

/**
 * 尝试按新的 JSON 数组格式解析选项
 *
 * 新格式形如 `[{ "key": "A", "value": "<p>选项内容</p>" }]`。
 * key 缺失就无法与答案比对，视为格式不符整体回退旧格式。
 *
 * @param {string} raw - 选项原文
 * @returns {Array<{key: string, value: string}>|null} 成功返回列表，不符返回 null
 */
function tryParseJsonOptions(raw) {
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null

    const result = []
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) return null
      const { key, value } = item
      if (typeof key !== 'string' || key.length === 0) return null
      result.push({ key, value: typeof value === 'string' ? value : '' })
    }
    return result
  } catch {
    return null
  }
}

/**
 * 按旧的「一行一个」纯文本格式解析选项（存量数据）
 *
 * 两类题型存法不同，必须分开处理，否则 key 取不到、作答无法与答案比对：
 * - 选择题带字母前缀（"A. 文本"），答案存字母，故 key 取字母、value 取其后文本；
 * - 判断题无前缀（"正确\n错误"），答案直接存文本，故 key 与 value 同为该行文本。
 *
 * 前缀分隔符宽容处理（"A. " / "A." / "A、" / "A）" 等均可），
 * 避免题库导入时的标点差异导致 key 丢失；前缀缺失的行按判断题口径回退，不抛错。
 *
 * @param {string} raw - 选项原文
 * @param {string} type - 题型 value
 * @returns {Array<{key: string, value: string}>} 选项列表
 */
function parseLegacyOptions(raw, type) {
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (type === 'judge') {
    return lines.map((line) => ({ key: line, value: line }))
  }

  return lines.map((line) => {
    const matched = /^([A-Za-z])\s*[.、．)）:：]\s*(.*)$/.exec(line)
    if (!matched) return { key: line, value: line }
    return { key: matched[1].toUpperCase(), value: matched[2].trim() }
  })
}

/**
 * 把选项原文解析为 { key, value } 列表
 *
 * 需要同时应付三种入参形态，因为两个接口下发的形状不同：
 * 1. `[{key, value}]` 对象数组 —— 练习接口已在服务端解析好，原样透传；
 * 2. `string[]` 字符串数组 —— 考试接口的 parseOptions 只按换行切了行、
 *    没有拆出 key/value（形如 `["A. 北京", "B. 上海"]`），须逐行解析；
 * 3. `string` 原始整段文本 —— 直接从库中取出的形态。
 *
 * 判别按元素形状而非「是不是数组」：只看 Array.isArray 会把上面第 2 种
 * 当成已解析结果放过去，那样 option.key 全是 undefined，选项只剩一个「.」。
 *
 * 整段文本走 JSON / 旧格式双读，按首个非空字符是否为 `[` 判别。判别必须带回退：
 * 历史脏数据可能有 `[A] 选项内容` 这类方括号前缀（Word/Excel 粘贴常见），
 * 误判成 JSON 后解析会失败，那样单题脏数据就会让整份卷子的选项全空。
 *
 * @param {string|Array|null} raw - 选项原文，三种形态见上
 * @param {string} type - 题型 value
 * @returns {Array<{key: string, value: string}>} 选项列表，无选项题型返回空数组
 */
export function parseQuestionOptions(raw, type) {
  if (Array.isArray(raw)) {
    // 对象数组：练习接口已解析，透传
    if (raw.every((item) => item !== null && typeof item === 'object')) return raw
    // 字符串数组：考试接口只切了行，拼回整段后按下方旧格式规则解析
    raw = raw.join('\n')
  }

  if (!raw || typeof raw !== 'string' || NO_OPTION_TYPES.has(type)) return []

  const trimmed = raw.trim()
  if (trimmed.startsWith('[')) {
    const parsed = tryParseJsonOptions(trimmed)
    if (parsed) return parsed
  }

  return parseLegacyOptions(raw, type)
}

/**
 * 归一化考试取卷接口下发的单道题
 *
 * 考试接口下发 stem + 选项原文，而 QuestionCard 读 content + 解析后的选项数组
 * （练习接口在服务端已按这个形状下发）。此处补齐差异，让两页共用同一个组件。
 *
 * @param {Object} question - 接口下发的题目对象
 * @returns {Object} 归一化后的题目对象
 */
export function normalizeQuestion(question) {
  return {
    ...question,
    // 兼容两种字段名：考试接口给 stem，练习接口给 content
    content: question.content ?? question.stem ?? '',
    options: parseQuestionOptions(question.options, question.type)
  }
}
