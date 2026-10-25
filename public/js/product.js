import { $, $$, esc, rub, oldPriceHTML, initChrome, getProducts, cart, favs, toast, svg, fatal, site, waLink, imgOf, metaOf, findVariant, availableVariants, inStock, minVariant, MAX_QTY, volLabel } from './core.js';

initChrome();

const root = $('#product-root');
const id = decodeURIComponent(location.pathname.split('/').pop() || '');

const state = { vol: null, qty: 1, img: 0, justAdded: false };
let p, hint = {};
let addTimer;

const chipLink = (href, icon, text) => `<a href="${esc(href)}" class="chip" rel="noopener" target="_blank">${svg(icon, { sw: 1.6 })}${text}</a>`;

function related(products) {
  return products.filter(x => x.id !== p.id)
    .map(x => ({ x, score: x.cats.filter(c => p.cats.includes(c)).length * 10 + (x.family === p.family ? 5 : 0) - x.popularity / 100 }))
    .sort((a, b) => b.score - a.score).slice(0, 4).map(r => r.x);
}

function relatedCard(x) {
  const min = minVariant(x), href = `/product/${encodeURIComponent(x.id)}`;
  return `<article class="card">
<a href="${href}" class="c-img" aria-label="${esc(x.brand + ' ' + x.name)}"><img src="${esc(imgOf(x))}" alt="Флакон ${esc(x.brand + ' ' + x.name)}" loading="lazy"></a>
<div class="c-body"><div class="c-brand">${esc(x.brand)}</div><a href="${href}" class="c-name">${esc(x.name)}</a><div class="c-meta">${esc(metaOf(x))}</div>
<div class="c-row"><div style="display: flex; align-items: baseline; gap: 8px"><span class="price">${min ? 'от ' + rub(min.price) : 'нет в наличии'}</span>${oldPriceHTML(min)}<span class="small">${min ? volLabel(x, min.vol) : ''}</span></div><a href="${href}" class="btn-ghost sm">Подробнее</a></div></div></article>`;
}

