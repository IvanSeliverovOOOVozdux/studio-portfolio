'use strict';
// Настройки читаются из переменных окружения при каждом вызове (удобно для тестов).
function cfg(){
  const e = process.env;
  return {
    token:   e.TG_BOT_TOKEN || '',
    chatId:  e.TG_CHAT_ID || '',                       // общий чат троих, куда приходят отзывы
    threadId: Number(e.TG_THREAD_ID) || 0,             // тема группы (форум), куда приходят карточки; 0 = без темы
    allowed: (e.TG_ALLOWED_IDS || '').split(',').map(s => s.trim()).filter(Boolean),
    secret:  e.TG_WEBHOOK_SECRET || '',
    siteUrl: (e.SITE_URL || '').replace(/\/+$/, ''),   // https://портфолио.vercel.app
    ipSalt:  e.IP_SALT || 'airium-default-salt',
    tgBase:  e.TG_API_BASE || 'https://api.telegram.org',
    linkTtlDays: Number(e.LINK_TTL_DAYS) || 30
  };
}
module.exports = { cfg };
