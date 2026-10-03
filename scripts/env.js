'use strict';
// Читает секреты из C:\Users\sasha\works\.env и локального .env (не перезаписывая уже заданные переменные).
const fs = require('fs'), path = require('path');
function loadEnv(){
  const files = [path.resolve(__dirname, '../../../.env'), path.resolve(__dirname, '../.env')];
  for (const f of files){
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)){
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m || line.trim().startsWith('#')) continue;
      if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}
module.exports = { loadEnv };
