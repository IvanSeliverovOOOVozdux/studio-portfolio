'use strict';
// POST /api/telegram — вебхук бота. Только для троих из TG_ALLOWED_IDS.
// Работает и в группе с темами (форум): отвечает в той же теме, откуда пришла команда.
const redis = require('./_lib/redis');
const tg = require('./_lib/tg');
const { cfg } = require('./_lib/config');
const S = require('./_lib/store');
const R = require('./_lib/replies');
const F = require('./_lib/format');
const { safeEqual } = require('./_lib/http');

const HELP = [
  '<b>Airium · отзывы клиентов</b>',
  '',
  '/new — создать личную ссылку на отзыв',
  '/orders — ссылки, которые ждут отзыва',
  '/history — история отзывов',
  '/cancel — отменить ввод',
  '',
  'Быстро одной строкой:',
  '<code>/new Название проекта | https://сайт.ру | Имя клиента</code>',
  '',
  '<b>Ответы студии под отзывами на сайте</b>',
  '/replies — список готовых ответов',
  '<code>/addreply 5 Текст с {name}</code> — добавить ответ для отзывов 4–5★ (цифра 3 — для 1–3★)',
  '<code>/delreply 5 номер</code> — удалить ответ (цифра 3 — из критичных)',
  '/resetreplies — вернуть стандартные'
].join('\n');

const personName = u => [u.first_name, u.last_name].filter(Boolean).join(' ') || (u.username ? '@' + u.username : String(u.id));
const isAllowed = id => cfg().allowed.includes(String(id));
const ask = placeholder => ({ reply_markup: { force_reply: true, selective: true, input_field_placeholder: placeholder } });
const stKey = (chatId, userId) => `st:${chatId}:${userId}`;
// ctx = { chatId, th } — th добавляет message_thread_id, если команда пришла из темы группы
const say = (ctx, text, extra) => tg.send(ctx.chatId, text, Object.assign({}, ctx.th, extra));

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const c = cfg();
  if (!c.secret || !safeEqual(req.headers['x-telegram-bot-api-secret-token'] || '', c.secret)) return res.status(401).end();
  const u = req.body || {};
  try {
    if (u.message) await onMessage(u.message);
    else if (u.callback_query) await onCallback(u.callback_query);
  } catch (e) { console.error('[bot]', e.message); }
  return res.status(200).json({ ok: true });      // всегда 200, иначе Telegram будет слать повторы
};

// Бот работает только в одном месте: в чате TG_CHAT_ID и (если задана) в теме TG_THREAD_ID.
// Личные сообщения, другие чаты и другие темы игнорируются молча.
function inScope(chatId, threadId){
  const c = cfg();
  if (c.chatId && String(chatId) !== String(c.chatId)) return false;
  if (c.threadId && Number(threadId || 0) !== c.threadId) return false;
  return true;
}

/* ---------- сообщения ---------- */
async function onMessage(m){
  const text = (m.text || '').trim(); if (!text) return;
  const chat = m.chat, from = m.from;
  if (!inScope(chat.id, m.message_thread_id)) return;
  if (!isAllowed(from.id)) return;                     // посторонним в рабочей теме бот не отвечает
  const ctx = { chatId: chat.id, th: m.message_thread_id ? { message_thread_id: m.message_thread_id } : {} };
  const cmd = text.match(/^\/(\w+)(?:@\w+)?(?:\s+([\s\S]*))?$/);
  const key = stKey(chat.id, from.id);

  if (cmd){
    const name = cmd[1].toLowerCase(), args = (cmd[2] || '').trim();
    if (name === 'start' || name === 'help') return void await say(ctx, HELP);
    if (name === 'cancel'){ await redis('DEL', key); return void await say(ctx, 'Ввод отменён.'); }
    if (name === 'history') return void await sendHistory(ctx, 0);
    if (name === 'orders') return void await sendOrders(ctx);
    if (name === 'replies') return void await sendReplies(ctx);
    if (name === 'addreply') return void await addReply(ctx, args);
    if (name === 'delreply') return void await delReply(ctx, args);
    if (name === 'resetreplies'){ await R.resetTemplates(); return void await say(ctx, 'Вернул стандартные ответы. Список: /replies'); }
    if (name === 'new') return void await startNew(ctx, from, args, key);
    return void await say(ctx, 'Не знаю такой команды.\n\n' + HELP);
  }

  // обычный текст: продолжаем мастер /new
  const st = JSON.parse((await redis('GET', key)) || 'null');
  if (!st) return;
  await wizardStep(ctx, from, key, st, text);
}

async function startNew(ctx, from, args, key){
  if (args.includes('|')){
    const [product, site, client] = args.split('|').map(s => s.trim());
    return void await finishOrder(ctx, from, key, product, site, client);
  }
  if (args){
    await redis('SET', key, JSON.stringify({ step: 'site', product: args.slice(0, 80) }), 'EX', 1800);
    return void await say(ctx, `Проект: <b>${F.esc(args.slice(0, 80))}</b>\nТеперь пришлите <b>ссылку на сайт</b> клиента.`, ask('https://сайт.ру'));
  }
  await redis('SET', key, JSON.stringify({ step: 'product' }), 'EX', 1800);
  await say(ctx, 'Как называется проект? Например: <i>Сайт кофейни «Мякиш»</i>', ask('Название проекта'));
}

