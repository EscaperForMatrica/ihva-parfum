import { existsSync } from 'node:fs';

// Загружаем .env, если он есть (Node ≥ 20.12). Секреты живут только в переменных окружения сервера.
try { if (existsSync('.env')) process.loadEnvFile('.env'); } catch { /* повреждённый .env не должен ронять сервер */ }

export function loadConfig(env = process.env) {
  const num = (v, d) => (Number.isFinite(Number(v)) && v !== undefined && v !== '' ? Number(v) : d);
  return {
    port: num(env.PORT, 3000),
    databasePath: env.DATABASE_PATH || './storage/orders.db',
    timezone: env.ORDER_TIMEZONE || 'Europe/Moscow',
    trustProxy: env.TRUST_PROXY === '1',
    telegram: {
      token: (env.TELEGRAM_BOT_TOKEN || '').trim(),
      chatIds: (env.TELEGRAM_CHAT_ID || '').split(',').map(x => x.trim()).filter(Boolean),
      apiBase: (env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/+$/, ''),
      timeoutMs: num(env.TELEGRAM_TIMEOUT_MS, 8000)
    },
    publicTelegramUrl: /^https:\/\/(t\.me|telegram\.me)\//i.test(env.PUBLIC_TELEGRAM_URL || '') ? env.PUBLIC_TELEGRAM_URL.trim() : '',
    siteUrl: (env.SITE_URL || '').replace(/\/+$/, ''),
    rateLimit: {
      ipMax: num(env.RATE_LIMIT_IP_MAX, 10),          // заявок с одного IP
      ipWindowMs: num(env.RATE_LIMIT_IP_WINDOW_MS, 10 * 60 * 1000),
      phoneMax: num(env.RATE_LIMIT_PHONE_MAX, 5),    // заявок с одного телефона
      phoneWindowMs: num(env.RATE_LIMIT_PHONE_WINDOW_MS, 60 * 60 * 1000)
    }
  };
}

export const telegramConfigured = cfg => Boolean(cfg.telegram.token && cfg.telegram.chatIds.length);
