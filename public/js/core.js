// Общие утилиты: данные каталога, корзина, избранное, уведомления, шапка. Без зависимостей и сборки.

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const rub = n => n.toLocaleString('ru-RU') + ' ₽';
export const plural = (n, [one, few, many]) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many);
};
export const PLACEHOLDER = '/images/placeholder.svg';
export const MAX_QTY = 10;

export const ICON = {
  arrow: 'M5 12h14M13 6l6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'm5 12 4.5 4.5L19 7',
  trash: 'M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  info: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 11v5M12 8h.01'],
  alert: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 8v5M12 16h.01'],
  close: 'M6 6l12 12M18 6 6 18',
  bag: ['M5 8h14l-1 12H6L5 8z', 'M9 8V6a3 3 0 0 1 6 0v2'],
  search: ['M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z', 'm20 20-4.2-4.2'],
  shield: 'M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3z',
  phone: 'M6.5 4h3l1.5 4-2 1.3a10 10 0 0 0 5.7 5.7L16 13l4 1.5v3A2 2 0 0 1 18 19.5C10.5 19 5 13.5 4.5 6A2 2 0 0 1 6.5 4z'
};
// Фирменные знаки (simple-icons, CC0): заливка, не обводка
const BRAND = { telegram: "M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z", whatsapp: "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" };
export const svg = (name, { cls = '', sw = 1.4, size } = {}) => {
  if (BRAND[name]) return `<svg viewBox="0 0 24 24"${size ? ` width="${size}" height="${size}"` : ''} fill="currentColor" aria-hidden="true" class="brand-${name}${cls ? ' ' + cls : ''}"><path d="${BRAND[name]}"/></svg>`;
  const d = [].concat(ICON[name]).map(p => `<path d="${p}"/>`).join('');
  const sz = size ? ` width="${size}" height="${size}"` : '';
  return `<svg viewBox="0 0 24 24"${sz} fill="none" stroke="currentColor" stroke-width="${sw}" aria-hidden="true"${cls ? ` class="${cls}"` : ''}>${d}</svg>`;
};

// ---------- данные ----------
let productsPromise;
export function getProducts() {
  productsPromise ??= fetch('/api/products', { headers: { accept: 'application/json' } }).then(r => { if (!r.ok) throw new Error('products ' + r.status); return r.json(); }).catch(e => { productsPromise = null; throw e; });
  return productsPromise;
}
export const site = (() => { try { return JSON.parse(document.getElementById('site-data')?.textContent || '{}'); } catch { return {}; } })();
/** Ссылка в мессенджер менеджера с готовым текстом сообщения. */
export const waLink = text => site.whatsapp ? `${site.whatsapp}?text=${encodeURIComponent(text)}` : '#';
export const findVariant = (p, vol) => p.variants.find(v => v.vol === vol);
export const availableVariants = p => p.variants.filter(v => v.available);
export const inStock = p => availableVariants(p).length > 0;
export const minVariant = p => availableVariants(p).sort((a, b) => a.price - b.price)[0] || null;
export const imgOf = p => p.image || PLACEHOLDER;
export const metaOf = p => [p.type, p.gender].filter(Boolean).join(' · ');

// ---------- безопасное хранилище ----------
const mem = new Map();
export const store = {
  get(k) { try { const v = localStorage.getItem(k); return v === null ? (mem.get(k) ?? null) : v; } catch { return mem.get(k) ?? null; } },
  set(k, v) { mem.set(k, v); try { localStorage.setItem(k, v); } catch { /* приватный режим */ } },
  del(k) { mem.delete(k); try { localStorage.removeItem(k); } catch { /* */ } }
};

// ---------- корзина ----------
const CART_KEY = 'ihva_cart_v1';
const listeners = new Set();
let lines = readCart();

