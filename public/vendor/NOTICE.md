# Сторонние компоненты (загружаются только в админке, при вырезании флакона)

| Файл | Что это | Источник | Лицензия |
|---|---|---|---|
| `ort/ort.wasm.min.js`, `ort/ort-wasm-simd.wasm` | ONNX Runtime Web 1.17.3 — запуск нейросети в браузере | https://github.com/microsoft/onnxruntime (npm `onnxruntime-web`) | MIT |
| `models/u2netp.onnx` | U²-Net-P — лёгкая модель выделения предмета (4,6 МБ) | https://github.com/xuebinqin/U-2-Net, файл из релиза https://github.com/danielgatis/rembg/releases/tag/v0.0.0 | Apache-2.0 |

Подход «ONNX Runtime + U²-Net в браузере» повторяет проект [rembg](https://github.com/danielgatis/rembg) (MIT).
Всё работает на стороне покупателя/админа: фото никуда не отправляются.
