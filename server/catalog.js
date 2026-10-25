import { readFileSync } from 'node:fs';

const DATA = new URL('../data/', import.meta.url);

export const GENDERS = ['Мужской', 'Женский', 'Для всех'];
export const CATS = ['Мужская', 'Женская', 'Для всех', 'Нишевые'];
export const FAMILIES = ['Восточные', 'Древесные', 'Цветочные', 'Цитрусовые'];
export const VOLS = [3, 5, 6, 10, 30, 50];
export const KINDS = { original: 'Оригиналы', oil: 'Масляные' };

const endOfDay = d => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? new Date(d + 'T23:59:59').getTime() : Infinity);
/** Цена со скидкой, округлённая до 10 ₽ (чтобы цены оставались «красивыми»). */
export const discounted = (price, pct) => Math.max(10, Math.round(price * (100 - pct) / 1000) * 10);
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

  db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  const catalog = { site };
  /** Форматы флаконов (3–50 мл): подпись, подсказка и фото. Правятся в админке, по умолчанию — из data/site.json. */
  catalog.formats = () => {
    const saved = db.prepare("SELECT value FROM settings WHERE key = 'formats'").get();
    const over = saved ? JSON.parse(saved.value) : {};
    return site.formats.map(f => ({ ...f, image: `/images/formats/${f.vol}.jpg`, ...(over[f.vol] || {}) }));
  };
  catalog.setFormat = (vol, patch) => {
    const saved = db.prepare("SELECT value FROM settings WHERE key = 'formats'").get();
    const over = saved ? JSON.parse(saved.value) : {};
    over[vol] = { ...(over[vol] || {}), ...patch };
    db.prepare("INSERT INTO settings (key, value) VALUES ('formats', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(over));
  };
  let visible = [], byId = new Map(), expiry = Infinity;

  const readGroups = () => {
    const saved = db.prepare("SELECT value FROM settings WHERE key = 'discounts'").get();
    const g = saved ? JSON.parse(saved.value) : {};
    return Object.fromEntries(Object.keys(KINDS).map(k => [k, { percent: 0, until: '', active: false, ...(g[k] || {}) }]));
  };
  /** Скидка товара: своя (если задана) важнее скидки группы. Возвращает { percent, until } или null. */
  function saleOf(p, groups, now) {
    const own = p.discount, grp = groups[p.kind];
    for (const d of [own && own.percent > 0 ? own : null, grp && grp.active && grp.percent > 0 ? grp : null]) {
      if (!d) continue;
      const end = endOfDay(d.until);
      if (now > end) continue;            // срок вышел
      expiry = Math.min(expiry, end + 1);  // пересоберём каталог, когда скидка закончится
      return { percent: d.percent, until: d.until || '' };
    }
    return null;
  }
  const rows = () => db.prepare('SELECT data, hidden FROM products ORDER BY position, id').all().map(r => ({ ...JSON.parse(r.data), hidden: Boolean(r.hidden) }));

  catalog.refresh = () => {
    const now = Date.now(), groups = readGroups();
    expiry = Infinity;
    visible = rows().filter(p => !p.hidden).map(({ hidden, discount, ...p }) => {
      const sale = saleOf({ ...p, discount }, groups, now);
      p.kind = p.kind || '';
      p.sale = sale;
      if (sale) p.variants = p.variants.map(v => ({ ...v, oldPrice: v.price, price: discounted(v.price, sale.percent) }));
      return p;
    });
    byId = new Map(visible.map(p => [p.id, p]));
  };
  // публичные данные пересобираются сами, когда у скидки истёк срок
  Object.defineProperty(catalog, 'products', { get() { if (Date.now() >= expiry) catalog.refresh(); return visible; }, enumerable: true });
  Object.defineProperty(catalog, 'byId', { get() { if (Date.now() >= expiry) catalog.refresh(); return byId; }, enumerable: true });

  /** Для админки: «сырые» цены + действующая скидка. */
  catalog.all = () => { const now = Date.now(), groups = readGroups(); return rows().map(p => ({ ...p, kind: p.kind || '', salePercent: saleOf(p, groups, now)?.percent || 0 })); };
  catalog.groups = readGroups;
  catalog.setGroups = g => {
    db.prepare("INSERT INTO settings (key, value) VALUES ('discounts', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(g));
    catalog.refresh();
  };
  catalog.setKind = (id, kind) => {
    const row = db.prepare('SELECT data FROM products WHERE id = ?').get(id);
    if (!row) return false;
    const data = JSON.parse(row.data); data.kind = kind;
    db.prepare('UPDATE products SET data = ? WHERE id = ?').run(JSON.stringify(data), id);
    catalog.refresh();
    return true;
  };
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
  v.kind = Object.keys(KINDS).includes(body.kind) ? body.kind : '';
  const dp = Number(body.discount?.percent) || 0;
  if (dp < 0 || dp > 90 || !Number.isInteger(dp)) e.discount = 'Скидка — целое число от 1 до 90';
  const du = String(body.discount?.until || '');
  if (du && !/^\d{4}-\d{2}-\d{2}$/.test(du)) e.discount = 'Дата в формате ГГГГ-ММ-ДД';
  v.discount = dp > 0 ? { percent: dp, until: du } : null;

  const incoming = new Map((Array.isArray(body.variants) ? body.variants : []).map(x => [Number(x.vol), x]));
  // целый флакон (без разлива): vol = 0, размер флакона — bottleMl. Необязателен: нет цены — нет позиции.
  const full = incoming.get(0) || {};
  const fullPrice = Number(full.price) || 0;
  const bottleMl = Number(body.bottleMl) || 0;
  if (fullPrice) {
    if (!Number.isInteger(fullPrice) || fullPrice < 1 || fullPrice > 5_000_000) e.price_0 = 'Укажите цену флакона';
    if (!Number.isInteger(bottleMl) || bottleMl < 5 || bottleMl > 1000) e.bottleMl = 'Объём флакона, мл (5–1000)';
  }
  v.bottleMl = fullPrice && !e.bottleMl ? bottleMl : null;
  v.variants = VOLS.map(vol => {
    const x = incoming.get(vol) || {};
    const price = Number(x.price);
    if (!Number.isInteger(price) || price < 1 || price > 1_000_000) { e[`price_${vol}`] = 'Укажите цену'; }
    return { vol, price, available: Boolean(x.available), priceSource: 'admin' };
  });
  if (fullPrice && !e.price_0 && !e.bottleMl) v.variants.push({ vol: 0, price: fullPrice, available: Boolean(full.available), priceSource: 'admin' });
  return { ok: Object.keys(e).length === 0, errors: e, value: v };
}

const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
export function slugify(s) {
  const t = String(s).toLowerCase().split('').map(ch => TR[ch] ?? ch).join('').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return t.length >= 2 ? t : 'item';
}

/** Проверка формата флакона из админки. */
export function validateFormat(body, current) {
  const e = {}, v = {};
  v.caption = str(body.caption, 30); if (!v.caption) e.caption = 'Укажите подпись';
  v.hint = str(body.hint, 60);
  v.image = typeof body.image === 'string' && /^\/(images|uploads)\/[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(body.image) ? body.image : current.image;
  return { ok: !Object.keys(e).length, errors: e, value: v };
}

/** Проверка скидок по группам из админки. */
export function validateGroups(body) {
  const e = {}, out = {};
  for (const k of Object.keys(KINDS)) {
    const g = body?.[k] || {};
    const percent = Number(g.percent) || 0, until = String(g.until || '');
    if (!Number.isInteger(percent) || percent < 0 || percent > 90) e[k] = 'Скидка — целое число от 0 до 90';
    if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) e[k] = 'Дата в формате ГГГГ-ММ-ДД';
    out[k] = { percent, until, active: Boolean(g.active) && percent > 0 };
  }
  return { ok: !Object.keys(e).length, errors: e, value: out };
}
