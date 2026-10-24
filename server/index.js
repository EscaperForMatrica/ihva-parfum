import { loadConfig, telegramConfigured } from './config.js';
import { createApp } from './app.js';

const config = loadConfig();
const { server } = createApp({ config });

server.listen(config.port, () => {
  console.log(`IHVA PARFUM → http://localhost:${config.port}`);
  if (!telegramConfigured(config)) {
    console.warn('⚠  TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID не заданы: сайт работает, но заявки приниматься не будут (см. README).');
  }
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
