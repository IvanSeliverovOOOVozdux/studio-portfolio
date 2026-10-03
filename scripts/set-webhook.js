'use strict';
// Подключает бота к сайту. Нужны TG_BOT_TOKEN, TG_WEBHOOK_SECRET, SITE_URL (в C:\Users\sasha\works\.env).
//   node scripts/set-webhook.js          — привязать вебхук и список команд бота
//   node scripts/set-webhook.js info     — показать состояние вебхука
//   node scripts/set-webhook.js chats    — найти ID чатов, где писали боту (для TG_CHAT_ID и TG_ALLOWED_IDS)
//   node scripts/set-webhook.js drop     — отвязать вебхук
require('./env').loadEnv();
const token = process.env.TG_BOT_TOKEN, secret = process.env.TG_WEBHOOK_SECRET, site = (process.env.SITE_URL || '').replace(/\/+$/, '');
const mode = process.argv[2] || 'set';

async function tg(method, body){
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  return j;
}
(async () => {
  if (!token){ console.error('Нет TG_BOT_TOKEN. Добавьте его в C:\\Users\\sasha\\works\\.env'); process.exit(1); }
  const me = await tg('getMe');
  if (!me.ok){ console.error('Токен не принят Telegram:', me.description); process.exit(1); }
  console.log('Бот: @' + me.result.username);

  if (mode === 'info'){ const i = (await tg('getWebhookInfo')).result; console.log({ url: i.url, pending: i.pending_update_count, lastError: i.last_error_message || null }); return; }
  if (mode === 'drop'){ console.log((await tg('deleteWebhook', { drop_pending_updates: true })).ok ? 'Вебхук отвязан' : 'Ошибка'); return; }
  if (mode === 'chats'){
    const u = await tg('getUpdates');
    if (!u.ok){ console.error(u.description, '\nЕсли вебхук уже привязан, сначала: node scripts/set-webhook.js drop'); process.exit(1); }
    const seen = new Map();
    for (const x of u.result){ const m = x.message || (x.callback_query && x.callback_query.message); const f = x.message ? x.message.from : x.callback_query && x.callback_query.from;
      if (m) seen.set(m.chat.id, `${m.chat.type} «${m.chat.title || m.chat.first_name || ''}»  <- это TG_CHAT_ID`);
      if (m && m.message_thread_id) seen.set('тема ' + m.message_thread_id, `в чате ${m.chat.id}` + (m.reply_to_message && m.reply_to_message.forum_topic_created ? `, «${m.reply_to_message.forum_topic_created.name}»` : '') + '  <- это TG_THREAD_ID');
      if (f) seen.set('user ' + f.id, `${f.first_name || ''} ${f.last_name || ''} @${f.username || ''}`.trim() + '  <- в TG_ALLOWED_IDS'); }
    if (!seen.size) console.log('Пока пусто. Напишите боту /start в личку, а в группе (в нужной теме) отправьте /help@имя_бота, потом запустите ещё раз.');
    seen.forEach((v, k) => console.log(String(k).padEnd(22), v));
    return;
  }
  if (!secret || !site){ console.error('Нужны TG_WEBHOOK_SECRET и SITE_URL (адрес задеплоенного сайта, https://...)'); process.exit(1); }
  if (!/^https:\/\//.test(site)){ console.error('SITE_URL должен начинаться с https:// (Telegram требует HTTPS)'); process.exit(1); }
  if (!process.env.TG_CHAT_ID){ console.error('Не задан TG_CHAT_ID: без него бот отвечал бы в любых чатах, включая личные. Запустите: node scripts/set-webhook.js chats'); process.exit(1); }
  if (!process.env.TG_THREAD_ID) console.warn('ВНИМАНИЕ: TG_THREAD_ID не задан, бот будет отвечать во ВСЕХ темах группы, а не только в «Отзывы».');
  if (!process.env.TG_ALLOWED_IDS) console.warn('ВНИМАНИЕ: TG_ALLOWED_IDS пуст, бот никому не будет отвечать.');
  const w = await tg('setWebhook', { url: site + '/api/telegram', secret_token: secret, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
  console.log(w.ok ? 'Вебхук привязан: ' + site + '/api/telegram' : 'Ошибка: ' + w.description);
  const c = await tg('setMyCommands', { commands: [
    { command: 'menu', description: 'Главное меню с кнопками' },
    { command: 'new', description: 'Создать ссылку на отзыв для клиента' },
    { command: 'orders', description: 'Ссылки, которые ждут отзыва' },
    { command: 'history', description: 'История отзывов' },
    { command: 'replies', description: 'Готовые ответы студии под отзывами' },
    { command: 'addreply', description: 'Добавить ответ: /addreply 5 текст с {name}' },
    { command: 'delreply', description: 'Удалить ответ: /delreply 5 номер' },
    { command: 'resetreplies', description: 'Вернуть стандартные ответы' },
    { command: 'cancel', description: 'Отменить ввод' },
    { command: 'help', description: 'Справка' }
  ] });
  console.log(c.ok ? 'Команды бота обновлены' : 'Команды: ' + c.description);
})().catch(e => { console.error(e.message); process.exit(1); });
