'use strict';
// POST /api/like  { id, visitor, on }  — поставить/снять лайк. Один посетитель (анонимный ID браузера) = один лайк на отзыв.
// IP хранится только как хэш для лимита частоты, чтобы нельзя было накручивать.
const S = require('./_lib/store');
const { wrap, ipHash } = require('./_lib/http');

module.exports = wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS'){ res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); return res.status(204).end(); }
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  let body;
  try { body = req.body; } catch (e) { return res.status(400).json({ ok: false, error: 'bad_json' }); }
  const b = (body && typeof body === 'object') ? body : {};
  const id = String(b.id || ''), visitor = String(b.visitor || '');
  if (!/^[a-f0-9]{10}$/.test(id) || !/^[A-Za-z0-9-]{8,64}$/.test(visitor) || typeof b.on !== 'boolean') return res.status(400).json({ ok: false, error: 'validation' });
  if (!(await S.rateLimit('rl:like:' + ipHash(req), 60, 600))) return res.status(429).json({ ok: false, error: 'limit' });

  const review = await S.getReview(id);
  if (!review || review.status !== 'approved') return res.status(404).json({ ok: false, error: 'notfound' });
  const count = await S.setLike(id, visitor, b.on);
  return res.status(200).json({ ok: true, liked: b.on, count });
});
