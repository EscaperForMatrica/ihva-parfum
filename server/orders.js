import { randomUUID } from 'node:crypto';
import { quote } from './products.js';
import { validateOrder } from './validate.js';
import { telegramConfigured } from './config.js';
import { formatOrderMessage, sendMessage, TelegramError } from './telegram.js';

const dayStamp = (d, timeZone) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone, year: '2-digit', month: '2-digit', day: '2-digit' }).formatToParts(d).map(x => [x.type, x.value]));
  return p.year + p.month + p.day;
};

const rowToOrder = r => ({
  orderNo: r.order_no, createdAt: r.created_at, name: r.name, phone: r.phone, city: r.city, method: r.method,
  contact: r.contact, comment: r.comment, items: JSON.parse(r.items), total: r.total,
  tgStatus: r.tg_status, tgAttempts: r.tg_attempts
});

export function createOrderService({ db, config, catalog, limiters, send = sendMessage }) {
  const byClient = db.prepare('SELECT * FROM orders WHERE client_id = ?');
  const countDay = db.prepare('SELECT COUNT(*) AS n FROM orders WHERE order_no LIKE ?');
  const insert = db.prepare(`INSERT INTO orders (order_no, client_id, created_at, name, phone, city, method, contact, comment, items, total)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const markSent = db.prepare("UPDATE orders SET tg_status='sent', tg_attempts=tg_attempts+1, tg_error=NULL, tg_sent_at=? WHERE order_no=?");
  const markFailed = db.prepare("UPDATE orders SET tg_status='failed', tg_attempts=tg_attempts+1, tg_error=? WHERE order_no=?");

  const publicView = o => ({ orderNo: o.orderNo, createdAt: o.createdAt, name: o.name, method: o.method, items: o.items, total: o.total });

  function create(v, priced) {
    const now = new Date();
    const prefix = `IH-${dayStamp(now, config.timezone)}-`;
    db.exec('BEGIN IMMEDIATE');
    try {
      const orderNo = prefix + String(countDay.get(prefix + '%').n + 1).padStart(4, '0');
      insert.run(orderNo, v.clientId, now.toISOString(), v.name, v.phone, v.city, v.method, v.contact, v.comment, JSON.stringify(priced.lines), priced.total);
      db.exec('COMMIT');
      return rowToOrder(byClient.get(v.clientId));
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }

  async function deliver(order) {
    try {
      await send(config, formatOrderMessage(order, config.timezone));
      markSent.run(new Date().toISOString(), order.orderNo);
      return { ok: true };
    } catch (e) {
      const err = e instanceof TelegramError ? e : new TelegramError('Не удалось отправить уведомление');
      markFailed.run(`${err.code}: ${err.message}`.slice(0, 300), order.orderNo);
      console.error(`[order ${order.orderNo}] Telegram: ${err.code}: ${err.message}`);
      return { ok: false, error: err };
    }
  }

  /** Принимает заявку. Возвращает { status, body } для HTTP-ответа. */
  async function submit(body, { ip } = {}) {
    if (!telegramConfigured(config)) {
      return { status: 503, body: { ok: false, code: 'not_configured', message: 'Приём заявок на сайте пока не настроен. Напишите менеджеру в Telegram или WhatsApp — контакты ниже.' } };
    }
    if (!limiters.ip.take(ip || 'unknown')) {
      return { status: 429, body: { ok: false, code: 'rate_limited', message: 'Слишком много попыток. Подождите несколько минут и попробуйте снова.' } };
    }

    const parsed = validateOrder(body || {});
    if (!parsed.ok) return { status: 400, body: { ok: false, code: 'validation', fields: parsed.errors, message: 'Проверьте выделенные поля' } };
    const v = parsed.value;

    if (v.spam) { // притворяемся, что всё в порядке, но ничего не сохраняем и не отправляем
      return { status: 200, body: { ok: true, order: { orderNo: 'IH-000000-0000', items: [], total: 0, method: v.method, name: v.name } } };
    }

    // Повторная отправка той же заявки (после сбоя Telegram или обрыва связи) — без дублей.
    const existing = byClient.get(v.clientId);
    if (existing) {
      const order = rowToOrder(existing);
      if (order.tgStatus === 'sent') return { status: 200, body: { ok: true, replay: true, order: publicView(order) } };
      const r = await deliver(order);
      return r.ok
        ? { status: 200, body: { ok: true, order: publicView(order) } }
        : { status: 502, body: notifyFailed(r.error) };
    }

    if (!limiters.phone.take(v.phone)) {
      return { status: 429, body: { ok: false, code: 'rate_limited', message: 'С этого номера уже отправлено несколько заявок. Менеджер свяжется с вами — подождите немного.' } };
    }

    let priced;
    try { priced = quote(catalog, body.items); }
    catch (e) { return { status: 400, body: { ok: false, code: 'validation', fields: e.fields || { items: e.message }, message: e.message } }; }

    const order = create(v, priced); // сначала сохраняем…
    const r = await deliver(order);  // …потом уведомляем менеджера
    return r.ok
      ? { status: 200, body: { ok: true, order: publicView(order) } }
      : { status: 502, body: notifyFailed(r.error) };
  }

  return { submit, deliver, rowToOrder, newClientId: randomUUID };
}

function notifyFailed(err) {
  return {
    ok: false, code: 'notify_failed', retryable: err.retryable,
    message: err.retryable
      ? 'Заявка не отправлена менеджеру. Проверьте соединение и попробуйте ещё раз — повторная отправка безопасна.'
      : 'Не удалось передать заявку менеджеру из-за настроек сервера. Напишите менеджеру в Telegram или WhatsApp — контакты ниже.'
  };
}
