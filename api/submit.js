'use strict';
// POST /api/submit — клиент отправляет отзыв по личной ссылке
const { getOrder, orderState, submitReview, updateReview, rateLimit } = require('./_lib/store');
const { cfg } = require('./_lib/config');
const tg = require('./_lib/tg');
const { cardText, cardKeyboard } = require('./_lib/format');
const { wrap, ipHash } = require('./_lib/http');

const clean = (s, max) => String(s == null ? '' : s)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g, '')   // управляющие и bidi-символы
  .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);

module.exports = wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const b = (req.body && typeof req.body === 'object') ? req.body : {};

  if (b.website) return res.status(200).json({ ok: true });                          // ловушка для ботов: тихо «успех»
  if (!(await rateLimit('rl:sub:' + ipHash(req), 8, 600))) return res.status(429).json({ ok: false, error: 'limit' });

  const order = await getOrder(b.token);
  if (!order) return res.status(404).json({ ok: false, error: 'notfound' });
  const st = orderState(order);
  if (st === 'expired' || st === 'closed') return res.status(410).json({ ok: false, error: st });
  if (st === 'submitted') return res.status(409).json({ ok: false, error: 'submitted' });

  const name = clean(b.name, 60), role = clean(b.role, 80), text = clean(b.text, 1500), rating = Number(b.rating);
  const fields = {};
  if (name.length < 2) fields.name = 'Укажите имя (минимум 2 символа)';
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) fields.rating = 'Поставьте оценку от 1 до 5';
  if (text.length < 15) fields.text = 'Напишите хотя бы пару предложений (от 15 символов)';
  if (b.consent !== true) fields.consent = 'Нужно согласие на публикацию';
  if (Object.keys(fields).length) return res.status(400).json({ ok: false, error: 'validation', fields });

  const review = await submitReview(order, { name, role, rating, text });
  if (!review) return res.status(409).json({ ok: false, error: 'submitted' });

  // карточка в общий чат на проверку; если Telegram недоступен — отзыв всё равно сохранён (виден в /history)
  try {
    const c = cfg();
    const extra = { reply_markup: cardKeyboard(review) };
    if (c.threadId) extra.message_thread_id = c.threadId;
    const msg = await tg.send(c.chatId, cardText(review), extra);
    await updateReview(review.id, { chatId: msg.chat && msg.chat.id, messageId: msg.message_id });
  } catch (e) { console.error('[submit] не удалось отправить карточку:', e.message); }

  return res.status(200).json({ ok: true });
});