function readCart() {
  try {
    const a = JSON.parse(store.get(CART_KEY) || '[]');
    return Array.isArray(a) ? a.filter(l => l && typeof l.id === 'string' && Number.isInteger(l.vol) && Number.isInteger(l.qty) && l.qty > 0).map(l => ({ id: l.id, vol: l.vol, qty: Math.min(MAX_QTY, l.qty) })) : [];
  } catch { return []; }
}
function persist(silent) {
  store.set(CART_KEY, JSON.stringify(lines));
  if (!silent) listeners.forEach(fn => fn(lines));
}
window.addEventListener('storage', e => { if (e.key === CART_KEY) { lines = readCart(); listeners.forEach(fn => fn(lines)); } });

export const cart = {
  lines: () => lines.map(l => ({ ...l })),
  count: () => lines.reduce((a, l) => a + l.qty, 0),
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  add(id, vol, qty = 1) {
    const l = lines.find(x => x.id === id && x.vol === vol);
    if (l) l.qty = Math.min(MAX_QTY, l.qty + qty); else lines.push({ id, vol, qty: Math.min(MAX_QTY, qty) });
    persist();
  },
  setQty(id, vol, qty) {
    const l = lines.find(x => x.id === id && x.vol === vol);
    if (!l) return;
    l.qty = Math.max(1, Math.min(MAX_QTY, qty));
    persist();
  },
  remove(id, vol) {
    const i = lines.findIndex(x => x.id === id && x.vol === vol);
    if (i < 0) return null;
    const [l] = lines.splice(i, 1);
    persist();
    return { line: l, index: i };
  },
  restore({ line, index }) {
    if (lines.some(x => x.id === line.id && x.vol === line.vol)) return;
    lines.splice(Math.min(index, lines.length), 0, line);
    persist();
  },
  clear() { lines = []; persist(); },
  /** Убирает позиции, которых больше нет в каталоге/наличии; возвращает удалённые. */
  reconcile(products) {
    const byId = new Map(products.map(p => [p.id, p]));
    const dropped = [];
    lines = lines.filter(l => {
      const v = byId.get(l.id)?.variants.find(x => x.vol === l.vol);
      if (v?.available) return true;
      dropped.push(l); return false;
    });
    if (dropped.length) persist();
    return dropped;
  }
};

/** Строки корзины с данными каталога и расчётом суммы (для отображения; итог всё равно пересчитывает сервер). */
export function priceCart(products, src = cart.lines()) {
  const byId = new Map(products.map(p => [p.id, p]));
  const items = [];
  for (const l of src) {
    const p = byId.get(l.id), v = p && findVariant(p, l.vol);
    if (!p || !v || !v.available) continue;
    items.push({ ...l, product: p, unit: v.price, sum: v.price * l.qty });
  }
  return { items, count: items.reduce((a, i) => a + i.qty, 0), total: items.reduce((a, i) => a + i.sum, 0) };
}

// ---------- избранное ----------
const FAV_KEY = 'ihva_fav_v1';
export const favs = {
  all() { try { const a = JSON.parse(store.get(FAV_KEY) || '[]'); return Array.isArray(a) ? a.filter(x => typeof x === 'string') : []; } catch { return []; } },
  has(id) { return this.all().includes(id); },
  toggle(id) {
    const a = this.all(), i = a.indexOf(id);
    if (i >= 0) a.splice(i, 1); else a.push(id);
    store.set(FAV_KEY, JSON.stringify(a));
    return i < 0;
  }
};

// ---------- уведомления ----------
let toastTimer, toastEl;
export function toast({ title, text = '', img, kind = 'ok', action, ttl = 2600, above = false }) {
  clearTimeout(toastTimer);
  toastEl?.remove();
  const icon = img
    ? `<img src="${esc(img)}" alt="">`
    : `<span class="t-ic ${kind === 'ok' ? '' : kind}">${svg(kind === 'bad' ? 'alert' : kind === 'neutral' ? 'trash' : 'check', { sw: 1.6 })}</span>`;
  const act = action ? (action.href ? `<a href="${esc(action.href)}" class="t-act">${esc(action.label)}</a>` : `<button type="button" class="t-act">${esc(action.label)}</button>`) : '';
  const el = document.createElement('div');
  el.className = 'toast-dock' + (above ? ' above-bar' : '');
  el.setAttribute('role', kind === 'bad' ? 'alert' : 'status');
  el.innerHTML = `<div class="toast">${icon}<div><b>${esc(title)}</b>${text ? `<small>${esc(text)}</small>` : ''}</div>${act}</div>`;
  if (action?.onClick) el.querySelector('button.t-act').addEventListener('click', () => { action.onClick(); el.remove(); });
  document.body.append(el);
  toastEl = el;
  if (ttl) toastTimer = setTimeout(() => { el.remove(); if (toastEl === el) toastEl = null; }, ttl);
  return el;
}
export const dismissToast = () => { clearTimeout(toastTimer); toastEl?.remove(); toastEl = null; };

