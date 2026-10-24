// Локальная имитация Telegram Bot API для проверки сайта без настоящего бота.
//   node scripts/mock-telegram.mjs [port]
//   POST /__mode/ok | /__mode/fail (HTTP 500) | /__mode/reject (HTTP 401, неверный токен) — переключить поведение
//   GET  /__messages — что «получил» менеджер
import { createServer } from 'node:http';

export function startMock(port = 8081) {
  let mode = 'ok';
  const messages = [];
  const server = createServer((req, res) => {
    const json = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    const m = req.url.match(/^\/__mode\/(ok|fail|reject)$/);
    if (m) { mode = m[1]; return json(200, { mode }); }
    if (req.url === '/__messages') return json(200, messages);
    if (/^\/bot[^/]+\/sendMessage$/.test(req.url) && req.method === 'POST') {
      let b = ''; req.on('data', c => b += c);
      req.on('end', () => {
        if (mode === 'fail') return json(500, { ok: false, description: 'Internal Server Error' });
        if (mode === 'reject') return json(401, { ok: false, description: 'Unauthorized' });
        const body = JSON.parse(b || '{}');
        messages.push(body);
        console.log('\n--- Telegram (mock) → chat', body.chat_id, '---\n' + body.text + '\n');
        json(200, { ok: true, result: { message_id: messages.length } });
      });
      return;
    }
    json(404, { ok: false, description: 'Not Found' });
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port, messages, setMode: v => { mode = v; } })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { port } = await startMock(Number(process.argv[2]) || 8081);
  console.log(`Mock Telegram API: http://127.0.0.1:${port}`);
}
