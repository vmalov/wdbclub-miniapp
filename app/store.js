// Мои машины и записи — в localStorage браузера (прототип, см. docs/registration.md).
// Хранилище может быть недоступно (приватный режим, запрет сайта) — тогда работаем в памяти.
export const KEY = 'wdb-stage1';
export const empty = () => ({ cars: [], regs: {}, lastCarId: null });

export function load(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return empty();
    const s = JSON.parse(raw);
    return { ...empty(), ...s, cars: Array.isArray(s.cars) ? s.cars : [], regs: s.regs && typeof s.regs === 'object' ? s.regs : {} };
  } catch {
    return empty();
  }
}

/** Сохранить. Возвращает false, если не удалось (например, переполнено фото). */
export function save(state, storage = globalThis.localStorage) {
  try {
    storage?.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
