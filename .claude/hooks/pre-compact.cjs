'use strict';

const { readState } = require('./lib/state.cjs');

exports.run = () => {
  const edited = readState('edited-files.txt').trim();
  const reviewCalled = readState('review-called.txt').trim();

  const state = [];
  if (edited) state.push(`已编辑文件:\n${edited}`);
  if (reviewCalled) state.push('code-reviewer: 已调用');
  else if (edited) state.push('code-reviewer: 未调用（需要在继续前调用）');

  if (state.length === 0) return null;

  return {
    hookSpecificOutput: {
      hookEventName: 'PreCompact',
      additionalContext:
        '【压缩前状态快照】\n' + state.join('\n')
    }
  };
};
