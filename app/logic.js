// Правила первого этапа (#2) — чистые функции без DOM и хранилища.
// Описание — docs/registration.md. Тесты — tests/logic.test.mjs.

export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
export const WD_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

// ---------- даты ----------
export const parseDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
export const dayKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
export const isPast = (event, today) => parseDate(event.date) < startOfDay(today);

/** Ближайшие мероприятия: от сегодня и позже, по дате и времени. */
export function upcoming(events, today) {
  return events.filter((e) => !isPast(e, today)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

/** Мероприятия одного дня. */
export const eventsOn = (events, key) => events.filter((e) => e.date === key);

/** Сетка месяца с понедельника: 5–6 недель по 7 дней. */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - lead);
  const days = new Date(year, month + 1, 0).getDate();
  const weeks = Math.ceil((lead + days) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { date: d, key: dayKey(d), out: d.getMonth() !== month };
  });
}

// ---------- запись ----------
/** Статус моей записи: 'on' | 'wait' | null. */
export const myStatus = (state, eventId) => state.regs[eventId]?.status ?? null;

/** Занято мест = вымышленные участники + я, если записан. */
export const seatsTaken = (event, state) => event.others.length + (myStatus(state, event.id) === 'on' ? 1 : 0);

/** Места есть (для меня, если я ещё не записан). */
export const hasSeats = (event, state) => seatsTaken(event, state) < event.cap;

/** Моё место в очереди (1 — первый) или null. */
export const waitPosition = (event, state) => (myStatus(state, event.id) === 'wait' ? (event.waitOthers?.length ?? 0) + 1 : null);

/** Сколько людей в очереди передо мной, если встану сейчас. */
export const queueAhead = (event) => event.waitOthers?.length ?? 0;

/** Что показывать на кнопке: 'past' | 'on' | 'wait' | 'free' | 'full'. */
export function eventState(event, state, today) {
  const st = myStatus(state, event.id);
  if (st) return st;
  if (isPast(event, today)) return 'past';
  return hasSeats(event, state) ? 'free' : 'full';
}

/** Тег в списке: 'on' | 'wait' | 'full' | null. */
export function listTag(event, state, today) {
  const s = eventState(event, state, today);
  return s === 'on' || s === 'wait' || s === 'full' ? s : null;
}

/** Машина по умолчанию при записи: последняя использованная, иначе первая. */
export function defaultCarId(state) {
  if (state.lastCarId && state.cars.some((c) => c.id === state.lastCarId)) return state.lastCarId;
  return state.cars[0]?.id ?? null;
}

/**
 * Записаться (или встать в очередь, если мест нет). Возвращает новое состояние и итог.
 * Ошибки: 'no-car' (машин нет), 'bad-car' (машины нет в профиле), 'past', 'already'.
 */
export function register(state, event, carId, today) {
  if (!state.cars.length) return { state, error: 'no-car' };
  if (!state.cars.some((c) => c.id === carId)) return { state, error: 'bad-car' };
  if (isPast(event, today)) return { state, error: 'past' };
  if (myStatus(state, event.id)) return { state, error: 'already' };
  const status = hasSeats(event, state) ? 'on' : 'wait';
  const next = { ...state, lastCarId: carId, regs: { ...state.regs, [event.id]: { status, carId, at: today.getTime() } } };
  return { state: next, status };
}

/** Отменить запись или выйти из очереди. */
export function unregister(state, eventId) {
  if (!state.regs[eventId]) return state;
  const regs = { ...state.regs };
  delete regs[eventId];
  return { ...state, regs };
}

/** Видит ли участник имена и машины других (записан или в очереди). */
export const canSeeParticipants = (state, eventId) => myStatus(state, eventId) !== null;

/** Мои записи на будущие мероприятия, ближайшие первыми. */
export function myRegs(events, state, today) {
  return upcoming(events, today).filter((e) => myStatus(state, e.id));
}

// ---------- машины ----------
export const BRAND_DEFAULT = 'Mercedes-Benz';

/** Проверка формы машины. Возвращает { ok, errors, car } — car с очищенными значениями. */
export function validateCar(input, today) {
  const maxYear = today.getFullYear() + 1;
  const t = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');
  const car = {
    brand: t(input.brand).slice(0, 40),
    model: t(input.model).slice(0, 40),
    year: t(input.year),
    color: t(input.color).slice(0, 30),
    plate: t(input.plate).toUpperCase().slice(0, 15),
    showPlate: Boolean(input.showPlate),
  };
  const errors = {};
  if (!car.brand) errors.brand = 'Укажите марку';
  if (!car.model) errors.model = 'Укажите модель';
  if (!car.year) errors.year = 'Укажите год';
  else if (!/^\d{4}$/.test(car.year) || +car.year < 1886 || +car.year > maxYear) errors.year = `Год от 1886 до ${maxYear}`;
  if (!errors.year) car.year = +car.year;
  return { ok: Object.keys(errors).length === 0, errors, car };
}

/** Госномер → { n, r }: номер и регион (последние 2–3 цифры после пробела). */
export function splitPlate(plate) {
  const p = String(plate ?? '').trim().toUpperCase();
  if (!p) return null;
  const m = p.match(/^(.*?)\s*(\d{2,3})$/);
  if (m && m[1] && /[A-ZА-ЯЁ]/.test(m[1])) return { n: m[1].trim(), r: m[2] };
  return { n: p, r: '' };
}

/** Сохранить машину: новая получает id, существующая заменяется. */
export function upsertCar(state, car, id, makeId) {
  if (id && state.cars.some((c) => c.id === id)) {
    return { state: { ...state, cars: state.cars.map((c) => (c.id === id ? { ...c, ...car, id } : c)) }, id };
  }
  const nid = makeId();
  return { state: { ...state, cars: [...state.cars, { ...car, id: nid }] }, id: nid };
}

// ---------- календарь (.ics) ----------
/** Файл события для «Добавить в календарь». Время — московское (+03:00), длительность 3 часа. */
export function ics(event) {
  const [h, m] = event.time.split(':').map(Number);
  const [y, mo, d] = event.date.split('-').map(Number);
  const startUtc = new Date(Date.UTC(y, mo - 1, d, h - 3, m));
  const endUtc = new Date(startUtc.getTime() + 3 * 3600 * 1000);
  const f = (dt) => dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s) => String(s).replace(/([,;\\])/g, '\\$1');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//WDB Club//mini-app//RU', 'BEGIN:VEVENT',
    `UID:${event.id}-${event.date}@wdbclub`, `DTSTAMP:${f(startUtc)}`, `DTSTART:${f(startUtc)}`, `DTEND:${f(endUtc)}`,
    `SUMMARY:${esc(event.name)}`, `LOCATION:${esc([event.place, event.address].filter(Boolean).join(', '))}`,
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
}

// ---------- тексты ----------
export const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
};
export const initials = (name) => String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
