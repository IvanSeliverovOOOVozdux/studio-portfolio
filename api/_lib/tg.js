'use strict';
const { cfg } = require('./config');

async function call(method, body){
  const c = cfg();
  if (!c.token) throw new Error('Не задан TG_BOT_TOKEN');
  const r = await fetch(`${c.tgBase}/bot${c.token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description || r.status}`);
  return j.result;
}

const base = { parse_mode: 'HTML', disable_web_page_preview: true };
module.exports = {
  call,
  send:   (chat_id, text, extra) => call('sendMessage', Object.assign({ chat_id, text }, base, extra)),
  edit:   (chat_id, message_id, text, extra) => call('editMessageText', Object.assign({ chat_id, message_id, text }, base, extra)).catch(e => { if (!/not modified/i.test(e.message)) throw e; }),
  answer: (callback_query_id, text, show_alert) => call('answerCallbackQuery', { callback_query_id, text: text || '', show_alert: !!show_alert }).catch(() => {})
};
