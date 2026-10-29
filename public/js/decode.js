// Открывает фото из галереи или камеры. createImageBitmap есть не везде (старые iPhone) и не все форматы
// поддерживает — тогда пробуем обычный <img>. Возвращает объект с width/height, который можно рисовать на canvas.
export async function decodeImage(blob) {
  try { return await createImageBitmap(blob); } catch { /* пробуем иначе */ }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new Error('Этот формат фото не открывается в браузере. Выберите фото в JPG или PNG (на iPhone: Настройки → Камера → Форматы → «Наиболее совместимый»).');
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
