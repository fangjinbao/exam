import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';

/** Excel 一行的原始内容（中文表头已由前端映射为字段名） */
export interface ImportCandidateRow {
  /** 考生类型原文：内部 / 外部 */
  candidateType?: string;
  /** 姓名（仅用于回显与姓名不一致提示，不作为匹配依据） */
  name?: string;
  /** 登录账号：内部填统一身份账号，外部填手机号 */
  account?: string;
  /** 身份证号（外部考生可选，填了则二次核验） */
  idCard?: string;
}

/** 匹配成功的考生 */
export interface ResolvedCandidate {
  /** internal 内部 / external 外部 */
  type: string;
  /** 业务 ID（内部为 SysUser.id，外部为 ExternalCandidate.id） */
  id: number;
  /** 库内姓名（以库为准，不用 Excel 里填的） */
  name: string;
  /** 所属：内部=部门名，外部=单位名 */
  belong: string;
  /** 登录账号：内部=统一身份账号，外部=手机号 */
  account: string | null;
  /** 身份证号：内部人员表无此列，恒为 null */
  idCard: string | null;
  /** 手机号 */
  phone: string | null;
}

/** 被跳过的行 */
export interface SkippedRow {
  /** Excel 行号（含表头，与用户在 Excel 里看到的行号一致） */
  row: number;
  /** 跳过原因 */
  reason: string;
}

/** 匹配结果 */
export interface ResolveImportResult {
  matched: ResolvedCandidate[];
  errors: SkippedRow[];
}

/** 类型列文案 → 内部类型值 */
const TYPE_ALIAS: Record<string, string> = {
  内部: 'internal',
  内部考生: 'internal',
  内部人员: 'internal',
  internal: 'internal',
  外部: 'external',
  外部考生: 'external',
  external: 'external',
};

/**
 * 考生导入匹配服务
 *
 * 只把 Excel 行匹配到系统里已存在的人，不新建任何人员：
 * 考试考生必须指向真实的 SysUser / ExternalCandidate，凭一张表格凭空建账号
 * 会绕过组织管理与外部考生管理的既有校验。匹配不上的行逐行跳过并给出原因。
 */
