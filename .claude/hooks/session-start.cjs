'use strict';

const { clearState } = require('./lib/state.cjs');

exports.run = () => {
  // Clear state files from previous session
  clearState('edited-files.txt');
  clearState('read-files.txt');
  clearState('review-called.txt');

  return {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext:
        '【会话初始化完成】状态文件已清理。\n' +
        '强制执行清单：\n' +
        '1. 技能检查 — 接到任务后第一步扫描技能触发词\n' +
        '2. code-reviewer — 写完代码后立即调用，无例外\n' +
        '3. 验证 — 完成声明前必须运行构建/测试命令'
    }
  };
};
