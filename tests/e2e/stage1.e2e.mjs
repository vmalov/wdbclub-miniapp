// E2E первого этапа (#2) — сценарии из mockups/flows.html глазами участника.
// Запуск: npm run e2e (видимый Chrome, по dev-guides). E2E_HEADLESS=1 — без окна (CI).
// Нужен установленный Google Chrome; playwright-core — devDependency.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { openDb, upsertEvents, touchUser, saveCar } from '../../server/core.mjs';
import { createServer, loadEvents } from '../../server/main.mjs';
import { signInitData } from '../../server/auth.mjs';
import { EVENTS as FIXTURE_EVENTS } from '../fixtures/data.js';

// #8: приложение работает через API. Каждый открытый экран — свой сервер со своей базой (server/main.mjs,
// staticRoot — корень репозитория, тот же origin), Telegram подменён заглушкой с подписанным initData.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shots = process.env.E2E_SHOTS; // папка для скриншотов шагов (необязательно)
const TOKEN = '777:E2E-test-token';
const ME = { id: 100, first_name: 'Иван', last_name: 'Петров', username: 'ivan_petrov' };
const TODAY = '2026-11-09';
let browser;
const cleanup = [];

before(async () => {
  browser = await chromium.launch({ channel: 'chrome', headless: !!process.env.E2E_HEADLESS, slowMo: process.env.E2E_HEADLESS ? 0 : 120 });
  if (shots) await mkdir(shots, { recursive: true });
});
after(async () => { await browser?.close(); for (const f of cleanup) await f(); });

/** Тестовые мероприятия (#6) в базу: вымышленные участники — пользователи с машинами и записями. */
function seedFixtures(db) {
  upsertEvents(db, FIXTURE_EVENTS.map(({ others, waitOthers, ...e }) => e));
  let uid = 1000, t = 1;
  const ins = db.prepare('INSERT INTO regs (event_id, user_id, car_id, status, created_at) VALUES (?, ?, ?, ?, ?)');
  for (const e of FIXTURE_EVENTS) {
    for (const [list, status] of [[e.others, 'on'], [e.waitOthers || [], 'wait']]) {
      for (const p of list) {
        const id = uid++;
        const [first_name, last_name] = p.name.split(' ');
        touchUser(db, { id, first_name, last_name, username: p.tg.slice(1) });
        const carId = saveCar(db, id, { ...p.car, year: String(p.car.year), plate: p.car.plate || '', showPlate: !!p.car.plate }, { photo: p.car.photo, today: new Date(TODAY) }).id;
        ins.run(e.id, id, carId, status, t++);
      }
    }
  }
}

/** Свой сервер: real — мероприятия из server/events.json, иначе тестовый набор с участниками. */
async function startServer({ real = false } = {}) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'wdb-e2e-'));
  const db = openDb();
  if (real) upsertEvents(db, await loadEvents()); else seedFixtures(db);
  const server = createServer({ db, botToken: TOKEN, dataDir, staticRoot: root, allowToday: true, log: { error: (e) => console.error(e) } });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  cleanup.push(async () => { server.close(); db.close(); await rm(dataDir, { recursive: true, force: true }); });
  return { db, base: `http://127.0.0.1:${server.address().port}/` };
}

/** Заглушка telegram-web-app.js: initData подписан тестовым токеном, «назад» — window.__tgBack(). */
const tgStub = (user, startParam) => `window.Telegram = { WebApp: {
  initData: ${JSON.stringify(signInitData(user, TOKEN))}, initDataUnsafe: { user: ${JSON.stringify(user)}${startParam ? `, start_param: ${JSON.stringify(startParam)}` : ''} },
  ready() {}, expand() {}, setHeaderColor() {}, setBackgroundColor() {}, setBottomBarColor() {}, openTelegramLink() {},
  BackButton: { show() {}, hide() {}, onClick(cb) { window.__tgBack = cb; } },
  HapticFeedback: { notificationOccurred() {}, selectionChanged() {} },
} };`;

