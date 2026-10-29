// Поиск по фото для покупателей: сфотографировать флакон → похожие ароматы из каталога.
import { $, esc, svg, cardHTML, bindCards, site, waLink } from './core.js';
import { features, similarity } from './visual.js';

let index = null;
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9а-яё]+/g, ' ').trim();
/** Ключ аромата: название + первое слово бренда («Essential Parfums» и «Essential parfums Paris» — один бренд). */
export const perfumeKey = p => `${norm(p.brand).split(' ')[0]}|${norm(p.name)}`;
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
    const scored = idx.filter(r => byId.has(r.id)).map(r => ({ p: byId.get(r.id), s: similarity(q, r.v) }));
    if (!scored.length) { status('Поиск по фото пока не настроен — каталог ещё не проиндексирован.'); return; }
    // один аромат часто заведён дважды — разливом и целым флаконом (у них разные фото).
    // Ищем аромат, а показываем все его форматы.
    const groups = new Map();
    for (const p of products) { const k = perfumeKey(p); if (!groups.has(k)) groups.set(k, { items: [], s: 0 }); groups.get(k).items.push(p); }
    for (const r of scored) { const g = groups.get(perfumeKey(r.p)); g.s = Math.max(g.s, r.s); }
    const top = [...groups.values()].filter(g => g.s > 0).sort((a, b) => b.s - a.s).slice(0, 4);
    const sure = top[0].s >= 0.55;
    status(sure ? 'Похоже, это:' : 'Точного совпадения нет — вот самые похожие ароматы:');
    const res = el.querySelector('.ps-res');
    res.hidden = false;
    const fmt = p => (p.variants.some(v => v.vol > 0) ? 'Разлив' : `Флакон ${p.bottleMl} мл`);
    const items = top.flatMap(g => g.items.sort((a, b) => fmt(b).localeCompare(fmt(a))).map(p => ({ p, s: g.s })));
    res.innerHTML = `<div class="cgrid ps-grid">${items.map(r => `<div class="ps-item"><span class="ps-score">${esc(fmt(r.p))} · ${Math.round(r.s * 100)}%</span>${cardHTML(r.p)}</div>`).join('')}</div>
<p class="small ps-help">Не нашли свой аромат? ${site.whatsapp ? `<a href="${esc(waLink('Здравствуйте! Ищу аромат, пришлю фото флакона.'))}" target="_blank" rel="noopener">Отправьте фото менеджеру в WhatsApp</a> — подскажем.` : 'Напишите менеджеру — подскажем.'}</p>`;
    bindCards(res, () => products);
  } catch (err) {
    console.error(err);
    status('Не удалось распознать фото в этом браузере. Попробуйте другое фото или поиск по названию.');
  }
}
