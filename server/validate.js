// Валидация и нормализация полей заявки. Всё, что пришло с клиента, считается недоверенным.

const METHODS = new Set(['telegram', 'whatsapp', 'call']);
const CTRL = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u2028\\u2029\\u202A-\\u202E\\u2066-\\u2069]', 'g');

const clean = (v, max) => String(v ?? '').replace(CTRL, '').replace(/[ \t]+/g, ' ').trim().slice(0, max);

/** Российский номер → +7 XXX XXX-XX-XX. Возвращает null, если номер не похож на корректный. */
export function normalizePhone(value) {
  let d = String(value ?? '').replace(/\D/g, '');
  if (d.length === 11 && (d[0] === '8' || d[0] === '7')) d = '7' + d.slice(1);
  else if (d.length === 10 && d[0] === '9') d = '7' + d;
  if (!/^7\d{10}$/.test(d)) return null;
  return `+7 ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
}

export function validateOrder(body) {
  const errors = {};
  const out = {};

  out.name = clean(body.name, 60);
  if (out.name.length < 2) errors.name = 'Укажите имя';

  const phoneRaw = String(body.phone ?? '');
  if (!phoneRaw.replace(/\D/g, '').length) errors.phone = 'Укажите номер телефона';
  else {
    out.phone = normalizePhone(phoneRaw);
    if (!out.phone) errors.phone = 'Номер выглядит неполным — нужно 11 цифр';
  }

  out.city = clean(body.city, 80);
  if (out.city.length < 2) errors.city = 'Укажите город для доставки';

  out.method = String(body.method ?? '');
  if (!METHODS.has(out.method)) errors.method = 'Выберите способ связи';

  out.contact = clean(body.contact, 80);
  out.comment = String(body.comment ?? '').replace(CTRL, '').replace(/\r\n?/g, '\n').trim().slice(0, 500);

  const clientId = String(body.clientOrderId ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) errors.clientOrderId = 'Не удалось создать заявку, обновите страницу';
  out.clientId = clientId.toLowerCase();

  // honeypot: настоящие пользователи это поле не видят и не заполняют
  out.spam = String(body.website ?? '').length > 0;

  return { ok: Object.keys(errors).length === 0, errors, value: out };
}
