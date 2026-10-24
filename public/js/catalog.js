import { $, $$, esc, plural, initChrome, getProducts, bindCards, cardHTML, cart, favs, svg, fatal, inStock } from './core.js';

initChrome();

const CATS = ['Мужская', 'Женская', 'Для всех', 'Нишевые'];
const VOLS = [3, 5, 6, 10, 30, 50];
const PRICES = ['до 700 ₽', '700–1 000 ₽', 'от 1 000 ₽'];
const KEYS = ['cats', 'brands', 'vols', 'prices', 'fams'];
const PARAM = { cats: 'cat', brands: 'brand', vols: 'vol', prices: 'price', fams: 'fam' };

const priceOk = (p, r) => {
  const base = Math.min(...p.variants.map(v => v.price));
  return r === 'до 700 ₽' ? base < 700 : r === '700–1 000 ₽' ? base >= 700 && base <= 1000 : base > 1000;
};
const label = (k, v) => (k === 'vols' ? v + ' мл' : v);

const state = { q: '', cats: [], brands: [], vols: [], prices: [], fams: [], sort: 'pop', fav: false };
let products = [];

function readUrl() {
  const u = new URLSearchParams(location.search);
  state.q = u.get('q') || '';
  state.sort = ['pop', 'asc', 'desc'].includes(u.get('sort')) ? u.get('sort') : 'pop';
  state.fav = u.get('fav') === '1';
  for (const k of KEYS) state[k] = u.getAll(PARAM[k]).map(v => (k === 'vols' ? Number(v) : v)).filter(v => v !== '' && !Number.isNaN(v));
}
function writeUrl() {
  const u = new URLSearchParams();
  if (state.q) u.set('q', state.q);
  if (state.sort !== 'pop') u.set('sort', state.sort);
  if (state.fav) u.set('fav', '1');
  for (const k of KEYS) state[k].forEach(v => u.append(PARAM[k], v));
  const qs = u.toString();
  history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
}

function filtered() {
  const tokens = state.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const fav = state.fav ? new Set(favs.all()) : null;
  const list = products.filter(p => {
    const hay = (p.brand + ' ' + p.name).toLowerCase();
    return tokens.every(t => hay.includes(t))
      && (!fav || fav.has(p.id))
      && (!state.cats.length || state.cats.some(c => p.cats.includes(c)))
      && (!state.brands.length || state.brands.includes(p.brand))
      && (!state.vols.length || state.vols.some(v => p.variants.some(x => x.vol === v && x.available)))
      && (!state.prices.length || state.prices.some(r => priceOk(p, r)))
      && (!state.fams.length || state.fams.includes(p.family));
  });
  const base = p => Math.min(...p.variants.map(v => v.price));
  if (state.sort === 'asc') list.sort((a, b) => base(a) - base(b));
  else if (state.sort === 'desc') list.sort((a, b) => base(b) - base(a));
  else list.sort((a, b) => a.popularity - b.popularity);
  return list;
}

const options = () => ({
  cats: CATS,
  brands: [...new Set(products.map(p => p.brand))].sort((a, b) => a.localeCompare(b)),
  vols: VOLS,
  prices: PRICES,
  fams: [...new Set(products.map(p => p.family))].sort((a, b) => a.localeCompare(b, 'ru'))
});
const countOf = (k, v) => k === 'cats' ? products.filter(p => p.cats.includes(v)).length : k === 'brands' ? products.filter(p => p.brand === v).length : k === 'fams' ? products.filter(p => p.family === v).length : null;

