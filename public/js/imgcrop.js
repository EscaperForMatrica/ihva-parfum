// Авто-обрезка фото флакона: находит предмет на снимке и предлагает кадр 4:5 вокруг него.
// Всё считается в браузере (без сервера и библиотек). Кадр можно подвинуть и изменить масштаб.
import { subjectAlpha, alphaBox } from './matting.js';

const RATIO = 0.8;          // ширина / высота кадра (как у карточек магазина)
const OUT_W = 1000;         // ширина готового фото, px (не больше исходного)

/** Ищет предмет: отличие от фона по краям снимка + контуры → крупнейшая связная область → рамка. */
export function detectSubject(bmp) {
  const W = bmp.width, H = bmp.height, k = 200 / Math.max(W, H);
  const w = Math.max(8, Math.round(W * k)), h = Math.max(8, Math.round(H * k));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;

  // цвет фона — медиана по рамке снимка
  const ring = Math.max(2, Math.round(Math.min(w, h) * 0.06)), ch = [[], [], []];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x < ring || x >= w - ring || y < ring || y >= h - ring) { const i = (y * w + x) * 4; ch[0].push(d[i]); ch[1].push(d[i + 1]); ch[2].push(d[i + 2]); }
  }
  const med = a => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
  const bg = ch.map(med);

  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  const score = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, p = i * 4;
    const dist = Math.hypot(d[p] - bg[0], d[p + 1] - bg[1], d[p + 2] - bg[2]);
    const gx = lum[i + 1] - lum[i - 1], gy = lum[i + w] - lum[i - w];
    // предмет чаще всего ближе к центру кадра — слегка усиливаем центр и ослабляем края
    const nx = x / w - 0.5, ny = y / h - 0.5, centre = 0.55 + 0.45 * Math.exp(-(nx * nx + ny * ny) / 0.09);
    score[i] = (dist + 1.5 * Math.hypot(gx, gy)) * centre;
  }

  // порог по Оцу
  const hist = new Array(256).fill(0); let max = 1;
  for (const v of score) max = Math.max(max, v);
  for (const v of score) hist[Math.min(255, Math.round(v / max * 255))]++;
  const total = w * h; let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sB = 0, wB = 0, best = 0, thr = 40;
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (!wB) continue; const wF = total - wB; if (!wF) break;
    sB += i * hist[i]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2;
    if (v > best) { best = v; thr = i; }
  }
  let mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = score[i] / max * 255 > thr ? 1 : 0;

  // смыкаем разрывы (стекло, этикетка, крышка), затем берём крупнейшую связную область
  for (let r = 0; r < 3; r++) {
    const m2 = new Uint8Array(mask);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (mask[i] || mask[i - 1] || mask[i + 1] || mask[i - w] || mask[i + w]) m2[i] = 1;
    }
    mask = m2;
  }
  const seen = new Uint8Array(w * h); let bestC = null; const comps = [];
  const stack = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || seen[s]) continue;
    let area = 0, x0 = w, y0 = h, x1 = 0, y1 = 0; stack.push(s); seen[s] = 1;
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i / w) | 0; area++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const j of [i - 1, i + 1, i - w, i + w]) if (j >= 0 && j < w * h && mask[j] && !seen[j] && Math.abs((j % w) - x) <= 1) { seen[j] = 1; stack.push(j); }
    }
    const cx = (x0 + x1) / 2 / w, cy = (y0 + y1) / 2 / h;
    const centrality = 1 - Math.hypot(cx - 0.5, cy - 0.5);
    // учитываем и площадь рамки: контур прозрачного флакона важнее одной этикетки внутри него
    const val = Math.sqrt(area * (x1 - x0 + 1) * (y1 - y0 + 1)) * Math.max(0.2, centrality);
    comps.push({ x0, y0, x1, y1, area, s });
    if (!bestC || val > bestC.val) bestC = { val, x0, y0, x1, y1, area, s };
  }
  if (!bestC) return null;
  // присоединяем соседние части предмета (крышку, горлышко), которые отделились от основной области
  const gap = Math.max(w, h) * 0.07, parts = [bestC];
  for (const c of comps) {
    if (c === bestC || c.area < w * h * 0.002) continue;
    if (c.x0 <= bestC.x1 + gap && c.x1 >= bestC.x0 - gap && c.y0 <= bestC.y1 + gap && c.y1 >= bestC.y0 - gap) parts.push(c);
  }
  bestC = { ...bestC, parts, x0: Math.min(...parts.map(c => c.x0)), y0: Math.min(...parts.map(c => c.y0)), x1: Math.max(...parts.map(c => c.x1)), y1: Math.max(...parts.map(c => c.y1)) };
  const frac = (bestC.x1 - bestC.x0 + 1) * (bestC.y1 - bestC.y0 + 1) / (w * h);
  if (frac < 0.03 || frac > 0.97) return null;       // ничего внятного — отдадим центр-кроп
  return { x: bestC.x0 / k, y: bestC.y0 / k, w: (bestC.x1 - bestC.x0 + 1) / k, h: (bestC.y1 - bestC.y0 + 1) / k, mask: subjectMask(mask, w, h, bestC) };
}

