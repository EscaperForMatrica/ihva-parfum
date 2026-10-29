// Поиск по фото для покупателей: сфотографировать флакон → похожие ароматы из каталога.
import { $, esc, svg, cardHTML, bindCards, site, waLink } from './core.js';
import { features, similarity } from './visual.js';

let index = null;
const loadIndex = async () => (index ??= await (await fetch('/api/visual')).json());

export function initPhotoSearch(getProducts) {
  const btn = $('#photo-btn'), file = $('#photo-file');
  if (!btn || !file) return;
  btn.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files[0]; file.value = '';
    if (f) run(f, getProducts());
  });
}

async function run(f, products) {
  const el = document.createElement('div');
  el.className = 'ps-back';
  el.innerHTML = `<div class="ps" role="dialog" aria-modal="true" aria-label="Поиск по фото">
<div class="ps-head"><b>Поиск по фото</b><button type="button" class="ibtn" data-close aria-label="Закрыть">${svg('close')}</button></div>
<div class="ps-body"><div class="ps-q"><img alt="Ваше фото"><div><p class="ps-status" role="status">Готовим распознавание…</p><p class="small" style="margin:0">При первом поиске загружается нейросеть (около 15 МБ), потом — быстро. Фото не покидает ваше устройство.</p></div></div>
<div class="ps-res" hidden></div></div></div>`;
  document.body.append(el); document.body.classList.add('lock');
  const close = () => { el.remove(); document.body.classList.remove('lock'); };
  el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-close]')) close(); });
  addEventListener('keydown', function onKey(e) { if (e.key === 'Escape') { close(); removeEventListener('keydown', onKey); } });
  const status = t => { const s = el.querySelector('.ps-status'); if (s) s.textContent = t; };
  el.querySelector('.ps-q img').src = URL.createObjectURL(f);

  try {
    const bmp = await createImageBitmap(f);
    status('Ищем флакон на фото…');
    const [q, idx] = await Promise.all([features(bmp), loadIndex()]);
    const byId = new Map(products.map(p => [p.id, p]));
    const ranked = idx.filter(r => byId.has(r.id)).map(r => ({ p: byId.get(r.id), s: similarity(q, r.v) })).sort((a, b) => b.s - a.s).slice(0, 4);
    if (!ranked.length) { status('Поиск по фото пока не настроен — каталог ещё не проиндексирован.'); return; }
    const sure = ranked[0].s >= 0.55;
    status(sure ? 'Похоже, это:' : 'Точного совпадения нет — вот самые похожие ароматы:');
    const res = el.querySelector('.ps-res');
    res.hidden = false;
    res.innerHTML = `<div class="cgrid ps-grid">${ranked.map(r => `<div class="ps-item"><span class="ps-score">${Math.round(r.s * 100)}%</span>${cardHTML(r.p)}</div>`).join('')}</div>
<p class="small ps-help">Не нашли свой аромат? ${site.whatsapp ? `<a href="${esc(waLink('Здравствуйте! Ищу аромат, пришлю фото флакона.'))}" target="_blank" rel="noopener">Отправьте фото менеджеру в WhatsApp</a> — подскажем.` : 'Напишите менеджеру — подскажем.'}</p>`;
    bindCards(res, () => products);
  } catch (err) {
    console.error(err);
    status('Не удалось распознать фото в этом браузере. Попробуйте другое фото или поиск по названию.');
  }
}
