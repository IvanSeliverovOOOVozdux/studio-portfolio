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
  // выравнивание и порядок полей
  const layout = await p.evaluate(() => {
    const legend = document.querySelector('.rate').closest('fieldset').querySelector('legend');
    const rng = document.createRange(); rng.selectNodeContents(legend);
    const top = id => document.getElementById(id).getBoundingClientRect().top;
    return { textLeft: rng.getBoundingClientRect().left, starLeft: document.querySelector('.rate label svg path').getBoundingClientRect().left, resize: getComputedStyle(document.getElementById('text')).resize,
      role: top('role'), name: top('name'), avatar: top('avpick'), consent: document.querySelector('.consent').getBoundingClientRect().top };
  });
  ok('звёзды вровень с подписью «Ваша оценка» (разница ' + (layout.starLeft - layout.textLeft).toFixed(1) + ' px)', Math.abs(layout.starLeft - layout.textLeft) <= 2.5, layout);
  ok('у поля отзыва нет «ручки» изменения размера в углу (resize: none)', layout.resize === 'none', layout.resize);
  ok('порядок полей: «Чем занимаетесь» → «Как вас подписать» → аватарка → согласие', layout.role < layout.name && layout.name < layout.avatar && layout.avatar < layout.consent, layout);
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

  // выбор аватарки
  const prev = () => p.evaluate(() => ({ text: document.getElementById('avpText').textContent, bg: getComputedStyle(document.getElementById('avp')).backgroundColor,
    nameColor: getComputedStyle(document.querySelector('.avname')).color, nameText: document.getElementById('avpName').textContent, emoji: document.getElementById('avp').classList.contains('emoji') }));
  const setName = async v => { await p.$eval('#name', e => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); }); await p.type('#name', v); };
  let pv = await prev();
  ok('превью аватарки по умолчанию: буквы имени «ДО» (Денис Орлов)', pv.text === 'ДО' && pv.nameText === 'Денис Орлов', pv);
  await setName('Иван Селиверов'); pv = await prev();
  ok('«Иван Селиверов» → «ИС»', pv.text === 'ИС' && pv.nameText === 'Иван Селиверов', pv);
  await setName('Себастьян'); pv = await prev();
  ok('«Себастьян» → «С» (одна буква)', pv.text === 'С', pv);
  ok('пока выбраны буквы, сетка смайликов скрыта', await p.$eval('#emojis', e => getComputedStyle(e).display === 'none'));
  await p.click('[data-mode="emoji"]'); await sleep(150);
  ok('режим «Смайлик»: показана сетка из 24 смайликов', (await p.$$eval('#emojis button', a => a.length)) === 24 && await p.$eval('#emojis', e => getComputedStyle(e).display !== 'none'));
  await p.click('#emojis [data-emoji="🦊"]'); pv = await prev();
  ok('выбран смайлик 🦊: он стоит в аватарке', pv.text === '🦊' && pv.emoji, pv);
  await p.click('[data-color="#3f7a58"]'); await sleep(400); pv = await prev();
  ok('выбран цвет «Зелень»: фон аватарки и цвет имени совпадают (rgb(63, 122, 88))', pv.bg === 'rgb(63, 122, 88)' && pv.nameColor === 'rgb(63, 122, 88)', pv);
  ok('выбранные цвет и смайлик отмечены (aria-checked)', await p.$eval('[data-color="#3f7a58"]', e => e.getAttribute('aria-checked') === 'true') && await p.$eval('#emojis [data-emoji="🦊"]', e => e.getAttribute('aria-checked') === 'true'));
  await p.click('[data-mode="letters"]'); pv = await prev();
  ok('назад к буквам: снова «С», цвет сохранился', pv.text === 'С' && pv.bg === 'rgb(63, 122, 88)' && !pv.emoji, pv);
  await p.click('[data-mode="emoji"]'); pv = await prev();
  ok('при возврате к смайликам прежний смайлик на месте (🦊)', pv.text === '🦊', pv);
  await p.screenshot({ path: path.join(OUT, 'review-form-avatar.png'), fullPage: true });
  await p.screenshot({ path: path.join(OUT, 'review-form-filled.png'), fullPage: true });
  await p.click('#go'); await sleep(900);
  ok('после отправки: экран «Спасибо»', /Спасибо за отзыв/.test(await p.$eval('h1', e => e.textContent)));
  const card = t.lastSent();
  ok('в бот пришла карточка с проектом, оценкой и текстом', /Мякиш/.test(card.body.text) && /★★★★☆/.test(card.body.text) && /гости сразу заметили/.test(card.body.text) && /Шеф-пекарь/.test(card.body.text));
  ok('в карточке для модераторов указан выбор аватарки (🦊, Зелень)', /Аватар: 🦊 · Зелень/.test(card.body.text), card.body.text);
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
  await p.click('[data-mode="emoji"]'); await sleep(200);
  ok('телефон: сетка смайликов не вылезает за экран, кнопки смайликов >= 44 px', (await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) === 0 && await p.$$eval('#emojis button', a => a.every(b => b.getBoundingClientRect().width >= 44 && b.getBoundingClientRect().height >= 44)));
  ok('телефон: переключатель «Буквы имени / Смайлик» и цвета не меньше 36 px', await p.$$eval('.seg button', a => a.every(b => b.getBoundingClientRect().height >= 44)) && await p.$$eval('.colors button', a => a.every(b => b.getBoundingClientRect().width >= 36)));
  await p.screenshot({ path: path.join(OUT, 'review-form-mobile.png'), fullPage: true });

  ok('ошибок JS нет', errs.length === 0, errs.join('; '));
  await browser.close(); t.stop();
  console.log(fails ? `\nПровалено проверок: ${fails}` : '\nВсе проверки пройдены');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('ТЕСТ УПАЛ:', e); process.exit(2); });
