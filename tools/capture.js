// Снимает hero-скрины кейсов РЕАЛЬНЫМ рендером (Edge через puppeteer-core),
// с паузой, чтобы успели отыграть анимации появления (лого, заголовки и т.п.)
const puppeteer = require('puppeteer-core');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(__dirname, '..', 'assets', 'cases');

const SITES = [
  { name: 'soberi',  url: 'https://soberi-party-dmitrov.vercel.app' },
  { name: 'sillage', url: 'https://sillage-expo.vercel.app' },
  { name: 'cafe',    url: 'https://cafe-aster.vercel.app' },
  { name: 'lawyer',  url: 'https://lawyer-sokolov.vercel.app' },
  { name: 'kaizen',  url: 'https://kaizen-teal.vercel.app' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const only = process.argv[2]; // можно снять один кейс: node capture.js soberi
  const list = only ? SITES.filter((s) => s.name === only) : SITES;

  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    args: ['--window-size=1440,900', '--hide-scrollbars'],
  });

  for (const s of list) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    try {
      await page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await sleep(2500);
      // прокрутка вниз — подгрузить ленивые изображения, затем вернуться наверх
      await page.evaluate(async () => {
        await new Promise((res) => {
          let y = 0;
          const step = () => { window.scrollBy(0, 700); y += 700;
            if (y < document.body.scrollHeight) setTimeout(step, 120); else res(); };
          step();
        });
      });
      await sleep(1500);
      await page.evaluate(() => window.scrollTo(0, 0));
      // ждём, пока все картинки в hero реально декодируются
      try { await page.evaluate(async () => {
        const imgs = Array.from(document.images);
        await Promise.all(imgs.map(im => im.complete ? 1 : new Promise(r => { im.onload = im.onerror = r; })));
      }); } catch (e) {}
      await sleep(6000); // дать hero-анимации доиграть после возврата наверх
      const out = path.join(OUT, s.name + '.png');
      await page.screenshot({ path: out });
      console.log('OK  ' + s.name + ' -> ' + out);
    } catch (e) {
      console.log('FAIL ' + s.name + ' :: ' + (e && e.message));
    }
    await page.close();
  }

  await browser.close();
  console.log('DONE');
})().catch((e) => { console.error(e); process.exit(1); });
