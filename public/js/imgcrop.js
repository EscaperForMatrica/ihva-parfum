// Авто-обрезка фото флакона: находит предмет на снимке и предлагает кадр 4:5 вокруг него.
// Всё считается в браузере (без сервера и библиотек). Кадр можно подвинуть и изменить масштаб.
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
  const seen = new Uint8Array(w * h); let bestC = null;
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
    const val = area * Math.max(0.2, centrality);
    if (!bestC || val > bestC.val) bestC = { val, x0, y0, x1, y1, area };
  }
  if (!bestC) return null;
  const frac = (bestC.x1 - bestC.x0 + 1) * (bestC.y1 - bestC.y0 + 1) / (w * h);
  if (frac < 0.03 || frac > 0.97) return null;       // ничего внятного — отдадим центр-кроп
  return { x: bestC.x0 / k, y: bestC.y0 / k, w: (bestC.x1 - bestC.x0 + 1) / k, h: (bestC.y1 - bestC.y0 + 1) / k };
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
<label class="crop-zoom"><span>Масштаб кадра</span><input type="range" min="30" max="100" value="100"></label>
<div class="crop-act"><button type="button" class="btn-ghost sm" data-a="auto">Найти заново</button><button type="button" class="btn-ghost sm" data-a="full">По центру</button><span class="sp"></span><button type="button" class="btn-ghost" data-a="cancel">Отмена</button><button type="button" class="btn" data-a="ok">Готово</button></div></div>`;
    document.body.append(el);
    const cv = el.querySelector('canvas'), ctx = cv.getContext('2d'), zoom = el.querySelector('input');
    const maxH = Math.min(innerHeight * 0.55, 560), maxWpx = Math.min(innerWidth - 56, 640);
    const s = Math.min(maxWpx / W, maxH / H);
    cv.width = Math.round(W * s); cv.height = Math.round(H * s);

    function sync() {
      zoom.value = Math.round(r.w / maxW * 100);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
      const x = r.x * s, y = r.y * s, w = r.w * s, h = r.w / RATIO * s;
      ctx.fillStyle = 'rgba(8,8,8,.62)';
      ctx.fillRect(0, 0, cv.width, y); ctx.fillRect(0, y + h, cv.width, cv.height - y - h);
      ctx.fillRect(0, y, x, h); ctx.fillRect(x + w, y, cv.width - x - w, h);
      ctx.strokeStyle = '#C6A15B'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      ctx.strokeStyle = 'rgba(229,209,161,.35)'; ctx.lineWidth = 1;
      for (let i = 1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x + w * i / 3, y); ctx.lineTo(x + w * i / 3, y + h); ctx.moveTo(x, y + h * i / 3); ctx.lineTo(x + w, y + h * i / 3); ctx.stroke(); }
    }
    sync();

    let drag = null;
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); drag = { px: e.offsetX, py: e.offsetY, x: r.x, y: r.y }; });
    cv.addEventListener('pointermove', e => { if (!drag) return; r = clamp({ w: r.w, x: drag.x + (e.offsetX - drag.px) / s, y: drag.y + (e.offsetY - drag.py) / s }, W, H); sync(); });
    cv.addEventListener('pointerup', () => { drag = null; });
    zoom.addEventListener('input', () => {
      const cx = r.x + r.w / 2, cy = r.y + r.w / RATIO / 2, nw = maxW * Number(zoom.value) / 100;
      r = clamp({ w: nw, x: cx - nw / 2, y: cy - nw / RATIO / 2 }, W, H); sync();
    });

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
        o.drawImage(bmp, r.x, r.y, r.w, r.w / RATIO, 0, 0, ow, oh);
        out.toBlob(b => done(b), 'image/jpeg', 0.92);
      }
    });
  });
}
