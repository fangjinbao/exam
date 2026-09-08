/**
 * 修复 base_sys_department.type 的 cp1252 双重编码损坏
 *
 * 成因：某次导入/seed 用了 cp1252 连接字符集，UTF-8 字节被再编码一次落库，
 * 导致 '省公司' 存成 'çœ\x81å…¬å\x8F¸'，字符串比较全部失配。
 * 本脚本按 cp1252 反查表还原，幂等：已是正常中文的记录会被跳过。
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** cp1252 中 0x80-0x9F 段到码点的反查表（其余字节与 latin1 一致） */
const CP1252_HIGH: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
};

/** 期望的合法部门类型 */
const VALID_TYPES = ['省公司', '分公司', '部门'];

/**
 * 尝试还原 cp1252 误编码文本
 * @param s 可能损坏的字符串
 * @returns 还原结果；无法映射时返回原值
 */
function repairCp1252(s: string): string {
  const bytes: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (CP1252_HIGH[cp] !== undefined) bytes.push(CP1252_HIGH[cp]);
    else if (cp <= 0xff) bytes.push(cp);
    else return s;
  }
  try {
    return Buffer.from(bytes).toString('utf8');
  } catch {
    return s;
  }
}

/** CLI 输出（脚本无 Nest 上下文，用标准输出而非 Logger/console） */
function print(msg: string): void {
  process.stdout.write(msg + '\n');
}

async function main() {
  const rows = await prisma.sysDepartment.findMany({
    select: { id: true, name: true, type: true },
    orderBy: { id: 'asc' },
  });

  print(`共 ${rows.length} 条部门记录，开始检查 type 字段…\n`);
  const plan: { id: number; name: string; from: string; to: string }[] = [];

  for (const r of rows) {
    if (!r.type) continue;
    if (VALID_TYPES.includes(r.type)) continue; // 已正常，跳过
    const repaired = repairCp1252(r.type);
    if (VALID_TYPES.includes(repaired)) {
      plan.push({ id: r.id, name: r.name, from: r.type, to: repaired });
    } else {
      console.warn(`⚠️ id=${r.id} ${r.name}：无法还原为合法类型（还原得到 "${repaired}"），已跳过`);
    }
  }

  if (plan.length === 0) {
    print('没有需要修复的记录。');
    return;
  }

  print('待修复清单：');
  console.table(plan.map((p) => ({ id: p.id, 部门: p.name, 修复为: p.to })));

  for (const p of plan) {
    await prisma.sysDepartment.update({ where: { id: p.id }, data: { type: p.to } });
  }
  print(`\n✅ 已修复 ${plan.length} 条记录。`);

  const after = await prisma.sysDepartment.findMany({
    select: { id: true, name: true, type: true },
    orderBy: { id: 'asc' },
  });
  print('\n修复后结果：');
  console.table(after.map((a) => ({ id: a.id, 部门: a.name, 类型: a.type })));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
