/**
 * 富文本辅助工具
 *
 * 题干、选项、答案解析、评分标准支持富文本后，凡是「按纯文本展示」的场景
 * （表格单元格、tooltip、Excel 导出、字数统计）都要先剥离 HTML，
 * 否则界面上会直接出现 <p>、<img> 之类的标签。
 */

/**
 * 是否含真正的 HTML 标签
 *
 * 只按「已知标签名」匹配，不能简单判断有没有 `<`。历史纯文本里的数学写法
 * （`若 a<b，则…`、`温度 <b 时`）交给 DOMParser 会被当成未闭合标签，
 * 从 `<` 起的内容全部被吞掉且不报错——题库里这类内容不算少见。
 *
 * 标签名取编辑器实际会产出的集合；`<y 且 y>` 这种「像标签」的数学表达式
 * 因 y 不在集合内而被正确当作纯文本。
 */
const HTML_TAG_REGEX =
  /<\/?(?:p|br|div|span|strong|b|em|i|u|s|del|ins|sub|sup|code|pre|blockquote|h[1-6]|ul|ol|li|table|thead|tbody|tr|td|th|img|a|hr|figure|figcaption)(?:\s[^<>]*)?\/?>/i

/**
 * 剥离 HTML 标签，取纯文本
 *
 * 用 DOMParser 而非 innerHTML 赋值：innerHTML 虽不执行 <script>，但会触发
 * <img onerror> 之类的副作用（浏览器会真的去加载资源）。DOMParser 解析出的
 * 文档是游离的，不会发起请求、不会执行事件。
 *
 * @param html 富文本 HTML（也接受纯文本，此时仅归一化空白后返回）
 * @returns 归一化空白后的纯文本
 */
export function stripHtml(html?: string | null): string {
  if (!html) return ''
  // 不像 HTML 就按纯文本处理，绕开 DOMParser 的吞字问题（见 HTML_TAG_REGEX 注释）
  if (!HTML_TAG_REGEX.test(html)) return html.replace(/\s+/g, ' ').trim()

  const doc = new DOMParser().parseFromString(html, 'text/html')
  // 块级标签与表格单元格之间补空格，避免「第一段末尾第二段开头」被粘成一个词
  doc.body
    .querySelectorAll('p, div, li, tr, td, th, h1, h2, h3, h4, h5, h6, blockquote')
    .forEach((el) => el.append(' '))
  // br/hr 是空元素，不能塞子节点，只能在其后插入
  doc.body.querySelectorAll('br, hr').forEach((el) => el.after(' '))
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim()
}

/**
 * 富文本是否为空
 *
 * Tiptap 空内容会产出 `<p></p>`，直接判空串会漏掉这种情况，
 * 导致「看起来是空的但通过了必填校验」。
 *
 * @param html 富文本 HTML
 */
export function isRichTextEmpty(html?: string | null): boolean {
  if (!html) return true
  // 含图片时即便无文字也算有内容——纯图片题干是合法的
  if (/<img\b/i.test(html)) return false
  return stripHtml(html).length === 0
}
