// Юнит-тесты сервера (#8): подпись Telegram, запись и очередь, видимость, машины, HTTP. ТЗ — docs/server.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { verifyInitData, signInitData } from '../server/auth.mjs';
import { openDb, upsertEvents, touchUser, stateFor, register, unregister, saveCar, deleteCar } from '../server/core.mjs';
import { createServer, loadEvents, parseOrganizers } from '../server/main.mjs';

const TOKEN = '123456:TEST-token-for-unit-tests';
const TODAY = new Date('2026-11-09T12:00:00');
const EV = { id: 'ev', type: 'Заезд', name: 'Тест', date: '2026-11-13', time: '10:00', place: 'Башня', cap: 2 };
const PAST = { id: 'old', type: 'Заезд', name: 'Прошлый', date: '2026-10-01', time: '10:00', place: 'Башня', cap: 5 };
const CAR = { brand: 'Mercedes-Benz', model: 'E 55 AMG', year: '2001', color: 'серебристый', plate: 'А 001 АА 777', showPlate: false };

function setup(events = [EV, PAST]) {
  const db = openDb();
  upsertEvents(db, events);
  const user = (id, first_name = 'U' + id, username = 'u' + id) => { touchUser(db, { id, first_name, username }); return saveCar(db, id, CAR, { today: TODAY }).id; };
  return { db, user };
}

// ---------- подпись ----------
test('initData: верная подпись — пользователь; чужой токен, подделка, просрочка — null', () => {
  const u = { id: 42, first_name: 'Иван', username: 'ivan' };
  const s = signInitData(u, TOKEN);
  assert.equal(verifyInitData(s, TOKEN).id, 42);
  assert.equal(verifyInitData(s, '999:other'), null, 'чужой токен');
  assert.equal(verifyInitData(s.replace('%22id%22%3A42', '%22id%22%3A43'), TOKEN), null, 'подменён id');
  const old = signInitData(u, TOKEN, { authDate: Math.floor(Date.now() / 1000) - 25 * 3600 });
  assert.equal(verifyInitData(old, TOKEN), null, 'старше суток');
  assert.equal(verifyInitData('', TOKEN), null);
  assert.equal(verifyInitData('user=%7B%7D&hash=zz', TOKEN), null);
});

// ---------- запись и очередь ----------
test('запись: места есть — on, кончились — wait; повтор и чужая машина — ошибка', () => {
  const { db, user } = setup();
  const a = user(1), b = user(2), c = user(3);
  assert.equal(register(db, 1, 'ev', a, TODAY).status, 'on');
  assert.equal(register(db, 2, 'ev', b, TODAY).status, 'on');
  assert.equal(register(db, 3, 'ev', c, TODAY).status, 'wait');
  assert.equal(register(db, 1, 'ev', a, TODAY).error, 'already');
  assert.equal(register(db, 1, 'old', a, TODAY).error, 'past');
  assert.equal(register(db, 1, 'nope', a, TODAY).error, 'not-found');
  touchUser(db, { id: 9, first_name: 'Без машины' });
  assert.equal(register(db, 9, 'ev', a, TODAY).error, 'no-car');
  user(4);
  assert.equal(register(db, 4, 'ev', a, TODAY).error, 'bad-car', 'чужая машина');
  const s = stateFor(db, 3);
  const ev = s.events.find((e) => e.id === 'ev');
  assert.equal(ev.others.length, 2);
  assert.equal(ev.myWaitPos, 1);
  assert.equal(s.regs.ev.status, 'wait');
});

test('отмена записи продвигает первого из очереди; выход из очереди — нет', () => {
  const { db, user } = setup();
  const cars = [1, 2, 3, 4].map((id) => user(id));
  cars.forEach((c, i) => register(db, i + 1, 'ev', c, TODAY, 1000 + i));
  assert.deepEqual(unregister(db, 4, 'ev'), { was: 'wait', promoted: 0 });
  assert.deepEqual(unregister(db, 1, 'ev'), { was: 'on', promoted: 1 });
  assert.equal(stateFor(db, 3).regs.ev.status, 'on', 'третий стал записанным');
  assert.equal(unregister(db, 1, 'ev').error, 'not-registered');
});

test('лимит вырос в events.json — очередь продвигается при старте', () => {
  const { db, user } = setup();
  [1, 2, 3].forEach((id) => register(db, id, 'ev', user(id), TODAY, id));
  upsertEvents(db, [{ ...EV, cap: 3 }, PAST]);
  assert.equal(stateFor(db, 3).regs.ev.status, 'on');
});

