import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateProduct, validateFormat, validateGroups, slugify, KINDS } from './catalog.js';
import { createLimiter } from './ratelimit.js';
import { formatOrderMessage, sendMessage } from './telegram.js';

const SESSION_MS = 7 * 24 * 3600 * 1000;
const MAX_UPLOAD = 6 * 1024 * 1024;
const COOKIE = 'ihva_admin';

const sha = s => createHash('sha256').update(s).digest();
const sign = (secret, v) => createHmac('sha256', secret).update(v).digest('base64url');

/** Определяет тип картинки по первым байтам (расширению и заголовку клиента не доверяем). SVG не принимаем. */
function sniff(buf) {
  if (buf.length > 12 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg';
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'png';
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}

export function createAdmin({ config, db, catalog, uploadsDir, send = sendMessage }) {
  const enabled = Boolean(config.adminPassword);
  const secret = sha('ihva-session:' + config.adminPassword);
  const pwHash = sha(config.adminPassword);
  const loginLimiter = createLimiter({ max: 10, windowMs: 15 * 60 * 1000 });

  const cookieOf = req => Object.fromEntries(String(req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(p => p.length === 2));
  const authed = req => {
    if (!enabled) return false;
    const [exp, sig] = String(cookieOf(req)[COOKIE] || '').split('.');
    if (!exp || !sig || Number(exp) < Date.now()) return false;
    const want = sign(secret, exp);
    return sig.length === want.length && timingSafeEqual(Buffer.from(sig), Buffer.from(want));
  };
  const setCookie = (req, value, maxAge) => {
    const secure = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted ? '; Secure' : '';
    return `${COOKIE}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`;
  };

  const orderRow = r => ({
    orderNo: r.order_no, createdAt: r.created_at, name: r.name, phone: r.phone, city: r.city, method: r.method,
    contact: r.contact, comment: r.comment, items: JSON.parse(r.items), total: r.total, tgStatus: r.tg_status, status: r.status
  });

  /** Возвращает [status, body, headers] или null, если маршрут не админский. */
  async function handle(req, path, { json, raw, ip }) {
    if (!path.startsWith('/api/admin/')) return null;
    if (!enabled) return [503, { ok: false, code: 'admin_disabled', message: 'Админка выключена: задайте ADMIN_PASSWORD на сервере.' }];
    const route = path.slice('/api/admin/'.length);

    if (route === 'login' && req.method === 'POST') {
      if (!loginLimiter.take(ip)) return [429, { ok: false, message: 'Слишком много попыток. Подождите 15 минут.' }];
      const { password } = await json();
      if (typeof password !== 'string' || !timingSafeEqual(sha(password), pwHash)) return [401, { ok: false, message: 'Неверный пароль' }];
      const exp = String(Date.now() + SESSION_MS);
      return [200, { ok: true }, { 'set-cookie': setCookie(req, `${exp}.${sign(secret, exp)}`, SESSION_MS / 1000) }];
    }
    if (route === 'logout' && req.method === 'POST') return [200, { ok: true }, { 'set-cookie': setCookie(req, '', 0) }];

    if (!authed(req)) return [401, { ok: false, code: 'unauthorized', message: 'Требуется вход' }];
    // защита от CSRF сверх SameSite=Strict: изменяющие запросы только с нашим заголовком
    if (req.method !== 'GET' && req.headers['x-admin'] !== '1') return [403, { ok: false, message: 'Запрещено' }];

    if (route === 'me') return [200, { ok: true }];

    if (route === 'products' && req.method === 'GET') return [200, catalog.all()];

    if (route === 'products' && req.method === 'POST') {
      const body = await json();
      const parsed = validateProduct(body);
      if (!parsed.ok) return [400, { ok: false, fields: parsed.errors, message: 'Проверьте поля' }];
      let id = slugify(`${parsed.value.brand} ${parsed.value.name}`), n = 2;
      while (catalog.exists(id)) id = `${id.replace(/-\d+$/, '')}-${n++}`;
      parsed.value.id = id;
      if (parsed.value.image === null || parsed.value.image === undefined) parsed.value.image = null;
      catalog.upsert(parsed.value);
      return [200, { ok: true, id }];
    }

    const pm = route.match(/^products\/([a-z0-9-]+)$/);
    if (pm) {
      const id = pm[1], existing = catalog.all().find(p => p.id === id);
      if (!existing) return [404, { ok: false, message: 'Товар не найден' }];
      if (req.method === 'PUT') {
        const parsed = validateProduct(await json(), existing);
        if (!parsed.ok) return [400, { ok: false, fields: parsed.errors, message: 'Проверьте поля' }];
        catalog.upsert(parsed.value);
        return [200, { ok: true }];
      }
      if (req.method === 'DELETE') { catalog.remove(id); return [200, { ok: true }]; }
    }

    if (route === 'discounts' && req.method === 'GET') return [200, catalog.groups()];
    if (route === 'discounts' && req.method === 'PUT') {
      const parsed = validateGroups(await json());
      if (!parsed.ok) return [400, { ok: false, fields: parsed.errors, message: 'Проверьте поля' }];
      catalog.setGroups(parsed.value);
      return [200, { ok: true }];
    }
    const km = route.match(/^products\/([a-z0-9-]+)\/kind$/);
    if (km && req.method === 'PUT') {
      const { kind } = await json();
      if (kind !== '' && !(kind in KINDS)) return [400, { ok: false, message: 'Неизвестный вид' }];
      return catalog.setKind(km[1], kind) ? [200, { ok: true }] : [404, { ok: false, message: 'Товар не найден' }];
    }
    if (route === 'formats' && req.method === 'GET') return [200, catalog.formats()];
    const fm = route.match(/^formats\/(\d+)$/);
    if (fm && req.method === 'PUT') {
      const vol = Number(fm[1]), cur = catalog.formats().find(f => f.vol === vol);
      if (!cur) return [404, { ok: false, message: 'Такого формата нет' }];
      const parsed = validateFormat(await json(), cur);
      if (!parsed.ok) return [400, { ok: false, fields: parsed.errors, message: 'Проверьте поля' }];
      catalog.setFormat(vol, parsed.value);
      return [200, { ok: true }];
    }

    if (route === 'upload' && req.method === 'POST') {
      const buf = await raw(MAX_UPLOAD);
      const ext = sniff(buf);
      if (!ext) return [415, { ok: false, message: 'Нужна картинка JPG, PNG или WebP' }];
      mkdirSync(uploadsDir, { recursive: true });
      const name = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}.${ext}`;
      writeFileSync(join(uploadsDir, name), buf);
      return [200, { ok: true, path: `/uploads/${name}` }];
    }

    if (route === 'orders' && req.method === 'GET') {
      return [200, db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 200').all().map(orderRow)];
    }
    const om = route.match(/^orders\/(IH-\d{6}-\d{4})\/(status|resend)$/);
    if (om && req.method === 'POST') {
      const row = db.prepare('SELECT * FROM orders WHERE order_no = ?').get(om[1]);
      if (!row) return [404, { ok: false, message: 'Заявка не найдена' }];
      if (om[2] === 'status') {
        const { status } = await json();
        if (!['new', 'done'].includes(status)) return [400, { ok: false }];
        db.prepare('UPDATE orders SET status = ? WHERE order_no = ?').run(status, om[1]);
        return [200, { ok: true }];
      }
      try {
        await send(config, formatOrderMessage(orderRow(row), config.timezone));
        db.prepare("UPDATE orders SET tg_status='sent', tg_attempts=tg_attempts+1, tg_error=NULL, tg_sent_at=? WHERE order_no=?").run(new Date().toISOString(), om[1]);
        return [200, { ok: true }];
      } catch (e) {
        db.prepare("UPDATE orders SET tg_status='failed', tg_attempts=tg_attempts+1, tg_error=? WHERE order_no=?").run(String(e.message).slice(0, 300), om[1]);
        return [502, { ok: false, message: 'Telegram не принял сообщение. Проверьте токен и chat_id.' }];
      }
    }
    return [404, { ok: false, code: 'not_found' }];
  }
  return { handle, enabled };
}
