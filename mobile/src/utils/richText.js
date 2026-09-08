/**
 * 文件名称：utils/richText.js - 富文本辅助
 *
 * 功能描述：
 *   题干、选项、解析支持富文本后，列表卡片这类「只需摘要」的场景要剥离 HTML，
 *   否则界面上会直接出现 <p>、<img> 标签。作答页仍按 HTML 渲染完整内容。
 *
 * 使用方式：
 *   import { stripHtml } from '@/utils/richText'
 *   stripHtml('<p>甲醇<strong>易燃</strong></p>')  // '甲醇易燃'
 */

/**
 * 剥离 HTML 标签，取纯文本
 *
 * 用 DOMParser 而非给元素赋 innerHTML：innerHTML 虽不执行 <script>，
 * 但会触发 <img onerror> 之类的副作用（浏览器会真的去请求资源）。
 * DOMParser 解析出的文档是游离的，不发请求、不执行事件。
 *
 * @param {string|null|undefined} html - 富文本 HTML（也接受纯文本）
 * @returns {string} 归一化空白后的纯文本
 */
export function stripHtml(html) {
  if (!html) return ''
  // 不含尖括号时视为纯文本，省掉一次解析
  if (!html.includes('<')) return html.trim()

  const doc = new DOMParser().parseFromString(html, 'text/html')
  // 块级标签之间补空格，避免「上一段末尾下一段开头」被粘成一个词
  doc.body.querySelectorAll('p, div, li, tr, h1, h2, h3, h4, blockquote').forEach((el) => {
    el.append(' ')
  })
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim()
}

/**
 * 生成纯文本摘要（用于列表卡片）
 *
 * @param {string|null|undefined} html - 富文本 HTML
 * @param {number} [max=120] - 最大字符数，超出以省略号收尾
 * @returns {string} 摘要文本
 */
export function richTextSummary(html, max = 120) {
  const text = stripHtml(html)
  // 无文字但有图片时给出可读占位，避免卡片出现空白行（纯图片题干是合法的）
  if (!text) return /<img\b/i.test(html || '') ? '[图片题]' : ''
  return text.length > max ? `${text.slice(0, max)}…` : text
}
