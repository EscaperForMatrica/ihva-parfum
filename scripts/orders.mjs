// Просмотр заявок и повторная отправка тех, что не дошли до Telegram.
//   npm run orders                 — последние заявки
//   npm run orders -- --pending    — только не доставленные менеджеру
//   npm run orders -- --resend     — повторно отправить все недоставленные
import { loadConfig, telegramConfigured } from '../server/config.js';
import { openDb } from '../server/db.js';
import { formatOrderMessage, sendMessage } from '../server/telegram.js';

const config = loadConfig();
const db = openDb(config.databasePath);
const args = new Set(process.argv.slice(2));
const rub = n => n.toLocaleString('ru-RU') + ' ₽';

const rows = db.prepare(`SELECT * FROM orders ${args.has('--pending') || args.has('--resend') ? "WHERE tg_status != 'sent'" : ''} ORDER BY created_at DESC LIMIT 100`).all();
if (!rows.length) { console.log('Заявок нет.'); process.exit(0); }

for (const r of rows) {
  console.log(`${r.order_no}  ${r.created_at.slice(0, 16).replace('T', ' ')}  ${r.name}, ${r.phone}, ${r.city}  ${rub(r.total)}  [telegram: ${r.tg_status}${r.tg_error ? ' — ' + r.tg_error : ''}]`);
}

if (args.has('--resend')) {
  if (!telegramConfigured(config)) { console.error('\nTELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID не заданы.'); process.exit(1); }
  const markSent = db.prepare("UPDATE orders SET tg_status='sent', tg_attempts=tg_attempts+1, tg_error=NULL, tg_sent_at=? WHERE order_no=?");
  const markFailed = db.prepare("UPDATE orders SET tg_status='failed', tg_attempts=tg_attempts+1, tg_error=? WHERE order_no=?");
  for (const r of rows) {
    const order = { orderNo: r.order_no, createdAt: r.created_at, name: r.name, phone: r.phone, city: r.city, method: r.method, contact: r.contact, comment: r.comment, items: JSON.parse(r.items), total: r.total };
    try { await sendMessage(config, formatOrderMessage(order, config.timezone)); markSent.run(new Date().toISOString(), r.order_no); console.log(`✔ ${r.order_no} отправлена`); }
    catch (e) { markFailed.run(String(e.message).slice(0, 300), r.order_no); console.error(`✖ ${r.order_no}: ${e.message}`); }
  }
}