// ---------- карточка товара (каталог, главная, «похожие») ----------
export function cardHTML(p, { added = false } = {}) {
  const oos = !inStock(p), min = minVariant(p);
  const fav = favs.has(p.id);
  const href = `/product/${encodeURIComponent(p.id)}`;
  const tag = oos ? 'Нет в наличии' : p.tag;
  const addLabel = `Добавить ${p.name} в корзину`;
  const action = oos
    ? `<a href="${esc(waLink(`Здравствуйте! Подскажите, когда будет в наличии: ${p.brand} ${p.name}`))}" class="lnk oos-link" style="font-size: 13px" target="_blank" rel="noopener">Уточнить наличие</a>`
    : `<button type="button" class="${added ? 'btn sm' : 'btn-ghost sm'} btn-add-d" data-add="${esc(p.id)}" aria-label="${esc(addLabel)}">${added ? svg('check', { cls: 'ck', sw: 1.6 }) : ''}<span>${added ? 'Добавлено' : 'В корзину'}</span></button>
       <button type="button" class="c-add btn-add-m ${added ? 'done' : ''}" data-add="${esc(p.id)}" aria-label="${esc(addLabel)}">${svg(added ? 'check' : 'plus', { sw: added ? 1.8 : 1.4 })}</button>`;
  return `<article class="card ${oos ? 'oos' : ''}" data-card="${esc(p.id)}">
<a href="${href}" class="c-img" aria-label="${esc(p.brand + ' ' + p.name)}"><img src="${esc(imgOf(p))}" alt="Флакон ${esc(p.brand + ' ' + p.name)}" loading="lazy" width="640" height="800">${tag ? `<span class="c-tag">${esc(tag)}</span>` : ''}</a>
<button type="button" class="ibtn c-fav ${fav ? 'on' : ''}" data-fav="${esc(p.id)}" aria-pressed="${fav}" aria-label="${fav ? 'Убрать из избранного' : 'В избранное'}">${svg('heart')}</button>
<div class="c-body">
<div class="c-brand">${esc(p.brand)}</div>
<a href="${href}" class="c-name">${esc(p.name)}</a>
<div class="c-meta">${esc(metaOf(p))}</div>
<div class="c-row">
<div style="display: flex; align-items: baseline; gap: 8px"><span class="price">${min ? 'от ' + rub(min.price) : esc(rub(p.variants[0].price))}</span><span class="small">${min ? min.vol + ' мл' : ''}</span></div>
${action}
</div>
</div>
</article>`;
}

