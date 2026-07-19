#!/usr/bin/env node
/**
 * 网关镜像构建期脚本：读 docker/frontends.json，逐个前端子项目执行
 * `npm install && npx vite build`，产物移动到 /out/<name>。
 *
 * 新增前端只需在 frontends.json 加一行，本脚本自动处理，无需改 Dockerfile。
 * 运行目录约定为构建上下文根（Dockerfile 中 WORKDIR /build 且已 COPY . .）。
 */
import { execSync } from 'node:child_process';
import { readFileSync, rmSync, cpSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const OUT = '/out';
const manifestPath = resolve(ROOT, 'docker/frontends.json');

const frontends = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (!Array.isArray(frontends) || frontends.length === 0) {
  console.error('[build-frontends] frontends.json 为空或格式错误');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

for (const { name } of frontends) {
  if (!name) {
    console.error('[build-frontends] 清单存在缺少 name 的条目');
    process.exit(1);
  }
  const appDir = resolve(ROOT, name);
  if (!existsSync(appDir)) {
    console.error(`[build-frontends] 找不到前端目录: ${name}/（请确认已创建且未被 .dockerignore 排除）`);
    process.exit(1);
  }

  console.log(`\n[build-frontends] ===== 构建 ${name} =====`);
  // 依赖：两个前端均无 lock 文件，用 npm install 容错安装
  execSync('npm install --no-audit --no-fund', { cwd: appDir, stdio: 'inherit' });
  // 仅跑 vite build（不含 vue-tsc 类型门禁，类型检查作为独立 CI 关注，与原 Dockerfile 一致）
  execSync('npx vite build', { cwd: appDir, stdio: 'inherit' });

  const distDir = resolve(appDir, 'dist');
  if (!existsSync(distDir)) {
    console.error(`[build-frontends] ${name} 构建后未产出 dist/`);
    process.exit(1);
  }
  const dest = resolve(OUT, name);
  rmSync(dest, { recursive: true, force: true });
  cpSync(distDir, dest, { recursive: true });
  console.log(`[build-frontends] ${name} → ${dest} 完成`);
}

console.log('\n[build-frontends] 全部前端构建完成');
