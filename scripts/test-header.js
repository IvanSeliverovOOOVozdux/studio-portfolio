'use strict';
// Шапка портфолио: нет наложений на разных мониторах, матовая полоса и прятание при прокрутке, подсветка раздела,
// прогресс, бургер-меню на телефоне (открытие, закрытие по Esc/ссылке, блокировка прокрутки).
// Запуск: node scripts/test-header.js [папка для скриншотов]
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
  const open = async (w, h, mobile) => { await p.setViewport({ width: w, height: h, isMobile: !!mobile, hasTouch: !!mobile, deviceScaleFactor: mobile ? 2 : 1 }); await p.goto(t.BASE + '/', { waitUntil: 'networkidle0' }); await sleep(700); };
  const scrollTo = async y => { await p.evaluate(y => window.scrollTo(0, y), y); await sleep(250); };
  const rects = () => p.evaluate(() => {
    const R = s => { const e = document.querySelector(s); if (!e || e.offsetParent === null && getComputedStyle(e).position !== 'fixed') return null; const r = e.getBoundingClientRect(); return r.width ? { l: r.left, r: r.right } : null; };
    return { brand: R('.hgroup'), pill: R('#navPill'), cta: R('.hright .hcta'), burger: R('#burger'), vw: innerWidth, sw: document.documentElement.scrollWidth };
  });

  // --- десктопы: ничего не налезает друг на друга, нет горизонтального скролла
  for (const [w, h] of [[2560, 1440], [1920, 1080], [1536, 864], [1366, 768], [1280, 720], [1100, 800], [1024, 768], [961, 800]]) {
    await open(w, h);
    const r = await rects();
    const gaps = [r.brand && r.pill ? r.pill.l - r.brand.r : 99, r.pill && r.cta ? r.cta.l - r.pill.r : 99];
    ok(`${w}×${h}: логотип, меню и кнопка не налезают (зазоры ${gaps.map(x => Math.round(x)).join(' / ')} px), нет горизонтального скролла`, gaps.every(g => g >= 12) && r.sw <= r.vw && !!r.cta && !r.burger, r);
  }

  // --- поведение на 1440
  await open(1440, 900);
  ok('вверху страницы шапка прозрачная и на месте', await p.$eval('#siteHead', e => !e.classList.contains('solid') && !e.classList.contains('away') && getComputedStyle(e).position === 'fixed'));
  ok('вверху ни один пункт не подсвечен', await p.$$eval('#navPill a[aria-current]', a => a.length) === 0);
  await scrollTo(1400);
  ok('при прокрутке вниз шапка уезжает вверх', await p.$eval('#siteHead', e => e.classList.contains('away') && e.classList.contains('solid')));
  await scrollTo(1100);
  ok('при прокрутке вверх шапка возвращается матовой полосой', await p.$eval('#siteHead', e => !e.classList.contains('away') && getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)'));
  ok('полоса прогресса растёт вместе с прокруткой', await p.$eval('#headProgress', e => +e.style.transform.match(/scaleX\(([\d.]+)\)/)[1] > 0));
  const topAbout = await p.evaluate(() => document.getElementById('about').getBoundingClientRect().top + scrollY);
  await scrollTo(topAbout + 80);
  ok('в разделе «О нас» подсвечен пункт «О нас», капсула стоит под ним', await p.evaluate(() => { const a = document.querySelector('#navPill a[aria-current]'), i = document.querySelector('#navPill .ind'); return !!a && a.dataset.sec === 'about' && +getComputedStyle(i).opacity === 1 && Math.abs(i.offsetWidth - a.offsetWidth) <= 1; }));
  const topPrice = await p.evaluate(() => document.getElementById('price').getBoundingClientRect().top + scrollY);
  await scrollTo(topPrice + 120); await sleep(300);
  ok('в разделе «Прайс» подсвечен «Прайс»', await p.$eval('#navPill a[aria-current]', a => a.dataset.sec) === 'price');
  await p.screenshot({ path: path.join(OUT, 'header-desktop-solid.png') });
  await scrollTo(topPrice + 60);                              // небольшая прокрутка вверх возвращает шапку
  await p.click('#navPill a[data-sec="about"]'); await sleep(400);
  ok('после клика по пункту шапка остаётся на виду (не прячется при прыжке)', await p.$eval('#siteHead', e => !e.classList.contains('away')));
  await p.click('#navPill a[data-sec="contact"]'); await sleep(500);
  ok('клик по «Контакты» прокручивает в самый низ, и пункт «Контакты» подсвечивается (а не остаётся «Прайс»)', await p.evaluate(() => innerHeight + scrollY >= document.documentElement.scrollHeight - 4) && await p.$eval('#navPill a[aria-current]', a => a.dataset.sec) === 'contact');
  await scrollTo(0); await sleep(200);
  ok('возврат в начало: шапка снова прозрачная, подсветки нет', await p.$eval('#siteHead', e => !e.classList.contains('solid')) && await p.$$eval('#navPill a[aria-current]', a => a.length) === 0);
  await open(1440, 900);                                      // чистая страница: после перехода по якорю Tab начинается от раздела
  await p.keyboard.press('Tab'); await p.keyboard.press('Tab');
  ok('с клавиатуры: фокус виден на пункте шапки (outline)', await p.evaluate(() => { const a = document.activeElement; return !!a.closest('#siteHead') && getComputedStyle(a).outlineStyle !== 'none'; }));

  // --- телефон: бургер
  await open(390, 844, true);
  const m = await rects();
  ok('телефон: меню-пилюля и кнопка скрыты, виден бургер ≥ 44 px, нет горизонтального скролла', !m.pill && !m.cta && !!m.burger && (await p.$eval('#burger', e => e.getBoundingClientRect().width >= 44 && e.getBoundingClientRect().height >= 44)) && m.sw <= m.vw, m);
  ok('телефон: панель меню закрыта и недоступна (inert)', await p.$eval('#mnav', e => e.inert && getComputedStyle(e).visibility === 'hidden') && await p.$eval('#burger', e => e.getAttribute('aria-expanded') === 'false'));
  await p.tap('#burger'); await sleep(900);
  ok('телефон: бургер открывает панель с пунктами (4 без «Отзывов») и кнопкой «Обсудить проект»', await p.evaluate(() => { const v = Array.from(document.querySelectorAll('#mnav a.ml')).filter(a => !a.hidden).length; return document.documentElement.classList.contains('menu-open') && getComputedStyle(document.getElementById('mnav')).visibility === 'visible' && v === 4 && !!document.querySelector('#mnav .mcta') && document.getElementById('burger').getAttribute('aria-expanded') === 'true' && !document.getElementById('mnav').inert; }));
  ok('телефон: пока меню открыто, страница не прокручивается', await p.evaluate(() => getComputedStyle(document.documentElement).overflow === 'hidden'));
  ok('телефон: пункты меню ≥ 44 px высотой', await p.$$eval('#mnav a.ml, #mnav .mcta', a => a.filter(e => !e.hidden).every(e => e.getBoundingClientRect().height >= 44)));
  await p.screenshot({ path: path.join(OUT, 'header-mobile-menu.png') });
  await p.keyboard.press('Escape'); await sleep(800);
  ok('телефон: Esc закрывает меню, фокус возвращается на бургер', !(await p.evaluate(() => document.documentElement.classList.contains('menu-open'))) && await p.evaluate(() => document.activeElement.id === 'burger'));
  await p.tap('#burger'); await sleep(800);
  await p.tap('#mnav a[data-sec="price"]'); await sleep(900);
  ok('телефон: пункт меню закрывает панель и переносит к разделу «Прайс»', !(await p.evaluate(() => document.documentElement.classList.contains('menu-open'))) && Math.abs(await p.evaluate(() => document.getElementById('price').getBoundingClientRect().top)) < 200);
  await p.screenshot({ path: path.join(OUT, 'header-mobile-solid.png') });

  ok('ошибок JS нет', errs.length === 0, errs.join('; '));
  await browser.close(); t.stop();
  console.log(fails ? `\nПровалено проверок: ${fails}` : '\nВсе проверки пройдены');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('ТЕСТ УПАЛ:', e); process.exit(2); });
