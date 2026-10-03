'use strict';
const crypto = require('crypto');
const { cfg } = require('./config');

// Обёртка: любая непойманная ошибка → 500 без утечки подробностей клиенту.
exports.wrap = fn => async (req, res) => {
  try { await fn(req, res); }
  catch (e){ console.error('[api]', e && e.message); if (!res.headersSent) res.status(500).json({ ok: false, error: 'server' }); }
};

// Хэш IP с солью: нужен только для лимита частоты, сам адрес не хранится.
exports.ipHash = req => {
  const xff = String((req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim();
  const ip = xff || (req.socket && req.socket.remoteAddress) || 'unknown';
  return crypto.createHash('sha256').update(cfg().ipSalt + '|' + ip).digest('hex').slice(0, 16);
};

exports.safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
