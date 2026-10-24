// Показывает chat_id тех, кто нажал Start у бота (или написал ему / добавил в группу).
//   node scripts/telegram-chats.mjs
import { loadConfig } from '../server/config.js';
const { telegram } = loadConfig();
if (!telegram.token) { console.error('Задайте TELEGRAM_BOT_TOKEN в .env'); process.exit(1); }
const r = await (await fetch(`${telegram.apiBase}/bot${telegram.token}/getUpdates`)).json();
if (!r.ok) { console.error('Ошибка Telegram:', r.description); process.exit(1); }
const seen = new Map();
for (const u of r.result) { const c = (u.message || u.my_chat_member || u.channel_post)?.chat; if (c) seen.set(c.id, c); }
if (!seen.size) console.log('Пока никто не писал боту. Откройте бота и нажмите Start, затем запустите команду снова.');
for (const c of seen.values()) console.log(`${c.id}\t${c.type}\t${c.username ? '@' + c.username : ''} ${c.first_name || c.title || ''}`.trim());