function build(products) {
  const oos = !inStock(p);
  const dots = (n, v) => [1, 2, 3, 4, 5].map(i => `<i class="${i <= v ? 'f' : ''}"></i>`).join('');
  const panels = [];
  if (p.seasons) panels.push(`<div class="panel" style="padding: 28px; display: flex; flex-direction: column; gap: 18px"><span class="eyebrow muted">Идеально для сезона</span>${Object.entries(p.seasons).map(([n, v]) => `<div style="display: flex; align-items: center; justify-content: space-between; gap: 16px"><span style="font: 500 14px/1 Manrope, sans-serif; color: #DCD7CD">${esc(n)}</span><span style="display: flex; align-items: center; gap: 12px"><span class="dots" aria-hidden="true">${dots(5, v)}</span><span class="small num" style="width: 26px; text-align: right">${v}/5</span></span></div>`).join('')}</div>`);
  if (p.longevity || p.audience) panels.push(`<div class="panel" style="padding: 28px; display: flex; flex-direction: column; gap: 14px">${p.longevity ? `<span class="eyebrow muted">Стойкость</span><b style="font: 500 44px/1 'Cormorant Garamond', serif; color: #E5D1A1">${esc(p.longevity)}</b><span class="small">Зависит от кожи, погоды и количества нанесений</span>` : ''}${p.longevity && p.audience ? '<hr class="hair" style="margin-top: 8px">' : ''}${p.audience ? `<span class="eyebrow muted" style="margin-top: 6px">Для кого</span><p class="body" style="font-size: 14px">${esc(p.audience)}</p>` : ''}</div>`);
  panels.push(`<div class="panel" style="padding: 28px; display: flex; flex-direction: column; gap: 14px"><span class="eyebrow muted">О бренде</span><b style="font: 500 34px/1 'Cormorant Garamond', serif; letter-spacing: .14em; text-transform: uppercase">${esc(p.brand)}</b>${p.brandInfo ? `<p class="body" style="font-size: 14px">${esc(p.brandInfo)}</p>` : ''}<a href="/catalog?brand=${encodeURIComponent(p.brand)}" class="lnk" style="margin-top: auto">Все ароматы бренда ${svg('arrow')}</a></div>`);

  const notes = p.notes ? `<section class="section">
<div class="sec-head"><div style="display: flex; flex-direction: column; gap: 16px"><div class="eyebrow">Композиция</div><h2 class="display d2">Пирамида аромата</h2></div></div>
<div class="notes3 notes-d" style="border-top: 1px solid rgba(229,209,161,.14); border-bottom: 1px solid rgba(229,209,161,.14)">
<div style="display: flex; flex-direction: column; gap: 12px"><span class="eyebrow muted">Верхние ноты</span><b style="font: 500 30px/1.15 'Cormorant Garamond', serif">${esc(p.notes.top)}</b><span class="small">Первое впечатление — первые 15–30 минут</span></div>
<div style="display: flex; flex-direction: column; gap: 12px"><span class="eyebrow muted">Средние ноты</span><b style="font: 500 30px/1.15 'Cormorant Garamond', serif">${esc(p.notes.heart)}</b><span class="small">Сердце аромата — раскрывается за 2–4 часа</span></div>
<div style="display: flex; flex-direction: column; gap: 12px"><span class="eyebrow muted">Базовые ноты</span><b style="font: 500 30px/1.15 'Cormorant Garamond', serif">${esc(p.notes.base)}</b><span class="small">Шлейф, который остаётся на коже</span></div>
</div></section>` : '';

  const ask = waLink(`Здравствуйте! Подскажите, когда будет в наличии: ${p.brand} ${p.name}`);
  root.innerHTML = `
<nav class="crumbs" aria-label="Хлебные крошки"><a href="/">Главная</a><i></i><a href="/catalog">Каталог</a><i></i><a href="/catalog?brand=${encodeURIComponent(p.brand)}">${esc(p.brand)}</a><i></i><span style="color: #CFCAC0">${esc(p.name)}</span></nav>
<div class="pd" style="margin-top: 32px">
<div class="gal">
<div class="thumbs" id="thumbs"></div>
<div class="gal-main" style="position: relative; aspect-ratio: 4/5; border-radius: 16px; overflow: hidden; border: 1px solid rgba(245,241,232,.08); background: radial-gradient(120% 80% at 50% 30%, #22201C, #0B0B0B)">
<img id="main-img" class="fade-img" src="" alt="" style="width: 100%; height: 100%; object-fit: cover">
${oos ? '<span class="c-tag" style="top: 20px; left: 20px">Нет в наличии</span>' : p.tag ? `<span class="c-tag" style="top: 20px; left: 20px">${esc(p.tag)}</span>` : ''}
<div class="dots-m" id="dots-m"></div>
</div>
</div>
<div class="pd-info" style="display: flex; flex-direction: column; gap: 28px; padding-top: 8px">
<div style="display: flex; flex-direction: column; gap: 14px">
<a href="/catalog?brand=${encodeURIComponent(p.brand)}" class="eyebrow">${esc(p.brand)}</a>
<h1 class="display pd-title" style="font-size: clamp(44px, 4vw, 60px)">${esc(p.name)}</h1>
<div class="small" style="font-size: 14px">${esc([p.type, p.gender, p.familyNote].filter(Boolean).join(' · '))}</div>
</div>
<p class="body">${esc(p.description)}</p>
<hr class="hair">
<div style="display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap"><span class="num pd-price" id="price" style="font: 600 34px/1 Manrope, sans-serif; color: #E5D1A1"></span><s class="old old-lg" id="price-old" hidden></s><span class="small" id="price-note" style="font-size: 14px"></span><span class="sale-pill" id="sale-pill" hidden></span></div>
<div style="display: flex; flex-direction: column; gap: 12px">
<div style="display: flex; justify-content: space-between; align-items: baseline"><span class="label" id="vol-label">${p.variants.some(v => v.vol > 0) ? 'Объём' : 'Формат'}</span><span class="small" id="vol-hint"></span></div>
<div class="vgrid" id="vols" role="radiogroup" aria-labelledby="vol-label"></div>
<div id="full-wrap" role="radiogroup" aria-label="Целый флакон"></div>
</div>
${oos ? `<div class="panel" style="padding: 20px; display: flex; flex-direction: column; gap: 12px"><b style="font: 600 15px/1.3 Manrope, sans-serif">Сейчас нет в наличии</b><span class="small">Напишите менеджеру — сообщим, когда аромат появится.</span><div><a href="${esc(ask)}" class="btn-ghost sm" target="_blank" rel="noopener">Спросить менеджера о поступлении</a></div></div>` : `
<div class="pd-buy" style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap">
<div class="stepper" role="group" aria-label="Количество">
<button type="button" id="dec" aria-label="Уменьшить">${svg('minus', { sw: 1.6 })}</button><output id="qty" aria-live="polite">1</output><button type="button" id="inc" aria-label="Увеличить">${svg('plus', { sw: 1.6 })}</button>
</div>
<button type="button" class="btn" id="add" style="flex: 1 1 220px"></button>
<button type="button" class="ibtn fav-btn" id="fav" aria-label="В избранное" style="width: 52px; height: 52px; border: 1px solid rgba(229,209,161,.26)">${svg('heart')}</button>
</div>`}
<div class="panel" style="padding: 24px; display: flex; flex-direction: column; gap: 16px">
<div class="eyebrow">Как оформить заказ</div>
<div style="display: flex; flex-direction: column; gap: 12px">
<div class="note-strip"><span style="font: 500 18px/1 'Cormorant Garamond', serif; color: #C6A15B; width: 18px">1</span><span>Добавьте аромат в корзину и оставьте заявку — без регистрации.</span></div>
<div class="note-strip"><span style="font: 500 18px/1 'Cormorant Garamond', serif; color: #C6A15B; width: 18px">2</span><span>Менеджер свяжется с вами удобным способом и подтвердит заказ.</span></div>
<div class="note-strip"><span style="font: 500 18px/1 'Cormorant Garamond', serif; color: #C6A15B; width: 18px">3</span><span>Оплату и доставку согласуете напрямую с менеджером.</span></div>
</div>
<hr class="hair">
<div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap"><span class="small">Нужна помощь с выбором?</span>
<div style="display: flex; gap: 8px">${site.telegramUrl ? chipLink(site.telegramUrl, 'telegram', 'Telegram') : ''}${site.whatsapp ? chipLink(waLink(`Здравствуйте! Хочу уточнить по аромату ${p.brand} ${p.name}`), 'whatsapp', 'WhatsApp') : ''}</div></div>
</div>
</div>
</div>
${notes}
<section style="padding-top: 56px"><div class="char" style="--n: ${panels.length}">${panels.join('')}</div></section>
<section class="section" style="padding-bottom: 120px">
<div class="sec-head"><div style="display: flex; flex-direction: column; gap: 16px"><div class="eyebrow">Похожее настроение</div><h2 class="display d2">Вам также понравится</h2></div><a href="/catalog" class="lnk">Весь каталог ${svg('arrow')}</a></div>
<div class="pgrid" style="grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr))">${related(products).map(relatedCard).join('')}</div>
</section>`;

  // мобильная нижняя панель
  const bar = $('#buybar');
  if (!oos) {
    bar.hidden = false;
    bar.innerHTML = `<div style="display: flex; flex-direction: column; gap: 3px; min-width: 96px"><span class="num" id="bar-price" style="font: 600 18px/1 Manrope, sans-serif; color: #E5D1A1"></span><span class="small" id="bar-note" style="font-size: 11.5px"></span></div><button type="button" class="btn" id="bar-add" style="flex: 1; padding: 0 16px"></button>`;
  } else bar.hidden = true;
}

