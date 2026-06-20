#!/usr/bin/env node
'use strict';

const hookName = process.argv[2];
if (!hookName) process.exit(0);

const path = require('path');
const { readInput } = require('./lib/io.cjs');

readInput().then(input => {
  const hookPath = path.join(__dirname, hookName + '.cjs');
  try {
    const hook = require(hookPath);
    const result = hook.run(input);
    if (result) process.stdout.write(JSON.stringify(result));
  } catch (err) {
    process.stderr.write(`[agentpm:${hookName}] ${err.message}\n`);
  }
}).catch(() => process.exit(0));
