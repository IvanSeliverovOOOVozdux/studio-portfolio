'use strict';
// Данные: заказы (личные ссылки) и отзывы. Всё хранится в Redis JSON-строками.
//   order:<token>  — заказ/ссылка       review:<id> — отзыв
//   used:<token>   — ссылка уже использована (SET NX = защита от двойной отправки)
//   z:orders / z:reviews / z:approved — упорядоченные по времени индексы
const crypto = require('crypto');
const redis = require('./redis');
const { cfg } = require('./config');

const newId = () => crypto.randomBytes(5).toString('hex');
const newToken = () => crypto.randomBytes(16).toString('base64url');
const parse = s => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };
const TOKEN_RE = /^[A-Za-z0-9_-]{16,40}$/;

function normalizeUrl(input){
  let u = String(input || '').trim();
  if (!u || /\s/.test(u)) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
  try {
    const x = new URL(u);
    if ((x.protocol !== 'https:' && x.protocol !== 'http:') || !x.hostname.includes('.')) return '';
    return x.href;
  } catch (e) { return ''; }
}
function siteLabel(url){ try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }

/* ---------- заказы ---------- */
async function createOrder({ product, siteUrl, clientName, by }){
  const now = Date.now();
  const order = {
    token: newToken(), product, siteUrl, siteLabel: siteLabel(siteUrl), clientName: clientName || '',
    by: by || null, createdAt: now, expiresAt: now + cfg().linkTtlDays * 864e5, status: 'open'
  };
  await redis('SET', 'order:' + order.token, JSON.stringify(order));
  await redis('ZADD', 'z:orders', now, order.token);
  return order;
}
async function getOrder(token){ return TOKEN_RE.test(String(token || '')) ? parse(await redis('GET', 'order:' + token)) : null; }
const saveOrder = o => redis('SET', 'order:' + o.token, JSON.stringify(o));
function orderState(o){
  if (o.status === 'submitted') return 'submitted';
  if (o.status === 'closed') return 'closed';
  return o.expiresAt < Date.now() ? 'expired' : 'open';
}
async function closeOrder(token){
  const o = await getOrder(token);
  if (!o || orderState(o) !== 'open') return null;
  o.status = 'closed'; await saveOrder(o); return o;
}
async function listOpenOrders(limit){
  const tokens = await redis('ZREVRANGE', 'z:orders', 0, 59);
  if (!tokens.length) return [];
  const rows = (await redis('MGET', ...tokens.map(t => 'order:' + t))).map(parse).filter(Boolean);
  return rows.filter(o => orderState(o) === 'open').slice(0, limit || 10);
}

/* ---------- отзывы ---------- */
async function submitReview(order, { name, role, rating, text }){
  // атомарно: вторая отправка по той же ссылке вернёт null
  const first = await redis('SET', 'used:' + order.token, '1', 'NX');
  if (!first) return null;
  try {
    const now = Date.now(), id = newId();
    const review = {
      id, token: order.token, product: order.product, siteUrl: order.siteUrl, siteLabel: order.siteLabel,
      name, role, rating, text, createdAt: now, status: 'pending', decidedBy: null, decidedAt: null, chatId: null, messageId: null
    };
    await redis('SET', 'review:' + id, JSON.stringify(review));
    await redis('ZADD', 'z:reviews', now, id);
    order.status = 'submitted'; order.reviewId = id; await saveOrder(order);
    return review;
  } catch (e) { await redis('DEL', 'used:' + order.token); throw e; }
}
async function getReview(id){ return /^[a-f0-9]{10}$/.test(String(id || '')) ? parse(await redis('GET', 'review:' + id)) : null; }
async function updateReview(id, patch){
  const r = await getReview(id); if (!r) return null;
  Object.assign(r, patch); await redis('SET', 'review:' + id, JSON.stringify(r)); return r;
}
const publish = r => redis('ZADD', 'z:approved', r.decidedAt || Date.now(), r.id);
const unpublish = id => redis('ZREM', 'z:approved', id);

// Полное удаление отзыва: сначала убираем из публичного списка (чтобы сайт перестал его отдавать),
// затем стираем саму запись, её место в индексах и личную ссылку клиента (заказ + метка «ссылка использована»).
async function deleteReview(id){
  const r = await getReview(id); if (!r) return null;
  await redis('ZREM', 'z:approved', id);
  await redis('ZREM', 'z:reviews', id);
  await redis('DEL', 'review:' + id);
  if (r.token){
    await redis('ZREM', 'z:orders', r.token);
    await redis('DEL', 'order:' + r.token, 'used:' + r.token);
  }
  return r;
}

async function listReviews(page, size){
  const total = Number(await redis('ZCARD', 'z:reviews'));
  const ids = await redis('ZREVRANGE', 'z:reviews', page * size, page * size + size - 1);
  const items = ids.length ? (await redis('MGET', ...ids.map(i => 'review:' + i))).map(parse).filter(Boolean) : [];
  return { items, total };
}
async function listApproved(limit){
  const ids = await redis('ZREVRANGE', 'z:approved', 0, (limit || 50) - 1);
  if (!ids.length) return [];
  return (await redis('MGET', ...ids.map(i => 'review:' + i))).map(parse).filter(r => r && r.status === 'approved');
}

/* ---------- прочее ---------- */
async function rateLimit(key, limit, windowSec){
  const n = Number(await redis('INCR', key));
  if (n === 1) await redis('EXPIRE', key, windowSec);
  return n <= limit;
}
// Короткая блокировка от двойного клика по кнопке
const lock = async (key, sec) => Boolean(await redis('SET', 'lock:' + key, '1', 'NX', 'EX', sec || 10));

module.exports = {
  normalizeUrl, siteLabel, createOrder, getOrder, saveOrder, orderState, closeOrder, listOpenOrders,
  submitReview, getReview, updateReview, publish, unpublish, deleteReview, listReviews, listApproved, rateLimit, lock
};
