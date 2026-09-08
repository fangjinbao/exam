/**
 * 证书渲染：把模板快照 + 证书自身数据合成前端可直接按坐标摆放的元素数组
 *
 * 抽出来是因为有多个入口要渲染同一张证书（考生端证书详情、交卷结果页的证书小样、
 * 后续的 PDF 套打）。各自实现一遍会漂移：同一张证书在不同页面长得不一样。
 * 版式语义（占位符取值、字段兜底、元素过滤）只在此处定义一次。
 */

/** 画布像素基准：A4 按 2px/mm，与管理端设计器 CANVAS_SIZE 一致，改一边就会错位 */
const CANVAS_SIZE = {
  /** 1 = A4 横版 */
  1: { width: 594, height: 420 },
  /** 2 = A4 竖版 */
  2: { width: 420, height: 594 },
} as const;

/** 渲染后的版式元素（前端只按坐标摆放，不需要理解字段语义） */
export interface CertRenderElement {
  type: 'text' | 'seal';
  x: number;
  y: number;
  width: number;
  fontSize: number;
  color: string;
  bold: boolean;
  underline: boolean;
  align: 'left' | 'center' | 'right';
  text: string;
}

/**
 * 占位符取值表：证书自身的动态数据
 *
 * 带索引签名是因为 fieldKey 来自设计器、运行时才知道，需按字符串键取值；
 * 具名字段仍保留，漏传会在编译期报错。
 */
export interface CertFieldValues {
  [key: string]: string;
  certTitle: string;
  issuingOrg: string;
  candidateName: string;
  certNo: string;
  projectName: string;
  issueDate: string;
  expireDate: string;
}

/**
 * 按尺寸取画布像素尺寸
 *
 * @param size 1=A4横版 2=A4竖版
 */
export function resolveCanvas(size: number): { width: number; height: number } {
  return size === 1 ? CANVAS_SIZE[1] : CANVAS_SIZE[2];
}

/**
 * 解析版式 JSON，把 field 占位符替换为真实值
 *
 * 占位符取值在服务端完成：前端只按坐标渲染文字，不必重复实现一遍字段语义。
 * content 是设计器写入的自由 JSON，可能残缺或非法，解析失败一律回退空数组——
 * 版式坏掉不该让整个证书打不开，前端拿到空数组会退化成纯文字卡片。
 *
 * @param content 版式 JSON 字符串（取自证书快照）
 * @param values 占位符字段取值表
 */
export function buildCertElements(
  content: string | null | undefined,
  values: CertFieldValues,
): CertRenderElement[] {
  if (!content) return [];

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  if (!parsed || !Array.isArray(parsed.elements)) return [];

  return parsed.elements
    .filter((el: any) => el && typeof el === 'object')
    .map((el: any): CertRenderElement => {
      // field 取占位符值，text 取静态文案；seal 不渲染文字
      let text = '';
      if (el.type === 'field') {
        text = values[el.fieldKey] ?? '';
      } else if (el.type === 'text') {
        text = typeof el.text === 'string' ? el.text : '';
      }

      return {
        // field 已在服务端填好值，对前端而言与静态文本无差别，统一成 text
        type: el.type === 'seal' ? 'seal' : 'text',
        x: Number(el.x) || 0,
        y: Number(el.y) || 0,
        width: Number(el.width) || 0,
        fontSize: Number(el.fontSize) || 14,
        color: typeof el.color === 'string' ? el.color : '#000000',
        bold: !!el.bold,
        underline: !!el.underline,
        align: ['left', 'center', 'right'].includes(el.align) ? el.align : 'center',
        text,
      };
    })
    // 印章要图才有意义；文字元素空串不占位，一律剔掉减少前端空节点
    .filter((el: CertRenderElement) => el.type === 'seal' || el.text !== '');
}
