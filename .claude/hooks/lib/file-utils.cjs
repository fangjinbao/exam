'use strict';

const CODE_EXTS = /\.(ts|tsx|vue|js|jsx|scss|css)$/;
const TEST_PATTERN = /\.(test|spec)\.|__tests__|__mocks__/;

exports.isCodeFile = (fp) => CODE_EXTS.test(fp);
exports.isTestFile = (fp) => TEST_PATTERN.test(fp);
