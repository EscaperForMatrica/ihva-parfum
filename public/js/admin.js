// Админка IHVA PARFUM: товары (цены, наличие, фото, показ/скрытие) и заявки. Без зависимостей.
import { $, $$, esc, rub, svg, toast, plural } from './core.js';
import { cropImage } from './imgcrop.js';

const app = $('#app');
const CATS = ['Мужская', 'Женская', 'Для всех', 'Нишевые'];
const FAMILIES = ['Восточные', 'Древесные', 'Цветочные', 'Цитрусовые'];
const GENDERS = ['Мужской', 'Женский', 'Для всех'];
const VOLS = [3, 5, 6, 10, 30, 50];
const LADDER = { 3: 1, 5: 1.6, 6: 1.8, 10: 2.8, 30: 7.5, 50: 11.6 };
const PLACEHOLDER = '/images/placeholder.svg';

const st = { tab: 'products', products: [], orders: [], formats: [], groups: {}, q: '', editing: null };
const KINDS = { original: 'Оригиналы', oil: 'Масляные' };

async function api(path, { method = 'GET', body, raw } = {}) {
  const res = await fetch('/api/admin/' + path, {
    method, credentials: 'same-origin',
    headers: { 'x-admin': '1', ...(raw ? { 'content-type': raw.type } : body ? { 'content-type': 'application/json' } : {}) },
    body: raw ? raw.data : body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== 'login') { renderLogin(); throw new Error('unauthorized'); }
  if (!res.ok) throw Object.assign(new Error(data.message || 'Ошибка'), { data, status: res.status });
  return data;
}
const note = (title, text, kind = 'ok') => toast({ kind, title, text, ttl: 3000 });
const minPrice = p => { const v = p.variants.filter(x => x.available); return v.length ? Math.min(...v.map(x => x.price)) : null; };
const imgOf = p => p.image || PLACEHOLDER;
const volName = (p, vol) => (vol === 0 ? `Флакон ${p.bottleMl} мл` : `${vol} мл`);

/** Открывает окно авто-обрезки (кадр 4:5 вокруг флакона) и загружает результат. Возвращает путь вида /uploads/... */
async function uploadImage(file) {
  if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Нужна картинка JPG, PNG или WebP');
  const blob = await cropImage(file);
  if (!blob) throw new Error('cancel');
  return (await api('upload', { method: 'POST', raw: { type: 'image/jpeg', data: blob } })).path;
}

// ---------- вход ----------
function renderLogin(msg = '') {
  app.innerHTML = `<form class="login" id="login" novalidate>
<a class="logo" href="/"><b>IHVA</b><i>PARFUM</i></a>
<div style="text-align:center"><div class="eyebrow">Админ-панель</div><h1 class="display d3" style="margin-top:10px">Вход</h1></div>
<div class="field"><label class="label" for="pw">Пароль</label><input id="pw" class="input ${msg ? 'bad' : ''}" type="password" autocomplete="current-password" autofocus>${msg ? `<span class="err">${esc(msg)}</span>` : ''}</div>
<button class="btn block" type="submit">Войти</button></form>`;
  $('#login').addEventListener('submit', async e => {
    e.preventDefault();
    try { await api('login', { method: 'POST', body: { password: $('#pw').value } }); await boot(); }
    catch (err) { renderLogin(err.message === 'unauthorized' ? '' : err.message); }
  });
}

// ---------- каркас ----------
function shell(inner) {
  const fresh = st.orders.filter(o => o.status === 'new').length;
  app.innerHTML = `<div class="adm-top"><div class="adm-top-in">
<a class="logo" href="/admin"><b style="font-size:20px">IHVA</b><i style="font-size:7px">PARFUM</i></a>
<nav class="adm-tabs"><button class="adm-tab ${st.tab === 'products' ? 'on' : ''}" data-tab="products">Товары</button>
<button class="adm-tab ${st.tab === 'sales' ? 'on' : ''}" data-tab="sales">Скидки</button>
<button class="adm-tab ${st.tab === 'formats' ? 'on' : ''}" data-tab="formats">Форматы</button>
<button class="adm-tab ${st.tab === 'orders' ? 'on' : ''}" data-tab="orders">Заявки${fresh ? `<span class="n">${fresh}</span>` : ''}</button></nav>
<a class="small" href="/" target="_blank" rel="noopener">Открыть сайт ↗</a><button class="btn-ghost sm" id="logout">Выйти</button></div></div>
<div class="adm-wrap">${inner}</div>`;
  $$('[data-tab]').forEach(b => b.addEventListener('click', () => { st.tab = b.dataset.tab; render(); }));
  $('#logout').addEventListener('click', async () => { await api('logout', { method: 'POST' }).catch(() => {}); renderLogin(); });
}

// ---------- товары ----------
function renderProducts() {
  const all = st.products, q = st.q.trim().toLowerCase();
  const list = all.filter(p => !q || `${p.brand} ${p.name}`.toLowerCase().includes(q));
  const out = all.filter(p => !p.hidden && !p.variants.some(v => v.available)).length;
  const hidden = all.filter(p => p.hidden).length;
  shell(`<div class="adm-head"><div><div class="eyebrow">Каталог</div><h1 class="display">Товары</h1></div><button class="btn" id="add">${svg('plus', { sw: 1.8 })}Добавить товар</button></div>
<div class="adm-stats"><div class="adm-stat"><b>${all.length}</b><span>всего товаров</span></div>
<div class="adm-stat ${out ? 'warn' : ''}"><b>${out}</b><span>нет в наличии</span></div>
<div class="adm-stat"><b>${hidden}</b><span>скрыто с сайта</span></div></div>
<div class="adm-bar"><div class="search">${svg('search')}<input id="aq" class="input" type="search" placeholder="Найти по названию или бренду" value="${esc(st.q)}" autocomplete="off"></div></div>
<div id="plist">${list.length ? list.map(rowHTML).join('') : '<div class="empty">Ничего не найдено</div>'}</div>`);
  $('#add').addEventListener('click', () => openEditor(null));
  $('#aq').addEventListener('input', e => { st.q = e.target.value; const pos = e.target.selectionStart; renderProducts(); const el = $('#aq'); el.focus(); el.setSelectionRange(pos, pos); });
  $('#plist').addEventListener('click', onListClick);
}

function rowHTML(p) {
  const m = minPrice(p), oos = m === null;
  return `<div class="prow ${p.hidden ? 'hid' : ''}" data-id="${esc(p.id)}">
<img src="${esc(imgOf(p))}" alt="" loading="lazy">
<div class="t"><small>${esc(p.brand)}</small><b>${esc(p.name)}</b>
<div class="vpills" aria-label="Объёмы: нажмите, чтобы включить или выключить">${p.variants.map(v => `<button type="button" class="vpill ${v.available ? '' : 'off'} ${v.vol === 0 ? 'full' : ''}" data-toggle="${v.vol}" title="${v.available ? 'В наличии — нажмите, чтобы убрать' : 'Нет в наличии — нажмите, чтобы вернуть'}">${esc(volName(p, v.vol))}<i>${rub(v.price)}</i></button>`).join('')}</div></div>
<div class="price">${p.hidden ? '<span class="badge-s">Скрыт</span>' : oos ? '<span class="badge-s bad">Нет в наличии</span>' : `<span class="badge-s ok">от ${rub(m)}</span>`}${p.salePercent ? ` <span class="badge-s gold">−${p.salePercent}%</span>` : ''}${p.kind ? ` <span class="badge-s">${KINDS[p.kind]}</span>` : ''}</div>
<div style="display:flex;gap:10px;align-items:center"><button type="button" class="sw ${p.hidden ? '' : 'on'}" data-hide role="switch" aria-checked="${!p.hidden}" aria-label="Показывать на сайте" title="${p.hidden ? 'Скрыт с сайта' : 'Показан на сайте'}"></button>
<button type="button" class="btn-ghost sm" data-edit>Изменить</button></div></div>`;
}

async function onListClick(e) {
  const row = e.target.closest('.prow');
  if (!row) return;
  const p = st.products.find(x => x.id === row.dataset.id);
  if (e.target.closest('[data-edit]')) return openEditor(p);
  try {
    if (e.target.closest('[data-toggle]')) {
      const vol = Number(e.target.closest('[data-toggle]').dataset.toggle);
      const next = { ...p, variants: p.variants.map(v => v.vol === vol ? { ...v, available: !v.available } : v) };
      await api('products/' + p.id, { method: 'PUT', body: next });
      note(next.variants.find(v => v.vol === vol).available ? 'Объём в наличии' : 'Объём убран', `${p.name}, ${volName(p, vol)}`);
    } else if (e.target.closest('[data-hide]')) {
      await api('products/' + p.id, { method: 'PUT', body: { ...p, hidden: !p.hidden } });
      note(p.hidden ? 'Показан на сайте' : 'Скрыт с сайта', p.name);
    } else return;
    await load(); renderProducts();
  } catch (err) { if (err.message !== 'unauthorized') note('Не сохранено', err.message, 'bad'); }
}

// ---------- редактор товара ----------
function blank() {
  return { brand: '', name: '', type: 'Eau de Parfum', gender: 'Для всех', cats: ['Для всех'], family: 'Восточные', tag: '', popularity: 50, description: '', image: null, hidden: false,
    kind: '', discount: null, bottleMl: '', notes: null, longevity: '', audience: '', brandInfo: '', variants: VOLS.map(vol => ({ vol, price: '', available: vol !== 6 })) };
}

function openEditor(p) {
  const isNew = !p;
  const d = structuredClone(p || blank());
  st.editing = d;
  const n = d.notes || {};
  let mode = d.variants.length && d.variants.every(v => v.vol === 0) ? 'bottle' : 'decant';
  const decants = VOLS.map(vol => d.variants.find(v => v.vol === vol) || (d.decantStash || []).find(v => v.vol === vol) || { vol, price: '', available: vol !== 6 });
  const full = d.variants.find(v => v.vol === 0) || { price: '', available: true };
  const el = document.createElement('div');
  el.innerHTML = `<div class="ed-back" data-close></div><form class="ed" role="dialog" aria-modal="true" aria-label="${isNew ? 'Новый товар' : 'Редактирование'}" novalidate>
<div class="ed-head"><h2>${isNew ? 'Новый товар' : esc(d.name)}</h2><button type="button" class="ibtn" data-close aria-label="Закрыть">${svg('close')}</button></div>
<div class="ed-body">
<div class="ed-sec"><h3>Фото</h3><div class="photo"><img id="ph-img" src="${esc(imgOf(d))}" alt=""><div><label class="drop" id="drop"><input type="file" id="ph-file" accept="image/jpeg,image/png,image/webp" hidden>Нажмите или перетащите фото<br><span class="hint">JPG, PNG или WebP. Мы сами найдём флакон и обрежем кадр 4:5 — останется проверить</span></label></div></div></div>
<div class="ed-sec"><h3>Основное</h3>
<div class="g2a"><div class="field"><label class="label" for="f-brand">Бренд</label><input id="f-brand" class="input" value="${esc(d.brand)}" maxlength="60" placeholder="Например, Xerjoff"><span class="err" data-e="brand" hidden></span></div>
<div class="field"><label class="label" for="f-name">Название</label><input id="f-name" class="input" value="${esc(d.name)}" maxlength="80" placeholder="Например, Purple Accento"><span class="err" data-e="name" hidden></span></div></div>
<div class="g2a"><div class="field"><label class="label" for="f-gender">Для кого</label><select id="f-gender" class="input">${GENDERS.map(g => `<option ${g === d.gender ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
<div class="field"><label class="label" for="f-kind">Вид</label><select id="f-kind" class="input"><option value="">Не указан</option>${Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${d.kind === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div></div>
<div class="ed-sec"><h3>Формат продажи</h3>
<div class="seg" role="radiogroup" aria-label="Формат продажи"><button type="button" class="seg-b ${mode === 'decant' ? 'on' : ''}" data-mode="decant" role="radio" aria-checked="${mode === 'decant'}"><b>Разливной формат</b><span>3, 5, 10, 30, 50 мл…</span></button><button type="button" class="seg-b ${mode === 'bottle' ? 'on' : ''}" data-mode="bottle" role="radio" aria-checked="${mode === 'bottle'}"><b>Целый флакон</b><span>без разлива, одна цена</span></button></div>
<div id="m-decant" ${mode === 'decant' ? '' : 'hidden'}><p class="hint" style="margin:0 0 12px">Цена за один флакон выбранного объёма. Снимите галочку, если объёма нет в наличии.</p>
<div id="vrows">${decants.map(v => `<div class="vrow"><b>${v.vol} мл</b><div class="field"><input class="input" inputmode="numeric" data-price="${v.vol}" value="${v.price ?? ''}" placeholder="Цена, ₽" aria-label="Цена ${v.vol} мл"><span class="err" data-e="price_${v.vol}" hidden></span></div><label class="chk"><input type="checkbox" data-avail="${v.vol}" ${v.available ? 'checked' : ''}>В наличии</label></div>`).join('')}</div>
<button type="button" class="lnk" id="auto" style="margin-top:8px">Рассчитать остальные цены от 3 мл</button></div>
<div id="m-bottle" ${mode === 'bottle' ? '' : 'hidden'}><p class="hint" style="margin:0 0 12px">Укажите объём флакона и общую цену за него.</p>
<div class="vrow" style="grid-template-columns:130px 1fr auto"><div class="field"><label class="label" for="f-bml">Объём, мл</label><input class="input" id="f-bml" inputmode="numeric" value="${d.bottleMl || ''}" placeholder="100"><span class="err" data-e="bottleMl" hidden></span></div>
<div class="field"><label class="label" for="f-bp">Цена за флакон, ₽</label><input class="input" id="f-bp" inputmode="numeric" data-price="0" value="${full.price ?? ''}" placeholder="12 900"><span class="err" data-e="price_0" hidden></span></div>
<label class="chk" style="padding-top:22px"><input type="checkbox" data-avail="0" ${full.available !== false ? 'checked' : ''}>В наличии</label></div></div></div>
<details class="opt" ${isNew ? '' : 'open'}><summary>Дополнительно: описание, категории, скидка, показ</summary><div class="ed-sec">
<div class="field"><label class="label" for="f-desc">Описание <em>— если пусто, подставим стандартное</em></label><textarea id="f-desc" class="input" maxlength="1000">${esc(d.description)}</textarea></div>
<div class="g2a"><div class="field"><label class="label" for="f-type">Тип <em>— например Eau de Parfum</em></label><input id="f-type" class="input" value="${esc(d.type)}" maxlength="60"></div>
<div class="field"><label class="label" for="f-family">Тип аромата</label><select id="f-family" class="input">${FAMILIES.map(g => `<option ${g === d.family ? 'selected' : ''}>${g}</option>`).join('')}</select></div></div>
<div class="field"><span class="label">Категории <em>— выбираются сами по полю «Для кого», можно поправить</em></span><div style="display:flex;gap:8px;flex-wrap:wrap">${CATS.map(c => `<button type="button" class="chip ${d.cats.includes(c) ? 'on' : ''}" data-cat="${c}" aria-pressed="${d.cats.includes(c)}">${c}</button>`).join('')}</div><span class="err" data-e="cats" hidden></span></div>
<div class="g2a"><div class="field"><label class="label" for="f-tag">Метка на фото <em>— необязательно</em></label><input id="f-tag" class="input" value="${esc(d.tag)}" maxlength="24" placeholder="Нишевый, Хит, Новинка"></div>
<div class="field"><label class="label" for="f-sale">Скидка на этот товар, % <em>— перекрывает скидку вида</em></label><div style="display:grid;grid-template-columns:90px 1fr;gap:10px"><input id="f-sale" class="input" inputmode="numeric" value="${d.discount?.percent || ''}" placeholder="0" aria-label="Процент скидки"><input id="f-sale-until" class="input" type="date" value="${esc(d.discount?.until || '')}" aria-label="Скидка действует до"></div><span class="err" data-e="discount" hidden></span><span class="hint">Пусто — без отдельной скидки. Дата — последний день скидки.</span></div></div>
<div class="ed-sec" style="margin-top:6px"><h3>Показ на сайте</h3><label class="vrow" style="grid-template-columns:auto 1fr;cursor:pointer"><button type="button" class="sw ${d.hidden ? '' : 'on'}" id="f-vis" role="switch" aria-checked="${!d.hidden}"></button><span id="f-vis-t" style="font:500 14px/1.3 var(--sans)">${d.hidden ? 'Скрыт — покупатели не видят этот товар' : 'Показан в каталоге'}</span></label></div>
</div></details>
<details class="opt" ${d.notes || d.longevity || d.audience || d.brandInfo ? 'open' : ''}><summary>Ноты и дополнительные сведения</summary><div class="ed-sec">
<div class="field"><label class="label" for="n-top">Верхние ноты</label><input id="n-top" class="input" value="${esc(n.top || '')}" maxlength="120"></div>
<div class="field"><label class="label" for="n-heart">Средние ноты</label><input id="n-heart" class="input" value="${esc(n.heart || '')}" maxlength="120"></div>
<div class="field"><label class="label" for="n-base">Базовые ноты</label><input id="n-base" class="input" value="${esc(n.base || '')}" maxlength="120"></div>
<div class="g2a"><div class="field"><label class="label" for="f-long">Стойкость</label><input id="f-long" class="input" value="${esc(d.longevity || '')}" maxlength="40" placeholder="до 10 часов"></div>
<div class="field"><label class="label" for="f-pop">Порядок в каталоге <em>— меньше = выше</em></label><input id="f-pop" class="input" inputmode="numeric" value="${d.popularity ?? 50}"></div></div>
<div class="field"><label class="label" for="f-aud">Для кого (текст)</label><textarea id="f-aud" class="input" style="min-height:70px" maxlength="300">${esc(d.audience || '')}</textarea></div>
<div class="field"><label class="label" for="f-bi">О бренде</label><textarea id="f-bi" class="input" style="min-height:70px" maxlength="400">${esc(d.brandInfo || '')}</textarea></div></div></details>
</div>
<div class="ed-foot">${isNew ? '' : '<button type="button" class="btn-ghost sm" id="del" style="color:var(--err);border-color:rgba(229,138,107,.4)">Удалить</button>'}<span class="sp"></span><button type="button" class="btn-ghost" data-close>Отмена</button><button type="submit" class="btn" id="save">Сохранить</button></div></form>`;
  document.body.append(el);
  document.body.classList.add('lock');
  const close = () => { el.remove(); document.body.classList.remove('lock'); st.editing = null; };
  el.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
  el.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  $('#f-brand', el).focus();
  // категории подбираются по полю «Для кого», пока их не правили руками
  let catsTouched = !isNew;
  const GENDER_CAT = { 'Мужской': 'Мужская', 'Женский': 'Женская', 'Для всех': 'Для всех' };
  $('#f-gender', el).addEventListener('change', e => {
    if (catsTouched) return;
    const keep = d.cats.filter(c => c === 'Нишевые');
    d.cats = [GENDER_CAT[e.target.value], ...keep];
    $$('[data-cat]', el).forEach(b => { const on = d.cats.includes(b.dataset.cat); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  });

  el.addEventListener('click', e => {
    const c = e.target.closest('[data-cat]');
    if (c) { catsTouched = true; const v = c.dataset.cat, i = d.cats.indexOf(v); if (i >= 0) d.cats.splice(i, 1); else d.cats.push(v); c.classList.toggle('on', i < 0); c.setAttribute('aria-pressed', i < 0); }
    if (e.target.closest('#f-vis')) { d.hidden = !d.hidden; $('#f-vis', el).classList.toggle('on', !d.hidden); $('#f-vis', el).setAttribute('aria-checked', !d.hidden); $('#f-vis-t', el).textContent = d.hidden ? 'Скрыт — покупатели не видят этот товар' : 'Показан в каталоге'; }
    const m = e.target.closest('[data-mode]');
    if (m) { mode = m.dataset.mode; $$('[data-mode]', el).forEach(b => { const on = b.dataset.mode === mode; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); }); $('#m-decant', el).hidden = mode !== 'decant'; $('#m-bottle', el).hidden = mode !== 'bottle'; }
    if (e.target.closest('#auto')) {
      const base = Number($('[data-price="3"]', el).value);
      if (!base) return note('Сначала укажите цену за 3 мл', '', 'bad');
      VOLS.forEach(v => { $(`[data-price="${v}"]`, el).value = v === 3 ? base : Math.round(base * LADDER[v] / 10) * 10; });
    }
  });

  // фото: уменьшаем в браузере до 1000 px и грузим на сервер
  async function upload(file) {
    try {
      d.image = await uploadImage(file); $('#ph-img', el).src = d.image;
      note('Фото загружено', 'Не забудьте нажать «Сохранить»');
    } catch (err) { if (!['unauthorized', 'cancel'].includes(err.message)) note('Не удалось загрузить фото', err.message, 'bad'); }
  }
  $('#ph-file', el).addEventListener('change', e => upload(e.target.files[0]));
  const drop = $('#drop', el);
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => upload(e.dataTransfer.files[0]));

  $('#del', el)?.addEventListener('click', async () => {
    if (!confirm(`Удалить «${d.brand} ${d.name}» навсегда? Если нужно только убрать с сайта — используйте переключатель «Показ на сайте».`)) return;
    try { await api('products/' + d.id, { method: 'DELETE' }); close(); await load(); render(); note('Товар удалён', d.name); } catch (err) { note('Не удалось удалить', err.message, 'bad'); }
  });

  $('form', el).addEventListener('submit', async e => {
    e.preventDefault();
    const body = {
      brand: $('#f-brand', el).value, name: $('#f-name', el).value, type: $('#f-type', el).value, gender: $('#f-gender', el).value, cats: d.cats,
      kind: $('#f-kind', el).value, discount: { percent: Number($('#f-sale', el).value) || 0, until: $('#f-sale-until', el).value }, family: $('#f-family', el).value, tag: $('#f-tag', el).value, description: $('#f-desc', el).value, image: d.image, hidden: d.hidden,
      popularity: Number($('#f-pop', el).value) || 50, longevity: $('#f-long', el).value, audience: $('#f-aud', el).value, brandInfo: $('#f-bi', el).value,
      notes: { top: $('#n-top', el).value, heart: $('#n-heart', el).value, base: $('#n-base', el).value },
      mode, bottleMl: Number($('#f-bml', el).value) || 0,
      variants: [...VOLS, 0].map(vol => ({ vol, price: Number($(`[data-price="${vol}"]`, el).value.replace(/\s/g, '')), available: $(`[data-avail="${vol}"]`, el).checked }))
    };
    $$('[data-e]', el).forEach(x => { x.hidden = true; });
    const btn = $('#save', el); btn.disabled = true; btn.textContent = 'Сохраняем…';
    try {
      await api(isNew ? 'products' : 'products/' + d.id, { method: isNew ? 'POST' : 'PUT', body });
      close(); await load(); render(); note('Сохранено', `${body.brand} — ${body.name}`);
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Сохранить';
      if (err.data?.fields) {
        for (const [k, m] of Object.entries(err.data.fields)) { const s = $(`[data-e="${k}"]`, el); if (s) { s.textContent = m; s.hidden = false; } }
        const first = el.querySelector('[data-e]:not([hidden])');
        first?.closest('details')?.setAttribute('open', '');
        first?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      if (err.message !== 'unauthorized') note('Не сохранено', err.message, 'bad');
    }
  });
}

// ---------- заявки ----------
const METHOD = { telegram: 'Telegram', whatsapp: 'WhatsApp', call: 'Звонок' };
function renderOrders() {
  const list = st.orders;
  shell(`<div class="adm-head"><div><div class="eyebrow">Покупатели</div><h1 class="display">Заявки</h1></div></div>
${list.length ? list.map(o => {
    const d = new Date(o.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const tel = o.phone.replace(/[^\d+]/g, '');
    return `<article class="ord ${o.status === 'done' ? 'done' : ''}" data-no="${esc(o.orderNo)}">
<div class="ord-top"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><b>№ ${esc(o.orderNo)}</b><span class="hint">${d}</span>${o.status === 'done' ? '<span class="badge-s ok">Выполнена</span>' : '<span class="badge-s gold">Новая</span>'}${o.tgStatus === 'sent' ? '' : '<span class="badge-s bad">Не ушла в Telegram</span>'}</div><b style="color:var(--champ);font-size:18px">${rub(o.total)}</b></div>
<div class="ord-meta"><span><b>${esc(o.name)}</b></span><a href="tel:${esc(tel)}">${esc(o.phone)}</a><span>${esc(o.city)}</span><span>Связь: ${METHOD[o.method] || esc(o.method)}${o.contact ? ' — ' + esc(o.contact) : ''}</span></div>
<ul>${o.items.map(i => `<li><span>${esc(i.brand)} — ${esc(i.name)}, ${esc(i.volLabel || i.vol + ' мл')} × ${i.qty}</span><span>${rub(i.sum)}</span></li>`).join('')}</ul>
${o.comment ? `<div class="hint">Комментарий: ${esc(o.comment)}</div>` : ''}
<div class="ord-act">${o.status === 'done' ? '<button class="btn-ghost sm" data-st="new">Вернуть в новые</button>' : '<button class="btn sm" data-st="done">Отметить выполненной</button>'}${o.tgStatus === 'sent' ? '' : '<button class="btn-ghost sm" data-resend>Отправить в Telegram ещё раз</button>'}</div></article>`;
  }).join('') : '<div class="empty">Заявок пока нет</div>'}`);
  $('.adm-wrap').addEventListener('click', async e => {
    const card = e.target.closest('.ord'); if (!card) return;
    const no = card.dataset.no;
    try {
      const s = e.target.closest('[data-st]');
      if (s) await api(`orders/${no}/status`, { method: 'POST', body: { status: s.dataset.st } });
      else if (e.target.closest('[data-resend]')) { await api(`orders/${no}/resend`, { method: 'POST' }); note('Отправлено в Telegram', no); }
      else return;
      await load(); renderOrders();
    } catch (err) { if (err.message !== 'unauthorized') note('Не получилось', err.message, 'bad'); }
  });
}

// ---------- скидки ----------
function renderSales() {
  const g = st.groups, cnt = k => st.products.filter(p => p.kind === k).length;
  const unset = st.products.filter(p => !p.kind).length;
  shell(`<div class="adm-head"><div><div class="eyebrow">Акции</div><h1 class="display">Скидки</h1></div></div>
<p class="hint" style="margin:-8px 0 20px;max-width:640px">Скидка применяется ко всем объёмам товара. На сайте показывается старая цена, метка «−N%», в корзине и заявке — цена со скидкой. Скидка на отдельный товар (в его карточке) важнее скидки вида.</p>
<div class="sale-grid">${Object.entries(KINDS).map(([k, name]) => { const x = g[k] || { percent: 0, until: '', active: false }; return `<form class="scard ${x.active ? 'live' : ''}" data-kind="${k}" novalidate>
<div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><div><div class="eyebrow">${name}</div><div class="hint">${cnt(k)} ${plural(cnt(k), ['товар', 'товара', 'товаров'])}</div></div>
<button type="button" class="sw ${x.active ? 'on' : ''}" data-act role="switch" aria-checked="${x.active}" aria-label="Скидка включена"></button></div>
<div class="field"><label class="label">Размер скидки, %</label><input class="input big" name="percent" inputmode="numeric" value="${x.percent || ''}" placeholder="например 15" maxlength="2"></div>
<div class="field"><label class="label">Действует до <em>— необязательно</em></label><input class="input" type="date" name="until" value="${esc(x.until || '')}"></div>
<span class="err" data-e="err" hidden></span>
<button class="btn" type="submit">Сохранить</button></form>`; }).join('')}</div>
<div class="adm-head" style="margin-top:36px"><div><div class="eyebrow">Чтобы скидки работали</div><h2 class="display d3">Вид товаров</h2></div></div>
<p class="hint" style="margin:-6px 0 14px">${unset ? `<b style="color:var(--err)">У ${unset} ${plural(unset, ['товара', 'товаров', 'товаров'])} вид не указан</b> — скидки на них не действуют. ` : ''}Выберите для каждого товара, оригинал это или масляные духи.</p>
<div>${st.products.map(p => `<div class="krow" data-id="${esc(p.id)}"><img src="${esc(imgOf(p))}" alt="" loading="lazy"><div class="t"><small>${esc(p.brand)}</small><b>${esc(p.name)}</b></div>${p.salePercent ? `<span class="badge-s gold">−${p.salePercent}%</span>` : ''}<select class="input" aria-label="Вид: ${esc(p.name)}"><option value="">Не указан</option>${Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${p.kind === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>`).join('')}</div>`);
  $$('.scard').forEach(card => {
    const k = card.dataset.kind; let active = Boolean((st.groups[k] || {}).active);
    card.querySelector('[data-act]').addEventListener('click', e => { active = !active; e.currentTarget.classList.toggle('on', active); e.currentTarget.setAttribute('aria-checked', active); });
    card.addEventListener('submit', async e => {
      e.preventDefault();
      const next = { ...st.groups, [k]: { percent: Number(card.percent.value) || 0, until: card.until.value, active } };
      const err = card.querySelector('[data-e]'); err.hidden = true;
      try {
        await api('discounts', { method: 'PUT', body: next });
        await load(); renderSales();
        note(active && next[k].percent ? `Скидка ${next[k].percent}% включена` : 'Сохранено', KINDS[k]);
      } catch (er) { if (er.message === 'unauthorized') return; if (er.data?.fields?.[k]) { err.textContent = er.data.fields[k]; err.hidden = false; } else note('Не сохранено', er.message, 'bad'); }
    });
  });
  $$('.krow select').forEach(sel => sel.addEventListener('change', async () => {
    const id = sel.closest('.krow').dataset.id;
    try { await api(`products/${id}/kind`, { method: 'PUT', body: { kind: sel.value } }); await load(); renderSales(); note('Вид сохранён', ''); }
    catch (er) { if (er.message !== 'unauthorized') note('Не сохранено', er.message, 'bad'); }
  }));
}

// ---------- форматы флаконов ----------
function renderFormats() {
  shell(`<div class="adm-head"><div><div class="eyebrow">Главная и страница аромата</div><h1 class="display">Форматы</h1></div></div>
<p class="hint" style="margin:-8px 0 20px;max-width:620px">Флаконы 3–50 мл показываются на главной и в галерее аромата. Здесь меняются фото и подписи. Цена и наличие каждого объёма задаются в карточке товара.</p>
<div class="fgrid-a">${st.formats.map(f => `<form class="fcard" data-vol="${f.vol}" novalidate>
<label class="fimg" title="Заменить фото"><img src="${esc(f.image)}" alt="${esc(f.alt)}"><input type="file" accept="image/jpeg,image/png,image/webp" hidden><span>Заменить фото</span></label>
<b class="fvol">${f.vol} мл</b>
<div class="field"><label class="label">Подпись на главной</label><input class="input" name="caption" value="${esc(f.caption)}" maxlength="30"></div>
<div class="field"><label class="label">Подсказка в карточке аромата</label><input class="input" name="hint" value="${esc(f.hint)}" maxlength="60" placeholder="Например: Стеклянный флакон"></div>
<button class="btn sm" type="submit">Сохранить</button></form>`).join('')}</div>`);
  $$('.fcard').forEach(card => {
    const f = st.formats.find(x => x.vol === Number(card.dataset.vol)); let image = f.image;
    card.querySelector('input[type=file]').addEventListener('change', async e => {
      try { image = await uploadImage(e.target.files[0]); card.querySelector('img').src = image; note('Фото загружено', 'Нажмите «Сохранить»'); }
      catch (err) { if (!['unauthorized', 'cancel'].includes(err.message)) note('Не удалось загрузить фото', err.message, 'bad'); }
    });
    card.addEventListener('submit', async e => {
      e.preventDefault();
      try { await api('formats/' + f.vol, { method: 'PUT', body: { caption: card.caption.value, hint: card.hint.value, image } }); note('Сохранено', `${f.vol} мл`); await load(); }
      catch (err) { if (err.message !== 'unauthorized') note('Не сохранено', err.message, 'bad'); }
    });
  });
}

function render() { ({ orders: renderOrders, formats: renderFormats, sales: renderSales }[st.tab] || renderProducts)(); }
async function load() { [st.products, st.orders, st.formats, st.groups] = await Promise.all([api('products'), api('orders'), api('formats'), api('discounts')]); }
async function boot() {
  try { await api('me'); } catch (e) { if (e.status === 503) { app.innerHTML = `<div class="login"><h1 class="display d3">Админка выключена</h1><p class="body">Задайте переменную <code>ADMIN_PASSWORD</code> на сервере и перезапустите приложение.</p></div>`; } else if (e.message !== 'unauthorized') renderLogin(); return; }
  await load(); render();
}
boot();
setInterval(() => { if (document.hidden || st.editing || $('.ed')) return; load().then(() => { if (st.tab === 'orders') renderOrders(); else if (st.tab === 'products' && (!$('#aq') || document.activeElement !== $('#aq'))) renderProducts(); }).catch(() => {}); }, 60000);
