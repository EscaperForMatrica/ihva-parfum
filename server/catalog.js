import { readFileSync } from 'node:fs';

const DATA = new URL('../data/', import.meta.url);

export const GENDERS = ['Мужской', 'Женский', 'Для всех'];
export const CATS = ['Мужская', 'Женская', 'Для всех', 'Нишевые'];
export const FAMILIES = ['Восточные', 'Древесные', 'Цветочные', 'Цитрусовые'];
export const VOLS = [3, 5, 6, 10, 30, 50];
const FAMILY_ADJ = { 'Восточные': 'Восточный', 'Древесные': 'Древесный', 'Цветочные': 'Цветочный', 'Цитрусовые': 'Цитрусовый' };

/**
 * Каталог хранится в SQLite (таблица products) — его редактирует админка. При первом запуске таблица
 * заполняется из data/products.json. `products` и `byId` — только видимые покупателям товары; они
 * пересобираются после каждого изменения, поэтому расчёт заказа всегда видит актуальные цены.
 */
export function createCatalog(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY, data TEXT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
  )`);
  const site = JSON.parse(readFileSync(new URL('site.json', DATA), 'utf8'));
  const count = db.prepare('SELECT COUNT(*) n FROM products').get().n;
  if (!count) {
    const seed = JSON.parse(readFileSync(new URL('products.json', DATA), 'utf8'));
    const ins = db.prepare('INSERT INTO products (id, data, hidden, position, updated_at) VALUES (?, ?, 0, ?, ?)');
    db.exec('BEGIN');
    seed.forEach((p, i) => ins.run(p.id, JSON.stringify(p), p.popularity ?? i + 1, new Date().toISOString()));
    db.exec('COMMIT');
  }

  const catalog = { site, products: [], byId: new Map() };
  const rows = () => db.prepare('SELECT data, hidden FROM products ORDER BY position, id').all().map(r => ({ ...JSON.parse(r.data), hidden: Boolean(r.hidden) }));

  catalog.refresh = () => {
    catalog.products = rows().filter(p => !p.hidden).map(({ hidden, ...p }) => p);
    catalog.byId = new Map(catalog.products.map(p => [p.id, p]));
  };
  catalog.all = () => rows();
  catalog.upsert = p => {
    const { hidden = false, ...data } = p;
    data.popularity = Number.isInteger(data.popularity) ? data.popularity : 99;
    data.familyNote = data.familyNote || FAMILY_ADJ[data.family] || data.family;
    db.prepare(`INSERT INTO products (id, data, hidden, position, updated_at) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET data = excluded.data, hidden = excluded.hidden, position = excluded.position, updated_at = excluded.updated_at`)
      .run(data.id, JSON.stringify(data), hidden ? 1 : 0, data.popularity, new Date().toISOString());
    catalog.refresh();
  };
  catalog.remove = id => { db.prepare('DELETE FROM products WHERE id = ?').run(id); catalog.refresh(); };
  catalog.exists = id => Boolean(db.prepare('SELECT 1 FROM products WHERE id = ?').get(id));
  catalog.refresh();
  return catalog;
}

const str = (v, max) => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const text = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r\n?/g, '\n').trim().slice(0, max);

/** Проверка товара из админки. Возвращает { ok, errors, value }. */
export function validateProduct(body, existing = {}) {
  const e = {};
  const v = { id: existing.id };
  v.brand = str(body.brand, 60); if (!v.brand) e.brand = 'Укажите бренд';
  v.name = str(body.name, 80); if (!v.name) e.name = 'Укажите название';
  v.type = str(body.type, 60);
  v.gender = GENDERS.includes(body.gender) ? body.gender : (e.gender = 'Выберите пол', existing.gender);
  v.cats = (Array.isArray(body.cats) ? body.cats : []).filter(c => CATS.includes(c));
  if (!v.cats.length) e.cats = 'Выберите хотя бы одну категорию';
  v.family = str(body.family, 30) || FAMILIES[0];
  v.familyNote = str(body.familyNote, 40) || FAMILY_ADJ[v.family] || v.family;
  v.popularity = Number.isInteger(Number(body.popularity)) && Number(body.popularity) >= 1 ? Math.min(999, Number(body.popularity)) : (existing.popularity ?? 99);
  v.tag = str(body.tag, 24);
  v.image = typeof body.image === 'string' && /^\/(images|uploads)\/[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(body.image) ? body.image : (existing.image ?? null);
  v.description = text(body.description, 1000);
  if (!v.description) v.description = `${v.brand} ${v.name} — в разливе: от пробника 3 мл до большого флакона.`;
  const n = body.notes || {};
  const notes = { top: str(n.top, 120), heart: str(n.heart, 120), base: str(n.base, 120) };
  v.notes = notes.top || notes.heart || notes.base ? notes : null;
  v.seasons = existing.seasons ?? null;
  v.longevity = str(body.longevity, 40) || null;
  v.audience = text(body.audience, 300) || null;
  v.brandInfo = text(body.brandInfo, 400) || null;
  v.hidden = Boolean(body.hidden);

  const incoming = new Map((Array.isArray(body.variants) ? body.variants : []).map(x => [Number(x.vol), x]));
  v.variants = VOLS.map(vol => {
    const x = incoming.get(vol) || {};
    const price = Number(x.price);
    if (!Number.isInteger(price) || price < 1 || price > 1_000_000) { e[`price_${vol}`] = 'Укажите цену'; }
    return { vol, price, available: Boolean(x.available), priceSource: 'admin' };
  });
  return { ok: Object.keys(e).length === 0, errors: e, value: v };
}

const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
export function slugify(s) {
  const t = String(s).toLowerCase().split('').map(ch => TR[ch] ?? ch).join('').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return t.length >= 2 ? t : 'item';
}
