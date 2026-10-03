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

  /* --- лайков больше нет: эндпоинт удалён, в публичных данных их нет --- */
  ok('лайков нет: /api/like удалён (404)', (await t.post('/api/like', { id: id1, visitor: 'visitor-aaaaaaaa', on: true }, '10.0.0.7')).status === 404);
  const pubNow = (await (await t.get('/api/reviews')).json()).reviews[0];
  ok('лайков нет: в публичном отзыве нет поля likes', !('likes' in pubNow), Object.keys(pubNow));

  /* --- готовые ответы студии: нейтральны по роду, имя подставляется, хранятся в базе --- */
  const R = require('../api/_lib/replies');
  const GENDER = /(^|[^а-яё])(рад|довол(ен|ьна)|уверен|уверена|благодарен|благодарна|готов|готова)([^а-яё]|$)/i;
  const all = R.DEFAULTS.positive.concat(R.DEFAULTS.critical);
  ok('стандартные ответы: ни одной формы рода (рад/довольна и т. п.)', all.every(s => !GENDER.test(s)), all.filter(s => GENDER.test(s)));
  ok('стандартные ответы: в каждом есть {name}', all.every(s => /\{name\}/.test(s)));
  ok('подстановка имени: «Анна Иванова» → «Анна», «Игорь Таранов» → «Игорь»', R.fill('Спасибо, {name}!', 'Анна Иванова') === 'Спасибо, Анна!' && R.fill('{имя}, привет', '  Игорь   Таранов ') === 'Игорь, привет');
  ok('подбор ответа стабилен: один и тот же отзыв всегда получает один ответ', R.pick(R.DEFAULTS.positive, 'a1b2c3d4e5') === R.pick(R.DEFAULTS.positive, 'a1b2c3d4e5'));
  ok('в публичном отзыве есть готовый ответ с именем клиента и без шаблонных скобок', typeof pubNow.reply === 'string' && pubNow.reply.includes('Марина') && !/\{/.test(pubNow.reply), pubNow.reply);
  ok('ответ для отзыва 5★ взят из «хвалебных»', R.DEFAULTS.positive.some(s => R.fill(s, 'Марина Литвинова') === pubNow.reply));

  await t.say(1001, '/replies');
  ok('/replies показывает обе группы', /4–5★/.test(t.lastSent().body.text) || /4–5★/.test(t.sent().slice(-2)[0].body.text));
  await t.say(1001, '/addreply 5 Мы очень ценим ваш отзыв, {name}! Спасибо, что выбрали нас.');
  ok('/addreply 5: добавлен ответ с примером подстановки', /Добавил/.test(t.lastSent().body.text) && /Анна/.test(t.lastSent().body.text), t.lastSent().body.text);
  await t.say(1001, '/addreply 5 Мы очень ценим ваш отзыв, {name}! Спасибо, что выбрали нас.');
  ok('/addreply: дубль отклонён', /уже есть/.test(t.lastSent().body.text));
  await t.say(1001, '/addreply 5 Я очень рад, что вам понравилось!');
  ok('/addreply: предупреждение про форму рода и про отсутствие {name}', /форма рода/.test(t.lastSent().body.text) && /нет \{name\}/.test(t.lastSent().body.text), t.lastSent().body.text);
  await t.say(1001, '/addreply 5 коротко');
  ok('/addreply: слишком короткий текст отклонён', /от 10 до 300/.test(t.lastSent().body.text));
  await t.say(1001, '/addreply текст без цифры');
  ok('/addreply: без цифры группы — подсказка формата', /Формат/.test(t.lastSent().body.text));
  let tpl = await R.getTemplates();
  ok('ответы сохранились в базе (positive стало ' + tpl.positive.length + ')', tpl.positive.length === R.DEFAULTS.positive.length + 2);
  await t.say(1001, '/delreply 5 ' + tpl.positive.length);
  await t.say(1001, '/delreply 5 ' + (tpl.positive.length - 1));
  tpl = await R.getTemplates();
  ok('/delreply: два добавленных ответа удалены', tpl.positive.length === R.DEFAULTS.positive.length);
  await t.say(1001, '/delreply 5 999');
  ok('/delreply: нет такого номера', /Нет ответа/.test(t.lastSent().body.text));
  await t.say(9999, '/addreply 5 Чужой пытается добавить ответ, {name}.');
  tpl = await R.getTemplates();
  ok('посторонний не может менять ответы', tpl.positive.length === R.DEFAULTS.positive.length);
  await t.say(1001, '/resetreplies');
  ok('/resetreplies возвращает стандартные', /стандартные/.test(t.lastSent().body.text));
  // критичный отзыв (2★) получает ответ из «критичных»
  await t.say(1002, '/new Сайт тест | critical-test.ru | Олег');
  const tokenC = tokenOf(t.lastSent().body.text);
  await t.post('/api/submit', { token: tokenC, rating: 2, name: 'Олег Смирнов', role: '', text: 'Были задержки по срокам, хотелось бы быстрее отвечали.', consent: true }, '10.0.0.8');
  const idC = reviewIdOf(t.lastSent());
  await sleep(2100); await t.press(1003, 'a:' + idC, 110);
  const critical = (await (await t.get('/api/reviews')).json()).reviews.find(x => x.id === idC);
  ok('отзыв 2★ получает ответ из «критичных», не поздравительный', critical && R.DEFAULTS.critical.some(s => R.fill(s, 'Олег Смирнов') === critical.reply), critical);

  /* --- ссылки: список и закрытие --- */
  await t.say(1003, '/new Сайт юриста | lawyer-sokolov.vercel.app | -');
  const token3 = tokenOf(t.lastSent().body.text);
  await t.say(1003, '/orders');
  const ordKb = JSON.stringify(t.lastSent().body.reply_markup);
  ok('/orders: у открытой ссылки есть кнопка-ссылка с токеном и кнопка закрытия', ordKb.includes('/r/' + token3) && ordKb.includes('"k:' + token3 + '"'), ordKb);
  await t.press(1003, 'c:' + token3, 103);
  r = await t.get('/api/order?t=' + token3);
  ok('закрытая ссылка → 410 closed', r.status === 410 && (await r.json()).state === 'closed');

  /* --- меню и кнопки: переходы между экранами нажатием --- */
  const flat = m => m.body.reply_markup.inline_keyboard.flat();
  const lastEdit = () => t.edits().slice(-1)[0].body;
  const hasCb = (btns, d) => btns.some(b => b.callback_data === d);
  await t.say(1001, '/menu');
  let mb = flat(t.lastSent());
  ok('/menu: кнопки «Новая ссылка», «Открытые ссылки», «История», «Ответы студии», «Справка»', ['m:new', 'm:ord', 'h:0', 'm:rep', 'm:help'].every(d => hasCb(mb, d)), mb);
  ok('/menu: кнопки-ссылки «Сайт» и «Отзывы на сайте»', mb.some(b => b.url === t.BASE) && mb.some(b => b.url === t.BASE + '/#reviews'), mb);
  ok('/menu: в тексте счётчики (ждут решения, опубликовано, ссылок)', /Ждут решения/.test(t.lastSent().body.text) && /Опубликовано на сайте/.test(t.lastSent().body.text) && /Ссылок ждут отзыва/.test(t.lastSent().body.text));
  ok('/start тоже открывает меню', (await t.say(1001, '/start'), hasCb(flat(t.lastSent()), 'm:new')));

  await t.press(1001, 'm:ord', 555);
  ok('кнопка «Открытые ссылки»: экран правит то же сообщение, есть «Новая ссылка» и «В меню»', lastEdit().message_id === 555 && /Открытые ссылки|Ссылки, которые ждут/.test(lastEdit().text) && hasCb(lastEdit().reply_markup.inline_keyboard.flat(), 'm:home'), lastEdit());
  await t.press(1001, 'h:0', 555);
  ok('кнопка «История»: список отзывов и «В меню»', /История отзывов/.test(lastEdit().text) && hasCb(lastEdit().reply_markup.inline_keyboard.flat(), 'm:home'));
  await t.press(1001, 'm:help', 555);
  ok('кнопка «Справка»: подсказка по командам и «В меню»', /\/menu/.test(lastEdit().text) && hasCb(lastEdit().reply_markup.inline_keyboard.flat(), 'm:home'));
  await t.press(1001, 'm:home', 555);
  ok('кнопка «В меню» возвращает главное меню', /Выберите действие/.test(lastEdit().text) && hasCb(lastEdit().reply_markup.inline_keyboard.flat(), 'm:rep'));

  // создание ссылки кнопками
  await t.press(1001, 'm:new', 555);
  ok('кнопка «Новая ссылка»: бот спрашивает название (force_reply)', /Как называется проект/.test(t.lastSent().body.text) && t.lastSent().body.reply_markup.force_reply === true);
  await t.say(1001, 'Проект из кнопки'); await t.say(1001, 'button-site.ru'); await t.say(1001, '-');
  const linkMsg = t.lastSent(), linkKb = flat(linkMsg), tokenBtn = tokenOf(linkMsg.body.text);
  ok('после мастера кнопки: «Открыть страницу отзыва» (ссылка), «Закрыть ссылку», «В меню»', linkKb.some(b => b.url && b.url.includes('/r/' + tokenBtn)) && hasCb(linkKb, 'c:' + tokenBtn) && hasCb(linkKb, 'm:home'), linkKb);
  await t.press(1001, 'm:ord', 556);
  ok('новая ссылка видна в «Открытых ссылках»', JSON.stringify(lastEdit().reply_markup).includes('k:' + tokenBtn));
  await t.press(1001, 'k:' + tokenBtn, 556);
  const afterClose = await t.get('/api/order?t=' + tokenBtn);
  ok('замок в списке закрывает ссылку (410) и обновляет список', afterClose.status === 410 && !JSON.stringify(lastEdit().reply_markup).includes('k:' + tokenBtn));

  // ответы студии кнопками
  await t.press(1001, 'm:rep', 557);
  ok('кнопка «Ответы студии»: список и кнопки добавить/удалить/вернуть', /4–5★/.test(lastEdit().text) && ['ra:5', 'ra:3', 'rd:5', 'rd:3', 'rr:ask'].every(d => hasCb(lastEdit().reply_markup.inline_keyboard.flat(), d)));
  await t.press(1001, 'ra:5', 557);
  ok('«Для 4–5★»: бот просит прислать текст (force_reply)', /Пришлите текст ответа/.test(t.lastSent().body.text) && t.lastSent().body.reply_markup.force_reply === true);
  await t.say(1001, 'Спасибо за отзыв, {name}! Работать с вами было приятно.');
  ok('присланный текст сохраняется как ответ, есть кнопка «К ответам»', /Добавил \(4–5★/.test(t.lastSent().body.text) && hasCb(flat(t.lastSent()), 'm:rep'), t.lastSent().body.text);
  let tplB = await R.getTemplates();
  ok('ответ появился в базе', tplB.positive.length === R.DEFAULTS.positive.length + 1);
  await t.press(1001, 'rd:5', 557);
  const nums = lastEdit().reply_markup.inline_keyboard.flat().filter(b => /^rx:5:/.test(b.callback_data));
  ok('«Удалить из 4–5★»: кнопки с номерами (' + nums.length + ' шт.)', /Удалить ответ/.test(lastEdit().text) && nums.length === tplB.positive.length, nums.length);
  await t.press(1001, 'rx:5:' + tplB.positive.length, 557);
  tplB = await R.getTemplates();
  ok('кнопка с номером удаляет ответ', tplB.positive.length === R.DEFAULTS.positive.length);
  await t.press(1001, 'rr:ask', 557);
  ok('«Вернуть стандартные»: сначала подтверждение (Да/Отмена)', /Вернуть стандартные/.test(lastEdit().text) && hasCb(lastEdit().reply_markup.inline_keyboard.flat(), 'rr:yes'));
  await t.press(1001, 'rr:yes', 557);
  ok('после «Да» ответы сброшены, экран ответов обновлён', /4–5★/.test(lastEdit().text));

  // карточка отзыва: кнопка-ссылка на сайт клиента
  const cardKb = card1.body.reply_markup.inline_keyboard;
  ok('карточка отзыва: у кнопок решения есть ссылка «Сайт клиента»', cardKb[0].length === 2 && cardKb.flat().some(b => b.url && b.url.includes('soberi-party-dmitrov.vercel.app')), cardKb);
  // чужие и вне темы кнопки меню не работают
  const editsBefore = t.edits().length;
  await t.press(9999, 'm:home', 558);
  await t.press(1001, 'm:home', 558, { thread: 8 });
  ok('меню: чужой и нажатие из другой темы игнорируются', t.edits().length === editsBefore);

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
