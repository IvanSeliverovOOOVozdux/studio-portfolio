'use strict';
// GET /api/order?t=<token> — данные для страницы клиента (проект и сайт, без лишнего)
const { getOrder, orderState, rateLimit } = require('./_lib/store');
const { wrap, ipHash } = require('./_lib/http');
const { COLORS, EMOJIS } = require('./_lib/avatars');

module.exports = wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok: false });
  if (!(await rateLimit('rl:ord:' + ipHash(req), 60, 600))) return res.status(429).json({ ok: false, state: 'limit' });

  const o = await getOrder(req.query && req.query.t);
  if (!o) return res.status(404).json({ ok: false, state: 'notfound' });
  const st = orderState(o);
  if (st === 'open') return res.status(200).json({ ok: true, state: 'open', product: o.product, siteUrl: o.siteUrl, siteLabel: o.siteLabel, clientName: o.clientName, avatars: { colors: COLORS, emojis: EMOJIS } });
  return res.status(st === 'submitted' ? 200 : 410).json({ ok: false, state: st, product: o.product });
});