/** Делегирование кликов «в корзину» и «в избранное» внутри контейнера карточек. */
export function bindCards(root, getProducts_, { onChange } = {}) {
  const doneTimers = new Map();
  root.addEventListener('click', e => {
    const addBtn = e.target.closest('[data-add]');
    if (addBtn) {
      const p = getProducts_().find(x => x.id === addBtn.dataset.add);
      const v = p && minVariant(p);
      if (!v) return;
      cart.add(p.id, v.vol, 1);
      toast({ img: imgOf(p), title: 'Добавлено в корзину', text: `${p.brand} — ${p.name}, ${v.vol} мл`, action: { label: 'Корзина', href: '/cart' } });
      const card = addBtn.closest('.card');
      card?.querySelectorAll('[data-add]').forEach(b => markAdded(b));
      clearTimeout(doneTimers.get(p.id));
      doneTimers.set(p.id, setTimeout(() => card?.querySelectorAll('[data-add]').forEach(b => unmarkAdded(b)), 1800));
      return;
    }
    const favBtn = e.target.closest('[data-fav]');
    if (favBtn) {
      const id = favBtn.dataset.fav, p = getProducts_().find(x => x.id === id);
      const on = favs.toggle(id);
      favBtn.classList.toggle('on', on);
      favBtn.setAttribute('aria-pressed', on);
      favBtn.setAttribute('aria-label', on ? 'Убрать из избранного' : 'В избранное');
      if (on && p) toast({ kind: 'ok', title: 'Добавлено в избранное', text: p.name, action: { label: 'Открыть', href: '/catalog?fav=1' } });
      onChange?.();
    }
  });
}
function markAdded(b) {
  if (b.classList.contains('c-add')) { b.classList.add('done'); b.innerHTML = svg('check', { sw: 1.8 }); }
  else { b.className = 'btn sm btn-add-d'; b.innerHTML = `${svg('check', { cls: 'ck', sw: 1.6 })}<span>Добавлено</span>`; }
}
function unmarkAdded(b) {
  if (b.classList.contains('c-add')) { b.classList.remove('done'); b.innerHTML = svg('plus'); }
  else { b.className = 'btn-ghost sm btn-add-d'; b.innerHTML = '<span>В корзину</span>'; }
}

// ---------- шапка, меню ----------
export function initChrome() {
  // liquid glass: световое пятно следует за курсором
  document.addEventListener('pointermove', e => {
    const el = e.target.closest?.('.hdr, .toast, .cartbar, .panel, .chip, .btn-ghost');
    if (!el) return;
    const b = el.getBoundingClientRect();
    el.style.setProperty('--mx', (e.clientX - b.left) + 'px');
    el.style.setProperty('--my', (e.clientY - b.top) + 'px');
  }, { passive: true });

  const badge = $('#cart-badge'), link = $('#cart-link');
  let prev = cart.count();
  const paint = () => {
    const n = cart.count();
    if (badge) {
      badge.hidden = n === 0;
      badge.textContent = n;
      if (n > prev) { badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump'); }
    }
    link?.setAttribute('aria-label', n ? `Корзина, товаров: ${n}` : 'Корзина');
    prev = n;
  };
  paint();
  cart.subscribe(paint);

  const hdr = $('#site-header');
  if (hdr && document.body.classList.contains('pg-home')) {
    const onScroll = () => hdr.classList.toggle('solid', (window.scrollY || 0) > 40);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  const menu = $('#mobile-menu'), openBtn = $('#menu-open');
  if (menu && openBtn) {
    const close = () => { menu.hidden = true; document.body.classList.remove('lock'); openBtn.focus(); };
    openBtn.addEventListener('click', () => { menu.hidden = false; document.body.classList.add('lock'); $('#menu-close').focus(); });
    $('#menu-close').addEventListener('click', close);
    menu.addEventListener('click', e => { if (e.target.closest('a')) { menu.hidden = true; document.body.classList.remove('lock'); } });
    addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) close(); });
    matchMedia('(min-width: 901px)').addEventListener('change', e => { if (e.matches && !menu.hidden) { menu.hidden = true; document.body.classList.remove('lock'); } });
  }
}

export function fatal(root, title = 'Не удалось загрузить данные', text = 'Проверьте соединение и обновите страницу.') {
  root.innerHTML = `<div class="panel" style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:18px;padding:80px 32px">
<div style="width:64px;height:64px;border-radius:50%;border:1px solid rgba(229,209,161,.26);display:flex;align-items:center;justify-content:center;color:#E5D1A1">${svg('alert', { sw: 1.3, size: 26 })}</div>
<h2 class="display d3">${esc(title)}</h2><p class="body" style="max-width:380px;color:#99958D">${esc(text)}</p>
<button class="btn sm" type="button" onclick="location.reload()">Обновить</button></div>`;
}
