'use strict';
// GET /api/health — диагностика для владельцев. Доступна только с заголовком X-Admin-Secret = TG_WEBHOOK_SECRET.
// Показывает, какие переменные заданы (длина и «странности» без самих значений) и отвечают ли база и Telegram.
const redis = require('./_lib/redis');
const tg = require('./_lib/tg');
const { cfg } = require('./_lib/config');
const { safeEqual } = require('./_lib/http');

const NAMES = ['TG_BOT_TOKEN', 'TG_WEBHOOK_SECRET', 'TG_CHAT_ID', 'TG_THREAD_ID', 'TG_ALLOWED_IDS', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'SITE_URL', 'IP_SALT'];
const scrub = s => String(s).replace(/[A-Za-z0-9_:\-]{28,}/g, '<скрыто>');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const c = cfg();
  if (!c.secret || !safeEqual(req.headers['x-admin-secret'] || '', c.secret)) return res.status(401).json({ ok: false });

  const env = {};
  for (const n of NAMES){
    const v = process.env[n];
    env[n] = v === undefined ? 'ОТСУТСТВУЕТ' : { length: v.length, пробелы_по_краям: /^\s|\s$/.test(v), кавычки_по_краям: /^["']|["']$/.test(v) };
  }
  const out = { ok: true, env };
  try { out.redis = { запись: await redis('SET', 'health:ping', String(Date.now()), 'EX', 30) }; }
  catch (e){ out.redis = { ошибка: scrub(e.message) }; }
  try { const me = await tg.call('getMe', {}); out.telegram = { бот: me.username }; }
  catch (e){ out.telegram = { ошибка: scrub(e.message) }; }
  return res.status(200).json(out);
};
