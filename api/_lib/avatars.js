'use strict';
// Аватарка клиента в отзыве: цвет из палитры + либо смайлик из набора, либо буквы имени (инициалы считает страница).
// Список здесь — единственный источник правды: страница отзыва получает его с сервера (/api/order),
// а сервер принимает только значения из этого списка (клиент не может прислать произвольный цвет или символы).
const COLORS = [
  { c: '#d1344f', n: 'Гранат' },
  { c: '#ee6c2b', n: 'Мандарин' },
  { c: '#d4920a', n: 'Золото' },
  { c: '#2e9d5f', n: 'Изумруд' },
  { c: '#14a3a8', n: 'Бирюза' },
  { c: '#2f63e0', n: 'Синий' },
  { c: '#7a5af0', n: 'Фиолет' },
  { c: '#d6489f', n: 'Роза' },
  { c: '#2d9cdb', n: 'Небо' },
  { c: '#26211d', n: 'Графит' }
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