/** Маска предмета: выбранная область, дыры (прозрачное стекло) закрашены построчно, края чуть сжаты. */
function subjectMask(mask, w, h, c) {
  const comp = new Uint8Array(w * h), stack = c.parts.map(p => p.s); stack.forEach(i => { comp[i] = 1; });
  while (stack.length) {
    const i = stack.pop(), x = i % w;
    for (const j of [i - 1, i + 1, i - w, i + w]) if (j >= 0 && j < w * h && mask[j] && !comp[j] && Math.abs((j % w) - x) <= 1) { comp[j] = 1; stack.push(j); }
  }
  const filled = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let a = -1, b = -1;
    for (let x = 0; x < w; x++) if (comp[y * w + x]) { if (a < 0) a = x; b = x; }
    if (a >= 0) filled.fill(1, y * w + a, y * w + b + 1);
  }
  // сжимаем маску: она была расширена, и по краю остался бы резкий ореол фона
  const n = Math.max(1, Math.min(3, Math.floor(Math.min(c.x1 - c.x0, c.y1 - c.y0) / 8)));
  let cur = filled;
  for (let it = 0; it < n; it++) {
    const nx = new Uint8Array(cur);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (cur[i] && !(cur[i - 1] && cur[i + 1] && cur[i - w] && cur[i + w])) nx[i] = 0;
    }
    cur = nx;
  }
  return { data: cur, w, h };
}

/** Маска «вручную»: скруглённый прямоугольник по области флакона (в том же низком разрешении, что и автомаска). */
function rectMask(W, H, reg) {
  const k = 200 / Math.max(W, H), w = Math.max(8, Math.round(W * k)), h = Math.max(8, Math.round(H * k));
  const x0 = reg.x * k, y0 = reg.y * k, x1 = (reg.x + reg.w) * k, y1 = (reg.y + reg.h) * k, rad = Math.min(x1 - x0, y1 - y0) * 0.14;
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = x + 0.5, py = y + 0.5;
    if (px < x0 || px > x1 || py < y0 || py > y1) continue;
    const cx = Math.min(Math.max(px, x0 + rad), x1 - rad), cy = Math.min(Math.max(py, y0 + rad), y1 - rad);
    if (Math.hypot(px - cx, py - cy) <= rad) data[y * w + x] = 1;
  }
  return { data, w, h };
}

/** Размытие без ctx.filter (его нет в Safari): уменьшаем и растягиваем обратно. */
function softCopy(src, w, h, factor) {
  let cur = src;
  for (const f of [factor, factor * 0.6]) {
    const t = document.createElement('canvas'); t.width = Math.max(2, Math.round(w / f)); t.height = Math.max(2, Math.round(h / f));
    const c = t.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(cur, 0, 0, t.width, t.height);
    const u = document.createElement('canvas'); u.width = w; u.height = h;
    const d = u.getContext('2d'); d.imageSmoothingQuality = 'high'; d.drawImage(t, 0, 0, w, h);
    cur = u;
  }
  return cur;
}