async function wizardStep(ctx, from, key, st, text){
  if (st.step === 'product'){
    if (text.length < 2 || text.length > 80) return void await say(ctx, 'Название от 2 до 80 символов. Попробуйте ещё раз.', ask('Название проекта'));
    await redis('SET', key, JSON.stringify({ step: 'site', product: text }), 'EX', 1800);
    return void await say(ctx, 'Пришлите <b>ссылку на сайт</b> клиента.', ask('https://сайт.ру'));
  }
  if (st.step === 'site'){
    const url = S.normalizeUrl(text);
    if (!url) return void await say(ctx, 'Не похоже на адрес сайта. Пример: <code>soberi-party-dmitrov.vercel.app</code>', ask('https://сайт.ру'));
    await redis('SET', key, JSON.stringify({ step: 'client', product: st.product, url }), 'EX', 1800);
    return void await say(ctx, 'Как зовут клиента? Подставлю в форму. Если не нужно, пришлите «-».', ask('Имя клиента или -'));
  }
  if (st.step === 'client') return void await finishOrder(ctx, from, key, st.product, st.url, text);
}

async function finishOrder(ctx, from, key, product, siteInput, client){
  const url = S.normalizeUrl(siteInput);
  if (!product || product.length < 2 || !url){
    await redis('DEL', key);
    return void await say(ctx, 'Нужны название проекта и корректная ссылка на сайт.\n\n<code>/new Название | https://сайт.ру | Имя клиента</code>');
  }
  const clientName = (client && client !== '-') ? client.slice(0, 60) : '';
  const order = await S.createOrder({ product: product.slice(0, 80), siteUrl: url, clientName, by: { id: from.id, name: personName(from) } });
  await redis('DEL', key);
  const base = cfg().siteUrl;
  const link = base ? `${base}/r/${order.token}` : `(не задан SITE_URL) /r/${order.token}`;
  await say(ctx, [
    '<b>Ссылка для клиента готова</b>',
    `Проект: <b>${F.esc(order.product)}</b>`,
    `Сайт: ${F.esc(order.siteLabel)}`,
    `Клиент: ${F.esc(order.clientName || '—')}`,
    '', link, '',
    `Одноразовая, действует ${cfg().linkTtlDays} дней.`
  ].join('\n'), { reply_markup: { inline_keyboard: [[{ text: '🔒 Закрыть ссылку', callback_data: 'c:' + order.token }]] } });
}

/* ---------- история и открытые ссылки ---------- */
const PAGE = 6;
async function historyView(page){
  const { items, total } = await S.listReviews(page, PAGE);
  if (!total) return { text: 'Отзывов пока нет. Создайте ссылку: /new', kb: { inline_keyboard: [] } };
  const pages = Math.ceil(total / PAGE);
  const row = [];
  if (page > 0) row.push({ text: '‹ Новее', callback_data: 'h:' + (page - 1) });
  if (page < pages - 1) row.push({ text: 'Старше ›', callback_data: 'h:' + (page + 1) });
  return {
    text: `<b>История отзывов</b> · ${page + 1}/${pages} · всего ${total}\n\n` + items.map(F.historyLine).join('\n\n'),
    kb: { inline_keyboard: row.length ? [row] : [] }
  };
}
async function sendHistory(ctx, page){ const v = await historyView(page); await say(ctx, v.text, { reply_markup: v.kb }); }

async function sendOrders(ctx){
  const open = await S.listOpenOrders(10);
  if (!open.length) return void await say(ctx, 'Открытых ссылок нет. Создайте новую: /new');
  const base = cfg().siteUrl;
  await say(ctx, '<b>Ссылки, которые ждут отзыва</b>\n\n' + open.map(o =>
    `• <b>${F.esc(o.product)}</b>${o.clientName ? ' · ' + F.esc(o.clientName) : ''}\n  создана ${F.fmt(o.createdAt)} · ${F.esc(o.by ? o.by.name : '')}\n  ${base ? base + '/r/' + o.token : o.token}`
  ).join('\n\n'));
}

/* ---------- ответы студии под отзывами (хранятся в базе) ---------- */
const REPLY_HINT = 'Пишите на «вы» и без форм рода («рад/рада», «доволен/довольна»): тогда ответ подходит и женским, и мужским именам. Имя клиента подставится вместо {name}.';
const GENDER_RE = /(^|[^а-яё])(рад|довол(ен|ьна)|уверен|уверена|благодарен|благодарна|готов|готова)([^а-яё]|$)/i;
const replyGroup = d => (d === '5' ? 'positive' : 'critical');

