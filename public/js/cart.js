import { $, esc, rub, plural, initChrome, getProducts, cart, priceCart, toast, dismissToast, svg, fatal, imgOf, MAX_QTY } from './core.js';

initChrome();

const body = $('#cart-body'), bar = $('#cart-bar'), countEl = $('#cart-count');
let products = [], dropped = [], first = true, undoTimer;

function rowHTML(it) {
  const p = it.product, key = `${p.id}:${it.vol}`, href = `/product/${encodeURIComponent(p.id)}?vol=${it.vol}`;
  return `<div class="row ${first ? 'slide-in' : ''}" data-row="${esc(key)}">
<a href="${href}"><img src="${esc(imgOf(p))}" alt="${esc(p.brand + ' ' + p.name)}" width="104" height="130"></a>
<div style="display: flex; flex-direction: column; gap: 6px; min-width: 0">
<span class="c-brand">${esc(p.brand)}</span>
<a href="${href}" style="font: 500 24px/1.1 'Cormorant Garamond', serif; color: #F5F1E8">${esc(p.name)}</a>
<span class="small">Объём: <span style="color: #DCD7CD">${it.vol} мл</span> · ${rub(it.unit)} / шт.</span>
</div>
<div class="r-qty"><div class="stepper sm" role="group" aria-label="Количество ${esc(p.name)}, ${it.vol} мл">
<button type="button" data-act="dec" data-key="${esc(key)}" ${it.qty <= 1 ? 'disabled' : ''} aria-label="Уменьшить">${svg('minus', { sw: 1.6 })}</button>
<output>${it.qty}</output>
<button type="button" data-act="inc" data-key="${esc(key)}" ${it.qty >= MAX_QTY ? 'disabled' : ''} aria-label="Увеличить">${svg('plus', { sw: 1.6 })}</button></div></div>
<span class="price r-sum" style="text-align: right; font-size: 18px">${rub(it.sum)}</span>
<button type="button" class="ibtn" data-act="rm" data-key="${esc(key)}" aria-label="Удалить ${esc(p.name)} из корзины">${svg('trash')}</button>
</div>`;
}

function render() {
  const { items, count, total } = priceCart(products);
  const focusKey = document.activeElement?.dataset?.act && `${document.activeElement.dataset.act}|${document.activeElement.dataset.key}`;
  countEl.hidden = !items.length;
  countEl.textContent = `${count} ${plural(count, ['товар', 'товара', 'товаров'])}`;

  if (!items.length) {
    bar.hidden = true;
    document.body.classList.remove('has-bar');
    body.innerHTML = `${droppedHTML()}<div class="panel rise" style="display: flex; flex-direction: column; align-items: center; text-align: center; gap: 20px; padding: 96px 32px">
<div style="width: 72px; height: 72px; border-radius: 50%; border: 1px solid rgba(229,209,161,.26); display: flex; align-items: center; justify-content: center; color: #E5D1A1">${svg('bag', { sw: 1.2, size: 28 })}</div>
<h2 class="display d2">Корзина пока пуста</h2>
<p class="body" style="max-width: 400px; color: #99958D">Загляните в каталог — начать знакомство с ароматом можно с пробника 3 мл.</p>
<a href="/catalog" class="btn">Перейти в каталог</a></div>`;
    return;
  }

  body.innerHTML = `${droppedHTML()}<div class="cl">
<div class="cl-main">
<div style="border-top: 1px solid rgba(245,241,232,.08)">${items.map(rowHTML).join('')}</div>
<a href="/catalog" class="lnk" style="margin-top: 20px">Продолжить покупки ${svg('arrow')}</a>
</div>
<aside class="cl-side panel" style="padding: 32px; display: flex; flex-direction: column; gap: 20px" aria-label="Итог заказа">
<h2 class="display d3" style="font-size: 30px">Ваш заказ</h2>
<div style="display: flex; flex-direction: column; gap: 12px">
<div style="display: flex; justify-content: space-between"><span class="small" style="font-size: 14px">Товары, ${count} шт.</span><span class="num" style="font: 500 14px/1 Manrope, sans-serif">${rub(total)}</span></div>
<div style="display: flex; justify-content: space-between; gap: 16px"><span class="small" style="font-size: 14px">Доставка</span><span class="small" style="font-size: 14px; text-align: right">рассчитает менеджер</span></div>
</div>
<hr class="hair m-hide">
<div class="m-hide" style="display: flex; justify-content: space-between; align-items: baseline"><span style="font: 600 15px/1 Manrope, sans-serif">Итого</span><span class="num" style="font: 600 30px/1 Manrope, sans-serif; color: #E5D1A1">${rub(total)}</span></div>
<a href="/checkout" class="btn block">Перейти к оформлению</a>
<div class="note-strip" style="align-items: flex-start">${svg('info', { cls: '' }).replace('<svg ', '<svg style="margin-top: 2px" ')}<span>Оплата на сайте не требуется. После заявки менеджер подтвердит наличие и согласует оплату и доставку.</span></div>
</aside></div><div class="bar-spacer"></div>`;

  bar.hidden = false;
  bar.innerHTML = `<div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px"><span style="font: 600 14px/1 Manrope, sans-serif">Итого</span><span class="num" style="font: 600 22px/1 Manrope, sans-serif; color: #E5D1A1">${rub(total)}</span></div><a href="/checkout" class="btn block">Перейти к оформлению</a>`;
  document.body.classList.add('has-bar');

  if (focusKey) { const [a, k] = focusKey.split('|'); [...body.querySelectorAll('[data-act]')].find(b => b.dataset.act === a && b.dataset.key === k && !b.disabled)?.focus(); }
  first = false;
}

const droppedHTML = () => dropped.length
  ? `<div class="alert-box" role="status" style="margin-bottom: 24px">${svg('alert', { sw: 1.6, size: 18 })}<span>Некоторых позиций больше нет в наличии — мы убрали их из корзины.</span></div>` : '';

body.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const [id, vol] = b.dataset.key.split(':'), v = Number(vol);
  const line = cart.lines().find(l => l.id === id && l.vol === v);
  if (!line) return;
  if (b.dataset.act === 'inc') cart.setQty(id, v, line.qty + 1);
  else if (b.dataset.act === 'dec') cart.setQty(id, v, line.qty - 1);
  else if (b.dataset.act === 'rm') {
    const removed = cart.remove(id, v), p = products.find(x => x.id === id);
    toast({ kind: 'neutral', title: 'Товар удалён', text: `${p.brand} — ${p.name}, ${v} мл`, ttl: 4500, above: matchMedia('(max-width: 600px)').matches,
      action: { label: 'Вернуть', onClick: () => cart.restore(removed) } });
  }
});

try {
  products = await getProducts();
  dropped = cart.reconcile(products);
  render();
  cart.subscribe(render);
} catch {
  fatal(body, 'Не удалось загрузить корзину', 'Мы не можем получить актуальные цены. Корзина сохранена — обновите страницу.');
}
