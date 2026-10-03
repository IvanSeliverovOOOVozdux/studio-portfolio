'use strict';
// Проверка страницы отзыва в реальном браузере (Edge). Запуск: node scripts/test-ui.js [папка для скриншотов]
const path = require('path');
const puppeteer = require('puppeteer-core');
const { boot } = require('./harness');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = process.argv[2] || __dirname;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log((c ? 'OK   ' : 'FAIL ') + n + (x && !c ? ' -> ' + x : '')); };

(async () => {
  const t = await boot();
  const mk = async (cmd) => { await t.say(1001, cmd); return (t.lastSent().body.text.match(/\/r\/([\w-]+)/) || [])[1]; };
  const token = await mk('/new Сайт кофейни «Мякиш» | myakish.ru | Денис Орлов');
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new' });
  const p = await browser.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.setViewport({ width: 1280, height: 900 });
  await p.goto(`${t.BASE}/r/${token}`, { waitUntil: 'networkidle0' }); await sleep(900);

  ok('заголовок = название проекта', (await p.$eval('h1', e => e.textContent)) === 'Сайт кофейни «Мякиш»');
  const a = await p.$eval('a.site', e => ({ h: e.href, t: e.target, r: e.rel }));
  ok('ссылка на сайт клиента: новая вкладка, noopener noreferrer', a.h.startsWith('https://myakish.ru') && a.t === '_blank' && /noopener/.test(a.r) && /noreferrer/.test(a.r));
  ok('имя клиента подставлено', (await p.$eval('#name', e => e.value)) === 'Денис Орлов');
  await p.screenshot({ path: path.join(OUT, 'review-form-desktop.png'), fullPage: true });

  // пустая отправка → ошибки
  await p.click('#go'); await sleep(300);
  const errsShown = await p.$$eval('.err', a => a.filter(e => e.textContent).length);
  ok('пустая форма: показаны ошибки (' + errsShown + ')', errsShown >= 3);
  await p.screenshot({ path: path.join(OUT, 'review-form-errors.png'), fullPage: true });

  // звёзды + текст
  await p.click('.rate label:nth-child(4)'); await sleep(200);
  ok('оценка 4: подсвечены 4 звезды, подпись «Хорошо»', (await p.$$eval('.rate label.on', a => a.length)) === 4 && (await p.$eval('#word', e => e.textContent)) === 'Хорошо');
  await p.type('#text', 'Сделали быстро и аккуратно, гости сразу заметили новое меню.');
  await p.type('#role', 'Шеф-пекарь');
  await p.click('.consent'); await sleep(200);
  ok('счётчик символов работает', /^\d+ \/ 1500$/.test(await p.$eval('#cnt', e => e.textContent)));
  await p.screenshot({ path: path.join(OUT, 'review-form-filled.png'), fullPage: true });
  await p.click('#go'); await sleep(900);
  ok('после отправки: экран «Спасибо»', /Спасибо за отзыв/.test(await p.$eval('h1', e => e.textContent)));
  const card = t.lastSent();
  ok('в бот пришла карточка с проектом, оценкой и текстом', /Мякиш/.test(card.body.text) && /★★★★☆/.test(card.body.text) && /гости сразу заметили/.test(card.body.text) && /Шеф-пекарь/.test(card.body.text));
  await p.screenshot({ path: path.join(OUT, 'review-thanks.png') });

  // повторное открытие той же ссылки
  await p.reload({ waitUntil: 'networkidle0' }); await sleep(600);
  ok('повторное открытие: «Отзыв уже отправлен»', /уже отправлен/.test(await p.$eval('h1', e => e.textContent)));
  // неверная ссылка
  await p.goto(`${t.BASE}/r/AAAAAAAAAAAAAAAAAAAAAA`, { waitUntil: 'networkidle0' }); await sleep(600);
  ok('неверная ссылка: «Ссылка не найдена»', /не найдена/.test(await p.$eval('h1', e => e.textContent)));
  await p.screenshot({ path: path.join(OUT, 'review-notfound.png') });

  // телефон
  const token2 = await mk('/new Сайт юриста | lawyer-sokolov.vercel.app | -');
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await p.goto(`${t.BASE}/r/${token2}`, { waitUntil: 'networkidle0' }); await sleep(900);
  ok('телефон: нет горизонтального скролла', (await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) === 0);
  const small = await p.$$eval('input[type=text]:not([tabindex="-1"]), textarea, .submit', a => a.filter(e => e.getBoundingClientRect().height < 44).length);
  ok('телефон: все поля и кнопка >= 44px', small === 0);
  const fs = await p.$$eval('input[type=text], textarea', a => Math.min.apply(null, a.map(e => parseFloat(getComputedStyle(e).fontSize))));
  ok('телефон: шрифт полей >= 16px (iOS не зумит)', fs >= 16, fs);
  await p.screenshot({ path: path.join(OUT, 'review-form-mobile.png'), fullPage: true });

  ok('ошибок JS нет', errs.length === 0, errs.join('; '));
  await browser.close(); t.stop();
  console.log(fails ? `\nПровалено проверок: ${fails}` : '\nВсе проверки пройдены');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('ТЕСТ УПАЛ:', e); process.exit(2); });