/** Рисует фрагмент снимка src (в координатах исходника) размером ow×oh; при strength > 0 фон вне предмета размыт. */
export function compose(bmp, subject, strength, src, ow, oh, dim = 0, studio = false) {
  const base = document.createElement('canvas'); base.width = ow; base.height = oh;
  const bc = base.getContext('2d'); bc.imageSmoothingQuality = 'high';
  bc.drawImage(bmp, src.x, src.y, src.w, src.h, 0, 0, ow, oh);
  if (!subject?.mask || (strength <= 0 && dim <= 0 && !studio)) return base;

  let blurred;
  if (studio) {   // фон магазина: тёмный графит с мягким золотистым свечением
    blurred = document.createElement('canvas'); blurred.width = ow; blurred.height = oh;
    const g = blurred.getContext('2d'), grad = g.createRadialGradient(ow / 2, oh * 0.4, 0, ow / 2, oh * 0.4, Math.max(ow, oh) * 0.8);
    grad.addColorStop(0, '#2a2620'); grad.addColorStop(0.55, '#14120f'); grad.addColorStop(1, '#0a0a09');
    g.fillStyle = grad; g.fillRect(0, 0, ow, oh);
  } else {
    blurred = softCopy(base, ow, oh, 2 + strength / 100 * 22 * Math.max(0.5, ow / 600));
  }
  if (dim > 0 && !studio) { const bg = blurred.getContext('2d'); bg.fillStyle = `rgba(6,6,6,${dim / 100})`; bg.fillRect(0, 0, ow, oh); }   // приглушаем фон, чтобы флакон выделялся
  // мягкая маска предмета в координатах результата
  const m = subject.mask, mc = document.createElement('canvas'); mc.width = m.w; mc.height = m.h;
  const mctx = mc.getContext('2d'), img = mctx.createImageData(m.w, m.h);
  for (let i = 0; i < m.w * m.h; i++) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = m.alpha ? m.alpha[i] : (m.data[i] ? 255 : 0); }
  mctx.putImageData(img, 0, 0);
  const sc = ow / src.w, W = bmp.width, H = bmp.height;
  const soft = document.createElement('canvas'); soft.width = ow; soft.height = oh;
  const sctx = soft.getContext('2d'); sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(mc, 0, 0, m.w, m.h, (0 - src.x) * sc, (0 - src.y) * sc, W * sc, H * sc);
  const feathered = m.alpha ? soft : softCopy(soft, ow, oh, Math.max(2, ow / 90));            // растушёвка края
  const sharp = document.createElement('canvas'); sharp.width = ow; sharp.height = oh;
  const shc = sharp.getContext('2d'); shc.drawImage(base, 0, 0);
  shc.globalCompositeOperation = 'destination-in'; shc.drawImage(feathered, 0, 0);
  const out = document.createElement('canvas'); out.width = ow; out.height = oh;
  const oc = out.getContext('2d'); oc.drawImage(blurred, 0, 0); oc.drawImage(sharp, 0, 0);
  return out;
}

/** Кадр 4:5 вокруг найденного предмета (с полями), в пределах снимка. */
export function frameFor(W, H, box) {
  const maxW = Math.min(W, H * RATIO);
  let cw = maxW, cx = W / 2, cy = H / 2;
  if (box) {
    const need = Math.max(box.w * 1.22, box.h * 1.18 * RATIO);   // предмет + ~10 % полей
    cw = Math.min(maxW, Math.max(need, maxW * 0.3));
    cx = box.x + box.w / 2; cy = box.y + box.h / 2;
  }
  const chh = cw / RATIO;
  return clamp({ x: cx - cw / 2, y: cy - chh / 2, w: cw }, W, H);
}
const clamp = (r, W, H) => ({ w: r.w, x: Math.min(Math.max(0, r.x), W - r.w), y: Math.min(Math.max(0, r.y), H - r.w / RATIO) });

