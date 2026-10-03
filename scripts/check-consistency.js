'use strict';
// Сверка базы с тем, что показывает сайт (только чтение). Запуск: node scripts/check-consistency.js
//   • всё, что в публичном списке (z:approved), существует и имеет статус approved;
//   • каждый отзыв со статусом approved есть в публичном списке (иначе на сайте его не будет);
//   • в списке отзывов нет «битых» ссылок на несуществующие записи;
//   • нет «осиротевших» ссылок клиентов (order:*), которые указывают на удалённые отзывы.
require('./env').loadEnv();
delete process.env.AIRIUM_MOCK_REDIS;
const redis = require('../api/_lib/redis');
const S = require('../api/_lib/store');

async function scan(pattern){
  let cursor = '0'; const keys = [];
  do { const r = await redis('SCAN', cursor, 'MATCH', pattern, 'COUNT', '500'); cursor = String(r[0]); keys.push(...r[1]); } while (cursor !== '0');
  return keys;
}
(async () => {
  const problems = [];
  const allIds = await redis('ZREVRANGE', 'z:reviews', 0, -1);
  const pubIds = await redis('ZREVRANGE', 'z:approved', 0, -1);
  const recs = {};
  for (const id of allIds) recs[id] = await S.getReview(id);

  for (const id of allIds) if (!recs[id]) problems.push(`в списке отзывов есть ${id}, но самой записи нет`);
  for (const id of pubIds) {
    const r = recs[id] || await S.getReview(id);
    if (!r) problems.push(`на сайт отдаётся ${id}, но записи нет (сайт её пропустит)`);
    else if (r.status !== 'approved') problems.push(`в публичном списке ${id} со статусом «${r.status}» (сайт её пропустит)`);
  }
  for (const id of allIds) { const r = recs[id]; if (r && r.status === 'approved' && !pubIds.includes(id)) problems.push(`отзыв ${id} одобрен, но не в публичном списке (на сайте его не будет)`); }

  const orderKeys = await scan('order:*');
  const tokensInReviews = new Set(Object.values(recs).filter(Boolean).map(r => r.token));
  for (const k of orderKeys) {
    const o = JSON.parse(await redis('GET', k) || 'null');
    if (o && o.status === 'submitted' && !tokensInReviews.has(o.token)) problems.push(`ссылка ${o.token.slice(0, 6)}… помечена «отзыв получен», но отзыва нет`);
  }

  const by = {}; Object.values(recs).filter(Boolean).forEach(r => { by[r.status] = (by[r.status] || 0) + 1; });
  console.log(`Отзывов в базе: ${allIds.length} ${JSON.stringify(by)}; на сайте опубликовано: ${pubIds.length}; ссылок клиентов: ${orderKeys.length}`);
  console.log(problems.length ? 'НАЙДЕНЫ РАСХОЖДЕНИЯ:\n - ' + problems.join('\n - ') : 'База и сайт согласованы: расхождений нет.');
  process.exit(problems.length ? 1 : 0);
})().catch(e => { console.error('ОШИБКА:', e.message); process.exit(2); });