// ---------- фильтры ----------
function checkList(k, o) {
  return o[k].map(v => {
    const on = state[k].includes(v);
    return `<button type="button" class="check ${on ? 'on' : ''}" data-f="${k}" data-v="${esc(v)}" aria-pressed="${on}"><span class="box">${svg('check', { sw: 2.4 })}</span>${esc(label(k, v))}<span class="cnt">${countOf(k, v)}</span></button>`;
  }).join('');
}
function chipList(k, o) {
  return o[k].map(v => {
    const on = state[k].includes(v);
    return `<button type="button" class="chip ${on ? 'on' : ''}" data-f="${k}" data-v="${esc(v)}" aria-pressed="${on}">${esc(label(k, v))}</button>`;
  }).join('');
}
function renderDesktopFilters(o) {
  $('#filters-desktop').innerHTML = `
<div class="fsec"><h3>Категория</h3>${checkList('cats', o)}</div>
<div class="fsec" id="brands"><h3>Бренд</h3>${checkList('brands', o)}</div>
<div class="fsec"><h3>Объём</h3><div style="display: flex; flex-wrap: wrap; gap: 8px">${chipList('vols', o)}</div></div>
<div class="fsec"><h3>Цена</h3><div style="display: flex; flex-wrap: wrap; gap: 8px">${chipList('prices', o)}</div></div>
<div class="fsec" style="border-bottom: 1px solid rgba(229,209,161,.14)"><h3>Тип аромата</h3>${checkList('fams', o)}</div>`;
}
function renderPanelFilters(o) {
  const body = $('#fpanel-body'), top = body.scrollTop;
  body.innerHTML = `
<div class="fsec"><h3>Категория</h3><div class="fp-chips">${chipList('cats', o)}</div></div>
<div class="fsec"><h3>Бренд</h3><div class="fp-chips">${chipList('brands', o)}</div></div>
<div class="fsec"><h3>Объём</h3><div class="fp-chips vols">${chipList('vols', o)}</div></div>
<div class="fsec"><h3>Цена за минимальный объём</h3><div class="fp-chips">${chipList('prices', o)}</div></div>
<div class="fsec"><h3>Тип аромата</h3><div class="fp-chips">${chipList('fams', o)}</div></div>`;
  body.scrollTop = top;
}

function activeFilters() {
  const a = [];
  if (state.q.trim()) a.push({ label: `«${state.q.trim()}»`, remove: () => { state.q = ''; $('#q').value = ''; } });
  if (state.fav) a.push({ label: 'Избранное', remove: () => { state.fav = false; } });
  for (const k of KEYS) state[k].forEach(v => a.push({ label: label(k, v), remove: () => toggle(k, v) }));
  return a;
}
function toggle(k, v) {
  const i = state[k].indexOf(v);
  if (i >= 0) state[k].splice(i, 1); else state[k].push(v);
}
function reset() { state.q = ''; state.fav = false; for (const k of KEYS) state[k] = []; $('#q').value = ''; }

