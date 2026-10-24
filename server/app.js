import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from './products.js';
import { openDb } from './db.js';
import { createLimiter } from './ratelimit.js';
import { createOrderService } from './orders.js';
import { telegramConfigured } from './config.js';

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
  const catalog = loadCatalog();
  const db = dbOverride || openDb(config.databasePath);
  const limiters = {
    ip: createLimiter({ max: config.rateLimit.ipMax, windowMs: config.rateLimit.ipWindowMs }),
    phone: createLimiter({ max: config.rateLimit.phoneMax, windowMs: config.rateLimit.phoneWindowMs })
  };
  const orders = createOrderService({ db, config, catalog, limiters, send });
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
      '{{ft_ig}}': `<a href="${esc(site.instagram)}" rel="noopener" target="_blank">Instagram · ${esc(site.instagramHandle)}</a>`,
      '{{phone}}': esc(site.phoneDisplay), '{{phone_tel}}': esc(site.phoneTel),
      '{{menu_tg}}': config.publicTelegramUrl ? tgLink('class="btn-ghost sm"') : '',
      '{{menu_wa}}': waLink('class="btn-ghost sm"'),
      '{{chip_tg}}': config.publicTelegramUrl ? `<a href="${esc(config.publicTelegramUrl)}" class="chip" rel="noopener" target="_blank"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M21 4 3 11l6 2.5L19 7l-8 8 6.5 5L21 4z"/></svg>Telegram</a>` : '',
      '{{chip_wa}}': `<a href="${esc(site.whatsapp)}" class="chip" rel="noopener" target="_blank"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 18.5 5.2 15A7.5 7.5 0 1 1 8.6 18.3L4 18.5z"/></svg>WhatsApp</a>`
    };
    for (const [k, v] of Object.entries(vars)) html = html.split(k).join(v);
    html = html.replace(/\{\{on:([a-z]+)\}\}/g, (_, n) => (n === active ? 'on' : ''));
    return html;
  }

  // ---------- статика ----------
  async function serveStatic(req, res, urlPath) {
    let rel;
    try { rel = normalize(decodeURIComponent(urlPath)); } catch { return false; }
    if (rel.includes('\0') || rel.split(sep).some(s => s.startsWith('.'))) return false;
    const file = join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC + sep)) return false;
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
    if (path.startsWith('/api/')) return send_(res, 404, { ok: false, code: 'not_found' });

    if (req.method !== 'GET' && req.method !== 'HEAD') return send_(res, 405, 'Method Not Allowed', { allow: 'GET, HEAD' });

    // страницы
    const pages = {
      '/': ['index', 'home', 'IHVA PARFUM — парфюмерный бутик'],
      '/catalog': ['catalog', 'catalog', 'Каталог ароматов — IHVA PARFUM'],
      '/cart': ['cart', 'cart', 'Корзина — IHVA PARFUM'],
      '/checkout': ['checkout', 'checkout', 'Оформление заказа — IHVA PARFUM']
    };
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
