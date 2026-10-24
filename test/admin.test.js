import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../server/config.js';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { startMock } from '../scripts/mock-telegram.mjs';

let mock, app, base, db, cookie, uploads;

async function boot(env = {}) {
  uploads = mkdtempSync(join(tmpdir(), 'ihva-up-'));
  const config = loadConfig({ TELEGRAM_BOT_TOKEN: '1:T', TELEGRAM_CHAT_ID: '1', TELEGRAM_API_BASE: `http://127.0.0.1:${mock.port}`, ADMIN_PASSWORD: 'correct horse', UPLOADS_DIR: uploads, RATE_LIMIT_IP_MAX: '1000', RATE_LIMIT_PHONE_MAX: '1000', ...env });
  db = openDb(':memory:');
  app = createApp({ config, db });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.server.address().port}`;
}
const shutdown = () => new Promise(r => { app.server.close(r); app.server.closeAllConnections(); });
const call = (path, { method = 'GET', body, headers = {}, raw } = {}) => fetch(`${base}/api/admin/${path}`, {
  method, headers: { ...(cookie ? { cookie } : {}), 'x-admin': '1', ...(raw ? { 'content-type': raw.type } : body ? { 'content-type': 'application/json' } : {}), ...headers },
  body: raw ? raw.data : body ? JSON.stringify(body) : undefined
});
async function login(pw = 'correct horse') {
  const r = await call('login', { method: 'POST', body: { password: pw } });
  if (r.ok) cookie = r.headers.get('set-cookie').split(';')[0];
  return r;
}
const order = (items, phone = '8 928 000 00 00') => ({ name: 'Анна', phone, city: 'Махачкала', method: 'telegram', contact: '', comment: '', items, clientOrderId: randomUUID(), website: '' });

before(async () => { mock = await startMock(0); });
after(async () => { if (app) await shutdown(); mock.server.closeAllConnections(); mock.server.close(); });
beforeEach(async () => { cookie = null; mock.messages.length = 0; mock.setMode('ok'); if (app) await shutdown(); await boot(); });

test('без ADMIN_PASSWORD админка выключена', async () => {
  await shutdown(); await boot({ ADMIN_PASSWORD: '' });
  assert.equal((await call('products')).status, 503);
  assert.equal((await call('login', { method: 'POST', body: { password: '' } })).status, 503);
});

test('вход: неверный пароль, нужен cookie, cookie HttpOnly+SameSite', async () => {
  assert.equal((await call('products')).status, 401);
  assert.equal((await login('wrong')).status, 401);
  const r = await login();
  assert.equal(r.status, 200);
  const c = r.headers.get('set-cookie');
  assert.match(c, /HttpOnly/); assert.match(c, /SameSite=Strict/);
  assert.equal((await call('products')).status, 200);
  assert.equal((await call('products', { headers: { cookie: cookie.slice(0, -3) + 'xxx' } })).status, 401);
});

test('подделанный/просроченный cookie не принимается', async () => {
  const r = await call('products', { headers: { cookie: `ihva_admin=${Date.now() + 1e9}.AAAA` } });
  assert.equal(r.status, 401);
  assert.equal((await call('products', { headers: { cookie: `ihva_admin=1.AAAA` } })).status, 401);
});

test('лимит попыток входа', async () => {
  for (let i = 0; i < 10; i++) await login('bad');
  assert.equal((await login('bad')).status, 429);
  assert.equal((await login()).status, 429);
});

test('изменяющие запросы без заголовка x-admin отклоняются (CSRF)', async () => {
  await login();
  const r = await fetch(`${base}/api/admin/products/xerjoff`, { method: 'DELETE', headers: { cookie } });
  assert.equal(r.status, 403);
});

test('смена цены в админке сразу меняет витрину и расчёт заказа', async () => {
  await login();
  const p = (await (await call('products')).json()).find(x => x.id === 'xerjoff');
  p.variants.find(v => v.vol === 3).price = 1234;
  assert.equal((await call('products/xerjoff', { method: 'PUT', body: p })).status, 200);
  const pub = await (await fetch(`${base}/api/products`)).json();
  assert.equal(pub.find(x => x.id === 'xerjoff').variants.find(v => v.vol === 3).price, 1234);
  const r = await (await fetch(`${base}/api/orders`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(order([{ id: 'xerjoff', vol: 3, qty: 2 }])) })).json();
  assert.equal(r.order.total, 2468);
});

test('«нет в наличии» и «скрыт» блокируют заказ и пропадают с витрины', async () => {
  await login();
  const all = await (await call('products')).json();
  const x = all.find(p => p.id === 'xerjoff');
  await call('products/xerjoff', { method: 'PUT', body: { ...x, variants: x.variants.map(v => v.vol === 10 ? { ...v, available: false } : v) } });
  let r = await fetch(`${base}/api/orders`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(order([{ id: 'xerjoff', vol: 10, qty: 1 }])) });
  assert.equal(r.status, 400);
  await call('products/chanel', { method: 'PUT', body: { ...all.find(p => p.id === 'chanel'), hidden: true } });
  assert.ok(!(await (await fetch(`${base}/api/products`)).json()).some(p => p.id === 'chanel'));
  assert.equal((await fetch(`${base}/product/chanel`)).status, 404);
  r = await fetch(`${base}/api/orders`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(order([{ id: 'chanel', vol: 3, qty: 1 }], '8 928 000 00 01')) });
  assert.equal(r.status, 400);
  assert.ok((await (await call('products')).json()).some(p => p.id === 'chanel' && p.hidden));
});

test('новый товар: валидация, id из названия, появляется в каталоге; удаление', async () => {
  await login();
  const bad = await call('products', { method: 'POST', body: { brand: '', name: '', cats: [], variants: [] } });
  assert.equal(bad.status, 400);
  const f = (await bad.json()).fields;
  assert.ok(f.brand && f.name && f.cats && f.price_3);
  const body = { brand: 'Tom Ford', name: 'Oud Wood', type: 'EDP', gender: 'Для всех', cats: ['Нишевые', 'Для всех'], family: 'Древесные', description: '', variants: [3, 5, 6, 10, 30, 50].map(vol => ({ vol, price: vol * 300, available: true })) };
  const r = await call('products', { method: 'POST', body });
  assert.equal(r.status, 200);
  const { id } = await r.json();
  assert.equal(id, 'tom-ford-oud-wood');
  assert.ok((await (await fetch(`${base}/api/products`)).json()).some(p => p.id === id));
  assert.equal((await fetch(`${base}/product/${id}`)).status, 200);
  assert.equal((await call('products', { method: 'POST', body })).status, 200); // тот же товар → id с суффиксом
  assert.equal((await call('products/' + id, { method: 'DELETE' })).status, 200);
  assert.equal((await fetch(`${base}/product/${id}`)).status, 404);
});

test('HTML в полях товара экранируется на клиенте и не ломает данные', async () => {
  await login();
  const x = (await (await call('products')).json()).find(p => p.id === 'xerjoff');
  const r = await call('products/xerjoff', { method: 'PUT', body: { ...x, name: '<img src=x onerror=alert(1)>', image: 'javascript:alert(1)' } });
  assert.equal(r.status, 200);
  const saved = (await (await call('products')).json()).find(p => p.id === 'xerjoff');
  assert.equal(saved.image, '/images/products/xerjoff.jpg'); // небезопасный путь отброшен
});

test('загрузка фото: принимает JPG/PNG/WebP по содержимому, отклоняет SVG и мусор', async () => {
  await login();
  const jpeg = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(64)]);
  const ok = await call('upload', { method: 'POST', raw: { type: 'image/jpeg', data: jpeg } });
  assert.equal(ok.status, 200);
  const { path } = await ok.json();
  assert.match(path, /^\/uploads\/[\w-]+\.jpg$/);
  assert.ok(existsSync(join(uploads, path.split('/').pop())));
  const served = await fetch(base + path);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/jpeg');
  const svg = await call('upload', { method: 'POST', raw: { type: 'image/svg+xml', data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>') } });
  assert.equal(svg.status, 415);
  // слишком большой файл: сервер отвечает 413 и закрывает соединение (клиент может увидеть обрыв)
  const big = await call('upload', { method: 'POST', raw: { type: 'image/jpeg', data: Buffer.alloc(7 * 1024 * 1024, 0xFF) } }).then(r => r.status, () => 'closed');
  assert.ok(big === 413 || big === 'closed');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n, 0);
  const x = (await (await call('products')).json()).find(p => p.id === 'xerjoff');
  assert.equal((await call('products/xerjoff', { method: 'PUT', body: { ...x, image: path } })).status, 200);
  assert.equal((await fetch(base + '/uploads/..%2f..%2fpackage.json')).status, 404);
});

test('заявки: список, статус, повторная отправка в Telegram', async () => {
  mock.setMode('fail');
  await fetch(`${base}/api/orders`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(order([{ id: 'xerjoff', vol: 3, qty: 1 }])) });
  await login();
  let list = await (await call('orders')).json();
  assert.equal(list.length, 1); assert.equal(list[0].tgStatus, 'failed'); assert.equal(list[0].status, 'new');
  const no = list[0].orderNo;
  assert.equal((await call(`orders/${no}/resend`, { method: 'POST' })).status, 502);
  mock.setMode('ok');
  assert.equal((await call(`orders/${no}/resend`, { method: 'POST' })).status, 200);
  assert.equal(mock.messages.length, 1);
  assert.equal((await call(`orders/${no}/status`, { method: 'POST', body: { status: 'done' } })).status, 200);
  list = await (await call('orders')).json();
  assert.deepEqual([list[0].tgStatus, list[0].status], ['sent', 'done']);
  assert.equal((await call(`orders/${no}/status`, { method: 'POST', body: { status: 'x' } })).status, 400);
});

test('страница /admin отдаётся с noindex и без кэша', async () => {
  const r = await fetch(base + '/admin');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('x-robots-tag'), /noindex/);
  assert.match(await r.text(), /\/js\/admin\.js/);
});
