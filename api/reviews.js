'use strict';
// GET /api/reviews — одобренные отзывы для портфолио (публичные поля) вместе со счётчиками лайков
const { listApproved, likeCounts } = require('./_lib/store');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ ok: false });
  try {
    const rows = await listApproved(50);
    const counts = await likeCounts(rows.map(r => r.id));
    // браузер всегда перепроверяет (max-age=0), общий кэш Vercel держит ответ 30 секунд
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=120');
    return res.status(200).json({
      ok: true,
      reviews: rows.map((r, i) => ({
        id: r.id, name: r.name, role: r.role, rating: r.rating, text: r.text,
        site: r.siteLabel, url: r.siteUrl, product: r.product, date: r.decidedAt || r.createdAt, likes: counts[i] || 0
      }))
    });
  } catch (e) {
    console.error('[reviews]', e.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, reviews: [], degraded: true });   // портфолио не ломается, блок просто скрыт
  }
};
