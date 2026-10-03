'use strict';
// Блок отзывов на портфолио: скрыт без отзывов, появляется после одобрения, лайки живые. Запуск: node scripts/test-portfolio.js [папка для скриншотов]
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
  await p.setViewport({ width: 1440, height: 900 });
  const open = async () => { await p.goto(t.BASE + '/', { waitUntil: 'networkidle0' }); await sleep(800); };

  await open();
  ok('без отзывов: блок скрыт', await p.$eval('#reviews', e => e.hidden));
  ok('без отзывов: пункт меню «Отзывы» скрыт', await p.$eval('#navReviews', e => e.hidden));

  // заказ → отзыв → одобрение
  await t.say(1001, '/new Сайт кофейни «Мякиш» | myakish.ru | Денис Орлов');
  const token = (t.lastSent().body.text.match(/\/r\/([\w-]+)/) || [])[1];
  await t.post('/api/submit', { token, rating: 5, name: 'Денис Орлов', role: 'Шеф-пекарь', text: 'Сделали быстро и аккуратно, гости сразу заметили новое меню.', consent: true }, '10.0.0.5');
  const card = t.lastSent(); const rid = card.body.reply_markup.inline_keyboard[0][0].callback_data.split(':')[1];
  ok('отзыв до одобрения на сайте не виден', (await (await t.get('/api/reviews')).json()).reviews.length === 0);
  await t.press(1002, 'a:' + rid, 101);

  await open();
  await p.$eval('#reviews', e => e.scrollIntoView({ block: 'center' })); await sleep(3500);
  ok('после одобрения блок виден', !(await p.$eval('#reviews', e => e.hidden)));
  ok('пункт меню «Отзывы» появился', !(await p.$eval('#navReviews', e => e.hidden)));
  const order = await p.evaluate(() => { const y = id => document.getElementById(id).getBoundingClientRect().top + scrollY; return { about: y('about'), reviews: y('reviews'), price: y('price') }; });
  ok('порядок: «Как мы работаем» → «Отзывы» → «Прайс»', order.about < order.reviews && order.reviews < order.price, order);
  const text = await p.$eval('#revBody', e => e.textContent);
  ok('отзыв показан: имя, роль, текст', /Денис Орлов/.test(text) && /Шеф-пекарь/.test(text) && /гости сразу заметили/.test(text));
  const chip = await p.$eval('#revBody a.rev-site', e => ({ h: e.href, t: e.target, r: e.rel, label: e.textContent.trim() }));
  ok('плашка сайта клиента: myakish.ru, новая вкладка, noopener', chip.h.startsWith('https://myakish.ru') && chip.t === '_blank' && /noopener/.test(chip.r) && chip.label === 'myakish.ru', chip);
  ok('в конце есть приглашение «Заказывали у нас сайт?»', /Заказывали у нас сайт/.test(text));
  await p.screenshot({ path: path.join(OUT, 'portfolio-reviews-desktop.png') });

  // лайк
  const likeState = () => p.$eval('.rev-like', e => ({ on: e.getAttribute('aria-pressed') === 'true', n: +e.querySelector('span').textContent }));
  ok('лайки: старт 0', (await likeState()).n === 0);
  await p.$eval('.rev-like', e => e.click()); await sleep(600);
  let s = await likeState(); ok('лайк: нажат, счётчик 1', s.on && s.n === 1, s);
  ok('лайк записан на сервере', (await (await t.get('/api/reviews')).json()).reviews[0].likes === 1);
  await open(); await p.$eval('#reviews', e => e.scrollIntoView({ block: 'center' })); await sleep(3500);
  s = await likeState(); ok('после перезагрузки лайк сохранён (нажат, 1)', s.on && s.n === 1, s);
  await p.$eval('.rev-like', e => e.click()); await sleep(600);
  s = await likeState(); ok('повторный клик снимает лайк (0)', !s.on && s.n === 0, s);

  // телефон
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await open(); await p.$eval('#reviews', e => e.scrollIntoView({ block: 'start' })); await sleep(3500);
  ok('телефон: нет горизонтального скролла', (await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) === 0);
  await p.screenshot({ path: path.join(OUT, 'portfolio-reviews-mobile.png') });

  ok('ошибок JS нет', errs.length === 0, errs);
  await browser.close(); t.stop();
  console.log(fails ? `\nПровалено проверок: ${fails}` : '\nВсе проверки пройдены');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('ТЕСТ УПАЛ:', e); process.exit(2); });
