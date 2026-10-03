'use strict';
// GET /api/reviews — одобренные отзывы для портфолио (публичные поля)
const { listApproved } = require('./_lib/store');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ ok: false });
  try {
    const rows = await listApproved(50);
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({
      ok: true,
      reviews: rows.map(r => ({
        id: r.id, name: r.name, role: r.role, rating: r.rating, text: r.text,
        site: r.siteLabel, url: r.siteUrl, product: r.product, date: r.decidedAt || r.createdAt, likes: r.likes || 0
      }))
    });
  } catch (e) {
    console.error('[reviews]', e.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, reviews: [], degraded: true });   // портфолио не ломается, блок просто скрыт
  }
};