/** Окно обрезки. Возвращает JPEG-Blob или null, если пользователь отменил. */
export function cropImage(file) {
  return new Promise(async (resolve, reject) => {
    let bmp;
    try { bmp = await createImageBitmap(file); } catch { reject(new Error('Не удалось открыть картинку')); return; }
    const W = bmp.width, H = bmp.height, maxW = Math.min(W, H * RATIO);
    const box = detectSubject(bmp);
    let r = frameFor(W, H, box);
    const auto = () => { r = frameFor(W, H, box); sync(); };

    const el = document.createElement('div');
    el.className = 'crop-back';
    el.innerHTML = `<div class="crop" role="dialog" aria-modal="true" aria-label="Обрезка фото">
<div class="crop-head"><b>Обрезка фото</b><span class="hint">${box ? 'Флакон найден автоматически. ' : 'Флакон не удалось найти — выбран центр. '}Можно подвинуть кадр.</span></div>
<div class="crop-stage"><canvas></canvas></div>
<label class="crop-zoom"><span>Масштаб кадра</span><input type="range" min="30" max="100" value="100" data-r="zoom"></label>
<div class="crop-blur"><label class="crop-chk"><input type="checkbox" data-r="blurOn"> Размыть фон, чтобы флакон был виднее</label>
<div data-r="blurRow" hidden class="crop-blur-in"><label class="crop-zoom"><span>Сила размытия</span><input type="range" min="10" max="100" value="70" data-r="blur"></label>
<label class="crop-zoom"><span>Затемнение фона</span><input type="range" min="0" max="80" value="35" data-r="dim"></label>
<div class="seg2 seg3" role="radiogroup" aria-label="Контур флакона"><button type="button" data-c="ai">Нейросеть</button><button type="button" data-c="auto" ${box ? '' : 'disabled'}>Простой авто</button><button type="button" data-c="manual">Вручную</button></div>
<p class="hint" data-r="aiStatus" style="margin:0" hidden></p>
<div class="seg2" role="radiogroup" aria-label="Что делать с фоном"><button type="button" data-bg="blur" class="on">Размыть фон</button><button type="button" data-bg="studio">Тёмный фон магазина</button></div>
<div data-r="regionRow" class="crop-blur-in"><p class="hint" style="margin:0">Перетащите пунктирную рамку на флакон и подгоните размер.</p><label class="crop-zoom"><span>Ширина</span><input type="range" min="8" max="100" data-r="rw"></label><label class="crop-zoom"><span>Высота</span><input type="range" min="8" max="100" data-r="rh"></label></div></div></div>
<div class="crop-act"><button type="button" class="btn-ghost sm" data-a="auto">Найти заново</button><button type="button" class="btn-ghost sm" data-a="full">По центру</button><span class="sp"></span><button type="button" class="btn-ghost" data-a="cancel">Отмена</button><button type="button" class="btn" data-a="ok">Готово</button></div></div>`;
    document.body.append(el);
    const cv = el.querySelector('canvas'), ctx = cv.getContext('2d'), zoom = el.querySelector('[data-r="zoom"]');
    const blurOn = el.querySelector('[data-r="blurOn"]'), blurRow = el.querySelector('[data-r="blurRow"]'), blurR = el.querySelector('[data-r="blur"]');
    const regionRow = el.querySelector('[data-r="regionRow"]'), rwR = el.querySelector('[data-r="rw"]'), rhR = el.querySelector('[data-r="rh"]');
    const coverage = box?.mask ? box.mask.data.reduce((a, v) => a + v, 0) / box.mask.data.length : 0;
    let contour = !box || coverage > 0.5 ? 'manual' : 'auto';      // ai | auto | manual
    let aiMask = null, studio = false, touched = false;

    let region = box && coverage <= 0.5 ? { x: box.x, y: box.y, w: box.w, h: box.h } : { x: W * 0.3, y: H * 0.15, w: W * 0.4, h: H * 0.7 };
    const subject = () => (contour === 'manual' ? { mask: rectMask(W, H, region) } : contour === 'ai' && aiMask ? { mask: aiMask } : box);
    const syncRegionUi = () => { rwR.value = Math.round(region.w / W * 100); rhR.value = Math.round(region.h / H * 100); };
    syncRegionUi();
    const paintContour = () => { el.querySelectorAll('[data-c]').forEach(x => x.classList.toggle('on', x.dataset.c === contour)); regionRow.hidden = contour !== 'manual'; };
    paintContour();
    let preview = null;
    const dimR = el.querySelector('[data-r="dim"]');
    const strength = () => (blurOn?.checked ? Number(blurR.value) : 0);
    const dimVal = () => (blurOn?.checked ? Number(dimR.value) : 0);
    const rebuild = () => { preview = strength() ? compose(bmp, subject(), strength(), { x: 0, y: 0, w: W, h: H }, cv.width, cv.height, dimVal(), studio) : null; sync(); };
    let raf = 0; const rebuildSoon = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(rebuild); };
    const maxH = Math.min(innerHeight * 0.55, 560), maxWpx = Math.min(innerWidth - 56, 640);
    const s = Math.min(maxWpx / W, maxH / H);
    cv.width = Math.round(W * s); cv.height = Math.round(H * s);

    function sync() {
      zoom.value = Math.round(r.w / maxW * 100);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(preview || bmp, 0, 0, cv.width, cv.height);
      const x = r.x * s, y = r.y * s, w = r.w * s, h = r.w / RATIO * s;
      ctx.fillStyle = 'rgba(8,8,8,.62)';
      ctx.fillRect(0, 0, cv.width, y); ctx.fillRect(0, y + h, cv.width, cv.height - y - h);
      ctx.fillRect(0, y, x, h); ctx.fillRect(x + w, y, cv.width - x - w, h);
      ctx.strokeStyle = '#C6A15B'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      if (blurOn?.checked && contour === 'manual') { ctx.save(); ctx.setLineDash([6, 5]); ctx.strokeStyle = '#E5D1A1'; ctx.lineWidth = 2; ctx.strokeRect(region.x * s, region.y * s, region.w * s, region.h * s); ctx.restore(); }
      ctx.strokeStyle = 'rgba(229,209,161,.35)'; ctx.lineWidth = 1;
      for (let i = 1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x + w * i / 3, y); ctx.lineTo(x + w * i / 3, y + h); ctx.moveTo(x, y + h * i / 3); ctx.lineTo(x + w, y + h * i / 3); ctx.stroke(); }
    }
    sync();

    let drag = null;
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      const ix = e.offsetX / s, iy = e.offsetY / s;
      const inRegion = blurOn?.checked && contour === 'manual' && ix >= region.x && ix <= region.x + region.w && iy >= region.y && iy <= region.y + region.h;
      drag = { px: e.offsetX, py: e.offsetY, x: inRegion ? region.x : r.x, y: inRegion ? region.y : r.y, region: inRegion };
    });
    cv.addEventListener('pointermove', e => {
      if (!drag) return;
      const nx = drag.x + (e.offsetX - drag.px) / s, ny = drag.y + (e.offsetY - drag.py) / s;
      if (drag.region) { region.x = Math.min(Math.max(0, nx), W - region.w); region.y = Math.min(Math.max(0, ny), H - region.h); rebuildSoon(); }
      else { touched = true; r = clamp({ w: r.w, x: nx, y: ny }, W, H); sync(); }
    });
    cv.addEventListener('pointerup', () => { drag = null; });
    zoom.addEventListener('input', () => {
      const cx = r.x + r.w / 2, cy = r.y + r.w / RATIO / 2, nw = maxW * Number(zoom.value) / 100;
      r = clamp({ w: nw, x: cx - nw / 2, y: cy - nw / RATIO / 2 }, W, H); sync();
    });

    blurOn?.addEventListener('change', () => { blurRow.hidden = !blurOn.checked; rebuild(); });
    el.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.c === 'ai') return useAi();
      contour = b.dataset.c; paintContour(); rebuild();
    }));
    const resizeRegion = () => {
      const cx = region.x + region.w / 2, cy = region.y + region.h / 2;
      region.w = W * Number(rwR.value) / 100; region.h = H * Number(rhR.value) / 100;
      region.x = Math.min(Math.max(0, cx - region.w / 2), W - region.w); region.y = Math.min(Math.max(0, cy - region.h / 2), H - region.h);
      rebuildSoon();
    };
    rwR.addEventListener('input', resizeRegion); rhR.addEventListener('input', resizeRegion);
    blurR?.addEventListener('input', rebuildSoon); dimR?.addEventListener('input', rebuildSoon);

    // нейросеть: грузится один раз (~15 МБ), потом выделение занимает 1–3 секунды
    const aiStatus = el.querySelector('[data-r="aiStatus"]');
    const say = t => { aiStatus.hidden = !t; aiStatus.textContent = t || ''; };
    async function useAi() {
      if (aiMask) { contour = 'ai'; paintContour(); rebuild(); return; }
      say('Загружаем нейросеть (один раз, около 15 МБ) и выделяем флакон…');
      el.querySelectorAll('[data-c]').forEach(x => { x.disabled = true; });
      try {
        const m = await subjectAlpha(bmp);
        aiMask = m; contour = 'ai';
        const hint = el.querySelector('.crop-head .hint'); if (hint) hint.textContent = 'Флакон выделен нейросетью. Можно подвинуть кадр.';
        const ab = alphaBox(m, W, H);
        if (ab && !touched) { r = frameFor(W, H, ab); }
        say('');
      } catch (err) {
        say('Нейросеть не запустилась в этом браузере — используется простой режим. ' + (err?.message || ''));
      } finally {
        el.querySelectorAll('[data-c]').forEach(x => { x.disabled = x.dataset.c === 'auto' && !box; });
        paintContour(); rebuild();
      }
    }
    el.querySelectorAll('[data-bg]').forEach(b => b.addEventListener('click', () => {
      studio = b.dataset.bg === 'studio';
      el.querySelectorAll('[data-bg]').forEach(x => x.classList.toggle('on', x === b));
      blurR.closest('.crop-zoom').hidden = studio; dimR.closest('.crop-zoom').hidden = studio;
      rebuild();
    }));
    // первое включение размытия сразу запускает нейросеть — это самый точный контур
    blurOn?.addEventListener('change', () => { if (blurOn.checked && !aiMask && !aiTried) { aiTried = true; useAi(); } });
    let aiTried = false;

    const done = v => { removeEventListener('keydown', onKey); el.remove(); v === undefined ? resolve(null) : resolve(v); };
    const onKey = e => { if (e.key === 'Escape') done(null); };
    addEventListener('keydown', onKey);
    el.addEventListener('click', async e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (e.target === el || a === 'cancel') return done(null);
      if (a === 'auto') return auto();
      if (a === 'full') { r = clamp({ w: maxW, x: 0, y: 0 }, W, H); r = { w: maxW, x: (W - maxW) / 2, y: (H - maxW / RATIO) / 2 }; return sync(); }
      if (a === 'ok') {
        const ow = Math.min(OUT_W, Math.round(r.w)), oh = Math.round(ow / RATIO);
        const out = document.createElement('canvas'); out.width = ow; out.height = oh;
        const o = out.getContext('2d'); o.imageSmoothingQuality = 'high';
        o.drawImage(compose(bmp, subject(), strength(), { x: r.x, y: r.y, w: r.w, h: r.w / RATIO }, ow, oh, dimVal(), studio), 0, 0);
        out.toBlob(b => done(b), 'image/jpeg', 0.92);
      }
    });
  });
}
