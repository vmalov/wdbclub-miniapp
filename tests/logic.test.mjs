// Юнит-тесты правил первого этапа (#2): docs/registration.md, docs/screens/*.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  upcoming, monthGrid, register, unregister, seatsTaken, waitPosition, eventState, listTag, canSeeParticipants, peopleHidden, queueAhead,
  defaultCarId, validateCar, splitPlate, upsertCar, ics, myRegs, plural,
} from '../app/logic.js';
import { EVENTS } from './fixtures/data.js'; // прежний набор мероприятий (#6)
import { EVENTS as APP_EVENTS, PARTNERS as APP_PARTNERS, setEvents, img } from '../app/data.js';

const TODAY = new Date(2026, 10, 9, 12); // 9 ноября 2026
const car = { id: 'c1', brand: 'Mercedes-Benz', model: 'E 55 AMG', year: 2001 };
const car2 = { id: 'c2', brand: 'Mercedes-AMG', model: 'AMG GT C', year: 2019 };
const st = (over = {}) => ({ cars: [], regs: {}, lastCarId: null, ...over });
const ev = (over = {}) => ({ id: 'e', date: '2026-11-14', time: '22:00', name: 'Заезд', place: 'Башня', others: [], waitOthers: [], cap: 3, ...over });
const people = (n) => Array.from({ length: n }, (_, i) => ({ name: 'п' + i }));

test('ближайшие — от сегодня, по дате; прошедшие не попадают', () => {
  const list = upcoming(EVENTS, TODAY).map((e) => e.id);
  assert.ok(!list.includes('autumn'));
  assert.deepEqual(list, ['night', 'dinner', 'detail', 'ny', 'ice']);
  assert.ok(upcoming([ev({ date: '2026-11-09' })], TODAY).length === 1, 'сегодняшнее остаётся');
});

test('сетка месяца с понедельника, соседние дни помечены', () => {
  const g = monthGrid(2026, 10); // ноябрь 2026: 1-е — воскресенье
  assert.equal(g.length % 7, 0);
  assert.equal(g[0].key, '2026-10-26');
  assert.ok(g[0].out);
  assert.equal(g[6].key, '2026-11-01');
  assert.ok(!g[6].out);
});

test('без машины записаться нельзя', () => {
  assert.equal(register(st(), ev(), 'c1', TODAY).error, 'no-car');
});

test('места есть — запись «on», занято растёт, отмена возвращает', () => {
  const e = ev({ others: people(2) });
  const r = register(st({ cars: [car] }), e, 'c1', TODAY);
  assert.equal(r.status, 'on');
  assert.equal(seatsTaken(e, r.state), 3);
  assert.equal(eventState(e, r.state, TODAY), 'on');
  assert.equal(listTag(e, r.state, TODAY), 'on');
  assert.equal(r.state.lastCarId, 'c1');
  const back = unregister(r.state, 'e');
  assert.equal(seatsTaken(e, back), 2);
  assert.equal(eventState(e, back, TODAY), 'free');
});

test('мест нет — лист ожидания с местом в очереди', () => {
  const e = ev({ others: people(3), waitOthers: people(2) });
  assert.equal(eventState(e, st({ cars: [car] }), TODAY), 'full');
  assert.equal(listTag(e, st(), TODAY), 'full');
  const r = register(st({ cars: [car] }), e, 'c1', TODAY);
  assert.equal(r.status, 'wait');
  assert.equal(waitPosition(e, r.state), 3);
  assert.equal(seatsTaken(e, r.state), 3, 'очередь мест не занимает');
  assert.equal(eventState(e, unregister(r.state, 'e'), TODAY), 'full');
});

test('прошедшее мероприятие — без записи', () => {
  const e = ev({ date: '2026-10-26' });
  assert.equal(eventState(e, st({ cars: [car] }), TODAY), 'past');
  assert.equal(register(st({ cars: [car] }), e, 'c1', TODAY).error, 'past');
});

test('повторная запись и чужая машина отклоняются', () => {
  const r = register(st({ cars: [car] }), ev(), 'c1', TODAY);
  assert.equal(register(r.state, ev(), 'c1', TODAY).error, 'already');
  assert.equal(register(st({ cars: [car] }), ev(), 'zzz', TODAY).error, 'bad-car');
});

test('полный список видят записанные и стоящие в очереди', () => {
  const e = ev({ others: people(3) });
  assert.equal(canSeeParticipants(st(), 'e'), false);
  const w = register(st({ cars: [car] }), e, 'c1', TODAY).state;
  assert.equal(canSeeParticipants(w, 'e'), true);
});

test('машина по умолчанию — последняя использованная, иначе первая', () => {
  assert.equal(defaultCarId(st({ cars: [car, car2] })), 'c1');
  assert.equal(defaultCarId(st({ cars: [car, car2], lastCarId: 'c2' })), 'c2');
  assert.equal(defaultCarId(st({ cars: [car], lastCarId: 'gone' })), 'c1');
});

