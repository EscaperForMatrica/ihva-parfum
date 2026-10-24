import { telegramConfigured } from './config.js';

export class TelegramError extends Error {
  constructor(message, { retryable = true, code = 'telegram_error' } = {}) {
    super(message);
    this.retryable = retryable;
    this.code = code;
  }
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const rub = n => n.toLocaleString('ru-RU').replace(/ | /g, ' ') + ' ₽';
const METHOD_LABEL = { telegram: 'Telegram', whatsapp: 'WhatsApp', call: 'Звонок' };

export function formatDate(iso, timeZone) {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat('ru-RU', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  const tz = timeZone === 'Europe/Moscow' ? 'МСК' : (new Intl.DateTimeFormat('ru-RU', { timeZone, timeZoneName: 'short' }).formatToParts(d).find(p => p.type === 'timeZoneName')?.value || '');
  return `${date.replace(',', '')} ${tz}`.trim();
}

/** Текст уведомления менеджеру (parse_mode=HTML; все пользовательские значения экранируются). */
export function formatOrderMessage(order, timeZone) {
  const lines = order.items.map(l => `— ${esc(l.brand)} · ${esc(l.name)}, ${l.vol} мл × ${l.qty} — ${rub(l.sum)}`);
  const out = [
    `🛍 <b>НОВЫЙ ЗАКАЗ №${esc(order.orderNo)}</b>`,
    `🕒 ${esc(formatDate(order.createdAt, timeZone))}`,
    '',
    `<b>Клиент:</b> ${esc(order.name)}`,
    `<b>Телефон:</b> ${esc(order.phone)}`,
    `<b>Город:</b> ${esc(order.city)}`,
    `<b>Способ связи:</b> ${METHOD_LABEL[order.method] || esc(order.method)}`
  ];
  if (order.contact) out.push(`<b>Контакт для связи:</b> ${esc(order.contact)}`);
  out.push('', '<b>Состав заказа:</b>', ...lines, '',
    `<b>Позиций:</b> ${order.items.length}, товаров: ${order.items.reduce((a, l) => a + l.qty, 0)} шт.`,
    `<b>Итого: ${rub(order.total)}</b>`);
  if (order.comment) out.push('', `<b>Комментарий:</b> ${esc(order.comment)}`);
  return out.join('\n');
}

/** Отправляет сообщение через Bot API. Токен нигде не логируется и не попадает в тексты ошибок. */
async function sendOne(cfg, chatId, text) {
  if (!telegramConfigured(cfg)) throw new TelegramError('Telegram не настроен', { retryable: false, code: 'not_configured' });
  let res;
  try {
    res = await fetch(`${cfg.telegram.apiBase}/bot${cfg.telegram.token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(cfg.telegram.timeoutMs)
    });
  } catch (e) {
    throw new TelegramError(e?.name === 'TimeoutError' ? 'Таймаут запроса к Telegram' : 'Нет соединения с Telegram', { code: 'network' });
  }
  let data = null;
  try { data = await res.json(); } catch { /* не JSON */ }
  if (res.ok && data?.ok) return data.result;
  const desc = String(data?.description || `HTTP ${res.status}`).replace(cfg.telegram.token, '***');
  // 400/401/403/404 — неверный токен, чат или формат: повтор не поможет, пока не исправят настройки
  const retryable = res.status === 429 || res.status >= 500;
  throw new TelegramError(`Telegram отклонил запрос: ${desc}`, { retryable, code: res.status === 429 ? 'rate_limited' : retryable ? 'upstream' : 'rejected' });
}

/**
 * Отправляет заявку всем получателям из TELEGRAM_CHAT_ID (через запятую).
 * Заявка считается доставленной, если дошла хотя бы до одного; сбои остальных пишутся в лог.
 */
export async function sendMessage(cfg, text) {
  if (!telegramConfigured(cfg)) throw new TelegramError('Telegram не настроен', { retryable: false, code: 'not_configured' });
  const results = await Promise.allSettled(cfg.telegram.chatIds.map(id => sendOne(cfg, id, text)));
  const ok = results.filter(r => r.status === 'fulfilled');
  results.forEach((r, i) => { if (r.status === 'rejected') console.error(`[telegram] получатель #${i + 1}: ${r.reason.message}`); });
  if (ok.length) return ok[0].value;
  throw results[0].reason;
}
