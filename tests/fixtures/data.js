// Тестовые данные (#6): прежний набор мероприятий первого этапа — для юнит-тестов и e2e.
// В приложении не используется: e2e подменяет ими app/data.js. Интерфейс модуля — как у app/data.js.

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

export const PARTNERS = [
  { id: 'loza', mark: 'ВЛ', name: 'Винотека «Лоза»', since: 2024, about: 'Вино и бар на Пресненской набережной. Закрытые дегустации для участников Клуба.', offer: '−12% на счёт и закрытые дегустации', until: 'Бессрочно', addr: 'Пресненская наб., 8', tel: '+7 900 000-00-06', site: 'loza-wine.ru' },
  { id: 'star', mark: 'ДС', name: 'Детейлинг «Стар»', since: 2025, about: 'Детейлинг и оклейка плёнкой. Мастера работают с ЛКП Mercedes-Benz.', offer: '−15% на оклейку плёнкой', until: 'До 31 декабря 2026', addr: 'ул. Примерная, 12', tel: '+7 900 000-00-01', site: 'star-detailing.ru' },
];

export let EVENTS = [
  { id: 'autumn', type: 'Заезд', name: 'Осенний заезд', date: '2026-10-26', time: '11:00', place: 'КВЦ «Башня»', address: 'Волоколамское ш., 71Ас1', desc: 'Закрытие сезона: колонна по Новорижскому шоссе и обед за городом.', cap: 50, partnerId: null, cover: 'event-road', others: people(50, 3), waitOthers: [] },
  { id: 'night', type: 'Заезд', name: 'Ночной заезд по Москве', date: '2026-11-14', time: '22:00', gather: '21:30', place: 'КВЦ «Башня»', address: 'Волоколамское ш., 71Ас1', desc: 'Садовое кольцо, набережные, Воробьёвы горы. Финиш — кофе у партнёра.', cap: 40, partnerId: 'loza', cover: 'event-bashnya', others: people(24, 0), waitOthers: [] },
  { id: 'dinner', type: 'Встреча', name: 'Клубный ужин', date: '2026-11-21', time: '19:00', place: 'Винотека «Лоза»', address: 'Пресненская наб., 8', desc: 'Ужин участников Клуба, знакомство с новыми членами. Дресс-код smart casual.', cap: 40, partnerId: 'loza', cover: 'event-lineup', others: people(40, 5), waitOthers: people(2, 11) },
  { id: 'detail', type: 'Мастер-класс', name: 'Уход за кузовом зимой', date: '2026-11-27', time: '18:00', place: 'Детейлинг «Стар»', address: 'ул. Примерная, 12', desc: 'Как защитить ЛКП от реагентов и что делать с керамикой зимой. Мастера ответят на вопросы по вашим машинам.', cap: 15, partnerId: 'star', cover: 'event-lineup', others: people(9, 7), waitOthers: [] },
  { id: 'ny', type: 'Встреча', name: 'Новогодняя вечеринка Клуба', date: '2026-12-19', time: '20:00', place: 'Место уточняется', address: '', desc: 'Итоги года и награждение активных участников.', cap: 120, partnerId: null, cover: 'event-bashnya', others: people(57, 2), waitOthers: [] },
  { id: 'ice', type: 'Трек', name: 'Зимний трек-день на льду', date: '2027-01-24', time: '11:00', gather: '10:00', place: 'Ледовый автодром', address: 'Подмосковье', desc: 'Инструкторы и упражнения на контроль заноса. Для полноприводных и заднеприводных машин.', cap: 30, partnerId: null, cover: 'event-road', others: people(12, 9), waitOthers: [] },
];

export function setEvents(list) { EVENTS = list; }

export const partnerOf = (event) => PARTNERS.find((p) => p.id === event.partnerId) || null;
export const img = (name) => (!name ? '' : name.includes('/') ? name : `app/img/${name}.jpg`);
