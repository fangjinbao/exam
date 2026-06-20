'use strict';

const fs = require('fs');
const path = require('path');
const { isCodeFile } = require('./lib/file-utils.cjs');
const { readState, appendState } = require('./lib/state.cjs');

exports.run = (input) => {
  const toolName = input?.tool_name;
  const filePath = input?.tool_input?.file_path;
  if (!filePath) return null;

  if (!isCodeFile(filePath)) return null;

  const stateFile = 'read-files.txt';

  const normalizedPath = path.resolve(filePath);

  if (toolName === 'Read') {
    appendState(stateFile, normalizedPath);
    return null;
  }

  // Write to a new file is fine — no prior content to conflict with
  if (toolName === 'Write' && !fs.existsSync(filePath)) {
    appendState(stateFile, normalizedPath);
    return null;
  }

  const readFiles = readState(stateFile);
  if (readFiles.includes(normalizedPath)) {
    return null;
  }

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext:
        `【GateGuard 警告】你正在编辑未读取过的文件: ${path.basename(filePath)}\n` +
        '请先 Read 该文件了解现有内容，再进行修改。\n' +
        '这能避免覆盖已有代码或引入冲突。'
    }
  };
};