async function sendReplies(ctx){
  const t = await R.getTemplates();
  const fmt = (title, list) => `<b>${title}</b>\n` + list.map((s, i) => `${i + 1}. ${F.esc(s)}`).join('\n');
  await say(ctx, fmt('Для отзывов 4–5★ (в командах цифра 5)', t.positive));
  await say(ctx, fmt('Для отзывов 1–3★ (в командах цифра 3)', t.critical) + '\n\n' + F.esc(REPLY_HINT));
}
async function addReply(ctx, args){
  const m = args.match(/^([53])\s+([\s\S]+)$/);
  if (!m) return void await say(ctx, 'Формат: <code>/addreply 5 Текст ответа с {name}</code>\nЦифра 5 — для отзывов 4–5★, цифра 3 — для отзывов 1–3★.');
  const text = m[2].trim().replace(/\s+/g, ' ');
  if (text.length < 10 || text.length > 300) return void await say(ctx, 'Ответ должен быть от 10 до 300 символов.');
  const g = replyGroup(m[1]), t = await R.getTemplates();
  if (t[g].length >= 30) return void await say(ctx, 'Ответов уже 30, удалите лишние: /delreply');
  if (t[g].some(x => x.toLowerCase() === text.toLowerCase())) return void await say(ctx, 'Такой ответ уже есть.');
  t[g].push(text); await R.saveTemplates(t);
  const notes = [];
  if (!/\{(name|имя)\}/i.test(text)) notes.push('В тексте нет {name}, имя клиента подставляться не будет.');
  if (GENDER_RE.test(text)) notes.push('Похоже, в тексте есть форма рода (рад/доволен и т. п.). Лучше переписать на «мы» и «вы», чтобы подходило любому имени.');
  await say(ctx, `Добавил (${g === 'positive' ? '4–5★' : '1–3★'}, №${t[g].length}).\nПример: «${F.esc(R.fill(text, 'Анна Иванова'))}»` + (notes.length ? '\n\n' + notes.map(F.esc).join('\n') : ''));
}
async function delReply(ctx, args){
  const m = args.match(/^([53])\s+(\d+)$/);
  if (!m) return void await say(ctx, 'Формат: <code>/delreply 5 номер</code> (цифра 5 — ответы для 4–5★, цифра 3 — для 1–3★). Номера: /replies');
  const g = replyGroup(m[1]), t = await R.getTemplates(), n = Number(m[2]);
  if (n < 1 || n > t[g].length) return void await say(ctx, 'Нет ответа с таким номером. Список: /replies');
  if (t[g].length <= 1) return void await say(ctx, 'Это последний ответ в группе, удалить нельзя. Сначала добавьте другой: /addreply');
  const [gone] = t[g].splice(n - 1, 1); await R.saveTemplates(t);
  await say(ctx, `Удалил: «${F.esc(gone)}»`);
}

/* ---------- кнопки ---------- */
async function onCallback(cb){
  const from = cb.from, msg = cb.message;
  if (!msg || !inScope(msg.chat.id, msg.message_thread_id)) return void await tg.answer(cb.id);
  if (!isAllowed(from.id)) return void await tg.answer(cb.id, 'Нет доступа', true);
  const [act, arg] = String(cb.data || '').split(':');
  const chatId = msg && msg.chat.id, mid = msg && msg.message_id;
  const by = { id: from.id, name: personName(from) };

  if (act === 'h'){
    const v = await historyView(Math.max(0, Number(arg) || 0));
    await tg.edit(chatId, mid, v.text, { reply_markup: v.kb });
    return void await tg.answer(cb.id);
  }
  if (act === 'c'){
    const o = await S.closeOrder(arg);
    await tg.answer(cb.id, o ? 'Ссылка закрыта' : 'Ссылка уже использована или закрыта', !o);
    if (o) await tg.edit(chatId, mid, F.esc(msg.text || '') + `\n\n🔒 Ссылка закрыта · ${F.esc(by.name)}`, { reply_markup: { inline_keyboard: [] } });
    return;
  }
  if (act === 'a' || act === 'r' || act === 'x') return void await decide(cb, act, arg, by, chatId, mid);
  await tg.answer(cb.id);
}

async function decide(cb, act, id, by, chatId, mid){
  if (!(await S.lock('decide:' + id, 2))) return void await tg.answer(cb.id, 'Секунду…');
  let r = await S.getReview(id);
  if (!r) return void await tg.answer(cb.id, 'Отзыв не найден', true);

  let toast = '';
  if (act === 'a' && (r.status === 'pending' || r.status === 'hidden')){
    r = await S.updateReview(id, { status: 'approved', decidedBy: by, decidedAt: Date.now() });
    await S.publish(r); toast = 'Одобрено, отзыв опубликован';
  } else if (act === 'r' && r.status === 'pending'){
    r = await S.updateReview(id, { status: 'rejected', decidedBy: by, decidedAt: Date.now() });
    await S.closeOrder(r.token); toast = 'Отклонено';
  } else if (act === 'x' && r.status === 'approved'){
    r = await S.updateReview(id, { status: 'hidden', decidedBy: by, decidedAt: Date.now() });
    await S.unpublish(id); toast = 'Скрыт с сайта';
  } else {
    toast = 'Уже решено: ' + (r.decidedBy ? r.decidedBy.name : r.status);
  }
  await tg.answer(cb.id, toast);
  await tg.edit(chatId, mid, F.cardText(r), { reply_markup: F.cardKeyboard(r) });
}
