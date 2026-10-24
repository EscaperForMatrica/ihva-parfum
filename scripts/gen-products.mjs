// One-off generator for data/products.json. The JSON is the source of truth afterwards — edit it directly.
// Prices marked "design" come from the approved design; the rest follow the volume ladder seen in the design
// (3 мл → 50 мл) and MUST be confirmed by the shop owner before launch.
import fs from 'node:fs';

const LADDER = { 3: 1, 5: 1.6, 6: 1.8, 10: 2.8, 30: 7.5, 50: 11.6 };
const round10 = n => Math.round(n / 10) * 10;
const ladder = (base, only, overrides = {}) =>
  Object.keys(LADDER).map(Number).map(vol => ({
    vol,
    price: overrides[vol] ?? round10(base * LADDER[vol]),
    available: only.includes(vol),
    priceSource: overrides[vol] ? 'design' : (vol === 3 ? 'design' : 'estimate')
  }));

const FAMILY_ADJ = { 'Восточные': 'Восточный', 'Древесные': 'Древесный', 'Цветочные': 'Цветочный', 'Цитрусовые': 'Цитрусовый' };
const ALL = [3, 5, 6, 10, 30, 50];

const raw = [
  { id: 'xerjoff', brand: 'Xerjoff', name: 'Purple Accento', type: 'Eau de Parfum', gender: 'Унисекс', cats: ['Женская', 'Унисекс', 'Нишевые'], family: 'Цветочные', familyNote: 'Цветочно-фруктовый', popularity: 1, tag: 'Нишевый',
    description: 'Современный, чувственный и притягательный аромат для тех, кто ценит индивидуальность и стиль. Композиция, полная загадки и шарма.',
    notes: { top: 'Бергамот, гиацинт', heart: 'Черника, жасмин самбак', base: 'Мускус, амбра, древесные ноты' },
    seasons: { 'Весна': 3, 'Лето': 2, 'Осень': 5, 'Зима': 3 }, longevity: 'до 10 часов', audience: 'Для мужчин и женщин, которые выбирают страсть, уверенность и харизму.',
    brandInfo: 'Итальянская парфюмерия, известная своими роскошными ингредиентами и уникальными флаконами.',
    variants: ladder(990, [3, 5, 10, 30, 50], { 3: 990, 5: 1590, 10: 2790, 30: 7490, 50: 11490 }) },
  { id: 'chanel', brand: 'Chanel', name: 'Bleu de Chanel', type: 'Eau de Parfum', gender: 'Мужской', cats: ['Мужская'], family: 'Древесные', popularity: 2, tag: 'Классика',
    variants: ladder(790, [3, 5, 10, 30, 50], { 3: 790 }) },
  { id: 'mancera', brand: 'Mancera', name: 'Red Tobacco', type: 'Eau de Parfum', gender: 'Унисекс', cats: ['Женская', 'Унисекс', 'Нишевые'], family: 'Восточные', popularity: 3, tag: 'Нишевый',
    variants: ladder(690, ALL, { 3: 690, 5: 1090 }) },
  { id: 'dg', brand: 'Dolce & Gabbana', name: 'K by Dolce & Gabbana', type: '', gender: 'Мужской', cats: ['Мужская'], family: 'Цитрусовые', popularity: 4, image: null,
    variants: ladder(590, ALL, { 3: 590 }) },
  { id: 'clive', brand: 'Clive Christian', name: 'XXI Art Deco Amberwood', type: 'Noble Collection', gender: 'Унисекс', cats: ['Женская', 'Унисекс', 'Нишевые'], family: 'Восточные', popularity: 5, tag: 'Нишевый',
    variants: ladder(1490, [3, 5, 6, 10, 30], { 3: 1490 }) },
  { id: 'amber', brand: 'French Avenue', name: 'Amber Empire', type: '', gender: 'Унисекс', cats: ['Женская', 'Унисекс', 'Нишевые'], family: 'Восточные', popularity: 6, tag: 'Нишевый',
    variants: ladder(490, ALL, { 3: 490 }) },
  { id: 'genyum', brand: 'Genyum', name: 'Painter', type: 'Eau de Parfum', gender: 'Унисекс', cats: ['Женская', 'Унисекс', 'Нишевые'], family: 'Древесные', popularity: 7, tag: 'Нишевый',
    variants: ladder(790, ALL, { 3: 790 }) },
  { id: 'hormone', brand: 'Hormone Paris', name: 'Hormone', type: '', gender: 'Унисекс', cats: ['Женская', 'Унисекс'], family: 'Древесные', popularity: 8, image: null,
    variants: ladder(890, [], { 3: 890 }) }
];

const products = raw.map(p => {
  const hasPhoto = p.image !== null;
  return {
    id: p.id, brand: p.brand, name: p.name, type: p.type, gender: p.gender, cats: p.cats,
    family: p.family, familyNote: p.familyNote || FAMILY_ADJ[p.family], popularity: p.popularity, tag: p.tag || '',
    image: hasPhoto ? `/images/products/${p.id}.jpg` : null,
    description: p.description || `${p.brand} ${p.name} — в разливе: от пробника 3 мл до большого флакона. Подробности о нотах и стойкости подскажет менеджер.`,
    notes: p.notes || null, seasons: p.seasons || null, longevity: p.longevity || null,
    audience: p.audience || null, brandInfo: p.brandInfo || null,
    variants: p.variants
  };
});
fs.writeFileSync(new URL('../data/products.json', import.meta.url), JSON.stringify(products, null, 2) + '\n');
console.log(products.length, 'products');