test('проверка формы машины', () => {
  const empty = validateCar({}, TODAY);
  assert.deepEqual(empty.errors, { brand: 'Укажите марку', model: 'Укажите модель', year: 'Укажите год' });
  assert.equal(validateCar({ brand: 'MB', model: 'E', year: '1885' }, TODAY).errors.year, 'Год от 1886 до 2027');
  assert.equal(validateCar({ brand: 'MB', model: 'E', year: '2028' }, TODAY).errors.year, 'Год от 1886 до 2027');
  assert.equal(validateCar({ brand: 'MB', model: 'E', year: '20a1' }, TODAY).errors.year, 'Год от 1886 до 2027');
  const ok = validateCar({ brand: '  Mercedes-Benz ', model: 'E  55 AMG', year: '2001', plate: 'а 001 аа 777', showPlate: 1 }, TODAY);
  assert.ok(ok.ok);
  assert.deepEqual(ok.car, { brand: 'Mercedes-Benz', model: 'E 55 AMG', year: 2001, color: '', plate: 'А 001 АА 777', showPlate: true });
});

test('госномер: номер и регион', () => {
  assert.deepEqual(splitPlate('А 001 АА 777'), { n: 'А 001 АА', r: '777' });
  assert.deepEqual(splitPlate('м707мм99'), { n: 'М707ММ', r: '99' });
  assert.deepEqual(splitPlate('ABC'), { n: 'ABC', r: '' });
  assert.equal(splitPlate(''), null);
});

test('сохранение машины: новая и изменённая', () => {
  const a = upsertCar(st(), { model: 'E 55 AMG' }, null, () => 'n1');
  assert.equal(a.id, 'n1');
  const b = upsertCar(a.state, { model: 'E 55 AMG Kompressor' }, 'n1', () => 'x');
  assert.equal(b.state.cars.length, 1);
  assert.equal(b.state.cars[0].model, 'E 55 AMG Kompressor');
});

test('мои записи — только будущие, ближайшие первыми', () => {
  const s = st({ cars: [car], regs: { ice: { status: 'on', carId: 'c1' }, autumn: { status: 'on', carId: 'c1' }, night: { status: 'wait', carId: 'c1' } } });
  assert.deepEqual(myRegs(EVENTS, s, TODAY).map((e) => e.id), ['night', 'ice']);
});

test('файл календаря: московское время в UTC', () => {
  const t = ics(EVENTS.find((e) => e.id === 'night'));
  assert.match(t, /DTSTART:20261114T190000Z/);
  assert.match(t, /SUMMARY:Ночной заезд по Москве/);
  assert.match(t, /LOCATION:КВЦ «Башня»\\, Волоколамское ш.\\, 71Ас1/);
});

test('данные: лимит и вымышленная очередь согласованы', () => {
  for (const e of EVENTS) {
    assert.ok(e.others.length <= e.cap, e.id);
    if (e.waitOthers.length) assert.equal(e.others.length, e.cap, `${e.id}: очередь только при полном лимите`);
  }
});

test('очередь и организатор: место с сервера, организатор видит всех (#8)', () => {
  const e = ev({ cap: 1, others: people(1), waitOthers: people(3), myWaitPos: 2 });
  assert.equal(waitPosition(e, st({ regs: { e: { status: 'wait', carId: 'c1' } } })), 2);
  assert.equal(canSeeParticipants(st({ organizer: true }), 'e'), true);
  assert.equal(canSeeParticipants(st(), 'e'), false);
});

test('список видит только организатор: места и очередь по числам с сервера (#23)', () => {
  // сервер не-организатору присылает пустые others/waitOthers и числа othersCount/waitCount
  const e = ev({ cap: 5, peopleOrganizerOnly: true, others: [], waitOthers: [], othersCount: 4, waitCount: 0 });
  assert.equal(seatsTaken(e, st()), 4);
  assert.equal(seatsTaken(e, st({ regs: { e: { status: 'on', carId: null } } })), 5);
  assert.equal(eventState(e, st(), TODAY), 'free');
  const full = ev({ cap: 4, peopleOrganizerOnly: true, others: [], waitOthers: [], othersCount: 4, waitCount: 2 });
  assert.equal(eventState(full, st(), TODAY), 'full');
  assert.equal(queueAhead(full), 2);
  assert.equal(peopleHidden(e, st()), true);
  assert.equal(peopleHidden(e, st({ regs: { e: { status: 'on', carId: null } } })), true);
  assert.equal(peopleHidden(e, st({ organizer: true })), false);
  assert.equal(peopleHidden(ev(), st()), false); // настройка выключена — как раньше
  assert.equal(seatsTaken(ev({ others: people(2) }), st()), 2); // без чисел — по списку
});
test('склонение', () => {
  assert.equal(plural(1, 'участник', 'участника', 'участников'), 'участник');
  assert.equal(plural(2, 'участник', 'участника', 'участников'), 'участника');
  assert.equal(plural(11, 'участник', 'участника', 'участников'), 'участников');
});

test('данные приложения: мероприятия — только с сервера, фото — имя или путь (#8)', () => {
  assert.equal(APP_EVENTS.length, 0, 'в коде мероприятий нет');
  assert.equal(APP_PARTNERS.length, 0);
  setEvents([{ id: 'x' }]);
  assert.deepEqual(APP_EVENTS, [{ id: 'x' }], 'live binding');
  setEvents([]);
  assert.equal(img('car-sls'), 'app/img/car-sls.jpg');
  assert.equal(img('photos/a.jpg'), 'photos/a.jpg');
  assert.equal(img(''), '');
});
