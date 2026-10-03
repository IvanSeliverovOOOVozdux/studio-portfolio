'use strict';
// Аватарка клиента в отзыве: цвет из палитры + либо смайлик из набора, либо буквы имени (инициалы считает страница).
// Список здесь — единственный источник правды: страница отзыва получает его с сервера (/api/order),
// а сервер принимает только значения из этого списка (клиент не может прислать произвольный цвет или символы).
const COLORS = [
  { c: '#9e2b45', n: 'Гранат' },
  { c: '#c2603a', n: 'Терракота' },
  { c: '#a8803a', n: 'Золото' },
  { c: '#3f7a58', n: 'Зелень' },
  { c: '#2f6f7a', n: 'Бирюза' },
  { c: '#3b5ba5', n: 'Синий' },
  { c: '#6b5b95', n: 'Лаванда' },
  { c: '#8a4f7d', n: 'Слива' },
  { c: '#5c534a', n: 'Мокко' },
  { c: '#1b1714', n: 'Графит' }
];
const EMOJIS = ['🙂', '😊', '😎', '🤓', '😍', '🥳', '😇', '🤩', '😺', '🐶', '🦊', '🐼', '🦁', '🐸', '🦄', '🌟', '🔥', '❤️', '👍', '🚀', '🌈', '☕', '🍀', '🎨'];

// Принимает присланное клиентом; возвращает { value } ({ c, e|null } или null, если не выбирал) либо { error }.
function normalize(color, emoji){
  const c = String(color == null ? '' : color).trim().toLowerCase();
  const e = String(emoji == null ? '' : emoji);
  if (!c && !e) return { value: null };                        // клиент ничего не выбирал: на сайте будет цвет по умолчанию и буквы
  const found = COLORS.find(x => x.c === c);
  if (!found) return { error: 'Выберите цвет аватарки из списка' };
  if (e && !EMOJIS.includes(e)) return { error: 'Выберите смайлик из списка' };
  return { value: { c: found.c, e: e || null } };
}
const colorName = c => (COLORS.find(x => x.c === c) || {}).n || '';
module.exports = { COLORS, EMOJIS, normalize, colorName };