function paint() {
  const v = findVariant(p, state.vol), oos = !inStock(p);
  const main = $('#main-img');
  const gallery = [{ src: imgOf(p), alt: `Флакон ${p.brand} ${p.name}` }];
  const f = state.vol ? (site.formats || []).find(x => x.vol === state.vol) : null;
  if (f) gallery.push({ src: `${f.image}`, alt: `Формат ${f.vol} мл` });
  if (state.img >= gallery.length) state.img = 0;
  if (main.getAttribute('src') !== gallery[state.img].src) {
    main.classList.remove('fade-img'); void main.offsetWidth; main.classList.add('fade-img');
    main.src = gallery[state.img].src;
  }
  main.alt = gallery[state.img].alt;
  $('#thumbs').innerHTML = gallery.map((g, i) => `<button type="button" class="thumb ${i === state.img ? 'on' : ''}" data-img="${i}" aria-label="${esc(g.alt)}" aria-pressed="${i === state.img}"><img src="${esc(g.src)}" alt=""></button>`).join('');
  $('#dots-m').innerHTML = gallery.map((g, i) => `<button type="button" data-img="${i}" aria-label="${esc(g.alt)}"><span class="pdot ${i === state.img ? 'on' : ''}"></span></button>`).join('');

  const active = document.activeElement?.dataset?.vol;
  $('#vols').innerHTML = p.variants.filter(x => x.vol > 0).map(x => {
    const on = x.vol === state.vol, na = !x.available;
    return `<button type="button" class="vol ${na ? 'na' : on ? 'on' : ''}" data-vol="${x.vol}" ${na ? 'disabled' : ''} role="radio" aria-checked="${on && !na}" aria-label="${x.vol} мл, ${na ? 'нет в наличии' : rub(x.price)}"><b>${x.vol} мл</b><span>${na ? 'нет' : rub(x.price)}</span>${!na && x.oldPrice ? `<s class="old old-sm">${rub(x.oldPrice)}</s>` : ''}</button>`;
  }).join('');
  const fullV = findVariant(p, 0);
  $('#full-wrap').innerHTML = fullV ? `<button type="button" class="vol full ${!fullV.available ? 'na' : state.vol === 0 ? 'on' : ''}" data-vol="0" ${!fullV.available ? 'disabled' : ''} role="radio" aria-checked="${state.vol === 0 && fullV.available}"><span class="full-t"><b>Целый флакон ${p.bottleMl} мл</b><em>без разлива, в упаковке</em></span><span class="full-p">${!fullV.available ? 'нет' : rub(fullV.price)}${fullV.available && fullV.oldPrice ? `<s class="old old-sm">${rub(fullV.oldPrice)}</s>` : ''}</span></button>` : '';
  if (active) $(`#vols [data-vol="${active}"], #full-wrap [data-vol="${active}"]`)?.focus();

  if (oos) {
    $('#price').textContent = 'Нет в наличии'; $('#price').style.fontSize = '28px';
    $('#price-note').textContent = '';
    return;
  }
  $('#vol-hint').textContent = state.vol === 0 ? 'Оригинальный флакон без разлива' : (hint[state.vol] || '');
  const total = v.price * state.qty;
  $('#price').textContent = rub(total);
  const oldEl = $('#price-old'); oldEl.hidden = !v.oldPrice; oldEl.textContent = v.oldPrice ? rub(v.oldPrice * state.qty) : '';
  const pill = $('#sale-pill'); pill.hidden = !p.sale; pill.textContent = p.sale ? `−${p.sale.percent}%${p.sale.until ? ' до ' + p.sale.until.split('-').reverse().join('.') : ''}` : '';
  const note = (state.vol === 0 ? `за ${volLabel(p, 0).toLowerCase()}` : `за ${state.vol} мл`) + (state.qty > 1 ? ` × ${state.qty}` : '');
  $('#price-note').textContent = note;
  $('#qty').textContent = state.qty;
  $('#dec').disabled = state.qty <= 1;
  $('#inc').disabled = state.qty >= MAX_QTY;
  const label = state.justAdded ? 'Добавлено в корзину' : 'Добавить в корзину';
  const inner = (state.justAdded ? svg('check', { sw: 1.6 }) : '') + `<span>${label}</span>`;
  $('#add').innerHTML = inner;
  $('#bar-add').innerHTML = `<span>${state.justAdded ? 'Добавлено' : 'Добавить в корзину'}</span>`;
  $('#bar-price').textContent = rub(total);
  $('#bar-note').textContent = `${volLabel(p, state.vol)} × ${state.qty}`;
  const fav = favs.has(p.id), fb = $('#fav');
  fb.classList.toggle('on', fav); fb.setAttribute('aria-pressed', fav);
}

