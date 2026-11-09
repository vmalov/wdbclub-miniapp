// Данные прототипа первого этапа (#2): мероприятия, партнёры, вымышленные участники.
// Сервера нет — см. допущения в docs/registration.md. Фото — с сайта клуба, номера скрыты.

const NAMES = ['Анна Кузнецова', 'Михаил Соколов', 'Дмитрий Волков', 'Сергей Орлов', 'Елена Морозова', 'Алексей Ким', 'Ольга Белова',
  'Павел Лебедев', 'Наталья Зайцева', 'Игорь Козлов', 'Татьяна Новикова', 'Андрей Фёдоров', 'Мария Павлова', 'Кирилл Семёнов',
  'Юлия Голубева', 'Роман Виноградов', 'Евгений Богданов', 'Ксения Воробьёва', 'Артём Медведев', 'Виктор Захаров'];
const CARS = [
  { brand: 'Mercedes-AMG', model: 'SLS AMG', year: 2011, color: 'белый', photo: 'car-sls' },
  { brand: 'Mercedes-AMG', model: 'AMG GT C Roadster', year: 2019, color: 'жёлтый', photo: 'car-amg-gt' },
  { brand: 'Mercedes-Benz', model: 'E 430', year: 2000, color: 'чёрный', photo: 'car-w210-black' },
  { brand: 'Mercedes-Benz', model: 'E 55 AMG', year: 2001, color: 'серебристый', photo: 'car-w210' },
];
const PLATES = ['М 707 ММ 799', null, 'К 212 ОР 777', null, 'В 555 ВВ 750', null, null, 'Т 100 ТТ 197'];

/** n вымышленных участников, разных для каждого мероприятия (seed — сдвиг по спискам). */
function people(n, seed) {
  return Array.from({ length: n }, (_, i) => {
    const k = i + seed;
    const name = NAMES[k % NAMES.length];
    return { name, tg: '@' + name.split(' ')[1].toLowerCase().replace(/ё/g, 'e').replace(/[^a-zа-я]/g, '').replace(/[а-я]/g, (c) => TR[c] || '') + '_' + (k % 9 + 1), car: { ...CARS[k % CARS.length], plate: PLATES[k % PLATES.length] } };
  });
}
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };

// Пока одно мероприятие-заглушка (#6). Прежний набор — в tests/fixtures/data.js (тесты).
export const PARTNERS = [];

export const EVENTS = [
  { id: 'voyage', type: 'Заезд', name: 'Вояж', date: '2026-11-13', time: '10:00', gather: '9:30', place: 'КВЦ «Башня»', address: 'Волоколамское ш., 71Ас1', desc: 'Путешествие по живописным дорогам Подмосковья на любимых автомобилях. Маршрут и точка обеда — на брифинге перед стартом.', cap: 30, partnerId: null, cover: 'event-road', others: people(12, 0), waitOthers: [] },
];

export const partnerOf = (event) => PARTNERS.find((p) => p.id === event.partnerId) || null;
export const img = (name) => `app/img/${name}.jpg`;
