'use strict';
// Сквозная проверка всей цепочки: заказ в боте → страница клиента → отзыв → одобрение → публикация. Запуск: node scripts/test-flow.js
const { boot } = require('./harness');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const ok = (name, cond, extra) => { if (!cond) fails++; console.log((cond ? 'OK   ' : 'FAIL ') + name + (extra && !cond ? '  -> ' + extra : '')); };

(async () => {
  const t = await boot();
  const tokenOf = text => (String(text).match(/\/r\/([A-Za-z0-9_-]+)/) || [])[1];
  const reviewIdOf = msg => { const kb = msg.body.reply_markup.inline_keyboard[0][0].callback_data; return kb.split(':')[1]; };

  /* --- доступ --- */
  ok('вебхук без секрета отклонён (401)', (await t.webhook({ message: {} }, 'wrong')).status === 401);
  const quiet = async (name, who, text, o) => { const n0 = t.sent().length; await t.say(who, text, o); ok(name, t.sent().length === n0); };
  await quiet('посторонний в теме «Отзывы»: бот молчит', 9999, '/new');
  await quiet('свой, но в личке с ботом: бот молчит', 1001, '/new', { private: true });
  await quiet('свой, но в другой теме (8): бот молчит', 1001, '/new', { thread: 8 });
  await quiet('свой, но в «Общей» теме без номера: бот молчит', 1001, '/new', { thread: 0 });
  await quiet('свой, но в другом чате: бот молчит', 1001, '/new', { chat: -777 });
  await t.say(1001, '/help');
  ok('в теме «Отзывы» бот отвечает и тоже в ней (thread 5)', t.lastSent().body.message_thread_id === 5 && /Airium/.test(t.lastSent().body.text));

  /* --- мастер /new --- */
  await t.say(1001, '/new');
  ok('мастер: спросил название (force_reply)', /Как называется проект/.test(t.lastSent().body.text) && t.lastSent().body.reply_markup.force_reply === true);
  await t.say(1001, 'Сайт «Soberi Party»');
  ok('мастер: спросил сайт', /ссылку на сайт/.test(t.lastSent().body.text));
  await t.say(1001, 'не сайт');
  ok('мастер: плохая ссылка отклонена', /Не похоже на адрес/.test(t.lastSent().body.text));
  await t.say(1001, 'soberi-party-dmitrov.vercel.app');
  ok('мастер: спросил клиента', /Как зовут клиента/.test(t.lastSent().body.text));
  await t.say(1001, 'Марина Литвинова');
  const link1 = t.lastSent().body.text, token1 = tokenOf(link1);
  ok('мастер: выдал личную ссылку', !!token1 && token1.length === 22 && /127\.0\.0\.1:3111\/r\//.test(link1), link1);

  /* --- страница клиента: данные --- */
  let r = await t.get('/api/order?t=' + token1), j = await r.json();
  ok('order: проект и сайт переданы', r.status === 200 && j.state === 'open' && j.product === 'Сайт «Soberi Party»' && j.siteLabel === 'soberi-party-dmitrov.vercel.app' && j.clientName === 'Марина Литвинова');
  ok('order: неизвестный токен → 404', (await t.get('/api/order?t=aaaaaaaaaaaaaaaaaaaaaa')).status === 404);
  ok('order: мусорный токен → 404', (await t.get('/api/order?t=../../etc')).status === 404);

  /* --- отправка отзыва --- */
  const good = { token: token1, rating: 5, name: 'Марина Литвинова', role: 'Основательница студии', text: 'Сайт заработал в тот же вечер, как мы его запустили. Первые заявки пришли с телефона.', consent: true, website: '' };
  r = await t.post('/api/submit', Object.assign({}, good, { rating: 0 }), '10.0.0.2');
  ok('submit: оценка 0 → 400 с полем rating', r.status === 400 && (await r.json()).fields.rating);
  r = await t.post('/api/submit', Object.assign({}, good, { consent: false }), '10.0.0.2');
  ok('submit: без согласия → 400', r.status === 400);
  r = await t.post('/api/submit', Object.assign({}, good, { text: 'коротко' }), '10.0.0.2');
  ok('submit: короткий текст → 400', r.status === 400);
  const cardsBefore = t.sent().length;
  r = await t.post('/api/submit', Object.assign({}, good, { website: 'spam.ru' }), '10.0.0.2');
  ok('submit: ловушка для ботов — тихо «ок», но ничего не создаёт', r.status === 200 && t.sent().length === cardsBefore);

  r = await t.post('/api/submit', good, '10.0.0.2');
  ok('submit: корректный отзыв принят', r.status === 200 && (await r.json()).ok === true);
  const card1 = t.lastSent();
  ok('карточка ушла в общий чат с кнопками', card1.body.chat_id === '-100500' && /Новый отзыв/.test(card1.body.text) && /Soberi Party/.test(card1.body.text) && card1.body.reply_markup.inline_keyboard[0].length === 2);
  ok('карточка отзыва уходит в заданную тему (TG_THREAD_ID=5)', card1.body.message_thread_id === 5);
  const id1 = reviewIdOf(card1);
  ok('повторная отправка по той же ссылке → 409', (await t.post('/api/submit', good, '10.0.0.2')).status === 409);
  ok('order после отправки: submitted', (await (await t.get('/api/order?t=' + token1)).json()).state === 'submitted');
  ok('до одобрения отзыв НЕ публичен', (await (await t.get('/api/reviews')).json()).reviews.length === 0);

  /* --- модерация --- */
  await t.press(1002, 'a:' + id1, 101, { thread: 8 });
  ok('кнопка из другой темы игнорируется', (await (await t.get('/api/reviews')).json()).reviews.length === 0);
  await t.press(9999, 'a:' + id1, 101);
  ok('чужой не может одобрить', t.answers().slice(-1)[0].body.show_alert === true && (await (await t.get('/api/reviews')).json()).reviews.length === 0);
  await t.press(1002, 'a:' + id1, 101);
  let pub = (await (await t.get('/api/reviews')).json()).reviews;
  ok('одобрение: отзыв опубликован', pub.length === 1 && pub[0].name === 'Марина Литвинова' && pub[0].url.startsWith('https://soberi-party-dmitrov.vercel.app') && pub[0].site === 'soberi-party-dmitrov.vercel.app');
  const e1 = t.edits().slice(-1)[0];
  ok('карточка обновлена: кто одобрил и когда', /Одобрено/.test(e1.body.text) && /Иван/.test(e1.body.text) && e1.body.message_id === 101);
  await sleep(2100);
  await t.press(1003, 'a:' + id1, 101);
  ok('повторное одобрение: «уже решено», дубля нет', /Уже решено/.test(t.answers().slice(-1)[0].body.text) && (await (await t.get('/api/reviews')).json()).reviews.length === 1);

  /* --- история --- */
  await t.say(1001, '/history');
  const h = t.lastSent().body.text;
  ok('/history: проект, оценка, начало текста, кто одобрил', /Soberi Party/.test(h) && /★★★★★/.test(h) && /Сайт заработал/.test(h) && /одобрено · Иван/.test(h), h);

  /* --- отклонение --- */
  await t.say(1002, '/new Кофейня Мякиш | myakish.ru | Денис');
  const token2 = tokenOf(t.lastSent().body.text);
  ok('быстрая форма /new: ссылка выдана', !!token2);
  await t.post('/api/submit', { token: token2, rating: 2, name: 'Денис', role: '', text: 'Не очень, долго отвечали на сообщения и сроки сдвигались.', consent: true }, '10.0.0.3');
  const id2 = reviewIdOf(t.lastSent());
  await t.press(1003, 'r:' + id2, 102);
  ok('отклонение: не публикуется, ссылка закрыта', (await (await t.get('/api/reviews')).json()).reviews.length === 1 && /Отклонено/.test(t.edits().slice(-1)[0].body.text) && /Игнат/.test(t.edits().slice(-1)[0].body.text));
  ok('после отклонения повторная отправка → 409', (await t.post('/api/submit', { token: token2, rating: 5, name: 'Денис', text: 'Попытка отправить повторно этот же отзыв.', consent: true }, '10.0.0.3')).status === 409);

  /* --- скрыть / вернуть --- */
  await sleep(2100);   // защита от двойного клика держится 2 секунды
  await t.press(1001, 'x:' + id1, 101);
  ok('скрыть с сайта: пропал из публичного списка', (await (await t.get('/api/reviews')).json()).reviews.length === 0);
  await sleep(2100);
  await t.press(1001, 'a:' + id1, 101);
  ok('вернуть на сайт: снова в списке', (await (await t.get('/api/reviews')).json()).reviews.length === 1);

  /* --- лайки --- */
  const like = (visitor, on, id) => t.post('/api/like', { id: id || id1, visitor, on }, '10.0.0.7').then(r => r.json().then(j => ({ s: r.status, j })));
  let L = await like('visitor-aaaaaaaa', true);
  ok('лайк: первый посетитель → 1', L.s === 200 && L.j.count === 1 && L.j.liked === true, L);
  L = await like('visitor-aaaaaaaa', true);
  ok('лайк: повтор того же посетителя не накручивает (всё ещё 1)', L.j.count === 1, L);
  L = await like('visitor-bbbbbbbb', true);
  ok('лайк: второй посетитель → 2', L.j.count === 2, L);
  L = await like('visitor-aaaaaaaa', false);
  ok('лайк: снятие → 1', L.j.count === 1 && L.j.liked === false, L);
  ok('лайк: в публичном списке счётчик = 1', (await (await t.get('/api/reviews')).json()).reviews[0].likes === 1);
  ok('лайк: короткий ID посетителя → 400', (await like('x', true)).s === 400);
  ok('лайк: неодобренный/чужой отзыв → 404', (await like('visitor-cccccccc', true, id2)).s === 404);
  ok('лайк: битый id → 400', (await like('visitor-cccccccc', true, 'zzzz')).s === 400);

  /* --- ссылки: список и закрытие --- */
  await t.say(1003, '/new Сайт юриста | lawyer-sokolov.vercel.app | -');
  const token3 = tokenOf(t.lastSent().body.text);
  await t.say(1003, '/orders');
  ok('/orders: открытая ссылка в списке', t.lastSent().body.text.includes(token3));
  await t.press(1003, 'c:' + token3, 103);
  r = await t.get('/api/order?t=' + token3);
  ok('закрытая ссылка → 410 closed', r.status === 410 && (await r.json()).state === 'closed');

  /* --- безопасность текста --- */
  await t.say(1001, '/new Тест XSS | xss-test.ru | Клиент');
  const token4 = tokenOf(t.lastSent().body.text);
  await t.post('/api/submit', { token: token4, rating: 4, name: '<b>Хакер</b>', role: '<i>x</i>', text: 'Пробуем <script>alert(1)</script> & проверяем экранирование в карточке.', consent: true }, '10.0.0.4');
  const xc = t.lastSent().body.text;
  ok('Telegram-карточка экранирует HTML клиента', !/<script>/.test(xc) && /&lt;script&gt;/.test(xc) && !/<b>Хакер<\/b>/.test(xc), xc);

  /* --- лимит --- */
  let limited = false;
  for (let i = 0; i < 12 && !limited; i++){ limited = (await t.post('/api/submit', { token: 'x'.repeat(22), rating: 5 }, '10.0.0.9')).status === 429; }
  ok('лимит частоты отправки срабатывает (429)', limited);

  console.log(fails ? `\nПровалено проверок: ${fails}` : '\nВсе проверки пройдены');
  t.stop();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('ТЕСТ УПАЛ:', e); process.exit(2); });
