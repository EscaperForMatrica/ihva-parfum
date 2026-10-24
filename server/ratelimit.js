// Простое скользящее окно в памяти процесса. Это ограничитель спама, а не хранилище: потеря данных при
// перезапуске безопасна. Заказы хранятся в SQLite.
export function createLimiter({ max, windowMs }) {
  const hits = new Map();
  return {
    /** true — запрос разрешён и учтён. */
    take(key, now = Date.now()) {
      const list = (hits.get(key) || []).filter(t => now - t < windowMs);
      if (list.length >= max) { hits.set(key, list); return false; }
      list.push(now); hits.set(key, list);
      if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < windowMs)) hits.delete(k);
      return true;
    }
  };
}
