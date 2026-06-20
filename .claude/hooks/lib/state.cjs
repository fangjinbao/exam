'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

function getStateDir() {
  const hash = crypto.createHash('md5')
    .update(process.cwd()).digest('hex').slice(0, 12);
  const dir = path.join(os.tmpdir(), `agentpm-${hash}`);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

exports.readState = (filename) => {
  const target = path.join(getStateDir(), filename);
  try { return fs.readFileSync(target, 'utf8'); }
  catch { return ''; }
};

exports.appendState = (filename, line) => {
  const target = path.join(getStateDir(), filename);
  fs.appendFileSync(target, line + '\n');
};

exports.clearState = (filename) => {
  const target = path.join(getStateDir(), filename);
  try { fs.unlinkSync(target); } catch {}
};
