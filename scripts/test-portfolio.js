'use strict';
// Блок отзывов на портфолио: скрыт без отзывов, после одобрения появляется между «Как мы работаем» и «Прайс»,
// цикл с «печатает…», ответами студии, обратной анимацией ухода, паузой при наведении, стрелками и нумерацией.
// Запуск: node scripts/test-portfolio.js [папка для скриншотов]
const path = require('path');
const puppeteer = require('puppeteer-core');
const { boot } = require('./harness');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = process.argv[2] || __dirname;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log((c ? 'OK   ' : 'FAIL ') + n + (x !== undefined && !c ? ' -> ' + JSON.stringify(x) : '')); };

(async () => {
  const t = await boot();
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new' });
  const p = await browser.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.setViewport({ width: 1440, height: 1000 });
  const open = async () => { await p.goto(t.BASE + '/', { waitUntil: 'networkidle0' }); await sleep(600); };

  await open();
  ok('без отзывов: блок и пункт меню скрыты', await p.$eval('#reviews', e => e.hidden) && await p.$eval('#navReviews', e => e.hidden));

  // три отзыва: мужское имя, женское, критичный
  const mk = async (cmd, rating, name, text, ip, extra) => {
    await t.say(1001, cmd); const token = (t.lastSent().body.text.match(/\/r\/([\w-]+)/) || [])[1];
    await t.post('/api/submit', Object.assign({ token, rating, name, role: 'Тест', text, consent: true }, extra || {}), ip);
    const rid = t.lastSent().body.reply_markup.inline_keyboard[0][0].callback_data.split(':')[1];
    await sleep(2100); await t.press(1002, 'a:' + rid, 100 + Math.floor(Math.random() * 1e4)); return rid;
  };
  await mk('/new Сайт кофейни «Мякиш» | myakish.ru | Денис', 5, 'Денис Орлов', 'Сделали быстро и аккуратно, гости сразу заметили новое меню.', '10.0.0.5', { avatarColor: '#3f7a58', avatarEmoji: '🦊' });
  await mk('/new Цветочная студия | len-polyn.ru | Марина', 5, 'Марина Литвинова', 'Сайт заработал в тот же вечер, как мы его запустили, заявки пошли с телефона.', '10.0.0.6', { avatarColor: '#6b5b95' });
  await mk('/new Сайт юриста | weiss-law.ru | Олег', 2, 'Олег Смирнов', 'Были задержки по срокам, хотелось бы, чтобы отвечали быстрее.', '10.0.0.7');
  const api = (await (await t.get('/api/reviews')).json()).reviews;
  ok('API отдаёт 3 отзыва, у каждого готовый ответ с именем, без шаблонных скобок и без лайков', api.length === 3 && api.every(r => r.reply && !/\{/.test(r.reply) && r.reply.includes(r.name.split(' ')[0]) && !('likes' in r)), api.map(r => r.reply));

  await open();
  const ev = async () => p.evaluate(() => window.__e);
  await p.evaluate(() => {
    window.__e = []; const t0 = performance.now(); const body = document.querySelector('#revBody');
    new MutationObserver(ms => ms.forEach(m => {
      m.addedNodes.forEach(n => { if (n.nodeType === 1 && n.classList.contains('rev-msg')) window.__e.push({ at: Math.round(performance.now() - t0), ev: '+ ' + (n.classList.contains('out') ? 'студия' : 'клиент') + (n.querySelector('.rev-typing') ? ' печатает' : ' сообщение'), name: (n.querySelector('.nm') || {}).textContent || '', text: (n.querySelector('p') || {}).textContent || '' }); });
      if (m.type === 'attributes' && m.target.classList && m.target.classList.contains('leaving') && !m.target.__s) { m.target.__s = 1; window.__e.push({ at: Math.round(performance.now() - t0), ev: 'УХОДИТ', anim: getComputedStyle(m.target).animationName, delay: getComputedStyle(m.target).animationDelay }); }
      if (m.type === 'childList' && m.removedNodes.length && !body.querySelector('.rev-msg')) window.__e.push({ at: Math.round(performance.now() - t0), ev: 'экран пуст' });
    })).observe(body, { childList: true, attributes: true, subtree: true, attributeFilter: ['class'] });
  });
  // сначала подключаем наблюдателя, и только потом прокручиваем к блоку (прокрутка запускает анимацию)
  await p.$eval('#reviews', e => e.scrollIntoView({ block: 'center' }));
  await sleep(300);
  const wait = async (f, ms) => { for (let i = 0; i < (ms || 9000) / 50; i++) { if (await f()) return true; await sleep(50); } return false; };
  const counter = () => p.$eval('#revCount', e => e.textContent);
  const lastClient = () => p.evaluate(() => { const m = document.querySelector('#revBody .rev-msg.in:not(:has(.rev-typing)) .nm'); return m ? m.textContent : null; });

  ok('блок появился после одобрения; пункт меню «Отзывы» показан', !(await p.$eval('#reviews', e => e.hidden)) && !(await p.$eval('#navReviews', e => e.hidden)));
  const order = await p.evaluate(() => { const y = id => document.getElementById(id).getBoundingClientRect().top + scrollY; return { about: y('about'), reviews: y('reviews'), price: y('price') }; });
  ok('порядок: «Как мы работаем» → «Отзывы» → «Прайс»', order.about < order.reviews && order.reviews < order.price, order);
  ok('панель стрелок видна, номер «01/03»', await wait(async () => (await counter()) === '01/03', 4000) && !(await p.$eval('#revNav', e => e.hidden)));
  ok('первым играет самый новый отзыв (Олег Смирнов, критичный)', await wait(async () => (await lastClient()) === 'Олег Смирнов', 4000), await lastClient());
  await wait(async () => (await ev()).some(x => x.ev === '+ студия сообщение'), 5000);
  let e = await ev();
  const avOf = () => p.evaluate(() => { const m = document.querySelector('#revBody .rev-msg.in:not(:has(.rev-typing))'); if (!m) return null; const a = m.querySelector('.rev-ava'), n = m.querySelector('.nm'); return { text: a.textContent, emoji: a.classList.contains('emoji'), bg: getComputedStyle(a).backgroundColor, nameColor: getComputedStyle(n).color }; });
  const ava1 = await avOf();
  ok('отзыв без выбранной аватарки (Олег): буквы «ОС», запасной цвет, имя того же цвета', ava1 && ava1.text === 'ОС' && !ava1.emoji && ava1.bg === 'rgb(158, 43, 69)' && ava1.nameColor === ava1.bg, ava1);
  const reply1 = e.find(x => x.ev === '+ студия сообщение');
  ok('ответ студии обращается по имени и подходит под критичный отзыв', reply1 && reply1.text.includes('Олег') && /честн|откровен|поделились|ценим/.test(reply1.text), reply1);
  const d = (a, b) => (e.find(x => x.ev === b) || {}).at - (e.find(x => x.ev === a) || {}).at;
  const dc = d('+ клиент печатает', '+ клиент сообщение'), ds = d('+ студия печатает', '+ студия сообщение'), dr = d('+ клиент сообщение', '+ студия сообщение');
  ok('отзыв появляется через 1,5 с после «печатает…» (' + dc + ' мс)', Math.abs(dc - 1500) < 200, dc);
  ok('ответ студии появляется ровно через 1,5 с после отзыва (' + dr + ' мс), «печатает…» студии тоже 1,5 с (' + ds + ' мс)', Math.abs(dr - 1500) < 200 && Math.abs(ds - 1500) < 200, [dr, ds]);
  const g = await p.evaluate(() => { const r = e => { const x = e.getBoundingClientRect(); return { l: x.left, r: x.right, cx: x.left + x.width / 2, cy: x.top + x.height / 2, b: x.bottom }; }; const m = document.querySelector('.rev-msg.in:not(:has(.rev-typing))'), o = document.querySelector('.rev-msg.out:not(:has(.rev-typing))'); return { inB: r(m.querySelector('.rev-bub')), inA: r(m.querySelector('.rev-ava')), outB: r(o.querySelector('.rev-bub')), outA: r(o.querySelector('.rev-ava')), logo: !!o.querySelector('.rev-ava img') }; });
  const near = (a, b) => Math.abs(a - b) < 22;
  ok('аватарка клиента на левом нижнем углу, студии (логотип) на правом нижнем', near(g.inA.cx, g.inB.l) && near(g.inA.cy, g.inB.b) && near(g.outA.cx, g.outB.r) && near(g.outA.cy, g.outB.b) && g.logo, g);
  await p.screenshot({ path: path.join(OUT, 'portfolio-new-chat.png') });

  // пауза при наведении
  const box = await (await p.$('#revChat')).boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + 150);
  await sleep(4500);
  e = await ev();
  ok('мышь над окном: пара держится больше 4 с и не уходит', !e.some(x => x.ev === 'УХОДИТ'));
  await p.mouse.move(20, 20); const leftAt = await p.evaluate(() => Math.round(performance.now()));
  ok('курсор ушёл: через ≈ 2 с оба сообщения одновременно уходят обратной анимацией (revOut, без задержки)', await wait(async () => (await ev()).filter(x => x.ev === 'УХОДИТ').length >= 2, 3500));
  e = await ev(); const lv = e.filter(x => x.ev === 'УХОДИТ');
  ok('уход: оба сообщения, анимация revOut, delay 0s', lv.length >= 2 && lv.every(x => x.anim === 'revOut' && x.delay === '0s'), lv);
  ok('после ухода экран очищается и идёт следующий отзыв (02/03, Марина Литвинова)', await wait(async () => (await counter()) === '02/03' && (await lastClient()) === 'Марина Литвинова', 6000), [await counter(), await lastClient()]);
  await wait(async () => (await ev()).some(x => x.ev === '+ клиент сообщение' && x.name === 'Марина Литвинова'), 6000);
  const ava2 = await avOf();
  ok('Марина выбрала фиолетовый цвет и буквы: «МЛ» на rgb(107, 91, 149), имя того же цвета', ava2 && ava2.text === 'МЛ' && !ava2.emoji && ava2.bg === 'rgb(107, 91, 149)' && ava2.nameColor === ava2.bg, ava2);
  const m2 = await wait(async () => (await ev()).some(x => x.ev === '+ студия сообщение' && x.text.includes('Марина')), 6000);
  ok('у Марины (5★) ответ хвалебный, с её именем', m2);

  // стрелки
  await p.$eval('[data-nav="1"]', b => b.click());
  ok('«вперёд»: 03/03, Денис Орлов', await wait(async () => (await counter()) === '03/03' && (await lastClient()) === 'Денис Орлов', 8000), [await counter(), await lastClient()]);
  await wait(async () => { const a = await avOf(); return a && a.text === '🦊'; }, 4000);
  const ava3 = await avOf();
  ok('Денис выбрал смайлик 🦊 и зелёный: в аватарке смайлик, фон rgb(63, 122, 88), имя того же цвета', ava3 && ava3.text === '🦊' && ava3.emoji && ava3.bg === 'rgb(63, 122, 88)' && ava3.nameColor === ava3.bg, ava3);
  await sleep(1700); await (await p.$('#revChat')).screenshot({ path: path.join(OUT, 'portfolio-avatar-emoji.png') });
  await p.$eval('[data-nav="1"]', b => b.click());
  ok('«вперёд» с последнего замыкает круг: 01/03', await wait(async () => (await counter()) === '01/03', 8000), await counter());
  await p.$eval('[data-nav="-1"]', b => b.click());
  ok('«назад» с первого: 03/03', await wait(async () => (await counter()) === '03/03', 8000), await counter());

  // ссылка на сайт клиента и отсутствие лайков
  ok('плашка сайта клиента: новая вкладка, noopener', await wait(async () => !!(await p.$('#revBody a.rev-site')), 4000) && await p.$eval('#revBody a.rev-site', a => a.target === '_blank' && /noopener/.test(a.rel)));
  ok('лайков на странице нет: ни кнопок, ни слов, ни обращений к /api/like', await p.evaluate(() => !document.querySelector('.rev-like, .react') && !/лайк/i.test(document.body.innerText)));
  ok('следы старых лайков в браузере удалены', await p.evaluate(() => { localStorage.setItem('airium-likes:v1', '{}'); localStorage.setItem('airium-visitor:v1', 'x'); return true; }) && await (async () => { await open(); return p.evaluate(() => localStorage.getItem('airium-likes:v1') === null && localStorage.getItem('airium-visitor:v1') === null); })());

  // телефон
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await open(); await p.$eval('#reviews', e => e.scrollIntoView({ block: 'start' })); await sleep(3800);
  ok('телефон: нет горизонтального скролла', (await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) === 0);
  ok('телефон: кнопки-стрелки не меньше 44 px', await p.$$eval('.rev-arrow', a => a.every(b => b.getBoundingClientRect().width >= 44 && b.getBoundingClientRect().height >= 44)));
  await p.screenshot({ path: path.join(OUT, 'portfolio-new-chat-mobile.png') });

  ok('ошибок JS нет', errs.length === 0, errs);
  await browser.close(); t.stop();
  console.log(fails ? `\nПровалено проверок: ${fails}` : '\nВсе проверки пройдены');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('ТЕСТ УПАЛ:', e); process.exit(2); });
