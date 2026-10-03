'use strict';
// Тексты для Telegram (parse_mode=HTML — всё, что пишет клиент, экранируется).
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);
const fmt = ts => new Date(ts).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');
const snippet = (t, n) => { const s = String(t).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n).trimEnd() + '…' : s; };
const ICON = { pending: '⏳', approved: '✅', rejected: '❌', hidden: '🙈' };

function footer(r){
  if (r.status === 'approved') return `✅ <b>Одобрено</b> · ${esc(r.decidedBy.name)} · ${fmt(r.decidedAt)}\nОпубликован на сайте.`;
  if (r.status === 'rejected') return `❌ <b>Отклонено</b> · ${esc(r.decidedBy.name)} · ${fmt(r.decidedAt)}\nСсылка закрыта.`;
  if (r.status === 'hidden')   return `🙈 <b>Скрыт с сайта</b> · ${esc(r.decidedBy.name)} · ${fmt(r.decidedAt)}`;
  return '';
}
function cardText(r){
  const lines = [
    r.status === 'pending' ? '<b>Новый отзыв на проверку</b>' : '<b>Отзыв</b>',
    `Проект: <b>${esc(r.product)}</b>${r.siteLabel ? ' · ' + esc(r.siteLabel) : ''}`,
    `Клиент: ${esc(r.name)}${r.role ? ', ' + esc(r.role) : ''}`,
    `Оценка: ${stars(r.rating)}`,
    '', `«${esc(r.text)}»`
  ];
  const f = footer(r); if (f) lines.push('', f);
  return lines.join('\n');
}
function cardKeyboard(r){
  const site = r.siteUrl ? [[{ text: '🌐 Сайт клиента', url: r.siteUrl }]] : [];     // кнопка-ссылка на сайт, о котором отзыв
  if (r.status === 'pending')  return { inline_keyboard: [[{ text: '✅ Одобрить', callback_data: 'a:' + r.id }, { text: '❌ Отклонить', callback_data: 'r:' + r.id }]].concat(site) };
  if (r.status === 'approved') return { inline_keyboard: [[{ text: '🙈 Скрыть с сайта', callback_data: 'x:' + r.id }]].concat(site) };
  if (r.status === 'hidden')   return { inline_keyboard: [[{ text: '↩️ Опубликовать снова', callback_data: 'a:' + r.id }]].concat(site) };
  return { inline_keyboard: site };
}
function historyLine(r){
  const who = r.decidedBy ? ` · ${esc(r.decidedBy.name)} · ${fmt(r.decidedAt)}` : '';
  const label = { pending: 'ждёт решения', approved: 'одобрено', rejected: 'отклонено', hidden: 'скрыто' }[r.status];
  return `${ICON[r.status]} <b>${esc(r.product)}</b> · ${stars(r.rating)} · ${esc(r.name)}\n«${esc(snippet(r.text, 80))}»\n<i>${label}${who}</i>`;
}

module.exports = { esc, stars, fmt, snippet, ICON, cardText, cardKeyboard, historyLine };
