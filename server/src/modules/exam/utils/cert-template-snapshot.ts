/**
 * 证书模板快照
 *
 * 已下发的证书必须定格在发证那一刻：模板日后被改版、改标题、换底图或调整版式，
 * 都不能回溯改写已经发到考生手上的证书 —— 证书是凭据，凭据不能事后变形。
 *
 * 因此发证时把模板中参与渲染的字段整份存进 Certificate.templateSnapshot，
 * 读取时一律以快照为准。与 Certificate.candidateName「发证时冗余留存」是同一条原则。
 *
 * 只冻结模板侧字段：姓名、编号、日期等动态值本就存在证书自身记录上，天然不可变。
 */
export interface CertTemplateSnapshot {
  /** 证书标题 */
  title: string;
  /** 颁发机构名称 */
  issuingOrg: string;
  /** 证书说明文案 */
  description: string | null;
  /** 证书尺寸 1=A4横版 2=A4竖版 */
  size: number;
  /** 底图 URL */
  backgroundImage: string | null;
  /** 印章图片 URL */
  sealImage: string | null;
  /** 版式 JSON 字符串（设计器写入的 {elements:[...]}）*/
  content: string | null;
}

/** 发证时需要从 CertificateTemplate 读取的字段（与快照字段一一对应） */
export const CERT_TEMPLATE_SNAPSHOT_SELECT = {
  title: true,
  issuingOrg: true,
  description: true,
  size: true,
  backgroundImage: true,
  sealImage: true,
  content: true,
} as const;

/** 快照来源：模板表里对应的那几列 */
type SnapshotSource = {
  title?: string | null;
  issuingOrg?: string | null;
  description?: string | null;
  size?: number | null;
  backgroundImage?: string | null;
  sealImage?: string | null;
  content?: string | null;
};

/**
 * 把模板字段收成快照 JSON 字符串，供发证时写入 Certificate.templateSnapshot
 *
 * @param tpl 模板表读出的字段
 * @returns 快照 JSON 字符串
 */
export function buildCertTemplateSnapshot(tpl: SnapshotSource): string {
  const snapshot: CertTemplateSnapshot = {
    title: tpl.title ?? '',
    issuingOrg: tpl.issuingOrg ?? '',
    description: tpl.description ?? null,
    size: tpl.size === 1 ? 1 : 2,
    backgroundImage: tpl.backgroundImage ?? null,
    sealImage: tpl.sealImage ?? null,
    content: tpl.content ?? null,
  };
  return JSON.stringify(snapshot);
}

/**
 * 读取证书应当使用的模板数据：优先快照，缺失时回退到模板当前值
 *
 * 回退是为了兼容本功能上线前已发出的存量证书（那时没有快照列）。这些证书仍会
 * 随模板改动而变，属于既有事实，无法追溯补正；新发的证书都带快照，不受影响。
 * 快照 JSON 解析失败时同样回退，避免脏数据导致证书整个打不开。
 *
 * @param snapshot Certificate.templateSnapshot 原始字符串
 * @param liveTemplate 联表读到的模板当前值，用作回退
 * @returns 渲染证书所需的模板字段
 */
export function resolveCertTemplate(
  snapshot: string | null | undefined,
  liveTemplate: SnapshotSource | null | undefined,
): CertTemplateSnapshot {
  if (snapshot) {
    try {
      const parsed = JSON.parse(snapshot) as CertTemplateSnapshot;
      // 只认对象；数组或标量说明存的不是快照结构
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return {
          title: parsed.title ?? '',
          issuingOrg: parsed.issuingOrg ?? '',
          description: parsed.description ?? null,
          size: parsed.size === 1 ? 1 : 2,
          backgroundImage: parsed.backgroundImage ?? null,
          sealImage: parsed.sealImage ?? null,
          content: parsed.content ?? null,
        };
      }
    } catch {
      // 落到下面的回退
    }
  }
  return buildFallback(liveTemplate);
}

/** 快照缺失或非法时，按模板当前值兜底 */
function buildFallback(tpl: SnapshotSource | null | undefined): CertTemplateSnapshot {
  return {
    title: tpl?.title ?? '',
    issuingOrg: tpl?.issuingOrg ?? '',
    description: tpl?.description ?? null,
    size: tpl?.size === 1 ? 1 : 2,
    backgroundImage: tpl?.backgroundImage ?? null,
    sealImage: tpl?.sealImage ?? null,
    content: tpl?.content ?? null,
  };
}
