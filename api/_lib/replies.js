'use strict';
// Ответы студии под отзывами. Хранятся в базе (ключ cfg:replies), если там пусто — берутся стандартные.
// Тексты нейтральны по роду: обращение только на «вы» (множественное число), без форм вроде «рад/рада», «довольна/доволен»,
// поэтому подходят и женским, и мужским именам. В текст подставляется имя клиента через {name}.
const redis = require('./redis');
const KEY = 'cfg:replies';

const DEFAULTS = {
  // для отзывов с оценкой 4–5
  positive: [
    'Большое спасибо за отзыв, {name}! Нам было приятно работать с вами, будем рады видеть вас снова.',
    '{name}, спасибо, что нашли время написать! Для нас это очень ценно.',
    'Благодарим вас за тёплые слова, {name}! Рады, что проект принёс пользу вашему делу.',
    'Спасибо за отзыв, {name}! Если понадобятся правки или новый проект, мы всегда на связи.',
    '{name}, большое спасибо! Желаем вашему делу роста, а сайту много заявок.',
    'Спасибо вам, {name}, за доверие и отзыв! Было здорово делать этот проект вместе.',
    '{name}, спасибо за обратную связь! Ваш отзыв помогает нам становиться лучше.',
    'Благодарим за отзыв, {name}! Будем рады помочь и с развитием сайта дальше.',
    'Большое спасибо, {name}! Рады, что итог вам понравился. Если что-то понадобится, пишите.',
    'Спасибо за добрые слова, {name}! Мы старались, и нам очень приятно, что это заметно.'
  ],
  // для отзывов с оценкой 1–3
  critical: [
    '{name}, спасибо за честный отзыв. Нам важно знать, что можно улучшить, мы обязательно учтём ваши замечания.',
    'Благодарим вас за откровенность, {name}. Мы обязательно разберём ситуацию и сделаем выводы.',
    'Спасибо, что поделились впечатлениями, {name}. Нам жаль, что не всё получилось идеально, и мы готовы всё исправить.',
    '{name}, ценим ваш отзыв. Напишите нам, пожалуйста: хотим разобраться и сделать лучше.'
  ]
};

const group = rating => (Number(rating) >= 4 ? 'positive' : 'critical');
const firstName = full => String(full || '').trim().split(/\s+/)[0] || '';
// Подстановка имени: {name} и {имя} заменяются на имя клиента (первое слово из «Имя Фамилия»)
const fill = (tpl, fullName) => String(tpl).replace(/\{(name|имя)\}/gi, firstName(fullName));
// Один и тот же отзыв всегда получает один и тот же ответ (по id), поэтому текст не «прыгает» при перезагрузке
function pick(list, id){
  let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}
const validList = a => Array.isArray(a) && a.length > 0 && a.every(s => typeof s === 'string' && s.trim());

// Всегда копии: вызывающий код (бот) дописывает и удаляет элементы, стандартные ответы в памяти менять нельзя
async function getTemplates(){
  try {
    const raw = await redis('GET', KEY); const j = raw ? JSON.parse(raw) : null;
    return { positive: (validList(j && j.positive) ? j.positive : DEFAULTS.positive).slice(), critical: (validList(j && j.critical) ? j.critical : DEFAULTS.critical).slice() };
  } catch (e) { return { positive: DEFAULTS.positive.slice(), critical: DEFAULTS.critical.slice() }; }
}
const saveTemplates = t => redis('SET', KEY, JSON.stringify(t));
const resetTemplates = () => redis('DEL', KEY);

// Готовый текст ответа для отзыва
const replyFor = (templates, review) => fill(pick(templates[group(review.rating)], review.id), review.name);

module.exports = { DEFAULTS, group, firstName, fill, pick, getTemplates, saveTemplates, resetTemplates, replyFor };
