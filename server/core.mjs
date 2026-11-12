// Ядро сервера (#8): база SQLite и правила записи. Без HTTP — его делает server/api.mjs.
// ТЗ — docs/server.md. Правила проверки формы и «прошло ли мероприятие» — общие с фронтом (app/logic.js).
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { validateCar, isPast } from '../app/logic.js';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL DEFAULT '', username TEXT NOT NULL DEFAULT '', photo_url TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL, seen_at INTEGER NOT NULL, last_car_id TEXT
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL, gather TEXT,
  place TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', descr TEXT NOT NULL DEFAULT '', cap INTEGER NOT NULL,
  cover TEXT, partner_id TEXT, no_car INTEGER NOT NULL DEFAULT 0, people_org_only INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cars (
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), brand TEXT NOT NULL, model TEXT NOT NULL, year INTEGER NOT NULL,
  color TEXT NOT NULL DEFAULT '', plate TEXT NOT NULL DEFAULT '', show_plate INTEGER NOT NULL DEFAULT 0, photo TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE TABLE IF NOT EXISTS regs (
  event_id TEXT NOT NULL REFERENCES events(id), user_id INTEGER NOT NULL REFERENCES users(id), car_id TEXT REFERENCES cars(id),
  status TEXT NOT NULL CHECK (status IN ('on', 'wait')), created_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS cars_user ON cars(user_id);
`;

export function openDb(file = ':memory:') {
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** Миграции базы, созданной прежней схемой (#10): мероприятие «без машины», запись без машины. */
function migrate(db) {
  const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all();
  if (!cols('events').some((c) => c.name === 'no_car')) db.exec('ALTER TABLE events ADD COLUMN no_car INTEGER NOT NULL DEFAULT 0');
  // #23: «список участников видит только организатор»
  if (!cols('events').some((c) => c.name === 'people_org_only')) db.exec('ALTER TABLE events ADD COLUMN people_org_only INTEGER NOT NULL DEFAULT 0');
  if (cols('regs').find((c) => c.name === 'car_id')?.notnull) {
    db.exec('PRAGMA foreign_keys = OFF');
    tx(db, () => db.exec(`
      CREATE TABLE regs_new (
        event_id TEXT NOT NULL REFERENCES events(id), user_id INTEGER NOT NULL REFERENCES users(id), car_id TEXT REFERENCES cars(id),
        status TEXT NOT NULL CHECK (status IN ('on', 'wait')), created_at INTEGER NOT NULL, PRIMARY KEY (event_id, user_id));
      INSERT INTO regs_new SELECT event_id, user_id, car_id, status, created_at FROM regs;
      DROP TABLE regs;
      ALTER TABLE regs_new RENAME TO regs;`));
    db.exec('PRAGMA foreign_keys = ON');
  }
}

/** Выполнить fn в транзакции BEGIN IMMEDIATE (запись и отмена атомарны). */
function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

const eventRow = (r) => ({ id: r.id, type: r.type, name: r.name, date: r.date, time: r.time, gather: r.gather || undefined, place: r.place, address: r.address, desc: r.descr, cap: r.cap, cover: r.cover, partnerId: r.partner_id || null, noCar: !!r.no_car, peopleOrganizerOnly: !!r.people_org_only });

/**
 * Мероприятия из server/events.json: добавить или обновить; после — продвинуть очереди (лимит мог вырасти).
 * Мероприятие, которого в файле больше нет, удаляется, если на него нет записей; с записями — остаётся (#10).
 * Возвращает id оставленных мероприятий, которых нет в файле.
 */
export function upsertEvents(db, list) {
  const st = db.prepare(`INSERT INTO events (id, type, name, date, time, gather, place, address, descr, cap, cover, partner_id, no_car, people_org_only)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET type=excluded.type, name=excluded.name, date=excluded.date, time=excluded.time, gather=excluded.gather,
      place=excluded.place, address=excluded.address, descr=excluded.descr, cap=excluded.cap, cover=excluded.cover, partner_id=excluded.partner_id,
      no_car=excluded.no_car, people_org_only=excluded.people_org_only`);
  return tx(db, () => {
    for (const e of list) st.run(e.id, e.type, e.name, e.date, e.time, e.gather ?? null, e.place ?? '', e.address ?? '', e.desc ?? '', e.cap, e.cover ?? null, e.partnerId ?? null, e.noCar ? 1 : 0, e.peopleOrganizerOnly ? 1 : 0);
    for (const e of list) promote(db, e.id);
    const ids = new Set(list.map((e) => e.id));
    const kept = [];
    for (const { id } of db.prepare('SELECT id FROM events').all()) {
      if (ids.has(id)) continue;
      if (db.prepare('SELECT 1 FROM regs WHERE event_id = ? LIMIT 1').get(id)) kept.push(id);
      else db.prepare('DELETE FROM events WHERE id = ?').run(id);
    }
    return kept;
  });
}

/** Пользователь из initData: создать или обновить имя, @username и фото. */
export function touchUser(db, u, now = Date.now()) {
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || (u.username ? '@' + u.username : 'Участник');
  db.prepare(`INSERT INTO users (id, name, username, photo_url, created_at, seen_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, username=excluded.username, photo_url=excluded.photo_url, seen_at=excluded.seen_at`)
    .run(u.id, name, u.username || '', u.photo_url || '', now, now);
}

const carOut = (c) => ({ id: c.id, brand: c.brand, model: c.model, year: c.year, color: c.color, plate: c.plate, showPlate: !!c.show_plate, photo: c.photo, photoData: '' });

/**
 * Всё для экранов одного участника. Форма — как у состояния прототипа (cars, regs, lastCarId) плюс events
 * с others / waitOthers, чтобы правила app/logic.js работали без изменений.
 * Имена и машины других — только записанным, стоящим в очереди и организаторам; остальным — фото машин.
 */
export function stateFor(db, userId, { organizers = [] } = {}) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const organizer = organizers.includes(Number(userId));
  const cars = db.prepare('SELECT * FROM cars WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at, rowid').all(userId).map(carOut);
  const regRows = db.prepare(`SELECT r.event_id, r.user_id, r.status, r.created_at, r.car_id, u.name, u.username,
      c.brand, c.model, c.year, c.color, c.plate, c.show_plate, c.photo
    FROM regs r JOIN users u ON u.id = r.user_id LEFT JOIN cars c ON c.id = r.car_id ORDER BY r.created_at, r.rowid`).all();
  const regs = {};
  const events = db.prepare('SELECT * FROM events ORDER BY date, time').all().map((row) => {
    const e = eventRow(row);
    const rows = regRows.filter((r) => r.event_id === e.id);
    const mine = rows.find((r) => r.user_id === Number(userId));
    if (mine) regs[e.id] = { status: mine.status, carId: mine.car_id, at: mine.created_at };
    const see = organizer || !!mine;
    // без машины (мероприятие noCar) — car: null; не видно имён — только фото машины или инициалы (#10)
    const car = (r) => (r.car_id ? { brand: r.brand, model: r.model, year: r.year, color: r.color, photo: r.photo, plate: r.show_plate && r.plate ? r.plate : null } : null);
    const person = (r) => (see
      ? { name: r.name, tg: r.username ? '@' + r.username : '', car: car(r) }
      : { name: '', tg: '', initials: initialsOf(r.name), car: r.car_id ? { photo: r.photo } : null });
    const wait = rows.filter((r) => r.status === 'wait');
    const on = rows.filter((r) => r.status === 'on' && r !== mine);
    const waitOthers = wait.filter((r) => r !== mine);
    if (e.peopleOrganizerOnly && !organizer) {
      // #23: список видит только организатор — остальным о других только числа
      e.others = []; e.waitOthers = [];
      e.othersCount = on.length; e.waitCount = waitOthers.length;
    } else {
      e.others = on.map(person);
      e.waitOthers = waitOthers.map(person);
    }
    e.myWaitPos = mine?.status === 'wait' ? wait.indexOf(mine) + 1 : null;
    return e;
  });
  return {
    me: { id: Number(userId), name: u?.name ?? '', tg: u?.username ? '@' + u.username : '', photo: u?.photo_url ?? '', organizer },
    cars, regs, lastCarId: u?.last_car_id ?? null, organizer, events,
  };
}

const initialsOf = (name) => String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
const getEvent = (db, id) => { const r = db.prepare('SELECT * FROM events WHERE id = ?').get(id); return r ? eventRow(r) : null; };
const takenOn = (db, eventId) => db.prepare("SELECT COUNT(*) AS n FROM regs WHERE event_id = ? AND status = 'on'").get(eventId).n;

/** Освободились места — первые из очереди становятся «on». */
function promote(db, eventId) {
  const e = getEvent(db, eventId);
  if (!e) return 0;
  let free = e.cap - takenOn(db, eventId), moved = 0;
  while (free > 0) {
    const next = db.prepare("SELECT rowid FROM regs WHERE event_id = ? AND status = 'wait' ORDER BY created_at, rowid LIMIT 1").get(eventId);
    if (!next) break;
    db.prepare("UPDATE regs SET status = 'on' WHERE rowid = ?").run(next.rowid);
    free--; moved++;
  }
  return moved;
}

/** Записаться или встать в очередь. Ошибки — коды из ТЗ. */
export function register(db, userId, eventId, carId, today = new Date(), now = Date.now()) {
  return tx(db, () => {
    const e = getEvent(db, eventId);
    if (!e) return { error: 'not-found' };
    if (!e.noCar) {
      const cars = db.prepare('SELECT id FROM cars WHERE user_id = ? AND deleted_at IS NULL').all(userId);
      if (!cars.length) return { error: 'no-car' };
      if (!cars.some((c) => c.id === carId)) return { error: 'bad-car' };
    }
    if (isPast(e, today)) return { error: 'past' };
    if (db.prepare('SELECT 1 FROM regs WHERE event_id = ? AND user_id = ?').get(eventId, userId)) return { error: 'already' };
    const status = takenOn(db, eventId) < e.cap ? 'on' : 'wait';
    db.prepare('INSERT INTO regs (event_id, user_id, car_id, status, created_at) VALUES (?, ?, ?, ?, ?)').run(eventId, userId, e.noCar ? null : carId, status, now);
    if (!e.noCar) db.prepare('UPDATE users SET last_car_id = ? WHERE id = ?').run(carId, userId);
    return { status };
  });
}

/** Отменить запись или выйти из очереди; освободилось место — продвинуть очередь. */
export function unregister(db, userId, eventId) {
  return tx(db, () => {
    const r = db.prepare('SELECT status FROM regs WHERE event_id = ? AND user_id = ?').get(eventId, userId);
    if (!r) return { error: 'not-registered' };
    db.prepare('DELETE FROM regs WHERE event_id = ? AND user_id = ?').run(eventId, userId);
    const promoted = r.status === 'on' ? promote(db, eventId) : 0;
    return { was: r.status, promoted };
  });
}

/** Создать (id не задан) или изменить свою машину. photo — имя файла или undefined (не менять). */
export function saveCar(db, userId, input, { id = null, photo, today = new Date(), now = Date.now() } = {}) {
  const v = validateCar(input, today);
  if (!v.ok) return { error: 'invalid', errors: v.errors };
  const c = v.car;
  if (id) {
    const old = db.prepare('SELECT * FROM cars WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(id, userId);
    if (!old) return { error: 'not-found' };
    db.prepare('UPDATE cars SET brand=?, model=?, year=?, color=?, plate=?, show_plate=?, photo=? WHERE id = ?')
      .run(c.brand, c.model, c.year, c.color, c.plate, c.showPlate ? 1 : 0, photo ?? old.photo, id);
    return { id };
  }
  const nid = 'c' + randomUUID().replace(/-/g, '').slice(0, 12);
  db.prepare('INSERT INTO cars (id, user_id, brand, model, year, color, plate, show_plate, photo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(nid, userId, c.brand, c.model, c.year, c.color, c.plate, c.showPlate ? 1 : 0, photo ?? '', now);
  return { id: nid };
}

/** Удалить свою машину (мягко). Нельзя, если она в записи на мероприятие, которое ещё не прошло. */
export function deleteCar(db, userId, carId, today = new Date(), now = Date.now()) {
  return tx(db, () => {
    const c = db.prepare('SELECT id FROM cars WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(carId, userId);
    if (!c) return { error: 'not-found' };
    const used = db.prepare('SELECT e.* FROM regs r JOIN events e ON e.id = r.event_id WHERE r.car_id = ?').all(carId)
      .map(eventRow).find((e) => !isPast(e, today));
    if (used) return { error: 'in-use', event: used.name };
    db.prepare('UPDATE cars SET deleted_at = ? WHERE id = ?').run(now, carId);
    db.prepare('UPDATE users SET last_car_id = NULL WHERE id = ? AND last_car_id = ?').run(userId, carId);
    return { ok: true };
  });
}
