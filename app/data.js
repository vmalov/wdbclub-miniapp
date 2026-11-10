// Данные приложения (#8): мероприятия и участники приходят с сервера (GET /api/state, docs/server.md),
// здесь — только живая ссылка на них для экранов и партнёры (в первом выпуске их нет).
// e2e подменяет модуль тестовым (tests/fixtures/data.js) ради партнёров; интерфейс тот же.

export let EVENTS = [];
/** Мероприятия из ответа сервера. Импорт EVENTS в других модулях видит новое значение (live binding). */
export function setEvents(list) { EVENTS = list; }

export const PARTNERS = [];

export const partnerOf = (event) => PARTNERS.find((p) => p.id === event.partnerId) || null;
/** Фото: имя файла из app/img или путь с сервера (photos/<uuid>.jpg). */
export const img = (name) => (!name ? '' : name.includes('/') ? name : `app/img/${name}.jpg`);
