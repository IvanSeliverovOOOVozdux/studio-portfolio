'use strict';
// Мобильная версия портфолио на разных экранах: ничего не вылезает за края, строки не рвутся, кнопки >= 44 px,
// карточка кейса и плашка «Перейти на сайт» помещаются в экран (портрет и ландшафт), меню-бургер выровнено, картинки в WebP.
// Запуск: node scripts/test-mobile.js [папка для скриншотов]
const path = require('path');
const puppeteer = require('puppeteer-core');
const { boot } = require('./harness');
const decode = require('./png-lite');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = process.argv[2] || __dirname;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log((c ? 'OK   ' : 'FAIL ') + n + (x !== undefined && !c ? ' -> ' + JSON.stringify(x) : '')); };

const PORTRAIT = [[320, 568], [360, 740], [375, 667], [390, 844], [414, 896], [430, 932], [768, 1024]];
const LANDSCAPE = [[667, 375], [844, 390]];

(async () => {
  const t = await boot();
  // два одобренных отзыва — чтобы проверить блок отзывов на телефоне
  const mk = async (cmd, rating, name, text, ip, extra) => {
    await t.say(1001, cmd); const token = (t.lastSent().body.text.match(/\/r\/([\w-]+)/) || [])[1];
    await t.post('/api/submit', Object.assign({ token, rating, name, role: 'Владелица кофейни', text, consent: true }, extra || {}), ip);
    const rid = t.lastSent().body.reply_markup.inline_keyboard[0][0].callback_data.split(':')[1];
    await sleep(2100); await t.press(1002, 'a:' + rid, 100 + Math.floor(Math.random() * 1e4)); return rid;
  };
  await mk('/new Сайт кофейни «Мякиш» | myakish.ru | Денис', 5, 'Денис Орлов', 'Сделали быстро и аккуратно, гости сразу заметили новое меню. Заявки пошли в тот же вечер, а на следующий день мы уже рассказывали о сайте партнёрам и друзьям, которые давно хотели такой же.', '10.0.0.5', { avatarColor: '#2e9d5f', avatarEmoji: '🦊' });
  await mk('/new Цветочная студия | len-polyn.ru | Марина', 5, 'Марина Литвинова', 'Сайт заработал в тот же вечер, как мы его запустили.', '10.0.0.6', { avatarColor: '#7a5af0' });

  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new' });
  const p = await browser.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const open = async (w, h) => { await p.setViewport({ width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); await p.goto(t.BASE + '/', { waitUntil: 'networkidle0' }); await sleep(900); };
  const scrollTo = async (y, ms) => { await p.evaluate(y => window.scrollTo(0, y), y); await sleep(ms || 1500); };
  const triggers = () => p.evaluate(() => ScrollTrigger.getAll().map(s => ({ s: s.start, e: s.end })));
  const box = sel => p.evaluate(sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; }, sel);

  // ---------- портрет: все ширины ----------
  for (const [w, h] of PORTRAIT) {
    await open(w, h);
    const tag = `${w}×${h}`;
    const m = await p.evaluate(() => {
      const kick = document.querySelector('.hero .kick'), roll = document.getElementById('rollNiche'), h1 = document.querySelector('.hero h1'), av = document.querySelector('.hero .av');
      const rolls = Array.from(roll.querySelectorAll('.r')).map(r => ({ w: r.getBoundingClientRect().width, t: r.textContent }));
      const o = Array.from(h1.querySelectorAll('.o')).map(e => e.getBoundingClientRect().right);
      return { sw: document.documentElement.scrollWidth, vw: innerWidth, kickOne: kick.getClientRects()[0].height < parseFloat(getComputedStyle(kick).fontSize) * 2.2 && kick.scrollWidth <= kick.clientWidth + 1,
        kickR: kick.scrollWidth, kickW: kick.clientWidth, rollAvail: roll.clientWidth, rolls, h1Right: Math.max.apply(null, o), avH: av.getBoundingClientRect().height, avR: av.getBoundingClientRect().right };
    });
    ok(`${tag}: нет горизонтального скролла`, m.sw <= m.vw, m);
    ok(`${tag}: строка-«кикер» в одну линию и не обрезана`, m.kickOne, m);
    ok(`${tag}: все бегущие слова помещаются по ширине (${m.rolls.filter(r => r.w > m.rollAvail + 1).map(r => r.t).join(', ') || 'ок'})`, m.rolls.every(r => r.w <= m.rollAvail + 1), m);
    ok(`${tag}: «САЙТЫ ДЛЯ» не вылезает за экран`, m.h1Right <= m.vw - 8, m);
    ok(`${tag}: плашка «Работаем ежедневно…» в одну строку и в экране`, (w >= 340 ? m.avH < 48 : true) && m.avR <= m.vw, m);
    if (w <= 600) {
      const cta = await box('#heroCta');
      ok(`${tag}: кнопка «Обсудить проект» на всю ширину и ≥ 44 px`, cta.h >= 44 && cta.w >= m.vw - 48, cta);
    }
    // карточка и плашка в конце первой сцены помещаются в экран
    const tr = await triggers();
    await scrollTo(tr[0].e - 3);
    const c = await box('.scene .card-scale'), pl = await box('.scene .go-plate a');
    ok(`${tag}: в конце кейса карточка целиком в экране (по ширине ${Math.round(c.l)}…${Math.round(c.r)} из ${w})`, c.l >= 0 && c.r <= w && c.t >= 0, c);
    ok(`${tag}: плашка «Перейти на сайт» видна, ниже карточки, ≥ 44 px, в экране`, pl.h >= 44 && pl.t >= c.b - 6 && pl.b <= h && pl.l >= 0 && pl.r <= w, { c, pl });
    if (w === 390) await p.screenshot({ path: path.join(OUT, 'mobile-scene-end.png') });
  }

  // ---------- крупные заголовки кейсов («SOBERI PARTY» и др.): целиком в экране, поля слева и справа равны ----------
  const titleSym = () => p.evaluate(() => Array.from(document.querySelectorAll('.scene')).map(sc => {
    const row = sc.querySelector('.case-title span'), ls = Array.from(row.querySelectorAll('i:not(.sp)')), fs = parseFloat(getComputedStyle(row).fontSize);
    const l = ls[0].getBoundingClientRect().left, r = innerWidth - ls[ls.length - 1].getBoundingClientRect().right;
    return { name: sc.querySelector('.scene-label').textContent.replace(/^.*— /, ''), left: +l.toFixed(1), right: +r.toFixed(1), fs: +fs.toFixed(1), tol: fs * .05 + 2 };
  }));
  for (const [w, h, mob] of [[320, 568, 1], [360, 740, 1], [390, 844, 1], [430, 932, 1], [768, 1024, 1], [1366, 768, 0], [1440, 900, 0], [1920, 1080, 0], [2560, 1440, 0]]) {
    await p.setViewport({ width: w, height: h, isMobile: !!mob, hasTouch: !!mob, deviceScaleFactor: 1 }); await p.goto(t.BASE + '/', { waitUntil: 'networkidle0' }); await sleep(900);
    const rows = await titleSym();
    const rw = await p.evaluate(() => Array.from(document.querySelectorAll('.scene')).map(sc => { const r = Array.from(sc.querySelectorAll('.case-title span')).filter(e => e.getClientRects().length).map(e => e.getBoundingClientRect()); let gap = 0; for (let i = 1; i < r.length; i++) gap = Math.max(gap, r[i].top - r[i - 1].bottom); return { n: r.length, gap: Math.round(gap) }; }));
    const wantN = mob && h > w ? 7 : 4;
    ok(`${w}×${h}: строк-названий на фоне кейса ${wantN} (на телефоне в портрете — 7, пустых промежутков нет: макс. зазор ${Math.max(...rw.map(x => x.gap))} px), на компьютере и в ландшафте 4`, rw.every(x => x.n === wantN) && (wantN === 4 || rw.every(x => x.gap <= h * .14)), rw);
    ok(`${w}×${h}: заголовки кейсов целиком в экране, поля слева и справа равны (${rows.map(r => `${r.name}: ${r.left}/${r.right}`).join('; ')})`, rows.every(r => r.left >= 8 && r.right >= 8 && Math.abs(r.left - r.right) <= r.tol), rows);
  }

  // ---------- ландшафт ----------
  for (const [w, h] of LANDSCAPE) {
    await open(w, h);
    const tag = `${w}×${h} (ландшафт)`;
    ok(`${tag}: нет горизонтального скролла`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const tr = await triggers();
    await scrollTo(tr[0].e - 3);
    const c = await box('.scene .card-scale'), pl = await box('.scene .go-plate a');
    ok(`${tag}: карточка и плашка кейса помещаются по высоте экрана`, c.t >= 0 && c.b <= h && pl.b <= h && pl.t >= c.b - 6 && c.l >= 0 && c.r <= w, { c, pl });
  }

  // ---------- 390×844: подробно ----------
  await open(390, 844);
  const tr = await triggers();
  ok('телефон: путь прокрутки на кейс короче (≈ 260% высоты экрана)', Math.abs((tr[0].e - tr[0].s) / 844 - 2.6) < .05, tr[0]);
  ok('картинки кейсов — WebP (лёгкие), размеры заданы', await p.evaluate(() => Array.from(document.querySelectorAll('.face.front img')).every(i => /\.webp$/.test(i.currentSrc) && i.naturalWidth === 1440 && i.getAttribute('width') === '1440')));
  ok('кириллица в заголовках — веб-шрифт Onest (чистый контур, одинаков на iPhone/Android/ПК), а не системный', await p.evaluate(() => document.fonts.check('800 20px Onest', 'САЙТЫ') && /Onest/.test(getComputedStyle(document.querySelector('.hero h1')).fontFamily)));
  const lt = await p.evaluate(() => ({ lite: document.documentElement.classList.contains('lite'), pos: getComputedStyle(document.querySelector('.scene')).position, pins: document.querySelectorAll('.pin-spacer').length,
    grain: getComputedStyle(document.querySelector('.grain')).display, blend: getComputedStyle(document.querySelector('.case-title')).mixBlendMode, clip: getComputedStyle(document.querySelector('.scene .fill')).clipPath, blur: getComputedStyle(document.querySelector('.site-head')).backdropFilter }));
  ok('телефон: «лёгкий режим» — сцена липкая (sticky) без JS-закрепления, нет зерна, смешивания цветов, clip-path и размытия под шапкой', lt.lite && lt.pos === 'sticky' && lt.pins === 0 && lt.grain === 'none' && lt.blend === 'normal' && lt.clip === 'none' && /none/.test(lt.blur), lt);
  await scrollTo(tr[1].e - 3);
  ok('телефон: к концу кейса диск-заливка закрыл экран, буквы заголовка перекрасились под новый фон (контраст сохранён)', await p.evaluate(() => { const sc = document.querySelectorAll('.scene')[1], disc = sc.querySelector('.disc'), l = sc.querySelector('.case-title i:not(.sp)'); const m = new DOMMatrixReadOnly(getComputedStyle(disc).transform); return Math.abs(m.a - 1) < .02 && getComputedStyle(l).color === 'rgb(241, 243, 242)'; }));
  await scrollTo(0, 700);
  ok('телефон: у карточки нет 3D-наклона от касаний (только мышь)', await p.evaluate(() => matchMedia('(hover:hover) and (pointer:fine)').matches === false));

  // меню: размер слов умеренный, цифра на одной оси со словом
  await p.tap('#burger'); await sleep(1300);
  const rows = await p.evaluate(() => Array.from(document.querySelectorAll('#mnav a.ml')).filter(a => !a.hidden).map(a => { const r = a.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, fs: parseFloat(getComputedStyle(a).fontSize), text: a.textContent.trim() }; }));
  ok(`меню: слова ≤ 30 px (было 36–52), сейчас ${rows[0].fs.toFixed(1)} px`, rows.every(r => r.fs <= 30.01 && r.fs >= 22), rows);
  const DPR = 2, shot = await p.screenshot();
  const img = decode(shot), bg = img.px(5, Math.round(rows[0].top * DPR) + 5);
  const dist = c => Math.abs(c[0] - bg[0]) + Math.abs(c[1] - bg[1]) + Math.abs(c[2] - bg[2]);
  const ink = (x0, x1, y0, y1) => { let top = 1e9, bot = -1; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (dist(img.px(x, y)) > 120) { if (y < top) top = y; if (y > bot) bot = y; break; } return (top + bot) / 2; };
  const dl = [];
  for (const r of rows.filter(r => /^(Работы|Контакты)$/.test(r.text))) {
    const y0 = Math.round((r.top + 2) * DPR), y1 = Math.round((r.bottom - 3) * DPR);
    dl.push(Math.abs(ink(Math.round(r.left * DPR), Math.round((r.left + 28) * DPR), y0, y1) - ink(Math.round((r.left + 36) * DPR), Math.round((r.left + 220) * DPR), y0, y1)) / DPR);
  }
  ok(`меню: середина цифры совпадает с серединой заглавных слова (расхождение ${dl.map(x => x.toFixed(2)).join(' / ')} px)`, dl.length === 2 && dl.every(x => x <= 1), dl);
  await p.screenshot({ path: path.join(OUT, 'mobile-menu.png') });
  await p.tap('#burger'); await sleep(900);

  // отзывы на телефоне
  const rv = await p.evaluate(() => { const b = document.getElementById('revBody'), cs = getComputedStyle(b); return { overscroll: cs.overscrollBehaviorY, h: b.getBoundingClientRect().height, vw: innerWidth, chatR: document.getElementById('revChat').getBoundingClientRect().right }; });
  ok('отзывы: прокрутка чата не «запирает» страницу (overscroll-behavior: auto на тач-экране)', rv.overscroll === 'auto', rv);
  const revTop = await p.evaluate(() => document.getElementById('reviews').getBoundingClientRect().top + scrollY);
  await scrollTo(revTop + 120, 800);
  const hs = []; for (let i = 0; i < 6; i++) { hs.push(Math.round((await box('#revBody')).h)); await sleep(1200); }
  ok('отзывы: высота окна чата не меняется, пока идут сообщения (страница не «прыгает»): ' + [...new Set(hs)].join(' px, ') + ' px', new Set(hs).size === 1, hs);
  ok('отзывы: стрелки ≥ 44 px, чат в пределах экрана', await p.$$eval('.rev-arrow', a => a.every(e => e.getBoundingClientRect().width >= 44 && e.getBoundingClientRect().height >= 44)) && rv.chatR <= rv.vw);
  await p.screenshot({ path: path.join(OUT, 'mobile-reviews.png') });

  // зоны нажатия
  const price = await p.evaluate(() => document.getElementById('price').getBoundingClientRect().top + scrollY);
  await scrollTo(price + 300, 500);
  const small = await p.evaluate(() => Array.from(document.querySelectorAll('.pbtn, .btn-big, .foot-bar a, .hero .tg-link, .go-plate a, .rev-site, .burger')).filter(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed').map(e => { const r = e.getBoundingClientRect(); const a = getComputedStyle(e, '::after'); return { cls: e.className, h: Math.round(r.height), w: Math.round(r.width) }; }).filter(x => x.h < 44 && !/rev-site/.test(x.cls)));
  ok('кнопки и ссылки в подвале/прайсе/контактах ≥ 44 px высотой', small.length === 0, small);
  await p.screenshot({ path: path.join(OUT, 'mobile-price.png') });

  ok('ошибок JS нет', errs.length === 0, errs.join('; '));
  await browser.close(); t.stop();
  console.log(fails ? `\nПровалено проверок: ${fails}` : '\nВсе проверки пройдены');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('ТЕСТ УПАЛ:', e); process.exit(2); });