/** Открыть приложение. user: null — вне Telegram. srv — сервер (по умолчанию новый). */
async function open({ real = false, user = ME, srv = null, cars = [], startParam = null } = {}) {
  srv = srv || await startServer({ real });
  if (user) touchUser(srv.db, user);
  for (const c of cars) saveCar(srv.db, user.id, c, { today: new Date(TODAY) });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/telegram\.org/, (r) => r.fulfill({ contentType: 'text/javascript', body: user ? tgStub(user, startParam) : '' }));
  // партнёры — из тестового набора (в приложении их нет); мероприятия всё равно приходят с сервера
  if (!real) await page.route(/\/app\/data\.js$/, async (r) => r.fulfill({ contentType: 'text/javascript', body: await readFile(path.join(root, 'tests/fixtures/data.js'), 'utf8') }));
  await page.goto(srv.base + 'index.html?today=' + TODAY);
  await page.evaluate(() => document.fonts.ready);
  if (user) await page.locator('main:not([data-view="loading"])').waitFor();
  return { page, ctx, errors, srv };
}
const back = (page) => page.evaluate(() => window.__tgBack());
// мероприятие с машиной для сценариев #8 (в приложении с #10 — Yellow Night без машины)
const VOYAGE = { id: 'voyage', type: 'Заезд', name: 'Вояж', date: '2026-11-13', time: '10:00', place: 'КВЦ «Башня»', cap: 30, cover: 'event-road' };
const CAR_A = { brand: 'Mercedes-Benz', model: 'E 55 AMG', year: '2001', color: 'серебристый', plate: 'А 001 АА 777', showPlate: false };
const CAR_B = { brand: 'Mercedes-AMG', model: 'AMG GT C Roadster', year: '2019', color: 'жёлтый', plate: '', showPlate: false };
const shot = async (page, name) => { if (shots) await page.screenshot({ path: path.join(shots, name + '.png'), fullPage: true }); };
const view = (page) => page.locator('main').getAttribute('data-view');

