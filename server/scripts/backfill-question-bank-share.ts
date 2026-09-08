/**
 * 存量题库补齐创建人：归属超级管理员（username='admin'），保持 all/manage。
 * 幂等：仅处理 createBy IS NULL 的记录，可重复执行。
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** CLI 输出（脚本无 Nest 上下文，用标准输出而非 Logger/console） */
function print(msg: string): void {
  process.stdout.write(msg + '\n');
}

async function main() {
  const admin = await prisma.sysUser.findUnique({
    where: { username: 'admin' },
    select: { id: true, username: true },
  });

  if (!admin) {
    console.error('未找到 username=admin 的用户，跳过补齐。存量题库 createBy 仍为 NULL。');
    return;
  }

  const result = await prisma.questionBank.updateMany({
    where: { createBy: null },
    data: { createBy: admin.id, visibleScope: 'all', shareLevel: 'manage' },
  });

  print(`已将 ${result.count} 个存量题库归属到 admin(id=${admin.id})，范围=all，级别=manage`);

  const all = await prisma.questionBank.findMany({
    select: { id: true, name: true, createBy: true, visibleScope: true, shareLevel: true },
    orderBy: { id: 'asc' },
  });
  console.table(all);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