function add() {
  const v = findVariant(p, state.vol);
  if (!v?.available) return;
  cart.add(p.id, state.vol, state.qty);
  state.justAdded = true;
  toast({ img: imgOf(p), title: 'Добавлено в корзину', text: `${p.name}, ${volLabel(p, state.vol)} × ${state.qty}`, action: { label: 'Корзина', href: '/cart' }, above: matchMedia('(max-width: 600px)').matches });
  clearTimeout(addTimer);
  addTimer = setTimeout(() => { state.justAdded = false; paint(); }, 2600);
  paint();
}

try {
  const products = await getProducts();
  cart.reconcile(products);
  p = products.find(x => x.id === id);
  if (!p) { location.replace('/404'); throw new Error('not found'); }
  hint = Object.fromEntries((site.formats || []).map(f => [f.vol, f.hint]));
  const want = Number(new URLSearchParams(location.search).get('vol'));
  const first = availableVariants(p).find(v => v.vol > 0) || availableVariants(p)[0];
  state.vol = availableVariants(p).some(v => v.vol === want) ? want : (first ? first.vol : p.variants[0].vol);
  build(products);
  paint();

  root.addEventListener('click', e => {
    const vol = e.target.closest('[data-vol]');
    if (vol && !vol.disabled) { state.vol = Number(vol.dataset.vol); state.img = state.vol ? 1 : 0; paint(); return; }
    const img = e.target.closest('[data-img]');
    if (img) { state.img = Number(img.dataset.img); paint(); return; }
    if (e.target.closest('#dec')) { state.qty = Math.max(1, state.qty - 1); paint(); return; }
    if (e.target.closest('#inc')) { state.qty = Math.min(MAX_QTY, state.qty + 1); paint(); return; }
    if (e.target.closest('#add')) { add(); return; }
    if (e.target.closest('#fav')) {
      const on = favs.toggle(p.id);
      if (on) toast({ title: 'Добавлено в избранное', text: p.name, action: { label: 'Открыть', href: '/catalog?fav=1' } });
      paint();
    }
  });
  $('#buybar').addEventListener('click', e => { if (e.target.closest('#bar-add')) add(); });
} catch (e) {
  if (e.message !== 'not found') { console.error(e); fatal(root); }
}