test('сценарий 1: первая запись без машины — добавить машину и сразу записаться', async () => {
  const { page, ctx, errors } = await open();
  await shot(page, '1-01-events');
  assert.equal(await page.locator('.tab').count(), 2, 'в таб-баре две вкладки');
  await page.locator('.ev-row', { hasText: 'Ночной заезд' }).click();
  assert.equal(await view(page), 'event');
  await assert.doesNotReject(page.locator('.seats', { hasText: '24' }).waitFor());
  await page.getByRole('button', { name: 'Записаться' }).click();
  await page.locator('.sheet', { hasText: 'Сначала — машина' }).waitFor();
  await shot(page, '1-02-need-car');
  await page.getByRole('button', { name: 'Добавить машину' }).click();
  assert.equal(await view(page), 'carForm');
  await page.getByRole('button', { name: 'Сохранить и записаться' }).click();
  await page.locator('.field__err', { hasText: 'Укажите модель' }).waitFor();
  assert.equal(await page.locator('.field.is-error').count(), 2, 'модель и год подсвечены');
  await shot(page, '1-03-form-errors');
  await page.fill('#f-model', 'E 55 AMG');
  await page.fill('#f-year', '2001');
  await page.fill('#f-color', 'серебристый');
  await page.fill('#f-plate', 'а 001 аа 777');
  await page.locator('#f-photo').setInputFiles(path.join(root, 'app/img/car-w210.jpg'));
  await page.locator('.upload[style*="data:image/jpeg"]').waitFor();
  await page.locator('.toggle').click();
  await shot(page, '1-04-form-filled');
  await page.getByRole('button', { name: 'Сохранить и записаться' }).click();
  await page.locator('main[data-view="event"]').waitFor();
  await page.locator('.btn--done', { hasText: 'Вы записаны · E 55 AMG' }).waitFor();
  await page.locator('.toast', { hasText: 'Вы записаны на «Ночной заезд по Москве»' }).waitFor();
  assert.match(await page.locator('.seats').innerText(), /25\s+из 40 мест/);
  await shot(page, '1-05-registered');
  await page.getByRole('button', { name: 'Все участники' }).click();
  assert.equal(await view(page), 'participants');
  await page.locator('.person', { hasText: 'Иван Петров · вы' }).locator('.plate', { hasText: 'А 001 АА' }).waitFor();
  assert.equal(await page.locator('.person').count(), 25);
  await shot(page, '1-06-participants');
  // переживает перезагрузку
  await page.reload();
  await page.locator('.tab', { hasText: 'Профиль' }).click();
  await page.locator('.ev-row', { hasText: 'Ночной заезд' }).locator('.tag--on').waitFor();
  await page.locator('.car-tile', { hasText: 'E 55 AMG' }).waitFor();
  await shot(page, '1-07-profile');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('сценарий 2 и 4: несколько машин — выбор; мест нет — лист ожидания; отмена', async () => {
  const { page, ctx, errors } = await open({ cars: [CAR_A, CAR_B] });
  await page.locator('.ev-row', { hasText: 'Ночной заезд' }).click();
  await page.getByRole('button', { name: 'Записаться' }).click();
  await page.locator('.sheet', { hasText: 'На какой машине едете?' }).waitFor();
  await page.locator('.car-opt', { hasText: 'AMG GT C Roadster' }).click();
  assert.equal(await page.locator('.car-opt.is-on').innerText().then((t) => t.includes('AMG GT C')), true);
  await shot(page, '2-01-pick-car');
  await page.locator('.sheet .btn').click();
  await page.locator('.btn--done', { hasText: 'AMG GT C Roadster' }).waitFor();
  await page.getByRole('button', { name: 'Отменить запись' }).click();
  await page.locator('.toast', { hasText: 'Запись отменена' }).waitFor();
  assert.match(await page.locator('.seats').innerText(), /24\s+из 40/);
  // мест нет
  await page.locator('.tab', { hasText: 'Мероприятия' }).click();
  await page.locator('main .screen > div', { hasText: 'Клубный ужин' }).locator('.btn', { hasText: 'Встать в лист ожидания' }).waitFor(); // #14: «мест нет» — на кнопке карточки
  await page.locator('.ev-row', { hasText: 'Клубный ужин' }).click();
  await page.locator('.meter--full').waitFor();
  await page.getByText('Перед вами в очереди 2 участника').waitFor();
  await page.getByRole('button', { name: 'Встать в лист ожидания' }).click();
  await page.locator('.sheet .btn', { hasText: 'Встать в лист ожидания' }).click();
  await page.locator('.btn--done', { hasText: 'Вы в листе ожидания · 3-й' }).waitFor();
  await shot(page, '4-01-waitlist');
  await page.getByRole('button', { name: 'Выйти из листа ожидания' }).click();
  await page.locator('.toast', { hasText: 'Вы вышли из листа ожидания' }).waitFor();
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('сценарий 3: не записан — только миниатюры; партнёр открывается из карточки', async () => {
  const { page, ctx, errors } = await open();
  await page.locator('.ev-row', { hasText: 'Ночной заезд' }).click();
  await page.getByText('Имена и машины — после записи').waitFor();
  await page.locator('.thumbs').first().click();
  assert.equal(await view(page), 'participants');
  assert.equal(await page.locator('.person').count(), 0, 'имён не видно');
  await page.getByText('Кто едет — после записи').waitFor();
  await shot(page, '3-01-thumbs');
  await back(page);
  await page.locator('.fact', { hasText: 'Партнёр' }).click();
  assert.equal(await view(page), 'partner');
  await page.getByText('−12% на счёт').waitFor();
  assert.equal(await page.getByText('карту участника').count(), 0);
  await shot(page, '3-02-partner');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('список: без календаря, карточки с картинкой и кнопкой записи; новичок в профиле (#14)', async () => {
  const { page, ctx, errors } = await open();
  assert.equal(await page.locator('.cal').count(), 0, 'календаря нет');
  assert.equal(await page.locator('.ev-row').count(), 5, 'ближайшие пять, прошедшего нет');
  assert.equal(await page.locator('main .cover').count(), 5, 'у каждой — картинка');
  await page.locator('main .btn[data-act="register"]').first().waitFor();
  assert.equal(await page.locator('main .btn', { hasText: 'Встать в лист ожидания' }).count(), 1, 'клубный ужин — мест нет');
  await shot(page, '14-01-cards');
  await page.locator('main .cover').first().click();
  assert.equal(await view(page), 'event');
  await back(page);
  await page.locator('.tab', { hasText: 'Профиль' }).click();
  await page.getByText('без машины на мероприятия не записаться').waitFor();
  await page.getByText('Пока пусто').waitFor();
  await shot(page, '6-01-newcomer');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('данные приложения: Yellow Night 13 ноября — запись без машины одним нажатием (#6, #8, #10)', async () => {
  const srv = await startServer({ real: true });
  const anna = { id: 201, first_name: 'Анна', last_name: 'Кузнецова', username: 'anna_k' };
  touchUser(srv.db, anna);
  const { page, ctx, errors } = await open({ srv }); // новичок: машин нет
  assert.equal(await page.locator('.ev-row').count(), 1);
  assert.match(await page.locator('main .cover').getAttribute('style'), /event-yellow-night\.jpg/);
  await page.locator('.ev-row', { hasText: 'Yellow Night' }).click();
  await page.getByText('пятница, 13 ноября').waitFor();
  await page.locator('.fact', { hasText: 'Нижняя Сыромятническая' }).waitFor();
  assert.match(await page.locator('.seats').innerText(), /0\s+из 50 мест/);
  await page.getByText('Кто идёт — после записи').waitFor();
  await shot(page, '10-01-yellow-night');
  await page.getByRole('button', { name: 'Записаться' }).click();
  await page.locator('.btn--done', { hasText: 'Вы записаны' }).waitFor();
  assert.equal(await page.locator('.sheet').count(), 0, 'без шторки «Сначала — машина»');
  assert.match(await page.locator('.seats').innerText(), /1\s+из 50 мест/);
  await page.getByRole('button', { name: 'Все участники' }).click();
  await page.locator('.person', { hasText: 'Иван Петров · вы' }).locator('.avatar', { hasText: 'ИП' }).waitFor();
  await shot(page, '10-02-participants');
  // второй участник записывается тоже без машины и видит первого
  const a = await open({ srv, user: anna });
  await a.page.locator('.ev-row', { hasText: 'Yellow Night' }).click();
  await a.page.locator('.thumbs .thumbs__i', { hasText: 'ИП' }).waitFor();
  await a.page.getByRole('button', { name: 'Записаться' }).click();
  await a.page.getByRole('button', { name: 'Все участники' }).click();
  await a.page.locator('.person', { hasText: 'Иван Петров' }).locator('a.link', { hasText: '@ivan_petrov' }).waitFor();
  assert.equal(await a.page.locator('.person__car').count(), 0, 'машин в списке нет');
  await a.page.locator('.tab', { hasText: 'Профиль' }).click();
  await a.page.locator('.ev-row', { hasText: 'Yellow Night' }).locator('.tag--on').waitFor();
  assert.deepEqual([...errors, ...a.errors], []);
  await ctx.close(); await a.ctx.close();
});

test('кнопка записи закреплена над таб-баром и видна без прокрутки; запись прямо из списка (#14)', async () => {
  const { page, ctx, errors } = await open({ real: true });
  await page.locator('.ev-row', { hasText: 'Yellow Night' }).click();
  const btn = page.locator('.dock .btn', { hasText: 'Записаться' });
  await btn.waitFor();
  const box = await btn.boundingBox();
  const tab = await page.locator('.tabbar').boundingBox();
  assert.ok(box.y + box.height <= tab.y + 1 && box.y > 844 / 2, 'кнопка над таб-баром, внизу экрана');
  await shot(page, '14-02-dock');
  await back(page);
  await page.locator('main .btn', { hasText: 'Записаться' }).click();
  await page.locator('main[data-view="event"]').waitFor();
  await page.locator('.dock .btn--done', { hasText: 'Вы записаны' }).waitFor();
  await page.getByRole('button', { name: 'Отменить запись' }).waitFor();
  await back(page);
  await page.locator('main .btn--done', { hasText: 'Вы записаны' }).waitFor();
  await shot(page, '14-03-list-registered');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('прямая ссылка ?startapp=<id>: сразу карточка события, «назад» — список; неизвестный id — список (#16)', async () => {
  const srv = await startServer({ real: true });
  const { page, ctx, errors } = await open({ srv, startParam: 'yellow-night' });
  assert.equal(await view(page), 'event');
  await page.getByText('пятница, 13 ноября').waitFor();
  await page.locator('.dock .btn', { hasText: 'Записаться' }).waitFor();
  await shot(page, '16-01-deeplink');
  await back(page);
  assert.equal(await view(page), 'events');
  // после «назад» ссылка не срабатывает повторно при обновлении данных
  await page.locator('main .btn', { hasText: 'Записаться' }).waitFor();
  const other = await open({ srv, startParam: 'no-such-event' });
  assert.equal(await view(other.page), 'events');
  assert.deepEqual([...errors, ...other.errors], []);
  await ctx.close(); await other.ctx.close();
});

test('общая база: второй участник видит запись первого; отмена продвигает очередь (#8)', async () => {
  const srv = await startServer({ real: true });
  upsertEvents(srv.db, [{ ...VOYAGE, cap: 1 }]);
  const anna = { id: 201, first_name: 'Анна', last_name: 'Кузнецова', username: 'anna_k' };
  const a = await open({ srv, user: anna, cars: [CAR_B] });
  await a.page.locator('.ev-row', { hasText: 'Вояж' }).click();
  await a.page.getByRole('button', { name: 'Записаться' }).click();
  await a.page.locator('.btn--done', { hasText: 'Вы записаны' }).waitFor();
  // Иван: мест нет — в очередь первым, видит Анну в списке
  const i = await open({ srv, cars: [CAR_A] });
  await i.page.locator('main .screen > div', { hasText: 'Вояж' }).locator('.btn', { hasText: 'Встать в лист ожидания' }).waitFor(); // #14: «мест нет» — на кнопке карточки
  await i.page.locator('.ev-row', { hasText: 'Вояж' }).click();
  await i.page.getByText('Вы будете первым в очереди').waitFor();
  await i.page.getByRole('button', { name: 'Встать в лист ожидания' }).click();
  await i.page.locator('.btn--done', { hasText: 'Вы в листе ожидания · 1-й' }).waitFor();
  await i.page.getByRole('button', { name: 'Все участники' }).click();
  await i.page.locator('.person', { hasText: 'Анна Кузнецова' }).waitFor();
  await shot(i.page, '8-01-waitlist-sees-anna');
  // Анна отменяет — Иван после перезагрузки записан
  await a.page.getByRole('button', { name: 'Отменить запись' }).click();
  await a.page.locator('.toast', { hasText: 'Запись отменена' }).waitFor();
  await i.page.reload();
  await i.page.locator('.tab', { hasText: 'Профиль' }).click();
  await i.page.locator('.ev-row', { hasText: 'Вояж' }).locator('.tag--on').waitFor();
  await shot(i.page, '8-02-promoted');
  assert.deepEqual([...a.errors, ...i.errors], []);
  await a.ctx.close(); await i.ctx.close();
});

test('машина: изменить и удалить; машину из записи удалить нельзя (#8)', async () => {
  const srv = await startServer({ real: true });
  upsertEvents(srv.db, [VOYAGE]);
  const { page, ctx, errors } = await open({ srv, cars: [CAR_A, CAR_B] });
  await page.locator('.ev-row', { hasText: 'Вояж' }).click();
  await page.getByRole('button', { name: 'Записаться' }).click();
  await page.locator('.car-opt', { hasText: 'E 55 AMG' }).click();
  await page.locator('.sheet .btn').click();
  await page.locator('.btn--done', { hasText: 'E 55 AMG' }).waitFor();
  await page.locator('.tab', { hasText: 'Профиль' }).click();
  // удалить машину из записи — нельзя
  await page.locator('.car-tile', { hasText: 'E 55 AMG' }).click();
  await page.getByRole('button', { name: 'Удалить' }).click();
  await page.locator('.sheet', { hasText: 'Удалить E 55 AMG?' }).waitFor();
  await shot(page, '8-03-delete-confirm');
  await page.locator('.sheet .btn', { hasText: 'Удалить' }).click();
  await page.locator('.toast', { hasText: 'Машина записана на «Вояж» — сначала отмените запись' }).waitFor();
  assert.equal(await view(page), 'car');
  await back(page);
  // изменить вторую и удалить её
  await page.locator('.car-tile', { hasText: 'AMG GT C Roadster' }).click();
  await page.getByRole('button', { name: 'Изменить' }).click();
  await page.fill('#f-color', 'зелёный');
  await page.locator('#f-photo').setInputFiles(path.join(root, 'app/img/car-amg-gt.jpg'));
  await page.locator('.upload[style*="data:image/jpeg"]').waitFor();
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await page.locator('.toast', { hasText: 'Машина сохранена' }).waitFor();
  assert.equal(await view(page), 'car', 'после правки — снова карточка машины');
  await page.locator('.spec', { hasText: 'зелёный' }).waitFor();
  assert.match(await page.locator('.car-card__photo').getAttribute('style'), /photos\/[0-9a-f-]{36}\.jpg/, 'фото с сервера');
  await page.getByRole('button', { name: 'Удалить' }).click();
  await page.locator('.sheet .btn', { hasText: 'Удалить' }).click();
  await page.locator('.toast', { hasText: 'Машина удалена' }).waitFor();
  assert.equal(await view(page), 'profile');
  assert.equal(await page.locator('.car-tile:not(.car-tile--add)').count(), 1);
  // после перезагрузки — то же (данные на сервере)
  await page.reload();
  await page.locator('.tab', { hasText: 'Профиль' }).click();
  assert.equal(await page.locator('.car-tile:not(.car-tile--add)').count(), 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('вне Telegram — «Откройте в Telegram», данных нет (#8)', async () => {
  const { page, ctx, errors } = await open({ real: true, user: null });
  await page.getByText('Откройте в Telegram').waitFor();
  assert.equal(await page.locator('.ev-row').count(), 0);
  assert.equal(await page.locator('a.btn').getAttribute('href'), 'https://t.me/wdbclub_bot');
  await shot(page, '8-04-no-telegram');
  assert.deepEqual(errors, []);
  await ctx.close();
});
