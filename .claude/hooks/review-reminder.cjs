'use strict';

const path = require('path');
const { isCodeFile, isTestFile } = require('./lib/file-utils.cjs');
const { appendState } = require('./lib/state.cjs');

exports.run = (input) => {
  const filePath = input?.tool_input?.file_path;
  if (!filePath) return null;

  if (!isCodeFile(filePath)) return null;

  appendState('edited-files.txt', filePath);

  const basename = path.basename(filePath);
  const isTest = isTestFile(filePath);

  return {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext:
        `【Review Reminder】你刚修改了代码文件: ${basename}\n` +
        '当这组相关改动全部完成后，你必须调用 code-reviewer agent 进行审查。\n' +
        '这是强制步骤，不可跳过。'
    }
  };
};
