// Выделение предмета нейросетью U²-Net-P прямо в браузере (ONNX Runtime Web, WebAssembly).
// Модель и рантайм лежат на нашем сервере (/vendor), грузятся только когда нужны. Фото никуда не отправляются.
// Подход как в проекте rembg (https://github.com/danielgatis/rembg).
const SIZE = 320;
const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];
let session = null, loading = null;

const loadScript = src => new Promise((res, rej) => {
  if (window.ort) return res();
  const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Не удалось загрузить нейросеть'));
  document.head.append(s);
});

/** Загружает рантайм и модель (≈15 МБ, один раз). */
export function loadMatting() {
  loading ??= (async () => {
    await loadScript('/vendor/ort/ort.wasm.min.js');
    ort.env.wasm.wasmPaths = '/vendor/ort/';
    ort.env.wasm.numThreads = 1;      // без SharedArrayBuffer — работает на любом хостинге
    ort.env.wasm.proxy = false;
    session = await ort.InferenceSession.create('/vendor/models/u2netp.onnx', { executionProviders: ['wasm'] });
  })().catch(e => { loading = null; throw e; });
  return loading;
}

/** Возвращает { alpha: Uint8Array (0–255), w, h } — «насколько пиксель похож на предмет», в координатах всего снимка. */
export async function subjectAlpha(bmp) {
  await loadMatting();
  const cv = document.createElement('canvas'); cv.width = cv.height = SIZE;
  const c = cv.getContext('2d', { willReadFrequently: true }); c.imageSmoothingQuality = 'high';
  c.drawImage(bmp, 0, 0, SIZE, SIZE);
  const px = c.getImageData(0, 0, SIZE, SIZE).data, n = SIZE * SIZE;
  let max = 1; for (let i = 0; i < n; i++) max = Math.max(max, px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
  const input = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) input[k * n + i] = (px[i * 4 + k] / max - MEAN[k]) / STD[k];
  const out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, SIZE, SIZE]) });
  const pred = out[session.outputNames[0]].data;
  let lo = Infinity, hi = -Infinity; for (let i = 0; i < n; i++) { lo = Math.min(lo, pred[i]); hi = Math.max(hi, pred[i]); }
  const alpha = new Uint8Array(n), span = hi - lo || 1;
  for (let i = 0; i < n; i++) {
    const v = (pred[i] - lo) / span;
    alpha[i] = Math.round(255 * Math.min(1, Math.max(0, (v - 0.3) / 0.4)));   // чуть «подтягиваем» контраст края
  }
  return { alpha, w: SIZE, h: SIZE };
}

/** Рамка предмета (в координатах исходника) по маске. */
export function alphaBox(m, W, H) {
  let x0 = m.w, y0 = m.h, x1 = -1, y1 = -1;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.alpha[y * m.w + x] > 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const sx = W / m.w, sy = H / m.h;
  return { x: x0 * sx, y: y0 * sy, w: (x1 - x0 + 1) * sx, h: (y1 - y0 + 1) * sy };
}
