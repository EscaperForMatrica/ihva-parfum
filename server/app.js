import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCatalog } from './catalog.js';
import { openDb } from './db.js';
import { createLimiter } from './ratelimit.js';
import { createOrderService } from './orders.js';
import { telegramConfigured } from './config.js';
import { createAdmin } from './admin.js';
import { dirname, resolve } from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PUBLIC = join(ROOT, 'public');
const PAGES = join(ROOT, 'pages');
const MAX_BODY = 16 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};

const SECURITY_HEADERS = {
  'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()'
};

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function createApp({ config, db: dbOverride, send } = {}) {
  const db = dbOverride || openDb(config.databasePath);
  const catalog = createCatalog(db);
  const limiters = {
    ip: createLimiter({ max: config.rateLimit.ipMax, windowMs: config.rateLimit.ipWindowMs }),
    phone: createLimiter({ max: config.rateLimit.phoneMax, windowMs: config.rateLimit.phoneWindowMs })
  };
  const orders = createOrderService({ db, config, catalog, limiters, send });
  const uploadsDir = resolve(config.uploadsDir || join(dirname(config.databasePath === ':memory:' ? './storage/x' : config.databasePath), 'uploads'));
  const admin = createAdmin({ config, db, catalog, uploadsDir, send });
  const publicSite = { ...catalog.site, telegramUrl: config.publicTelegramUrl };

  // ---------- шаблоны страниц ----------
  const partialCache = new Map();
  async function partial(name) {
    if (!partialCache.has(name) || process.env.NODE_ENV !== 'production') partialCache.set(name, await readFile(join(PAGES, 'partials', `${name}.html`), 'utf8'));
    return partialCache.get(name);
  }

  const tgLink = (cls, label = 'Telegram') => config.publicTelegramUrl ? `<a href="${esc(config.publicTelegramUrl)}" ${cls} rel="noopener" target="_blank">${label}</a>` : '';
  const waLink = (cls, label = 'WhatsApp') => `<a href="${esc(catalog.site.whatsapp)}" ${cls} rel="noopener" target="_blank">${label}</a>`;

  async function render(pageName, { active = '', title, description, path = '/' } = {}) {
    let html = await readFile(join(PAGES, `${pageName}.html`), 'utf8');
    const [header, footer, menu] = await Promise.all([partial('header'), partial('footer'), partial('menu')]);
    const site = catalog.site;
    const vars = {
      '<!--@header-->': header, '<!--@footer-->': footer, '<!--@menu-->': menu,
      '{{site_json}}': JSON.stringify(publicSite).replace(/</g, '\\u003c'),
      '{{hdr}}': active === 'home' ? '' : 'solid',
      '{{foot}}': active === 'home' ? '' : 'min',
      '{{title}}': esc(title || 'IHVA PARFUM — парфюмерный бутик'),
      '{{description}}': esc(description || 'IHVA PARFUM — парфюмерный бутик. Ароматы во флаконах от 3 до 50 мл. Заявка без оплаты на сайте — менеджер свяжется с вами.'),
      '{{canonical}}': config.siteUrl ? `<link rel="canonical" href="${esc(config.siteUrl + path)}">` : '',
      '{{ft_tg}}': config.publicTelegramUrl ? `<a href="${esc(config.publicTelegramUrl)}" rel="noopener" target="_blank">Telegram</a>` : '',
      '{{ft_wa}}': `<a href="${esc(site.whatsapp)}" rel="noopener" target="_blank">WhatsApp · ${esc(site.phoneDisplay)}</a>`,
      '{{phone}}': esc(site.phoneDisplay), '{{phone_tel}}': esc(site.phoneTel),
      '{{menu_tg}}': config.publicTelegramUrl ? tgLink('class="btn-ghost sm"') : '',
      '{{menu_wa}}': waLink('class="btn-ghost sm"'),
      '{{chip_tg}}': config.publicTelegramUrl ? `<a href="${esc(config.publicTelegramUrl)}" class="chip" rel="noopener" target="_blank"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" class="brand-telegram"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>Telegram</a>` : '',
      '{{chip_wa}}': `<a href="${esc(site.whatsapp)}" class="chip" rel="noopener" target="_blank"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" class="brand-whatsapp"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>WhatsApp</a>`
    };
    for (const [k, v] of Object.entries(vars)) html = html.split(k).join(v);
    html = html.replace(/\{\{on:([a-z]+)\}\}/g, (_, n) => (n === active ? 'on' : ''));
    return html;
  }

  // ---------- статика ----------
  async function serveStatic(req, res, urlPath, root = PUBLIC) {
    let rel;
    try { rel = normalize(decodeURIComponent(urlPath)); } catch { return false; }
    if (rel.includes('\0') || rel.split(sep).some(s => s.startsWith('.'))) return false;
    const file = join(root, rel);
    if (!file.startsWith(root + sep)) return false;
    let st;
    try { st = await stat(file); } catch { return false; }
    if (!st.isFile()) return false;
    const type = MIME[extname(file).toLowerCase()];
    if (!type) return false;
    const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    const immutable = /\.(woff2|jpg|jpeg|png|webp|svg)$/i.test(file);
    const headers = { ...SECURITY_HEADERS, 'content-type': type, etag, 'cache-control': immutable ? 'public, max-age=604800' : 'no-cache' };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return true; }
    res.writeHead(200, { ...headers, 'content-length': st.size });
    if (req.method === 'HEAD') { res.end(); return true; }
    res.end(await readFile(file));
    return true;
  }

  // ---------- вспомогательное ----------
  function send_(res, status, body, headers = {}) {
    const isStr = typeof body === 'string';
    res.writeHead(status, { ...SECURITY_HEADERS, 'content-type': isStr ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
    res.end(isStr ? body : JSON.stringify(body));
  }

  function clientIp(req) {
    if (config.trustProxy) {
      const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
      if (xff) return xff;
    }
    return req.socket.remoteAddress || 'unknown';
  }

  function readJson(req) {
    return new Promise((resolve, reject) => {
      let size = 0, tooLarge = false; const chunks = [];
      req.on('data', c => {
        if (tooLarge) return;
        size += c.length;
        if (size > MAX_BODY) { tooLarge = true; chunks.length = 0; reject(Object.assign(new Error('too large'), { status: 413 })); return; }
        chunks.push(c);
      });
      req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(Object.assign(new Error('bad json'), { status: 400 })); } });
      req.on('error', reject);
    });
  }

  function readRaw(req, limit) {
    return new Promise((resolve_, reject) => {
      let size = 0; const chunks = []; let over = false;
      req.on('data', c => { if (over) return; size += c.length; if (size > limit) { over = true; chunks.length = 0; reject(Object.assign(new Error('too large'), { status: 413 })); return; } chunks.push(c); });
      req.on('end', () => { if (!over) resolve_(Buffer.concat(chunks)); });
      req.on('error', reject);
    });
  }

  // ---------- маршруты ----------
  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;

    if (path === '/api/health') return send_(res, 200, { ok: true, telegram: telegramConfigured(config) });
    if (path === '/api/products' && req.method === 'GET') return send_(res, 200, catalog.products, { 'cache-control': 'no-cache' });
    if (path === '/api/site' && req.method === 'GET') return send_(res, 200, publicSite, { 'cache-control': 'no-cache' });

    if (path === '/api/orders') {
      if (req.method !== 'POST') return send_(res, 405, { ok: false, code: 'method_not_allowed' }, { allow: 'POST' });
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) return send_(res, 415, { ok: false, code: 'unsupported_media_type' });
      try {
        const body = await readJson(req);
        const r = await orders.submit(body, { ip: clientIp(req) });
        return send_(res, r.status, r.body);
      } catch (e) {
        if (e.status) {
          if (e.status === 413) res.on('finish', () => req.destroy());
          return send_(res, e.status, { ok: false, code: e.status === 413 ? 'too_large' : 'bad_request', message: 'Некорректный запрос' }, e.status === 413 ? { connection: 'close' } : {});
        }
        console.error('[orders] unexpected', e);
        return send_(res, 500, { ok: false, code: 'server_error', message: 'Внутренняя ошибка. Ничего не потеряно — попробуйте ещё раз через минуту.' });
      }
    }
    if (path.startsWith('/api/admin/')) {
      try {
        const r = await admin.handle(req, path, { json: () => readJson(req), raw: n => readRaw(req, n), ip: clientIp(req) });
        return send_(res, r[0], r[1], { 'x-robots-tag': 'noindex', ...(r[2] || {}) });
      } catch (e) {
        if (e.status) { if (e.status === 413) res.on('finish', () => req.destroy()); return send_(res, e.status, { ok: false, message: e.status === 413 ? 'Файл слишком большой' : 'Некорректный запрос' }, e.status === 413 ? { connection: 'close' } : {}); }
        console.error('[admin] unexpected', e);
        return send_(res, 500, { ok: false, message: 'Внутренняя ошибка' });
      }
    }
    if (path.startsWith('/api/')) return send_(res, 404, { ok: false, code: 'not_found' });

    if (req.method !== 'GET' && req.method !== 'HEAD') return send_(res, 405, 'Method Not Allowed', { allow: 'GET, HEAD' });

    // страницы
    const pages = {
      '/': ['index', 'home', 'IHVA PARFUM — парфюмерный бутик'],
      '/catalog': ['catalog', 'catalog', 'Каталог ароматов — IHVA PARFUM'],
      '/cart': ['cart', 'cart', 'Корзина — IHVA PARFUM'],
      '/checkout': ['checkout', 'checkout', 'Оформление заказа — IHVA PARFUM']
    };
    if (path === '/admin' || path === '/admin/') {
      const html = await readFile(join(PAGES, 'admin.html'), 'utf8');
      return send_(res, 200, html, { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' });
    }
    if (path.startsWith('/uploads/') && await serveStatic(req, res, path.slice('/uploads'.length), uploadsDir)) return;
    const clean = path.length > 1 ? path.replace(/\/+$/, '') : path;
    if (pages[clean]) {
      const [name, active, title] = pages[clean];
      return send_(res, 200, await render(name, { active, title, path: clean }), { 'cache-control': 'no-cache' });
    }
    const pm = clean.match(/^\/product\/([a-z0-9-]+)$/);
    if (pm) {
      const p = catalog.byId.get(pm[1]);
      if (!p) return send_(res, 404, await render('404', { title: 'Страница не найдена — IHVA PARFUM', path }));
      const min = Math.min(...p.variants.filter(v => v.available).map(v => v.price));
      const description = `${p.brand} ${p.name}${p.type ? ' ' + p.type : ''} — ${p.gender.toLowerCase()} аромат в разливе${Number.isFinite(min) ? ', от ' + min.toLocaleString('ru-RU') + ' ₽' : ''}. Заявка без оплаты на сайте.`;
      return send_(res, 200, await render('product', { active: 'catalog', title: `${p.brand} ${p.name} — IHVA PARFUM`, description, path: clean }), { 'cache-control': 'no-cache' });
    }

    if (await serveStatic(req, res, path)) return;
    return send_(res, 404, await render('404', { title: 'Страница не найдена — IHVA PARFUM', path }));
  }

  const server = createServer((req, res) => {
    handle(req, res).catch(e => {
      console.error('[http] unexpected', e);
      if (!res.headersSent) send_(res, 500, 'Internal Server Error');
      else res.end();
    });
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  return { server, db, orders, catalog };
}
