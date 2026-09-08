/**
 * 一次性回填：给已存在的演示证书模板补上默认版式
 *
 * 背景：早期 seed 创建演示模板时没写 content（版式 JSON），导致考生端证书详情
 * 拿到空 elements 后退化成纯字段清单，看着不像证书。seed 已修，但存量库里那行
 * 仍是空的，故需这一次回填。
 *
 * 只补「本来就空」的模板，不覆盖任何已设计过的版式（避免抹掉人工排版成果）。
 * 幂等：重复执行时空版式已被填上，不再命中。
 *
 * 用法：npx ts-node scripts/backfill-demo-cert-layout.ts
 */
import { PrismaClient } from '@prisma/client';
import { DEMO_CERT_LAYOUT, DEMO_CERT_TEMPLATE_NAME } from '../src/common/seed.service';

const prisma = new PrismaClient();

/** CLI 输出（脚本无 Nest 上下文，用标准输出而非 Logger/console） */
function print(msg: string): void {
  process.stdout.write(msg + '\n');
}

async function main() {
  /*
    精确匹配 seed 创建时用的模板名。此前用 `contains: '演示'` 范围过宽：
    用户自建的、名字恰好含「演示」且尚未设计版式的模板会被写入
    DEMO_CERT_LAYOUT 里「兹证明」「经考核成绩合格，特发此证。」这类
    特种作业证书专用文案。
  */
  const candidates = await prisma.certificateTemplate.findMany({
    where: { name: DEMO_CERT_TEMPLATE_NAME },
    select: { id: true, name: true, content: true },
  });

  /*
    可写入的两种情形：
    1. 完全没有版式（NULL / 空串 / 元素数组为空）——初次回填；
    2. 现存版式带 origin='seed' 标记——仍是 seed 生成的原样，可安全刷新成新版。

    判定不看元素 id：设计器保存时保留原 id，人工改完 id 仍是 seed_ 前缀，
    按前缀判断会覆盖掉人工排版。而设计器存盘只写 { elements }，一旦有人保存过，
    origin 标记就消失，据此跳过，绝不覆盖排版成果。
  */
  const targets = candidates.filter((t) => {
    if (!t.content) return true;
    try {
      const parsed = JSON.parse(t.content);
      const els = parsed?.elements;
      if (!Array.isArray(els) || els.length === 0) return true;
      return parsed?.origin === 'seed';
    } catch {
      // 解析不了的脏版式当作无版式，用默认版式救回来
      return true;
    }
  });

  const skipped = candidates.length - targets.length;
  if (skipped > 0) {
    print(`跳过 ${skipped} 个已人工设计的演示模板`);
  }
  if (targets.length === 0) {
    print('无需回填');
    return;
  }

  // 先列出待改清单再写库：写完才打印的话，操作者要等库已被改动才知道动了什么
  print(`即将回填 ${targets.length} 个模板：`);
  for (const t of targets) {
    print(`  #${t.id} ${t.name}（原版式 ${t.content ? `${t.content.length} 字节` : '空'}）`);
  }

  const content = JSON.stringify(DEMO_CERT_LAYOUT);
  for (const t of targets) {
    await prisma.certificateTemplate.update({
      where: { id: t.id },
      data: { content },
    });
    print(`已回填模板 #${t.id} ${t.name}（版式 ${content.length} 字节）`);
  }
}

main()
  .catch((err) => {
    console.error('回填失败：', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
