/**
 * 回填认证项目的报名截止时间：把改造前落库的「纯日期行」补上时分。
 *
 * 背景：改造前前端只提交 'YYYY-MM-DD'，按 ES 规范走 UTC 解析，
 * '2026-10-15' 落库为 00:00Z——在东八区实为当天 08:00。旧的 isClosed 按本地
 * 日历天比较，从当天 00:00 就关闭；改造后按时刻比较，要到 08:00 才关，
 * 即这批行晚关 8 小时，且列表会把「10-15」显示成「2026-10-15 08:00」。
 *
 * 识别特征：UTC 下时分秒恰为 00:00:00。带时分提交的新数据几乎不会命中
 * （需正好填到 08:00:00 整，且秒为 0）。
 *
 * 两种口径（--mode）：
 *   midnight  减 8 小时 → 当天本地 00:00:00，完全还原改造前行为
 *   endofday  置当天本地 23:59:59，改为「截止日当天仍可报」
 *
 * 默认 dry-run，只打印将要改动的行；确认后加 --apply 才写库。
 * 幂等：仅处理命中特征的行，midnight 口径执行后不再命中（时分变为 16:00Z）。
 *
 * 用法：
 *   npx ts-node scripts/backfill-cert-apply-deadline.ts --mode=midnight
 *   npx ts-node scripts/backfill-cert-apply-deadline.ts --mode=midnight --apply
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** CLI 输出（脚本无 Nest 上下文，用标准输出而非 Logger/console） */
function print(msg: string): void {
  process.stdout.write(msg + '\n');
}

type Mode = 'midnight' | 'endofday';

/** 解析参数：--mode 必传，避免默认口径带来的误操作 */
function parseArgs(): { mode: Mode; apply: boolean } {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const raw = argv.find((a) => a.startsWith('--mode='))?.split('=')[1];
  if (raw !== 'midnight' && raw !== 'endofday') {
    throw new Error('必须指定 --mode=midnight 或 --mode=endofday，不提供默认值');
  }
  return { mode: raw, apply };
}

/** 是否为改造前的纯日期行：UTC 下时分秒恰为 00:00:00 */
function isLegacyRow(d: Date): boolean {
  return d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
}

/**
 * 算出目标时刻
 *
 * midnight：直接减 8 小时。原瞬时是本地 08:00，减完即本地当天 00:00。
 * endofday：取该瞬时的本地日期，再置 23:59:59（用本地构造，不碰 UTC 偏移）。
 */
function targetDate(d: Date, mode: Mode): Date {
  if (mode === 'midnight') {
    return new Date(d.getTime() - 8 * 3600 * 1000);
  }
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 0);
}

/** 本地时区下的可读格式，便于与页面显示对照 */
function fmt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

async function main() {
  const { mode, apply } = parseArgs();

  if (process.env.TZ && process.env.TZ !== 'Asia/Shanghai') {
    throw new Error(`当前 TZ=${process.env.TZ}，本脚本按 Asia/Shanghai 口径计算，请勿在其他时区执行`);
  }

  const rows = await prisma.certProject.findMany({
    select: { id: true, name: true, applyDeadline: true, startTime: true },
    orderBy: { id: 'asc' },
  });

  const hits = rows.filter((r) => isLegacyRow(r.applyDeadline));

  print(`项目总数 ${rows.length}，命中存量特征（UTC 时分秒为 00:00:00）${hits.length} 行`);
  print(`口径：${mode === 'midnight' ? '减 8 小时 → 当天 00:00:00（还原改造前）' : '置当天 23:59:59'}`);
  print(apply ? '模式：APPLY（将写库）' : '模式：DRY-RUN（只打印，不写库）');

  if (!hits.length) {
    print('无需回填。');
    return;
  }

  const plan = hits.map((r) => {
    const to = targetDate(r.applyDeadline, mode);
    const legal = to.getTime() < r.startTime.getTime();
    return {
      id: r.id,
      名称: r.name,
      现截止: fmt(r.applyDeadline),
      改为: fmt(to),
      鉴定开始: fmt(r.startTime),
      仍早于开始: legal ? 'Y' : '⚠ N',
      _to: to,
      _legal: legal,
    };
  });

  console.table(plan.map(({ _to, _legal, ...show }) => show));

  // endofday 口径可能把截止推到鉴定开始之后，那是非法配置，必须拦住
  const bad = plan.filter((p) => !p._legal);
  if (bad.length) {
    print(`\n⚠ 有 ${bad.length} 行回填后截止时间不早于鉴定开始，属非法配置，已中止。`);
    return;
  }

  if (!apply) {
    print('\n以上为预览。确认无误后加 --apply 执行。');
    return;
  }

  let done = 0;
  for (const p of plan) {
    await prisma.certProject.update({
      where: { id: p.id },
      data: { applyDeadline: p._to },
    });
    done += 1;
  }
  print(`\n已回填 ${done} 行。`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
