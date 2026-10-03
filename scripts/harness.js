'use strict';
// Тестовая среда: имитация Telegram + локальный сервер + хранилище в памяти. Реальных ключей не нужно.
const http = require('http');

const PORT = 3111, TG_PORT = 3112, BASE = `http://127.0.0.1:${PORT}`;
const NAMES = { 1001: 'Александр', 1002: 'Иван', 1003: 'Игнат', 9999: 'Чужой' };

function mockTelegram(){
  const calls = []; let mid = 100;
  const server = http.createServer((req, res) => {
    let b = ''; req.on('data', d => b += d);
    req.on('end', () => {
      const m = req.url.match(/^\/bot([^/]+)\/(\w+)/), body = b ? JSON.parse(b) : {};
      calls.push({ method: m && m[2], body });
      res.setHeader('Content-Type', 'application/json');
      if (!m || m[1] !== 'TESTTOKEN') return res.end(JSON.stringify({ ok: false, description: 'Unauthorized' }));
      const result = m[2] === 'sendMessage' ? { message_id: ++mid, chat: { id: body.chat_id }, text: body.text } : true;
      res.end(JSON.stringify({ ok: true, result }));
    });
  });
  return new Promise(r => server.listen(TG_PORT, '127.0.0.1', () => r({ server, calls })));
}

async function boot(){
  Object.assign(process.env, {
    AIRIUM_MOCK_REDIS: '1', TG_BOT_TOKEN: 'TESTTOKEN', TG_CHAT_ID: '-100500', TG_ALLOWED_IDS: '1001,1002,1003',
    TG_WEBHOOK_SECRET: 'S3CRET', TG_THREAD_ID: '5', SITE_URL: BASE, TG_API_BASE: `http://127.0.0.1:${TG_PORT}`, IP_SALT: 'test'
  });
  const tg = await mockTelegram();
  const web = await require('./dev-server').start(PORT);
  let n = 0;
  const api = {
    BASE, calls: tg.calls,
    sent: () => tg.calls.filter(c => c.method === 'sendMessage'),
    lastSent: () => tg.calls.filter(c => c.method === 'sendMessage').slice(-1)[0],
    edits: () => tg.calls.filter(c => c.method === 'editMessageText'),
    answers: () => tg.calls.filter(c => c.method === 'answerCallbackQuery'),
    webhook: (update, secret) => fetch(BASE + '/api/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret === undefined ? 'S3CRET' : secret }, body: JSON.stringify(update) }),
    // по умолчанию сообщение пишется в группу -100500, тему 5 («Отзывы»); o = { private, chat, thread } меняет место
    say: (from, text, o) => {
      o = o || {};
      const chat = o.private ? from : (o.chat || -100500), thread = o.private ? 0 : (o.thread === undefined ? 5 : o.thread);
      return api.webhook({ message: Object.assign({ message_id: ++n, from: { id: from, first_name: NAMES[from] || 'X' }, chat: { id: chat, type: o.private ? 'private' : 'supergroup' }, text }, thread ? { message_thread_id: thread, is_topic_message: true } : {}) });
    },
    press: (from, data, mid, o) => {
      o = o || {};
      const thread = o.thread === undefined ? 5 : o.thread;
      return api.webhook({ callback_query: { id: 'cb' + (++n), from: { id: from, first_name: NAMES[from] || 'X' }, data, message: Object.assign({ message_id: mid, chat: { id: o.chat || -100500 }, text: 'карточка' }, thread ? { message_thread_id: thread } : {}) } });
    },
    post: (p, body, ip) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip || '10.0.0.1' }, body: JSON.stringify(body) }),
    get: (p, ip) => fetch(BASE + p, { headers: { 'X-Forwarded-For': ip || '10.0.0.1' } }),
    stop: () => { tg.server.close(); web.close(); }
  };
  return api;
}
module.exports = { boot, BASE };