@Injectable()
export class ExamCandidateImportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 把 Excel 行匹配为系统内已存在的考生
   *
   * 行号从 2 起算（第 1 行是表头），与用户在 Excel 里看到的行号一致。
   * 同一人在表内重复出现只保留首次，不计为错误。
   * @param rows 前端解析出的行数组
   * @returns 匹配到的考生与被跳过的行明细
   */
  async resolve(rows: ImportCandidateRow[]): Promise<ResolveImportResult> {
    const matched: ResolvedCandidate[] = [];
    const errors: SkippedRow[] = [];
    const seen = new Set<string>();

    // 先做行级格式校验，把合法行按类型分组，两类各一次批量查询，避免逐行往返
    const internalRows: Array<{ row: number; account: string; name: string }> = [];
    const externalRows: Array<{ row: number; account: string; name: string; idCard: string }> = [];

    rows.forEach((raw, index) => {
      const row = index + 2;
      const type = TYPE_ALIAS[(raw.candidateType ?? '').trim()];
      if (!type) {
        errors.push({ row, reason: '考生类型必须填「内部」或「外部」' });
        return;
      }
      const account = (raw.account ?? '').trim();
      if (!account) {
        errors.push({
          row,
          reason: type === 'internal' ? '统一身份账号不能为空' : '手机号不能为空',
        });
        return;
      }
      const item = { row, account, name: (raw.name ?? '').trim() };
      if (type === 'internal') internalRows.push(item);
      else externalRows.push({ ...item, idCard: (raw.idCard ?? '').trim() });
    });

    await Promise.all([
      this.matchInternal(internalRows, matched, errors, seen),
      this.matchExternal(externalRows, matched, errors, seen),
    ]);

    // 两类并行匹配会打乱行序，按行号还原成 Excel 里的顺序，便于用户逐行核对
    errors.sort((a, b) => a.row - b.row);
    return { matched, errors };
  }

  /**
   * 匹配内部人员：按统一身份账号（SysUser.username，唯一）精确查
   * @param rows 已通过格式校验的内部行
   * @param matched 匹配结果收集器
   * @param errors 跳过明细收集器
   * @param seen 已收录的人员键，用于表内去重
   */
  private async matchInternal(
    rows: Array<{ row: number; account: string; name: string }>,
    matched: ResolvedCandidate[],
    errors: SkippedRow[],
    seen: Set<string>,
  ): Promise<void> {
    if (!rows.length) return;
    const users = await this.prisma.sysUser.findMany({
      where: { username: { in: [...new Set(rows.map((r) => r.account))] } },
      select: {
        id: true,
        username: true,
        name: true,
        status: true,
        phone: true,
        department: { select: { name: true } },
      },
    });
    const byAccount = new Map(users.map((u) => [u.username, u]));

    for (const r of rows) {
      const user = byAccount.get(r.account);
      if (!user) {
        errors.push({ row: r.row, reason: `统一身份账号「${r.account}」在系统中不存在` });
        continue;
      }
      if (user.status !== 1) {
        errors.push({ row: r.row, reason: `账号「${r.account}」已停用，不能参加考试` });
        continue;
      }
      const dbName = user.name || user.username;
      if (r.name && dbName !== r.name) {
        errors.push({
          row: r.row,
          reason: `姓名与系统不一致（系统为「${dbName}」），请核对后再导入`,
        });
        continue;
      }
      const key = `internal:${user.id}`;
      if (seen.has(key)) continue; // 表内重复，保留首次即可，不算错误
      seen.add(key);
      matched.push({
        type: 'internal',
        id: user.id,
        name: dbName,
        belong: user.department?.name ?? '',
        account: user.username,
        // 内部人员表无身份证号列，故不回填
        idCard: null,
        phone: user.phone ?? null,
      });
    }
  }

  /**
   * 匹配外部考生：按手机号（ExternalCandidate.phone，唯一）查，填了身份证号则再核验
   * @param rows 已通过格式校验的外部行
   * @param matched 匹配结果收集器
   * @param errors 跳过明细收集器
   * @param seen 已收录的人员键，用于表内去重
   */
  private async matchExternal(
    rows: Array<{ row: number; account: string; name: string; idCard: string }>,
    matched: ResolvedCandidate[],
    errors: SkippedRow[],
    seen: Set<string>,
  ): Promise<void> {
    if (!rows.length) return;
    const candidates = await this.prisma.externalCandidate.findMany({
      where: { phone: { in: [...new Set(rows.map((r) => r.account))] } },
      select: {
        id: true,
        phone: true,
        name: true,
        idCard: true,
        status: true,
        org: { select: { name: true } },
      },
    });
    const byPhone = new Map(candidates.map((c) => [c.phone, c]));

    for (const r of rows) {
      const cand = byPhone.get(r.account);
      if (!cand) {
        errors.push({ row: r.row, reason: `手机号「${r.account}」不属于任何外部考生` });
        continue;
      }
      if (cand.status !== 1) {
        errors.push({ row: r.row, reason: `外部考生「${cand.name}」已停用，不能参加考试` });
        continue;
      }
      // 身份证号为选填：填了才核验，且库内未维护身份证时不能算作不匹配
      if (r.idCard && cand.idCard && r.idCard !== cand.idCard) {
        errors.push({ row: r.row, reason: '身份证号与系统记录不一致，请核对后再导入' });
        continue;
      }
      if (r.name && cand.name !== r.name) {
        errors.push({
          row: r.row,
          reason: `姓名与系统不一致（系统为「${cand.name}」），请核对后再导入`,
        });
        continue;
      }
      const key = `external:${cand.id}`;
      if (seen.has(key)) continue; // 表内重复，保留首次即可，不算错误
      seen.add(key);
      matched.push({
        type: 'external',
        id: cand.id,
        name: cand.name,
        belong: cand.org?.name ?? '',
        // 外部考生以手机号登录，账号即手机号
        account: cand.phone,
        idCard: cand.idCard ?? null,
        phone: cand.phone,
      });
    }
  }
}
