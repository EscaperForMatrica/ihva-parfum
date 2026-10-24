import { $, $$, esc, rub, plural, initChrome, getProducts, cart, priceCart, toast, dismissToast, svg, fatal, imgOf, site, waLink } from './core.js';

initChrome();

const root = $('#checkout-root');
const LAST_KEY = 'ihva_last_order', DRAFT_KEY = 'ihva_draft', ATTEMPT_KEY = 'ihva_attempt';
const ss = {
  get(k) { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } },
  del(k) { try { sessionStorage.removeItem(k); } catch { /* */ } }
};

const METHODS = [
  { id: 'telegram', title: 'Telegram', sub: 'Напишем в мессенджер', icon: 'telegram', label: 'Ник или номер в Telegram', ph: '@username', via: 'в Telegram' },
  { id: 'whatsapp', title: 'WhatsApp', sub: 'Напишем в мессенджер', icon: 'whatsapp', label: 'Номер WhatsApp', ph: '+7 (___) ___-__-__', via: 'в WhatsApp' },
  { id: 'call', title: 'Звонок', sub: 'Позвоним по телефону', icon: 'phone', label: 'Номер для звонка', ph: '+7 (___) ___-__-__', via: 'по телефону' }
];

const form = { name: '', phone: '', city: '', method: 'telegram', contact: '', comment: '', ...(ss.get(DRAFT_KEY) || {}) };
let products = [], busy = false;

const uuid = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

function validate() {
  const e = {};
  if (form.name.trim().length < 2) e.name = 'Укажите имя';
  const d = form.phone.replace(/\D/g, '');
  if (!d.length) e.phone = 'Укажите номер телефона';
  else if (!(d.length === 11 && (d[0] === '7' || d[0] === '8')) && !(d.length === 10 && d[0] === '9')) e.phone = 'Номер выглядит неполным — нужно 11 цифр';
  if (form.city.trim().length < 2) e.city = 'Укажите город для доставки';
  return e;
}

// ---------- представление ----------
function emptyView() {
  root.innerHTML = `<div class="wrap" style="padding-top: 48px; padding-bottom: 120px"><div class="panel rise" style="display: flex; flex-direction: column; align-items: center; text-align: center; gap: 20px; padding: 96px 32px">
<div style="width: 72px; height: 72px; border-radius: 50%; border: 1px solid rgba(229,209,161,.26); display: flex; align-items: center; justify-content: center; color: #E5D1A1">${svg('bag', { sw: 1.2, size: 28 })}</div>
<h1 class="display d2">Корзина пока пуста</h1>
<p class="body" style="max-width: 400px; color: #99958D">Чтобы оформить заявку, добавьте аромат в корзину — начать можно с пробника 3 мл.</p>
<a href="/catalog" class="btn">Перейти в каталог</a></div></div>`;
}

function summaryHTML({ items, total }) {
  return `<aside class="co-side panel" style="padding: 28px; display: flex; flex-direction: column; gap: 20px" aria-label="Состав заказа">
<div style="display: flex; justify-content: space-between; align-items: baseline"><h2 class="display" style="font-size: 28px">Ваш заказ</h2><a href="/cart" class="small" style="color: #E5D1A1">Изменить</a></div>
<div style="display: flex; flex-direction: column; gap: 16px">
${items.map(it => `<div class="co-item"><img src="${esc(imgOf(it.product))}" alt="" width="56" height="70"><div style="display: flex; flex-direction: column; gap: 4px; min-width: 0"><span style="font: 500 19px/1.1 'Cormorant Garamond', serif">${esc(it.product.name)}</span><span class="small" style="font-size: 12.5px">${esc(it.product.brand)} · ${it.vol} мл × ${it.qty}</span></div><span class="num" style="font: 500 14px/1 Manrope, sans-serif">${rub(it.sum)}</span></div>`).join('')}
</div>
<hr class="hair">
<div style="display: flex; justify-content: space-between"><span class="small" style="font-size: 14px">Доставка</span><span class="small" style="font-size: 14px">по согласованию</span></div>
<div style="display: flex; justify-content: space-between; align-items: baseline"><span style="font: 600 15px/1 Manrope, sans-serif">Итого</span><span class="num" style="font: 600 28px/1 Manrope, sans-serif; color: #E5D1A1">${rub(total)}</span></div>
<div class="note-strip" style="align-items: flex-start; padding-top: 4px">${svg('shield').replace('<svg ', '<svg style="margin-top: 2px" ')}<span>Без регистрации и онлайн-оплаты. Данные нужны только для связи по заказу.</span></div>
</aside>`;
}

const errLine = k => `<span class="err" data-err="${k}" hidden>${svg('alert', { sw: 1.8 })}<span></span></span>`;

