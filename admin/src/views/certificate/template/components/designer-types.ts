/**
 * 证书可视化设计器 — 共享类型与常量
 * content JSON 结构：{ elements: DesignerElement[] }，与后端 CertificateTemplate.content 一一对应
 */

/** 元素类型：静态文本 / 动态占位符字段 / 印章图片 */
export type ElementType = 'text' | 'field' | 'seal'

/** 文本对齐方式 */
export type TextAlign = 'left' | 'center' | 'right'

/** 单个排版元素（坐标 x/y 与宽度 width 均为画布内像素） */
export interface DesignerElement {
  /** 元素唯一 id */
  id: string
  /** 元素类型 */
  type: ElementType
  /** 左上角 X 坐标（画布内 px） */
  x: number
  /** 左上角 Y 坐标（画布内 px） */
  y: number
  /** 元素宽度（px） */
  width: number
  /** 字号（px；seal 类型表示图片显示宽度已由 width 决定，此项忽略） */
  fontSize: number
  /** 文字颜色 */
  color: string
  /** 是否加粗 */
  bold: boolean
  /** 是否显示底部下划线（填空横线，铺满元素宽度；seal 类型忽略） */
  underline: boolean
  /** 文本对齐 */
  align: TextAlign
  /** 静态文本内容（type=text 时使用） */
  text?: string
  /** 占位符字段键（type=field 时使用，见 FIELD_OPTIONS） */
  fieldKey?: string
  /**
   * 框宽是否跟随文字自动收放（新增元素默认开启）
   *
   * 关掉后 width 由人工掌控。之所以不做成一律自动：width 同时是 text-align 的
   * 参照系和下划线横线的长度，「姓名 ____」这类填空栏需要框比文字宽。
   * 手动改宽度即视为接管，自动收放随之关闭。
   */
  autoWidth?: boolean
}

/**
 * 元素最小宽度（px）
 *
 * 同时用于属性面板宽度输入的下限与自动贴合的底线，避免框被压成一条缝。
 * 两处必须一致，故收在此处共享。
 */
export const MIN_ELEMENT_WIDTH = 20

/**
 * 按文字实宽算出元素的新框宽与新 x（纯函数，便于单独验算）
 *
 * 规则：对齐方式决定改字时哪条边（或中点）保持不动 —— 左对齐锚左缘、
 * 右对齐锚右缘、居中锚中点。先把宽度夹到 [MIN_ELEMENT_WIDTH, 锚点侧可用空间]
 * 定案，再由锚点反推 x；**底线必须在算 x 之前生效**，否则 x 用的是兜底前的
 * 宽度，锚点会被顶偏（文字量出来比底线还窄时就会发生，未必靠近画布边界）。
 *
 * 放不下时压缩框宽让文字折行，而不是挪动元素 —— 因打字导致已摆好的元素
 * 自己跑位最反直觉。框可能因底线宽度略微溢出画布右缘：锚点恰好贴边时溢出
 * 达到上界 MIN_ELEMENT_WIDTH。这是刻意取舍，几像素溢出看得见拖得回，比元素
 * 跑位轻。该上界依赖入口处对 x/width 的归一化，脏数据不会把它撑破。
 *
 * @param el 当前元素的位置、宽度与对齐
 * @param measured 文字实测宽度（px）
 * @param canvasWidth 画布宽度（px）
 * @returns 新的 x 与 width，均为整数
 */
export function fitElementBox(
  el: Pick<DesignerElement, 'x' | 'width' | 'align'>,
  measured: number,
  canvasWidth: number
): { x: number; width: number } {
  /*
    先把输入归一化到画布量程内。下面三个分支的「可用空间」都隐含假设
    x/width 本身合法；若 x 为负（外部或历史 content JSON 直写，parseContent
    不做范围校验），canvasWidth - x 会算出一个很大的正数，它已不代表任何
    真实可用空间，fit 便失去钳制能力，框宽可远超画布。
  */
  const baseX = Math.min(Math.max(el.x, 0), canvasWidth)
  const baseWidth = Math.min(Math.max(el.width, MIN_ELEMENT_WIDTH), canvasWidth)

  const fit = (available: number) => Math.max(MIN_ELEMENT_WIDTH, Math.min(measured, available))
  let width: number
  let x: number
  if (el.align === 'right') {
    // 右缘不动：框最多向左长到画布左边界
    const right = Math.min(baseX + baseWidth, canvasWidth)
    width = fit(right)
    x = right - width
  } else if (el.align === 'center') {
    // 中点不动：框只能对称地向两侧长，故上限是到最近边界距离的两倍
    const center = baseX + baseWidth / 2
    width = fit(2 * Math.min(center, canvasWidth - center))
    x = Math.round(center - width / 2)
  } else {
    // 左缘不动：框最多向右长到画布右边界
    width = fit(canvasWidth - baseX)
    x = baseX
  }
  /*
    只纠正左缘真在画布外的破损状态（横竖版切换、或从「位置」输入框手填了
    越界值）。左缘在画布内就一律不动，哪怕框因底线宽度而溢出右缘。
  */
  if (x < 0) x = 0
  else if (x >= canvasWidth) x = Math.max(0, canvasWidth - width)
  return { x, width }
}

/** content JSON 顶层结构 */
export interface DesignerContent {
  elements: DesignerElement[]
}

/** 动态占位符字段定义：key 存入 content，label 展示，sample 用于预览渲染 */
export interface FieldOption {
  key: string
  label: string
  sample: string
}

/**
 * 可用占位符字段
 * certTitle / issuingOrg 取模板自身配置；其余为发证时按考生/认证项目填充的动态值。
 */
export const FIELD_OPTIONS: FieldOption[] = [
  { key: 'certTitle', label: '证书标题', sample: '安全生产合格证书' },
  { key: 'issuingOrg', label: '颁发机构', sample: '某某认证中心' },
  { key: 'candidateName', label: '考生姓名', sample: '张三' },
  { key: 'certNo', label: '证书编号', sample: '2026-0001' },
  { key: 'projectName', label: '认证项目', sample: '安全生产资格认证' },
  { key: 'issueDate', label: '颁发日期', sample: '2026-07-20' },
  { key: 'expireDate', label: '有效期至', sample: '2029-07-20' }
]

/** 按 key 取字段定义 */
export function getFieldOption(key?: string): FieldOption | undefined {
  return FIELD_OPTIONS.find((f) => f.key === key)
}

/**
 * A4 画布像素尺寸（2px/mm）
 * 竖版 210×297mm → 420×594；横版 297×210mm → 594×420
 */
export const CANVAS_SIZE = {
  /** size=1 横版 */
  1: { width: 594, height: 420 },
  /** size=2 竖版 */
  2: { width: 420, height: 594 }
} as const

/** 生成元素 id（时间戳 + 随机后缀，避免同批次碰撞） */
export function genElementId(): string {
  return `el_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

/** 解析 content JSON 字符串为元素数组，失败返回空 */
export function parseContent(content?: string | null): DesignerElement[] {
  if (!content) return []
  try {
    const parsed = JSON.parse(content) as DesignerContent
    if (!Array.isArray(parsed?.elements)) return []
    // 兼容旧模板：补齐新增的 underline 字段，避免开关状态与类型不一致
    return parsed.elements.map((el) => ({ ...el, underline: el.underline ?? false }))
  } catch {
    return []
  }
}

/** 序列化元素数组为 content JSON 字符串 */
export function stringifyContent(elements: DesignerElement[]): string {
  return JSON.stringify({ elements } as DesignerContent)
}
