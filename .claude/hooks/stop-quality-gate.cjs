'use strict';

const fs = require('fs');
const path = require('path');
const { readState } = require('./lib/state.cjs');

exports.run = (input) => {
  // Prevent infinite loop: if stop hook already active, don't block again
  if (input?.stop_hook_active) return null;

  const editedRaw = readState('edited-files.txt');
  if (!editedRaw.trim()) return null;

  const editedFiles = editedRaw.trim().split('\n').filter(Boolean);
  const issues = [];

  // Check 1: console.log remnants (skip CLI files where console.log is intentional stdout output).
  // 用 i 标志兼容大小写文件系统下的路径（agentpm / agentPM）；src/ 整目录视为 CLI 代码。
  const CLI_PATTERNS = [/packages[/\\]agentpm[/\\]src[/\\]/i, /packages[/\\]agentpm[/\\]scripts[/\\]/i, /[/\\]bin[/\\]/];
  for (const fp of editedFiles) {
    if (CLI_PATTERNS.some(p => p.test(fp))) continue;
    try {
      if (!fs.existsSync(fp)) continue;
      const content = fs.readFileSync(fp, 'utf8');
      const lines = content.split('\n');
      const hits = [];
      lines.forEach((line, i) => {
        if (/console\.(log|debug|info)\s*\(/.test(line) && !/\/\/\s*keep/.test(line)) {
          hits.push(i + 1);
        }
      });
      if (hits.length > 0) {
        issues.push(`${path.basename(fp)} 第 ${hits.join(',')} 行有 console.log`);
      }
    } catch {}
  }

  // Check 2: review-called state
  const reviewCalled = readState('review-called.txt').trim();
  if (!reviewCalled) {
    issues.push('本轮修改了代码文件但未调用 code-reviewer agent');
  }

  if (issues.length === 0) return null;

  return {
    decision: 'block',
    reason:
      '【质量门禁】发现以下问题：\n' +
      issues.map(i => `  - ${i}`).join('\n') +
      '\n请处理后再结束回复。'
  };
};