function formView(priced) {
  root.innerHTML = `<div class="wrap" style="padding-top: 48px; padding-bottom: 120px">
<div style="display: flex; flex-direction: column; gap: 14px; margin-bottom: 44px">
<div class="eyebrow">Заявка на заказ</div>
<h1 class="display co-h1" style="font-size: clamp(42px, 4.2vw, 60px)">Оформление заказа</h1>
<p class="body" style="color: #99958D; max-width: 560px">Оставьте контакты — менеджер свяжется с вами, подтвердит заказ и согласует оплату и доставку.</p>
</div>
<div class="co">
<form class="co-main" id="co-form" novalidate style="display: flex; flex-direction: column; gap: 44px" aria-label="Заявка на заказ">
<div id="co-alert" role="alert"></div>
<fieldset style="border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 20px">
<legend style="display: flex; align-items: center; gap: 14px; padding: 0; margin-bottom: 20px"><span style="font: 400 30px/1 'Cormorant Garamond', serif; color: #C6A15B">01</span><span style="font: 600 17px/1 Manrope, sans-serif">Контактные данные</span></legend>
<div class="field"><label class="label" for="nm">Имя</label><input id="nm" name="name" class="input" autocomplete="name" maxlength="60" placeholder="Как к вам обращаться" aria-describedby="nm-e">${errLine('name')}</div>
<div class="g2">
<div class="field"><label class="label" for="ph">Телефон</label><input id="ph" name="phone" class="input" type="tel" inputmode="tel" autocomplete="tel" maxlength="24" placeholder="+7 (___) ___-__-__">${errLine('phone')}</div>
<div class="field"><label class="label" for="ct">Город</label><input id="ct" name="city" class="input" autocomplete="address-level2" maxlength="80" placeholder="Ваш город">${errLine('city')}</div>
</div>
</fieldset>
<fieldset style="border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 20px">
<legend style="display: flex; align-items: center; gap: 14px; padding: 0; margin-bottom: 20px"><span style="font: 400 30px/1 'Cormorant Garamond', serif; color: #C6A15B">02</span><span style="font: 600 17px/1 Manrope, sans-serif">Как с вами связаться</span></legend>
<div class="g3 method-grid" role="radiogroup" aria-label="Способ связи">${METHODS.map(m => `<button type="button" class="method" data-method="${m.id}" role="radio" aria-checked="false"><span class="mi">${svg(m.icon, { sw: 1.6 })}</span><span class="dot"></span><span style="display: flex; flex-direction: column; gap: 4px"><b>${m.title}</b><span>${m.sub}</span></span></button>`).join('')}</div>
<div class="mm-list" role="radiogroup" aria-label="Способ связи">${METHODS.map(m => `<button type="button" class="mm" data-method="${m.id}" role="radio" aria-checked="false"><span class="mi">${svg(m.icon, { sw: 1.6, size: 17 })}</span><span style="display: flex; flex-direction: column; gap: 3px"><b style="font: 600 14px/1 Manrope, sans-serif">${m.title}</b><span class="small" style="font-size: 12px">${m.sub}</span></span><span class="rd"></span></button>`).join('')}</div>
<div class="field"><label class="label" for="cn"><span id="cn-label"></span> <em>— если отличается от телефона</em></label><input id="cn" name="contact" class="input" maxlength="80" autocomplete="off"></div>
<div class="field"><label class="label" for="cm">Комментарий к заказу <em>— необязательно</em></label><textarea id="cm" name="comment" class="input" maxlength="500" placeholder="Удобное время для связи, пожелания по подбору или доставке"></textarea></div>
</fieldset>
<input type="text" name="website" class="vh" tabindex="-1" autocomplete="off" aria-hidden="true">
<div style="display: flex; flex-direction: column; gap: 16px">
<button type="submit" class="btn block" id="co-submit" style="min-height: 58px; font-size: 15px">Оформить заказ</button>
<p class="small" style="margin: 0; text-align: center; font-size: 13.5px">После оформления заявки менеджер свяжется с вами для подтверждения заказа и согласования оплаты и доставки.</p>
</div>
</form>
${summaryHTML(priced)}
</div></div>`;

  const f = $('#co-form');
  f.name.value = form.name; f.phone.value = form.phone; f.city.value = form.city; f.contact.value = form.contact; f.comment.value = form.comment;
  paintMethod();
  f.addEventListener('input', e => {
    const t = e.target;
    if (!(t.name in form)) return;
    form[t.name] = t.value;
    ss.set(DRAFT_KEY, form);
    if (t.name in { name: 1, phone: 1, city: 1 }) clearError(t.name);
  });
  f.phone.addEventListener('blur', () => {
    const d = form.phone.replace(/\D/g, '');
    if (d.length === 11 && (d[0] === '7' || d[0] === '8')) {
      form.phone = `+7 ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`;
      f.phone.value = form.phone; ss.set(DRAFT_KEY, form);
    }
  });
  f.addEventListener('click', e => {
    const m = e.target.closest('[data-method]');
    if (m) { form.method = m.dataset.method; ss.set(DRAFT_KEY, form); paintMethod(); }
  });
  f.addEventListener('submit', e => { e.preventDefault(); submit(); });
}

