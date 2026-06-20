'use strict';

const { appendState } = require('./lib/state.cjs');

exports.run = (input) => {
  const desc = input?.tool_input?.description || '';
  const prompt = input?.tool_input?.prompt || '';
  const subagentType = input?.tool_input?.subagent_type || '';

  const combined = `${desc} ${prompt} ${subagentType}`.toLowerCase();

  if (/code.?review|security.?review|reviewer/.test(combined)) {
    appendState('review-called.txt', new Date().toISOString());
  }

  return null;
};
