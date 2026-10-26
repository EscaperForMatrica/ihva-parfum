import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../server/config.js';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { startMock } from '../scripts/mock-telegram.mjs';
import { normalizePhone } from '../server/validate.js';

let mock, app, base, db;

async function boot(env = {}) {
  const config = loadConfig({ TELEGRAM_BOT_TOKEN: '111:SECRET', TELEGRAM_CHAT_ID: '-100', TELEGRAM_API_BASE: `http://127.0.0.1:${mock.port}`, RATE_LIMIT_IP_MAX: '1000', RATE_LIMIT_PHONE_MAX: '1000', ...env });
  db = openDb(':memory:');
  app = createApp({ config, db });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.server.address().port}`;
}
const shutdown = () => new Promise(r => { app.server.close(r); app.server.closeAllConnections(); });

const order = (over = {}) => ({
  name: 'Анна', phone: '8 928 000 00 00', city: 'Махачкала', method: 'telegram', contact: '@anna', comment: '',
  items: [{ id: 'xerjoff', vol: 10, qty: 1 }, { id: 'mancera', vol: 5, qty: 2 }],
  clientOrderId: randomUUID(), website: '', consent: true, ...over
});
const post = (body, headers = {}) => fetch(`${base}/api/orders`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

before(async () => { mock = await startMock(0); });
after(async () => { if (app) await shutdown(); mock.server.closeAllConnections(); mock.server.close(); });
beforeEach(async () => { mock.messages.length = 0; mock.setMode('ok'); if (app) await shutdown(); await boot(); });

test('нормализация телефона', () => {
  assert.equal(normalizePhone('8 (928) 000-00-00'), '+7 928 000-00-00');
  assert.equal(normalizePhone('+79280000000'), '+7 928 000-00-00');
  assert.equal(normalizePhone('9280000000'), '+7 928 000-00-00');
  assert.equal(normalizePhone('8 928 80'), null);
  assert.equal(normalizePhone('12345678901'), null);
});

test('успешная заявка: цена считается на сервере, менеджер получает сообщение', async () => {
  // клиент пытается подсунуть свою цену и название — сервер их игнорирует
  const body = order({ comment: 'Позвонить после 18:00 <script>', items: [{ id: 'xerjoff', vol: 10, qty: 1, price: 1, name: 'ПОДДЕЛКА' }, { id: 'mancera', vol: 5, qty: 2, price: 1 }] });
  const r = await post(body);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.order.total, 2790 + 1090 * 2);
  assert.match(j.order.orderNo, /^IH-\d{6}-0001$/);
  assert.equal(mock.messages.length, 1);
  const t = mock.messages[0].text;
  for (const part of [j.order.orderNo, 'Анна', '+7 928 000-00-00', 'Махачкала', 'Telegram', '@anna', 'Xerjoff · Purple Accento, 10 мл × 1 — 2 790 ₽', 'Mancera · Red Tobacco, 5 мл × 2 — 2 180 ₽', 'Итого: 4 970 ₽', 'Позвонить после 18:00 &lt;script&gt;']) assert.ok(t.includes(part), `нет «${part}» в:\n${t}`);
  assert.ok(!t.includes('ПОДДЕЛКА'));
  assert.ok(!t.includes('SECRET'));
  assert.equal(db.prepare("SELECT tg_status FROM orders").get().tg_status, 'sent');
});

test('повтор с тем же clientOrderId не создаёт дубль и не шлёт второе сообщение', async () => {
  const body = order();
  const a = await (await post(body)).json();
  const r2 = await post(body);
  const b = await r2.json();
  assert.equal(r2.status, 200);
  assert.equal(b.order.orderNo, a.order.orderNo);
  assert.equal(b.replay, true);
  assert.equal(mock.messages.length, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n, 1);
});

test('сбой Telegram: 502, заявка сохранена, успеха нет; повтор доставляет без дубля', async () => {
  mock.setMode('fail');
  const body = order();
  const r = await post(body);
  assert.equal(r.status, 502);
  const j = await r.json();
  assert.equal(j.ok, false); assert.equal(j.code, 'notify_failed'); assert.equal(j.retryable, true);
  assert.equal(mock.messages.length, 0);
  const row = db.prepare('SELECT tg_status, tg_attempts FROM orders').get();
  assert.deepEqual({ ...row }, { tg_status: 'failed', tg_attempts: 1 });

  mock.setMode('ok');
  const r2 = await post(body);
  assert.equal(r2.status, 200);
  assert.equal(mock.messages.length, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n, 1);
  assert.equal(db.prepare('SELECT tg_status FROM orders').get().tg_status, 'sent');
});

test('неверный токен/чат: 502 без повторной попытки (retryable=false), токен не утекает', async () => {
  mock.setMode('reject');
  const r = await post(order());
  const j = await r.json();
  assert.equal(r.status, 502);
  assert.equal(j.retryable, false);
  assert.ok(!JSON.stringify(j).includes('SECRET'));
  assert.ok(!db.prepare('SELECT tg_error FROM orders').get().tg_error.includes('SECRET'));
});

test('Telegram недоступен (нет соединения): 502', async () => {
  await shutdown();
  await boot({ TELEGRAM_API_BASE: 'http://127.0.0.1:1', TELEGRAM_TIMEOUT_MS: '500' });
  const r = await post(order());
  assert.equal(r.status, 502);
  assert.equal((await r.json()).retryable, true);
});

test('Telegram не настроен: 503 и ничего не сохраняется', async () => {
  await shutdown();
  await boot({ TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '' });
  const r = await post(order());
  assert.equal(r.status, 503);
  assert.equal((await r.json()).code, 'not_configured');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n, 0);
});

test('валидация полей', async () => {
  const r = await post(order({ name: '', phone: '8 928 80', city: ' ', method: 'pigeon' }));
  const j = await r.json();
  assert.equal(r.status, 400);
  assert.deepEqual(Object.keys(j.fields).sort(), ['city', 'method', 'name', 'phone']);
  assert.equal(j.fields.phone, 'Номер выглядит неполным — нужно 11 цифр');
  assert.equal(mock.messages.length, 0);
});

test('некорректные позиции корзины отклоняются', async () => {
  for (const items of [[], [{ id: 'nope', vol: 3, qty: 1 }], [{ id: 'xerjoff', vol: 6, qty: 1 }], [{ id: 'hormone', vol: 3, qty: 1 }], [{ id: 'xerjoff', vol: 3, qty: 11 }], [{ id: 'xerjoff', vol: 3, qty: 0 }], [{ id: 'xerjoff', vol: 3, qty: 1.5 }], 'x', null]) {
    const r = await post(order({ items }));
    assert.equal(r.status, 400, JSON.stringify(items));
    assert.equal((await r.json()).code, 'validation');
  }
  assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n, 0);
});

test('honeypot: бот получает «успех», но ничего не сохраняется и не отправляется', async () => {
  const r = await post(order({ website: 'http://spam' }));
  assert.equal(r.status, 200);
  assert.equal(mock.messages.length, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n, 0);
});

test('лимит заявок с одного IP', async () => {
  await shutdown();
  await boot({ RATE_LIMIT_IP_MAX: '2' });
  assert.equal((await post(order({ phone: '8 928 000 00 01' }))).status, 200);
  assert.equal((await post(order({ phone: '8 928 000 00 02' }))).status, 200);
  assert.equal((await post(order({ phone: '8 928 000 00 03' }))).status, 429);
});

test('лимит заявок с одного телефона', async () => {
  await shutdown();
  await boot({ RATE_LIMIT_PHONE_MAX: '1' });
  assert.equal((await post(order())).status, 200);
  assert.equal((await post(order())).status, 429);
});

test('служебные ограничения запроса', async () => {
  assert.equal((await post('{"x":"' + 'a'.repeat(20000) + '"}')).status, 413);
  assert.equal((await post('not json')).status, 400);
  assert.equal((await post('{}', { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await fetch(`${base}/api/orders`)).status, 405);
});

test('одновременные заявки получают разные номера', async () => {
  const rs = await Promise.all([1, 2, 3, 4, 5].map(i => post(order({ phone: `8 928 000 00 0${i}` }))));
  const nos = await Promise.all(rs.map(async r => (await r.json()).order.orderNo));
  assert.equal(new Set(nos).size, 5);
});

test('статика: нет выхода за пределы public, скрытые файлы недоступны, заголовки безопасности есть', async () => {
  for (const p of ['/..%2f..%2fpackage.json', '/%2e%2e/package.json', '/.env', '/css/../../.env.example', '/server/config.js', '/data/products.json']) {
    const r = await fetch(base + p);
    assert.equal(r.status, 404, p);
  }
  const r = await fetch(base + '/');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await fetch(base + '/product/unknown')).status, 404);
  assert.equal((await fetch(base + '/product/xerjoff')).status, 200);
});

test('каталог отдаётся единым источником и совпадает с серверной ценой', async () => {
  const products = await (await fetch(`${base}/api/products`)).json();
  const x = products.find(p => p.id === 'xerjoff');
  assert.equal(x.variants.find(v => v.vol === 50).price, 11490);
  const r = await (await post(order({ items: [{ id: 'xerjoff', vol: 50, qty: 1 }] }))).json();
  assert.equal(r.order.total, 11490);
});

test('без согласия на обработку персональных данных заявка не принимается', async () => {
  const r = await post(order({ consent: false }));
  assert.equal(r.status, 400);
  assert.ok((await r.json()).fields.consent);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n, 0);
  const ok = await post(order());
  assert.equal(ok.status, 200);
  assert.ok(db.prepare('SELECT consent_at FROM orders').get().consent_at);
});

test('страницы политики и согласия открываются и есть в подвале', async () => {
  for (const p of ['/privacy', '/consent']) {
    const r = await fetch(base + p);
    assert.equal(r.status, 200);
    const html = await r.text();
    assert.match(html, /персональных данных/);
    assert.doesNotMatch(html, /\{\{/);           // все подстановки заполнены
  }
  assert.match(await (await fetch(base + '/')).text(), /href="\/privacy"/);
});

test('заявки старше срока хранения удаляются при запуске', async () => {
  await shutdown();
  const config = loadConfig({ TELEGRAM_BOT_TOKEN: '111:SECRET', TELEGRAM_CHAT_ID: '-100', TELEGRAM_API_BASE: `http://127.0.0.1:${mock.port}`, ORDER_RETENTION_DAYS: '30' });
  db = openDb(':memory:');
  db.prepare(`INSERT INTO orders (order_no, client_id, created_at, name, phone, city, method, items, total) VALUES ('IH-200101-0001', 'old', '2020-01-01T00:00:00Z', 'А', '+7', 'Г', 'call', '[]', 1)`).run();
  db.prepare(`INSERT INTO orders (order_no, client_id, created_at, name, phone, city, method, items, total) VALUES ('IH-261026-0009', 'new', ?, 'Б', '+7', 'Г', 'call', '[]', 1)`).run(new Date().toISOString());
  app = createApp({ config, db });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.server.address().port}`;
  assert.deepEqual(db.prepare('SELECT order_no FROM orders').all().map(r => r.order_no), ['IH-261026-0009']);
});