test('гонка за последнее место: из двух на одно место один on, второй wait', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wdb-'));
  try {
    const file = path.join(dir, 'db.sqlite');
    const db1 = openDb(file), db2 = openDb(file);
    upsertEvents(db1, [{ ...EV, cap: 1 }]);
    touchUser(db1, { id: 1, first_name: 'A' }); touchUser(db1, { id: 2, first_name: 'B' });
    const a = saveCar(db1, 1, CAR, { today: TODAY }).id, b = saveCar(db1, 2, CAR, { today: TODAY }).id;
    const r = [register(db1, 1, 'ev', a, TODAY), register(db2, 2, 'ev', b, TODAY)].map((x) => x.status).sort();
    assert.deepEqual(r, ['on', 'wait']);
    db1.close(); db2.close();
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// ---------- видимость ----------
test('имена и машины видят записанные, стоящие в очереди и организаторы; остальные — только фото', () => {
  const { db, user } = setup();
  register(db, 1, 'ev', user(1, 'Анна', 'anna'), TODAY);
  saveCar(db, 1, { ...CAR, showPlate: true }, { id: stateFor(db, 1).cars[0].id, today: TODAY });
  user(2);
  const stranger = stateFor(db, 2).events.find((e) => e.id === 'ev').others[0];
  assert.deepEqual(stranger, { name: '', tg: '', initials: 'А', car: { photo: '' } });
  const org = stateFor(db, 2, { organizers: [2] });
  assert.equal(org.organizer, true);
  const seen = org.events.find((e) => e.id === 'ev').others[0];
  assert.equal(seen.name, 'Анна');
  assert.equal(seen.tg, '@anna');
  assert.equal(seen.car.plate, 'А 001 АА 777', 'номер виден — владелец разрешил');
  register(db, 2, 'ev', stateFor(db, 2).cars[0].id, TODAY);
  assert.equal(stateFor(db, 2).events.find((e) => e.id === 'ev').others[0].name, 'Анна');
});

test('госномер скрыт, если владелец не разрешил', () => {
  const { db, user } = setup();
  register(db, 1, 'ev', user(1), TODAY);
  register(db, 2, 'ev', user(2), TODAY);
  assert.equal(stateFor(db, 2).events.find((e) => e.id === 'ev').others[0].car.plate, null);
});

// ---------- машины ----------
test('машины: создать, изменить, удалить; в записи на будущее — нельзя; чужую — нельзя', () => {
  const { db, user } = setup();
  const a = user(1);
  assert.equal(saveCar(db, 1, { ...CAR, model: '' }, { today: TODAY }).error, 'invalid');
  assert.equal(saveCar(db, 1, { ...CAR, model: 'CLS 63' }, { id: a, today: TODAY }).id, a);
  assert.equal(stateFor(db, 1).cars[0].model, 'CLS 63');
  user(2);
  assert.equal(saveCar(db, 2, CAR, { id: a, today: TODAY }).error, 'not-found', 'чужую не изменить');
  assert.equal(deleteCar(db, 2, a, TODAY).error, 'not-found', 'чужую не удалить');
  register(db, 1, 'ev', a, TODAY);
  assert.deepEqual(deleteCar(db, 1, a, TODAY), { error: 'in-use', event: 'Тест' });
  unregister(db, 1, 'ev');
  assert.deepEqual(deleteCar(db, 1, a, TODAY), { ok: true });
  assert.equal(stateFor(db, 1).cars.length, 0);
  assert.equal(stateFor(db, 1).lastCarId, null);
});

test('машину из записи на прошедшее мероприятие удалить можно', () => {
  const { db, user } = setup();
  const a = user(1);
  register(db, 1, 'old', a, new Date('2026-09-01T12:00:00'));
  assert.deepEqual(deleteCar(db, 1, a, TODAY), { ok: true });
});

// ---------- данные и HTTP ----------
test('events.json: одно мероприятие — Yellow Night 13 ноября, 19:00, 50 мест, без машины (#10)', async () => {
  const list = await loadEvents();
  assert.equal(list.length, 1);
  const e = list[0];
  assert.deepEqual([e.id, e.name, e.type, e.date, e.time, e.cap, e.noCar, e.peopleOrganizerOnly], ['yellow-night', 'WDB CLUB • Yellow Night Edition', 'Встреча', '2026-11-13', '19:00', 50, true, true]);
  assert.match(e.address, /Нижняя Сыромятническая/);
  assert.equal(e.others, undefined, 'выдуманных участников нет');
});

test('мероприятие без машины: запись без машин, машина не сохраняется, в списке — без машины (#10)', () => {
  const NC = { ...EV, id: 'nc', noCar: true };
  const { db, user } = setup([EV, NC]);
  touchUser(db, { id: 1, first_name: 'Без', last_name: 'Машины', username: 'nocar' });
  assert.equal(register(db, 1, 'nc', null, TODAY).status, 'on');
  assert.equal(register(db, 1, 'ev', null, TODAY).error, 'no-car', 'обычное — по-прежнему с машиной');
  const a = user(2);
  assert.equal(register(db, 2, 'nc', a, TODAY).status, 'on', 'переданная машина игнорируется');
  const s2 = stateFor(db, 2);
  assert.equal(s2.regs.nc.carId, null);
  assert.equal(s2.lastCarId, null, 'запись без машины не меняет машину по умолчанию');
  assert.deepEqual(s2.events.find((e) => e.id === 'nc').others, [{ name: 'Без Машины', tg: '@nocar', car: null }]);
  assert.equal(s2.events.find((e) => e.id === 'nc').noCar, true);
  user(3);
  assert.deepEqual(stateFor(db, 3).events.find((e) => e.id === 'nc').others[0], { name: '', tg: '', initials: 'БМ', car: null });
  assert.deepEqual(deleteCar(db, 2, a, TODAY), { ok: true }, 'машину можно удалить — она не в записи');
});

test('список видит только организатор: остальным — только числа (#23)', () => {
  const OO = { ...EV, id: 'oo', cap: 2, noCar: true, peopleOrganizerOnly: true };
  const { db, user } = setup([EV, OO]);
  for (const id of [1, 2, 3, 4]) touchUser(db, { id, first_name: 'Участник', last_name: String(id), username: 'u' + id });
  assert.equal(register(db, 1, 'oo', null, TODAY).status, 'on');
  assert.equal(register(db, 2, 'oo', null, TODAY).status, 'on');
  assert.equal(register(db, 3, 'oo', null, TODAY).status, 'wait');
  const hidden = (e) => [e.others, e.waitOthers, e.othersCount, e.waitCount];
  // записан, в очереди, не записан — ни имён, ни инициалов, ни фото
  assert.deepEqual(hidden(stateFor(db, 1).events.find((e) => e.id === 'oo')), [[], [], 1, 1]);
  const w = stateFor(db, 3).events.find((e) => e.id === 'oo');
  assert.deepEqual(hidden(w), [[], [], 2, 0]);
  assert.equal(w.myWaitPos, 1);
  assert.deepEqual(hidden(stateFor(db, 4).events.find((e) => e.id === 'oo')), [[], [], 2, 1]);
  assert.doesNotMatch(JSON.stringify(stateFor(db, 4)), /Участник [123]|@u[123]|initials/, 'в ответе нет данных других участников');
  // организатор — полный список
  const org = stateFor(db, 9, { organizers: [9] }).events.find((e) => e.id === 'oo');
  assert.deepEqual(org.others.map((p) => p.tg), ['@u1', '@u2']);
  assert.deepEqual(org.waitOthers.map((p) => p.tg), ['@u3']);
  assert.equal(org.othersCount, undefined);
  // настройка выключена — как раньше
  register(db, 5, 'ev', user(5), TODAY);
  const plain = stateFor(db, 6).events.find((e) => e.id === 'ev');
  assert.equal(plain.peopleOrganizerOnly, false);
  assert.equal(plain.others.length, 1);
  assert.equal(plain.othersCount, undefined);
});

test('миграция: база без people_org_only получает столбец, настройка читается (#23)', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wdb-'));
  try {
    const file = path.join(dir, 'old.db');
    const { DatabaseSync } = await import('node:sqlite');
    const old = new DatabaseSync(file);
    old.exec(`CREATE TABLE events (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL, gather TEXT, place TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', descr TEXT NOT NULL DEFAULT '', cap INTEGER NOT NULL, cover TEXT, partner_id TEXT, no_car INTEGER NOT NULL DEFAULT 0);
      INSERT INTO events (id, type, name, date, time, cap) VALUES ('ev', 'Заезд', 'Тест', '2026-11-13', '10:00', 5);`);
    old.close();
    const db = openDb(file);
    upsertEvents(db, [{ ...EV, id: 'ev' }, { ...EV, id: 'oo', peopleOrganizerOnly: true }]);
    touchUser(db, { id: 1, first_name: 'Иван' });
    const evs = stateFor(db, 1).events;
    assert.deepEqual(evs.map((e) => [e.id, e.peopleOrganizerOnly]).sort(), [['ev', false], ['oo', true]]);
    db.close();
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('мероприятие убрали из events.json: без записей удаляется, с записями остаётся (#10)', () => {
  const { db, user } = setup([EV, PAST, { ...EV, id: 'gone' }]);
  register(db, 1, 'ev', user(1), TODAY);
  assert.deepEqual(upsertEvents(db, [PAST]), ['ev']);
  assert.deepEqual(stateFor(db, 1).events.map((e) => e.id).sort(), ['ev', 'old']);
});

test('миграция: база прежней схемы (car_id NOT NULL, без no_car) открывается и принимает запись без машины (#10)', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wdb-'));
  try {
    const file = path.join(dir, 'old.db');
    const { DatabaseSync } = await import('node:sqlite');
    const old = new DatabaseSync(file);
    old.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL DEFAULT '', username TEXT NOT NULL DEFAULT '', photo_url TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, seen_at INTEGER NOT NULL, last_car_id TEXT);
      CREATE TABLE events (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL, gather TEXT, place TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', descr TEXT NOT NULL DEFAULT '', cap INTEGER NOT NULL, cover TEXT, partner_id TEXT);
      CREATE TABLE cars (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, brand TEXT NOT NULL, model TEXT NOT NULL, year INTEGER NOT NULL, color TEXT NOT NULL DEFAULT '', plate TEXT NOT NULL DEFAULT '', show_plate INTEGER NOT NULL DEFAULT 0, photo TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, deleted_at INTEGER);
      CREATE TABLE regs (event_id TEXT NOT NULL, user_id INTEGER NOT NULL, car_id TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (event_id, user_id));
      INSERT INTO users VALUES (5, 'Старый', '', '', 1, 1, NULL);
      INSERT INTO events (id, type, name, date, time, cap) VALUES ('ev', 'Заезд', 'Тест', '2026-11-13', '10:00', 5);
      INSERT INTO cars (id, user_id, brand, model, year, created_at) VALUES ('c1', 5, 'MB', 'E', 2001, 1);
      INSERT INTO regs VALUES ('ev', 5, 'c1', 'on', 1);`);
    old.close();
    const db = openDb(file);
    upsertEvents(db, [{ ...EV, id: 'nc', noCar: true }]);
    touchUser(db, { id: 6, first_name: 'Новый' });
    assert.equal(register(db, 6, 'nc', null, TODAY).status, 'on');
    assert.equal(stateFor(db, 5).regs.ev.carId, 'c1', 'старая запись сохранилась');
    db.close();
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('организаторы из переменной окружения', () => {
  assert.deepEqual(parseOrganizers(' 1, 22 ,x,,-3'), [1, 22]);
  assert.deepEqual(parseOrganizers(undefined), []);
});

test('HTTP: без подписи 401; запись, фото, удаление машины через API', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wdb-'));
  const db = openDb();
  upsertEvents(db, [EV]);
  const server = createServer({ db, botToken: TOKEN, dataDir: dir, allowToday: true, log: { error() {} } });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${server.address().port}/api/`;
  const auth = { authorization: 'tma ' + signInitData({ id: 7, first_name: 'Иван', last_name: 'Петров', username: 'ivan' }, TOKEN), 'x-today': '2026-11-09' };
  const call = (method, p, body) => fetch(base + p, { method, headers: { ...auth, 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then(async (r) => ({ code: r.status, ...(await r.json()) }));
  try {
    assert.equal((await fetch(base + 'state')).status, 401);
    assert.equal((await fetch(base + 'state', { headers: { authorization: 'tma ' + signInitData({ id: 7 }, 'bad:token') } })).status, 401);
    const s = await call('GET', 'state');
    assert.equal(s.me.name, 'Иван Петров');
    assert.equal(s.me.tg, '@ivan');
    const jpeg = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
    const c = await call('POST', 'cars', { ...CAR, photoData: jpeg });
    assert.equal(c.code, 200);
    assert.match(c.state.cars[0].photo, /^photos\/[0-9a-f-]{36}\.jpg$/);
    assert.equal((await call('POST', 'cars', { ...CAR, year: '1700' })).errors.year, 'Год от 1886 до 2027');
    const r = await call('POST', 'events/ev/register', { carId: c.id });
    assert.equal(r.status, 'on');
    assert.equal(r.state.regs.ev.carId, c.id);
    assert.equal((await call('DELETE', `cars/${c.id}`)).error, 'in-use');
    assert.equal((await call('DELETE', 'events/ev/register')).was, 'on');
    assert.equal((await call('DELETE', `cars/${c.id}`)).code, 200);
    assert.equal((await call('GET', 'nope')).code, 404);
  } finally {
    server.close(); db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
