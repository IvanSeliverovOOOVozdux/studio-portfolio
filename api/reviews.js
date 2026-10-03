'use strict';
// GET /api/reviews — одобренные отзывы для портфолио (публичные поля) вместе с готовым ответом студии
const { listApproved } = require('./_lib/store');
const R = require('./_lib/replies');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ ok: false });
  try {
    const rows = await listApproved(50);
    const templates = await R.getTemplates();
    // браузер всегда перепроверяет (max-age=0), общий кэш Vercel держит ответ 30 секунд
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=120');
    return res.status(200).json({
      ok: true,
      reviews: rows.map(r => ({
        id: r.id, name: r.name, role: r.role, rating: r.rating, text: r.text, avatar: r.avatar || null,
        site: r.siteLabel, url: r.siteUrl, product: r.product, date: r.decidedAt || r.createdAt,
        reply: R.replyFor(templates, r)
      }))
    });
  } catch (e) {
    console.error('[reviews]', e.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, reviews: [], degraded: true });   // портфолио не ломается, блок просто скрыт
  }
};