function paintMethod() {
  const m = METHODS.find(x => x.id === form.method) || METHODS[0];
  $$('[data-method]').forEach(b => { const on = b.dataset.method === m.id; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  $('#cn-label').textContent = m.label;
  $('#cn').placeholder = m.ph;
}

function showErrors(errors) {
  const keys = Object.keys(errors).filter(k => ['name', 'phone', 'city'].includes(k));
  for (const k of ['name', 'phone', 'city']) {
    const el = $(`[data-err="${k}"]`), input = $(`[name="${k}"]`);
    const msg = errors[k];
    el.hidden = !msg; el.querySelector('span').textContent = msg || '';
    input.classList.toggle('bad', Boolean(msg));
    input.setAttribute('aria-invalid', Boolean(msg));
  }
  if (keys.length) {
    setAlert(`<span>Проверьте выделенные поля — без них менеджер не сможет связаться с вами.</span>`);
    $(`[name="${keys[0]}"]`).focus();
  }
}
function clearError(k) {
  const el = $(`[data-err="${k}"]`), input = $(`[name="${k}"]`);
  if (!el) return;
  el.hidden = true; input.classList.remove('bad'); input.removeAttribute('aria-invalid');
  if (!$$('[data-err]:not([hidden])').length) setAlert('');
}
function setAlert(html) {
  $('#co-alert').innerHTML = html ? `<div class="alert-box">${svg('alert', { sw: 1.6, size: 18 })}<div>${html}</div></div>` : '';
}
function contactLinks() {
  const l = [];
  if (site.telegramUrl) l.push(`<a href="${esc(site.telegramUrl)}" target="_blank" rel="noopener">Telegram</a>`);
  if (site.whatsapp) l.push(`<a href="${esc(waLink('Здравствуйте! Не получилось оформить заявку на сайте.'))}" target="_blank" rel="noopener">WhatsApp</a>`);
  if (site.phoneTel) l.push(`<a href="tel:${esc(site.phoneTel)}">${esc(site.phoneDisplay)}</a>`);
  return l.length ? `<div class="links">${l.join('')}</div>` : '';
}

// ---------- отправка ----------
function payload(priced) {
  const body = {
    name: form.name.trim(), phone: form.phone.trim(), city: form.city.trim(), method: form.method,
    contact: form.contact.trim(), comment: form.comment.trim(),
    items: priced.items.map(i => ({ id: i.id, vol: i.vol, qty: i.qty }))
  };
  // Один и тот же clientOrderId на все повторы той же заявки → сервер не создаёт дубль.
  const sig = JSON.stringify(body);
  let a = ss.get(ATTEMPT_KEY);
  if (!a || a.sig !== sig) { a = { sig, id: uuid() }; ss.set(ATTEMPT_KEY, a); }
  return { ...body, clientOrderId: a.id, website: ($('[name="website"]')?.value || '') };
}

async function submit() {
  if (busy) return;
  const errors = validate();
  if (Object.keys(errors).length) { showErrors(errors); return; }
  showErrors({});
  setAlert('');
  const priced = priceCart(products);
  if (!priced.items.length) { render(); return; }

  busy = true;
  const btn = $('#co-submit');
  btn.setAttribute('aria-busy', 'true'); btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span><span>Отправляем…</span>';
  dismissToast();

  let res, data;
  try {
    res = await fetch('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(payload(priced)) });
    data = await res.json().catch(() => null);
  } catch { res = null; }

  busy = false;
  if (res?.ok && data?.ok) return success(data.order);

  btn.removeAttribute('aria-busy'); btn.disabled = false; btn.textContent = 'Оформить заказ';
  if (res?.status === 400 && data?.code === 'validation') {
    if (data.fields?.items) {
      products = await getProducts().catch(() => products);
      cart.reconcile(products);
      setAlert(`<span>${esc(data.fields.items)}. <a href="/cart">Вернуться в корзину</a></span>`);
      render();
      return;
    }
    return showErrors(data.fields || {});
  }
  const msg = data?.message || 'Проверьте соединение и попробуйте ещё раз';
  setAlert(`<span>${esc(msg)}</span>${contactLinks()}`);
  const retryable = !res || data?.retryable !== false && data?.code !== 'not_configured';
  toast({ kind: 'bad', title: 'Заявка не отправлена', text: res ? 'Данные сохранены в форме — повторная отправка безопасна' : 'Проверьте соединение и попробуйте ещё раз', ttl: 8000,
    action: retryable ? { label: 'Повторить', onClick: submit } : undefined });
}

function success(order) {
  const m = METHODS.find(x => x.id === (order.method || form.method)) || METHODS[0];
  const view = { order, via: m.via };
  ss.set(LAST_KEY, view);
  cart.clear();                 // корзина очищается только после подтверждённого сервером принятия
  ss.del(DRAFT_KEY); ss.del(ATTEMPT_KEY);
  successView(view);
  scrollTo(0, 0);
}

function successView({ order, via }) {
  const first = (order.name || '').trim().split(/\s+/)[0];
  root.innerHTML = `<div class="wrap" style="padding-top: 88px; padding-bottom: 120px">
<div style="max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 26px">
<div class="ring rise">${svg('check', { sw: 1.2, size: 40 })}</div>
<div class="eyebrow rise d1x">Заявка № ${esc(order.orderNo)}</div>
<h1 class="display rise d1x co-h1" style="font-size: clamp(42px, 4.4vw, 62px)" tabindex="-1" id="ok-title">${first ? `Спасибо, ${esc(first)}! ` : 'Спасибо! '}Заявка принята</h1>
<p class="lead rise d2x" style="max-width: 560px">Менеджер свяжется с вами ${esc(via)}, чтобы подтвердить заказ и согласовать оплату и доставку.</p>
</div>
<div class="panel rise d3x" style="max-width: 860px; margin: 56px auto 0; padding: 32px">
<div class="tl">
<div style="display: flex; flex-direction: column; gap: 10px; padding-right: 24px"><span style="width: 30px; height: 30px; border-radius: 50%; background: #C6A15B; color: #080808; display: flex; align-items: center; justify-content: center">${svg('check', { sw: 2, size: 15 })}</span><b style="font: 600 14px/1.3 Manrope, sans-serif">Заявка принята</b><span class="small">Передана менеджеру</span></div>
<div style="display: flex; flex-direction: column; gap: 10px; padding-right: 24px"><span style="width: 30px; height: 30px; border-radius: 50%; border: 1px solid #C6A15B; color: #E5D1A1; display: flex; align-items: center; justify-content: center; font: 600 12px/1 Manrope, sans-serif">2</span><b style="font: 600 14px/1.3 Manrope, sans-serif">Подтверждение</b><span class="small">Менеджер уточнит наличие и детали</span></div>
<div style="display: flex; flex-direction: column; gap: 10px"><span style="width: 30px; height: 30px; border-radius: 50%; border: 1px solid rgba(245,241,232,.2); color: #99958D; display: flex; align-items: center; justify-content: center; font: 600 12px/1 Manrope, sans-serif">3</span><b style="font: 600 14px/1.3 Manrope, sans-serif">Оплата и доставка</b><span class="small">По согласованию с менеджером</span></div>
</div>
<hr class="hair" style="margin: 28px 0">
<div style="display: flex; flex-direction: column; gap: 14px">
${order.items.map(it => `<div style="display: flex; justify-content: space-between; gap: 16px; text-align: left"><span style="font: 400 14px/1.4 Manrope, sans-serif; color: #DCD7CD">${esc(it.brand)} — ${esc(it.name)}, ${it.vol} мл × ${it.qty}</span><span class="num" style="font: 500 14px/1.4 Manrope, sans-serif; white-space: nowrap">${rub(it.sum)}</span></div>`).join('')}
<div style="display: flex; justify-content: space-between; align-items: baseline; padding-top: 10px; border-top: 1px solid rgba(245,241,232,.08)"><span style="font: 600 15px/1 Manrope, sans-serif">Итого</span><span class="num" style="font: 600 24px/1 Manrope, sans-serif; color: #E5D1A1">${rub(order.total)}</span></div>
</div></div>
<div style="display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; margin-top: 40px"><a href="/" class="btn">Вернуться на главную</a><a href="/catalog" class="btn-ghost">Продолжить покупки</a></div>
</div>`;
  $('#ok-title')?.focus({ preventScroll: true });
}

function render() {
  const priced = priceCart(products);
  if (!priced.items.length) { emptyView(); return; }
  ss.del(LAST_KEY);
  formView(priced);
}

try {
  products = await getProducts();
  const dropped = cart.reconcile(products);
  const last = ss.get(LAST_KEY);
  if (!cart.count() && last?.order) successView(last);   // перезагрузка страницы после успешной заявки
  else render();
  if (dropped.length) toast({ kind: 'bad', title: 'Корзина обновлена', text: 'Некоторых позиций больше нет в наличии', ttl: 5000 });
} catch {
  fatal(root, 'Не удалось загрузить оформление', 'Мы не можем получить актуальные цены. Корзина сохранена — обновите страницу.');
}
