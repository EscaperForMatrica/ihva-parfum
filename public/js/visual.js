// Поиск парфюма по фото. Флакон на снимке выделяет нейросеть U²-Net-P (matting.js), затем считаются признаки:
// цвет флакона (гистограмма HSV по пикселям флакона), форма (пропорции, заполненность) и рисунок
// (гистограмма направлений контуров, как HOG). Признаки товаров считаются в админке и хранятся на сервере.
import { subjectAlpha } from './matting.js';
import { decodeImage } from './decode.js';

const HB = 12, CBINS = HB * 2 * 3 + 3;          // 12 оттенков × 2 насыщенности × 3 яркости + 3 серых
const GW = 4, GH = 8, OB = 9;                    // клетки 4×8 по 8×8 px, 9 направлений
export const VEC_LEN = 2 + CBINS + GW * GH * OB; // 365

function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx / 255];
}

/** Признаки снимка → массив из VEC_LEN чисел. */
export async function features(bmp) {
  const W = bmp.width, H = bmp.height, S = 320;
  let m;
  try { m = await subjectAlpha(bmp); } catch { m = null; }
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(bmp, 0, 0, S, S);
  const px = c.getImageData(0, 0, S, S).data;
  const inside = i => (m ? m.alpha[i] > 128 : true);

  // рамка флакона
  let x0 = S, y0 = S, x1 = -1, y1 = -1, cnt = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (inside(y * S + x)) { cnt++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (cnt < S * S * 0.01) { x0 = S * 0.2; y0 = S * 0.1; x1 = S * 0.8; y1 = S * 0.9; m = null; cnt = (x1 - x0) * (y1 - y0); }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const aspect = (bh * H) / (bw * W), fill = cnt / (bw * bh);

  // цвет
  const col = new Float32Array(CBINS);
  for (let i = 0; i < S * S; i++) {
    if (!inside(i)) continue;
    const [h, s, v] = hsv(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
    const vb = Math.min(2, Math.floor(v * 3));
    if (s < 0.18 || v < 0.12) col[HB * 6 + vb]++;
    else col[(Math.floor(h / 30) % HB) * 6 + (s < 0.5 ? 0 : 3) + vb]++;
  }
  const cs = col.reduce((a, b) => a + b, 0) || 1;
  for (let i = 0; i < CBINS; i++) col[i] /= cs;

  // рисунок: флакон из исходника → 32×64 в оттенках серого, фон заменён средним
  const g = document.createElement('canvas'); g.width = GW * 8; g.height = GH * 8;
  const gc = g.getContext('2d', { willReadFrequently: true });
  gc.drawImage(bmp, x0 / S * W, y0 / S * H, bw / S * W, bh / S * H, 0, 0, g.width, g.height);
  const gp = gc.getImageData(0, 0, g.width, g.height).data, gw = g.width, gh = g.height;
  const lum = new Float32Array(gw * gh);
  for (let i = 0; i < gw * gh; i++) lum[i] = 0.299 * gp[i * 4] + 0.587 * gp[i * 4 + 1] + 0.114 * gp[i * 4 + 2];
  const hog = new Float32Array(GW * GH * OB);
  for (let y = 1; y < gh - 1; y++) for (let x = 1; x < gw - 1; x++) {
    const i = y * gw + x, dx = lum[i + 1] - lum[i - 1], dy = lum[i + gw] - lum[i - gw];
    const mag = Math.hypot(dx, dy); if (!mag) continue;
    const ang = (Math.atan2(dy, dx) * 180 / Math.PI + 180) % 180;
    hog[(Math.floor(y / 8) * GW + Math.floor(x / 8)) * OB + Math.min(OB - 1, Math.floor(ang / 20))] += mag;
  }
  const hn = Math.hypot(...hog) || 1;
  for (let i = 0; i < hog.length; i++) hog[i] /= hn;

  const out = [aspect, fill, ...col, ...hog];
  return out.map(v => Math.round(v * 10000) / 10000);
}

/** Похожесть 0..1: цвет 50 %, рисунок 30 %, форма 20 %. */
export function similarity(a, b) {
  let col = 0; for (let i = 2; i < 2 + CBINS; i++) col += Math.min(a[i], b[i]);
  let dot = 0; for (let i = 2 + CBINS; i < VEC_LEN; i++) dot += a[i] * b[i];
  const shape = Math.exp(-Math.abs(Math.log((a[0] || 1) / (b[0] || 1))) * 2) * (1 - Math.min(1, Math.abs(a[1] - b[1])));
  return 0.5 * col + 0.3 * Math.max(0, dot) + 0.2 * shape;
}

/** Открывает картинку по адресу как ImageBitmap (для индекса в админке). */
export async function bitmapFromUrl(url) {
  const blob = await (await fetch(url, { cache: 'force-cache' })).blob();
  return decodeImage(blob);
}
