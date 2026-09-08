// 用 import * as：项目 tsconfig 开了 allowSyntheticDefaultImports 但没开
// esModuleInterop，默认导入能过编译、运行时却拿到 undefined。
// 与 bcrypt / Handlebars 的既有导入风格一致。
import * as sanitizeHtml from 'sanitize-html';

/**
 * 富文本净化与纯文本提取
 *
 * 题干、选项、答案解析、评分标准支持富文本（含图片）后，必须在服务端净化：
 * 前端净化可被绕过（直接调接口），入库前净化是唯一可靠的关口。
 *
 * 净化点放在写入路径（题目新建/更新），入库即已干净，读取侧无需重复处理。
 */

/** 允许的标签：常规排版 + 表格 + 图片，不含任何可执行或可加载外部资源的标签 */
const ALLOWED_TAGS = [
  'p', 'br', 'div', 'span',
  'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup',
  'ul', 'ol', 'li',
  'blockquote', 'code', 'pre',
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'img',
  'h1', 'h2', 'h3', 'h4',
];

/**
 * 图片 src 白名单协议
 *
 * 只放本站上传目录与内联 data 图；不放 http/https，避免题干引用外站图片造成
 * 内容失效或外部追踪。svg 在上传接口已被扩展名白名单挡掉（可内嵌脚本）。
 */
const ALLOWED_IMG_SRC = /^(\/uploads\/|data:image\/(png|jpe?g|gif|webp);base64,)/i;

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    // style 只放宽到文本对齐与尺寸，由 allowedStyles 进一步限制取值
    '*': ['style'],
    img: ['src', 'alt', 'width', 'height'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
  },
  allowedStyles: {
    '*': {
      'text-align': [/^(left|right|center|justify)$/],
      width: [/^\d+(\.\d+)?(px|%|em|rem)$/],
      height: [/^\d+(\.\d+)?(px|%|em|rem)$/],
    },
  },
  // 不允许任何 URL 协议出现在 href 上——干脆不允许 a 标签（见 ALLOWED_TAGS）
  allowedSchemes: [],
  allowedSchemesByTag: { img: ['data'] },
  // 丢弃标签的同时丢弃其内容，避免 <script>alert(1)</script> 残留成可见文本
  nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript'],
  transformTags: {
    // 逐个校验 img src，不合白名单的整体丢弃（返回空标签名即移除）
    img: (tagName, attribs) => {
      const src = attribs.src ?? '';
      if (!ALLOWED_IMG_SRC.test(src)) {
        return { tagName: 'span', attribs: {}, text: '' };
      }
      return { tagName, attribs };
    },
  },
};

/**
 * 净化富文本 HTML，移除脚本、事件属性、外部资源与非白名单标签
 *
 * @param html 未净化的 HTML（前端富文本编辑器产出）
 * @returns 净化后的 HTML；入参为空返回空字符串
 */
export function sanitizeRichText(html: string | null | undefined): string {
  if (!html) return '';
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

/**
 * 提取纯文本：去掉所有标签并还原实体，用于搜索、Excel 导出、送 AI 的提示词
 *
 * AI 阅卷是按标点分词做关键词覆盖率（GradingService.heuristicScore），
 * 评分标准若带着标签送进去，标签名会被当成关键词导致评分虚高，必须先剥离。
 *
 * @param html 富文本 HTML（也接受纯文本，此时原样返回并归一空白）
 * @returns 归一化空白后的纯文本
 */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  // 块级标签转空格，避免「第一段末尾第二段开头」被粘成一个词
  const spaced = html.replace(/<\/(p|div|li|tr|h[1-4]|blockquote)>/gi, ' ');
  const stripped = sanitizeHtml(spaced, { allowedTags: [], allowedAttributes: {} });
  // sanitize-html 在无标签模式下会转义而不解码实体，此处还原成真实字符：
  // 搜索要能用 & 匹配到 &amp;，送 AI 的提示词也不该带实体码。
  // &amp; 放最后，避免把 &amp;lt; 提前解成 <。
  const decoded = stripped
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
  return decoded.replace(/\s+/g, ' ').trim();
}
