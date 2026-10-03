'use strict';
// Минимальный клиент Upstash Redis через REST (без зависимостей).
// Для локальных тестов: AIRIUM_MOCK_REDIS=1 включает хранилище в памяти.

async function real(cmd){
  const url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Redis не настроен: нет UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN');
  const r = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error('Redis: ' + (j.error || r.status));
  return j.result;
}

// ---- хранилище в памяти: только команды, которые нужны проекту ----
const M = new Map();
const now = () => Date.now();
function entry(k){ const e = M.get(k); if (e && e.exp && e.exp <= now()){ M.delete(k); return undefined; } return e; }
function memory(c){
  const op = String(c[0]).toUpperCase(), k = c[1];
  switch (op){
    case 'GET':    { const e = entry(k); return e ? e.v : null; }
    case 'MGET':   return c.slice(1).map(x => { const e = entry(x); return e ? e.v : null; });
    case 'SET': {
      let nx = false, ex = 0;
      for (let i = 3; i < c.length; i++){ const o = String(c[i]).toUpperCase(); if (o === 'NX') nx = true; else if (o === 'EX') ex = Number(c[++i]); }
      if (nx && entry(k)) return null;
      M.set(k, { v: String(c[2]), exp: ex ? now() + ex * 1000 : 0 }); return 'OK';
    }
    case 'DEL':    { let n = 0; c.slice(1).forEach(x => { if (M.delete(x)) n++; }); return n; }
    case 'INCR':   { const e = entry(k); const v = (e ? Number(e.v) : 0) + 1; M.set(k, { v: String(v), exp: e ? e.exp : 0 }); return v; }
    case 'EXPIRE': { const e = entry(k); if (!e) return 0; e.exp = now() + Number(c[2]) * 1000; return 1; }
    case 'ZADD':   { let e = entry(k); if (!e){ e = { v: new Map(), exp: 0 }; M.set(k, e); } const had = e.v.has(String(c[3])); e.v.set(String(c[3]), Number(c[2])); return had ? 0 : 1; }
    case 'ZREM':   { const e = entry(k); return e && e.v.delete(String(c[2])) ? 1 : 0; }
    case 'ZCARD':  { const e = entry(k); return e ? e.v.size : 0; }
    case 'ZREVRANGE': {
      const e = entry(k); if (!e) return [];
      const arr = Array.from(e.v.entries()).sort((a, b) => b[1] - a[1]).map(x => x[0]);
      const s = Number(c[2]); let t = Number(c[3]); if (t < 0) t = arr.length + t;
      return arr.slice(s, t + 1);
    }
    case 'SADD':      { let e = entry(k); if (!e){ e = { v: new Set(), exp: 0 }; M.set(k, e); } const had = e.v.has(String(c[2])); e.v.add(String(c[2])); return had ? 0 : 1; }
    case 'SREM':      { const e = entry(k); return e && e.v.delete(String(c[2])) ? 1 : 0; }
    case 'SISMEMBER': { const e = entry(k); return e && e.v.has(String(c[2])) ? 1 : 0; }
    case 'SCARD':     { const e = entry(k); return e ? e.v.size : 0; }
    default: throw new Error('mock redis: команда не поддерживается: ' + op);
  }
}

module.exports = async function redis(...cmd){
  const c = cmd.map(x => (typeof x === 'number' ? String(x) : x));
  return process.env.AIRIUM_MOCK_REDIS === '1' ? memory(c) : real(c);
};
