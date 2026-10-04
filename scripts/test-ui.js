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
  const emoState = () => p.$eval('#emoWrap', e => e.dataset.state);
  const emoH = () => p.$eval('.emo-wrap', e => e.getBoundingClientRect().height);
  const segGap = () => p.evaluate(() => Math.round(document.getElementById('emoWrap').nextElementSibling.getBoundingClientRect().top - document.querySelector('.seg').getBoundingClientRect().bottom));
  const colorsTop = () => p.$eval('.colors', e => e.getBoundingClientRect().top + scrollY);
  ok('пока выбраны буквы, блок смайликов свёрнут (высота 0, скрыт, недоступен)', await emoState() === 'closed' && await segGap() === 16 && await p.$eval('#emoWrap', e => e.inert && getComputedStyle(e.querySelector('.emo-clip')).visibility === 'hidden'));
  const topClosed = await colorsTop();
  await p.click('[data-mode="emoji"]'); await sleep(150);
  ok('режим «Смайлик»: в сетке 24 смайлика, блок раскрывается', (await p.$$eval('#emojis button', a => a.length)) === 24 && await emoState() === 'opening' && await emoH() > 0);

  // анимация появления смайликов: по очереди, с нарастающей задержкой; после неё работает :hover
  const anim = await p.evaluate(() => { const tiles = Array.from(document.querySelectorAll('#emojis button')), cs = tiles.map(b => getComputedStyle(b));
    return { name: cs[0].animationName, d0: cs[0].animationDelay, d1: cs[1].animationDelay, d23: cs[23].animationDelay, running: tiles[0].getAnimations().length, op23: +cs[23].opacity }; });
  ok('смайлики появляются по очереди: анимация emojiIn, задержка растёт (0 → 16 мс → 368 мс)', anim.name === 'emojiIn' && anim.d0 === '0s' && anim.d1 === '0.016s' && anim.d23 === '0.368s', anim);
  ok('в начале анимации последняя плитка ещё невидима (по очереди, не разом)', anim.running > 0 && anim.op23 === 0, anim);
  // пока смайлики появляются, переключатель заблокирован
  await p.click('[data-mode="letters"]'); await sleep(60);
  ok('пока смайлики появляются, нажатие «Буквы имени» игнорируется', await emoState() === 'opening' && (await prev()).emoji === true);
  await sleep(900);
  ok('через секунду блок открыт, все 24 плитки на месте, анимации закончились', await emoState() === 'open' && await p.evaluate(() => Array.from(document.querySelectorAll('#emojis button')).every(b => +getComputedStyle(b).opacity === 1 && b.getAnimations().length === 0)));
  const hOpen = await emoH(), topOpen = await colorsTop();
  ok('при раскрытии блок вырос, а нижняя часть сайта уехала вниз (цвета сдвинулись на ' + Math.round(topOpen - topClosed) + ' px)', hOpen > 100 && topOpen - topClosed > 100, { hOpen, topClosed, topOpen });
  const tile3 = await p.$('#emojis button:nth-child(4)'); const tb = await tile3.boundingBox(); await p.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2); await sleep(350);
  ok('после анимации работает наведение: плитка приподнимается на 2 px', await p.$eval('#emojis button:nth-child(4)', b => getComputedStyle(b).transform) === 'matrix(1, 0, 0, 1, 0, -2)');
  await p.mouse.move(5, 5);

  // сворачивание: плитки уходят с последней до первой, блок плавно схлопывается, пока идёт — «Смайлик» не нажать
  await p.click('[data-mode="letters"]'); await sleep(120);
  const out = await p.evaluate(() => { const tiles = Array.from(document.querySelectorAll('#emojis button')), cs = tiles.map(b => getComputedStyle(b));
    return { state: document.getElementById('emoWrap').dataset.state, name: cs[0].animationName, d0: cs[0].animationDelay, d22: cs[22].animationDelay, d23: cs[23].animationDelay, busy: document.getElementById('avpick').classList.contains('busy') }; });
  ok('сворачивание: плитки уходят в обратном порядке (последняя без задержки, первая — самая поздняя: 368 мс)', out.state === 'closing' && out.name === 'emojiOut' && out.d23 === '0s' && out.d22 === '0.016s' && out.d0 === '0.368s', out);
  ok('пока смайлики пропадают, переключатель помечен занятым', out.busy);
  await p.click('[data-mode="emoji"]'); await sleep(80);
  ok('быстро нажать «Смайлик», пока смайлики не пропали, нельзя', await emoState() === 'closing' && (await prev()).emoji === false);
  const tilesMid = await p.evaluate(() => Array.from(document.querySelectorAll('#emojis button')).map(b => +getComputedStyle(b).opacity));
  ok('смайлики уходят по очереди: в начале первые ещё видны, последние уже исчезают', tilesMid[0] === 1 && tilesMid[23] < 1 && tilesMid.some(o => o > 0 && o < 1), tilesMid);
  await sleep(650);
  const hMid = await emoH();
  ok('после ухода плиток блок начинает схлопываться: ещё не закрыт, но ниже полной высоты', hMid > 0 && hMid < hOpen, { hMid, hOpen });
  await p.click('[data-mode="emoji"]'); await sleep(40);
  ok('и ближе к концу сворачивания «Смайлик» всё ещё не нажимается', await emoState() === 'closing');
  await sleep(900);
  ok('после сворачивания блок закрыт, нижняя часть вернулась вверх на место', await emoState() === 'closed' && await segGap() === 16 && Math.abs(await colorsTop() - topClosed) <= 1 && await p.$eval('#emoWrap', e => e.inert));
  ok('после закрытия «Смайлик» снова доступен, ожидание снято', await p.$eval('#avpick', e => !e.classList.contains('busy')));
  await p.click('[data-mode="emoji"]'); await sleep(120);
  ok('при повторном переключении на «Смайлик» анимация запускается снова', await emoState() === 'opening' && await p.evaluate(() => document.querySelector('#emojis button').getAnimations().length > 0));
  await sleep(800);
  // выравнивание: плашки не правее текста (сдвиг -2 px компенсирует скруглённые углы)
  const al = await p.evaluate(() => { const L = el => el.getBoundingClientRect().left, tl = el => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().left; };
    const base = tl(document.querySelector('#avpick > legend')); return { base, seg: L(document.querySelector('.seg')) - base, tile: L(document.querySelector('#emojis button')) - base, color: L(document.querySelector('.colors button')) - base, ctext: tl(document.querySelector('.sublbl')) - base }; });
  ok('переключатель, плитки смайликов и цвета сдвинуты влево на 2 px (не правее текста): ' + [al.seg, al.tile, al.color].map(x => x.toFixed(1)).join(' / '), [al.seg, al.tile, al.color].every(x => x <= 0.2 && x >= -2.8), al);
  await p.click('#emojis [data-emoji="🦊"]'); pv = await prev();
  ok('выбран смайлик 🦊: он стоит в аватарке', pv.text === '🦊' && pv.emoji, pv);
  await p.click('[data-color="#2e9d5f"]'); await sleep(400); pv = await prev();
  ok('выбран цвет «Изумруд»: фон аватарки и цвет имени совпадают (rgb(46, 157, 95))', pv.bg === 'rgb(46, 157, 95)' && pv.nameColor === 'rgb(46, 157, 95)', pv);
  ok('выбранные цвет и смайлик отмечены (aria-checked)', await p.$eval('[data-color="#2e9d5f"]', e => e.getAttribute('aria-checked') === 'true') && await p.$eval('#emojis [data-emoji="🦊"]', e => e.getAttribute('aria-checked') === 'true'));
  await p.click('[data-mode="letters"]'); pv = await prev(); await sleep(1200);
  ok('назад к буквам: снова «С», цвет сохранился', pv.text === 'С' && pv.bg === 'rgb(46, 157, 95)' && !pv.emoji, pv);
  await p.click('[data-mode="emoji"]'); pv = await prev(); await sleep(800);
  ok('при возврате к смайликам прежний смайлик на месте (🦊)', pv.text === '🦊', pv);
  await p.screenshot({ path: path.join(OUT, 'review-form-avatar.png'), fullPage: true });
  await p.screenshot({ path: path.join(OUT, 'review-form-filled.png'), fullPage: true });
  await p.click('#go'); await sleep(900);
  ok('после отправки: экран «Спасибо»', /Спасибо за отзыв/.test(await p.$eval('h1', e => e.textContent)));
  const card = t.lastSent();
  ok('в бот пришла карточка с проектом, оценкой и текстом', /Мякиш/.test(card.body.text) && /★★★★☆/.test(card.body.text) && /гости сразу заметили/.test(card.body.text) && /Шеф-пекарь/.test(card.body.text));
  ok('в карточке для модераторов указан выбор аватарки (🦊, Изумруд)', /Аватар: 🦊 · Изумруд/.test(card.body.text), card.body.text);
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
  await p.click('[data-mode="emoji"]'); await sleep(900);      // ждём конца анимации появления: в её начале плитки уменьшены
  ok('телефон: сетка смайликов не вылезает за экран, кнопки смайликов >= 44 px', (await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) === 0 && await p.$$eval('#emojis button', a => a.every(b => b.getBoundingClientRect().width >= 44 && b.getBoundingClientRect().height >= 44)));
  ok('телефон: переключатель «Буквы имени / Смайлик» и цвета не меньше 36 px', await p.$$eval('.seg button', a => a.every(b => b.getBoundingClientRect().height >= 44)) && await p.$$eval('.colors button', a => a.every(b => b.getBoundingClientRect().width >= 36)));
  await p.screenshot({ path: path.join(OUT, 'review-form-mobile.png'), fullPage: true });

  ok('ошибок JS нет', errs.length === 0, errs.join('; '));
  await browser.close(); t.stop();
  console.log(fails ? `\nПровалено проверок: ${fails}` : '\nВсе проверки пройдены');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('ТЕСТ УПАЛ:', e); process.exit(2); });
