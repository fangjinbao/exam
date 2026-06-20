'use strict';

exports.readInput = () => new Promise((resolve) => {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { data += chunk; });
  process.stdin.on('end', () => {
    clearTimeout(timer);
    try { resolve(JSON.parse(data)); }
    catch { resolve({}); }
  });
  const timer = setTimeout(() => resolve({}), 500);
});
