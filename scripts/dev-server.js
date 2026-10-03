'use strict';
// Локальный сервер: раздаёт сайт и подключает api/*.js так же, как Vercel. Запуск: node scripts/dev-server.js
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp4': 'video/mp4' };
const BLOCKED = /^\/(\.env|scripts|node_modules|\.git|api\/_)/;

function wrapRes(res){
  res.status = c => { res.statusCode = c; return res; };
  res.json = o => { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); return res; };
  return res;
}
const readBody = req => new Promise(r => { const ch = []; req.on('data', d => ch.push(d)); req.on('end', () => r(Buffer.concat(ch).toString())); });

function start(port){
  const server = http.createServer(async (req, res) => {
    wrapRes(res);
    const u = new URL(req.url, 'http://localhost');
    try {
      if (u.pathname.startsWith('/api/')){
        const name = u.pathname.slice(5);
        const file = path.join(ROOT, 'api', name + '.js');
        if (!/^[a-z]+$/.test(name) || !fs.existsSync(file)) return res.status(404).json({ ok: false });
        req.query = Object.fromEntries(u.searchParams);
        const raw = await readBody(req);
        req.body = undefined;
        if (raw){ try { req.body = JSON.parse(raw); } catch (e) { req.body = raw; } }
        return await require(file)(req, res);
      }
      let rel = u.pathname;
      if (/^\/r\/[\w-]+$/.test(rel)) rel = '/review.html';
      if (rel === '/') rel = '/index.html';
      if (BLOCKED.test(rel)) return res.status(404).end();
      const abs = path.normalize(path.join(ROOT, decodeURIComponent(rel)));
      if (!abs.startsWith(ROOT)) return res.status(403).end();
      fs.readFile(abs, (err, buf) => {
        if (err) return res.status(404).end('not found');
        res.setHeader('Content-Type', MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream');
        res.end(buf);
      });
    } catch (e) { console.error(e); if (!res.headersSent) res.status(500).json({ ok: false }); }
  });
  return new Promise(r => server.listen(port, '127.0.0.1', () => r(server)));
}
module.exports = { start };

if (require.main === module){
  require('./env').loadEnv();
  const port = Number(process.env.PORT) || 3000;
  start(port).then(() => console.log(`Локальный сервер: http://127.0.0.1:${port}  (отзывы: /r/<token>)`));
}