// ---------- вывод ----------
let activeList = [];
function render() {
  const list = filtered(), o = options(), act = activeFilters();
  activeList = act;
  const n = list.length;
  $('#count-label').textContent = `${n} ${plural(n, ['аромат', 'аромата', 'ароматов'])} · цены указаны за минимальный объём`;

  $('#active-row').innerHTML = act.length
    ? act.map((a, i) => `<button type="button" class="chip on" data-rm="${i}" aria-label="Убрать фильтр ${esc(a.label)}">${esc(a.label)}${svg('close', { sw: 1.8 })}</button>`).join('') + `<button type="button" class="lnk" data-reset style="font-size: 13px; margin-left: 8px">Сбросить всё</button>`
    : `<span class="small only-d">Фильтры не выбраны</span>`;
  const cnt = $('#filters-count');
  cnt.hidden = !act.length; cnt.textContent = act.length;

  $('#sort').value = state.sort;
  renderDesktopFilters(o);
  renderPanelFilters(o);
  $('#fpanel-apply').textContent = `Показать ${n}`;

  const res = $('#results');
  if (n) {
    res.innerHTML = `<div class="cgrid">${list.map(p => cardHTML(p)).join('')}</div>`;
  } else {
    const empty = !products.length;
    const favEmpty = state.fav && !favs.all().length && !state.q && !KEYS.some(k => state[k].length);
    const title = empty ? 'Каталог пока пуст' : favEmpty ? 'В избранном пока ничего' : 'Ничего не найдено';
    const text = empty ? 'Мы готовим новую коллекцию — загляните позже или спросите менеджера.'
      : favEmpty ? 'Нажмите на сердечко на карточке аромата, чтобы сохранить его здесь.'
      : (state.q.trim() ? `По запросу «${esc(state.q.trim())}» с выбранными фильтрами ароматов нет. Попробуйте изменить запрос или сбросить фильтры.` : 'С выбранными фильтрами ароматов нет. Попробуйте изменить условия или сбросить фильтры.');
    res.innerHTML = `<div class="panel" style="display: flex; flex-direction: column; align-items: center; text-align: center; gap: 18px; padding: 80px 32px">
<div style="width: 64px; height: 64px; border-radius: 50%; border: 1px solid rgba(229,209,161,.26); display: flex; align-items: center; justify-content: center; color: #E5D1A1">${svg('search', { sw: 1.3, size: 26 })}</div>
<h2 class="display d3">${title}</h2><p class="body" style="max-width: 380px; color: #99958D">${text}</p>
${empty ? '' : '<div style="display: flex; gap: 12px; flex-wrap: wrap; justify-content: center"><button type="button" class="btn sm" data-reset>Сбросить фильтры</button></div>'}</div>`;
  }
  writeUrl();
}

// ---------- события ----------
function onFilterClick(e) {
  const b = e.target.closest('[data-f]');
  if (b) { toggle(b.dataset.f, b.dataset.f === 'vols' ? Number(b.dataset.v) : b.dataset.v); render(); return; }
  const rm = e.target.closest('[data-rm]');
  if (rm) { activeList[Number(rm.dataset.rm)].remove(); render(); return; }
  if (e.target.closest('[data-reset]')) { reset(); render(); }
}
$('#filters-desktop').addEventListener('click', onFilterClick);
$('#fpanel-body').addEventListener('click', onFilterClick);
$('#active-row').addEventListener('click', onFilterClick);
$('#results').addEventListener('click', onFilterClick);
$('#sort').addEventListener('change', e => { state.sort = e.target.value; render(); });
let qTimer;
$('#q').addEventListener('input', e => { clearTimeout(qTimer); qTimer = setTimeout(() => { state.q = e.target.value; render(); }, 120); });

// панель фильтров (планшет — шторка слева, телефон — снизу)
const wrap = $('#fpanel-wrap');
const openPanel = () => { wrap.hidden = false; document.body.classList.add('lock'); $('#fpanel-close').focus(); };
const closePanel = () => { wrap.hidden = true; document.body.classList.remove('lock'); $('#filters-open').focus(); };
$('#filters-open').addEventListener('click', openPanel);
$('#fpanel-close').addEventListener('click', closePanel);
$('#fpanel-apply').addEventListener('click', closePanel);
$('#fpanel-backdrop').addEventListener('click', closePanel);
$('#fpanel-reset').addEventListener('click', () => { reset(); render(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !wrap.hidden) closePanel(); });
matchMedia('(min-width: 901px)').addEventListener('change', e => { if (e.matches && !wrap.hidden) { wrap.hidden = true; document.body.classList.remove('lock'); } });

try {
  products = await getProducts();
  cart.reconcile(products);
  readUrl();
  $('#q').value = state.q;
  render();
  bindCards($('#results'), () => products, { onChange: () => { if (state.fav) render(); } });
  const u = new URLSearchParams(location.search);
  if (u.get('focus') === 'search') $('#q').focus();
  if (location.hash === '#brands') {
    if (matchMedia('(max-width: 900px)').matches) openPanel();
    else $('#brands')?.scrollIntoView({ block: 'center' });
  }
} catch {
  fatal($('#results'), 'Каталог временно недоступен', 'Не удалось загрузить список ароматов. Проверьте соединение и обновите страницу.');
}
