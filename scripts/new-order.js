'use strict';
// Создать личную ссылку на отзыв из командной строки (то же, что /new в боте).
//   node scripts/new-order.js "Название проекта" "https://сайт.ру" "Имя клиента"
require('./env').loadEnv();
const S = require('../api/_lib/store');
(async () => {
  const [product, site, client] = process.argv.slice(2);
  const url = S.normalizeUrl(site);
  if (!product || !url){ console.error('Использование: node scripts/new-order.js "Название проекта" "https://сайт.ру" "Имя клиента"'); process.exit(1); }
  const o = await S.createOrder({ product, siteUrl: url, clientName: client && client !== '-' ? client : '', by: { id: 0, name: 'консоль' } });
  const base = (process.env.SITE_URL || '').replace(/\/+$/, '');
  console.log('Ссылка для клиента:\n' + (base ? base : '<SITE_URL не задан>') + '/r/' + o.token);
})().catch(e => { console.error(e.message); process.exit(1); });
