import { $, esc, rub, plural, initChrome, getProducts, bindCards, cardHTML, cart, priceCart, site, fatal } from './core.js';

initChrome();

const brandStyle = `font: 500 28px/1 'Cormorant Garamond', serif; letter-spacing: .18em; color: #BDB8AE; text-transform: uppercase`;

function renderStatic(products) {
  // форматы
  const formats = site.formats || [];
  $('#formats').innerHTML = formats.map(f => `<div style="display: flex; flex-direction: column; gap: 14px"><div style="aspect-ratio: 4/5; border-radius: 10px; overflow: hidden; border: 1px solid rgba(245,241,232,.08)"><img src="${esc(f.image)}" alt="${esc(f.alt)}" loading="lazy" style="width: 100%; height: 100%; object-fit: cover"></div><div style="display: flex; justify-content: space-between; align-items: baseline"><b style="font: 500 26px/1 'Cormorant Garamond', serif">${f.vol} мл</b><span class="small">${esc(f.caption)}</span></div></div>`).join('');
  $('#formats-m').innerHTML = formats.map(f => `<div style="width: 128px; display: flex; flex-direction: column; gap: 10px"><div style="height: 160px; border-radius: 10px; overflow: hidden; border: 1px solid rgba(245,241,232,.08)"><img src="${esc(f.image)}" alt="${esc(f.alt)}" loading="lazy" style="width: 100%; height: 100%; object-fit: cover"></div><b style="font: 500 22px/1 'Cormorant Garamond', serif">${f.vol} мл</b><span class="small" style="font-size: 12px">${esc(f.caption)}</span></div>`).join('');
  // бренды — из того же каталога
  const brands = [...new Set(products.map(p => p.brand))];
  $('#brands').innerHTML = brands.map(b => `<a href="/catalog?brand=${encodeURIComponent(b)}" style="${brandStyle}">${esc(b)}</a>`).join('');
}

function renderCartBar(products) {
  const bar = $('#cartbar');
  const { items, count, total } = priceCart(products);
  if (!items.length) { bar.hidden = true; document.body.classList.remove('has-cartbar'); return; }
  bar.hidden = false;
  bar.innerHTML = `<div style="display: flex; flex-direction: column; gap: 3px"><span style="font: 600 14px/1 Manrope, sans-serif">Корзина · ${count} ${plural(count, ['товар', 'товара', 'товаров'])}</span><span class="num" style="font: 500 12.5px/1 Manrope, sans-serif; color: #E5D1A1">${rub(total)}</span></div><a href="/cart" class="btn sm" style="min-height: 44px">Оформить<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>`;
  document.body.classList.add('has-cartbar');
}

try {
  const products = await getProducts();
  cart.reconcile(products);
  const popular = [...products].sort((a, b) => a.popularity - b.popularity).slice(0, 4);
  const grid = $('#popular');
  grid.innerHTML = popular.map(p => cardHTML(p)).join('');
  bindCards(grid, () => products);
  renderStatic(products);
  renderCartBar(products);
  cart.subscribe(() => renderCartBar(products));
} catch {
  fatal($('#popular'), 'Каталог временно недоступен', 'Не удалось загрузить список ароматов. Обновите страницу.');
}
