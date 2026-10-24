export const MAX_QTY = 10;
export const MAX_LINES = 30;

/**
 * Пересчитывает корзину по доверенным данным каталога. Цены, названия и объёмы из запроса не используются —
 * клиент присылает только { id, vol, qty }.
 * Возвращает { lines, total, count } или бросает { fields, message } при ошибке.
 */
export function quote(catalog, rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw quoteError('Корзина пуста');
  if (rawItems.length > MAX_LINES) throw quoteError('Слишком много позиций в заявке');

  const merged = new Map();
  for (const it of rawItems) {
    if (!it || typeof it !== 'object') throw quoteError('Некорректная позиция в корзине');
    const qty = Number(it.qty), vol = Number(it.vol);
    if (typeof it.id !== 'string' || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY || !Number.isInteger(vol)) {
      throw quoteError('Некорректная позиция в корзине');
    }
    const key = `${it.id}:${vol}`;
    merged.set(key, { id: it.id, vol, qty: Math.min(MAX_QTY, (merged.get(key)?.qty || 0) + qty) });
  }

  const lines = [];
  for (const { id, vol, qty } of merged.values()) {
    const p = catalog.byId.get(id);
    const v = p?.variants.find(x => x.vol === vol);
    if (!p || !v) throw quoteError('Один из товаров больше не продаётся — обновите корзину');
    if (!v.available) throw quoteError(`${p.brand} ${p.name}, ${vol} мл — нет в наличии`);
    const line = { id: p.id, brand: p.brand, name: p.name, vol, qty, unit: v.price, sum: v.price * qty };
    if (v.oldPrice) { line.oldUnit = v.oldPrice; line.discount = p.sale.percent; }
    lines.push(line);
  }
  return {
    lines,
    total: lines.reduce((a, l) => a + l.sum, 0),
    count: lines.reduce((a, l) => a + l.qty, 0)
  };
}

function quoteError(message) { return { fields: { items: message }, message }; }
