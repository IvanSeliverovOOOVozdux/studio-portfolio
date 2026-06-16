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
      await page.goto(s.url, { waitUntil: 'networkidle0', timeout: 60000 });
    } catch (e) {
      await page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    }
    await sleep(7000); // даём анимациям появления доиграть
    const out = path.join(OUT, s.name + '.png');
    await page.screenshot({ path: out });
    console.log('OK  ' + s.name + ' -> ' + out);
    await page.close();
  }

  await browser.close();
  console.log('DONE');
})().catch((e) => { console.error(e); process.exit(1); });
