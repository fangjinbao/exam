'use strict';

const fs = require('fs');
const path = require('path');

const PROTECTED = /^(\.eslintrc|eslint\.config|\.prettierrc|prettier\.config|\.stylelintrc|tsconfig|biome)\b/;

exports.run = (input) => {
  const filePath = input?.tool_input?.file_path;
  if (!filePath) return null;

  const basename = path.basename(filePath);
  if (!PROTECTED.test(basename)) return null;
  if (!fs.existsSync(filePath)) return null;

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        `【Config Protection】禁止修改配置文件: ${basename}。` +
        '修复代码中的问题，而不是放宽配置。'
    }
  };
};
