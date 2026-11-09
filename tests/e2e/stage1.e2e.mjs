// E2E первого этапа (#2) — сценарии из mockups/flows.html глазами участника.
// Запуск: npm run e2e (видимый Chrome, по dev-guides). E2E_HEADLESS=1 — без окна (CI).
// Нужен установленный Google Chrome; playwright-core — devDependency.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shots = process.env.E2E_SHOTS; // папка для скриншотов шагов (необязательно)
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
let server, base, browser;

before(async () => {
  server = http.createServer(async (q, r) => {
    const p = path.join(root, decodeURIComponent(new URL(q.url, 'http://x').pathname));
    try { const d = await readFile(p.endsWith(path.sep) ? path.join(p, 'index.html') : p); r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); r.end(d); } catch { r.writeHead(404); r.end(); }
  });
  await new Promise((ok) => server.listen(0, ok));
  base = `http://localhost:${server.address().port}/`;
  browser = await chromium.launch({ channel: 'chrome', headless: !!process.env.E2E_HEADLESS, slowMo: process.env.E2E_HEADLESS ? 0 : 120 });
  if (shots) await mkdir(shots, { recursive: true });
});
after(async () => { await browser?.close(); server?.close(); });

// По умолчанию — тестовый набор мероприятий (tests/fixtures/data.js, #6); real: true — данные приложения.
async function open({ real = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/telegram\.org/, (r) => r.fulfill({ body: '' }));
  if (!real) await page.route(/\/app\/data\.js$/, async (r) => r.fulfill({ contentType: 'text/javascript', body: await readFile(path.join(root, 'tests/fixtures/data.js'), 'utf8') }));
  await page.goto(base + 'index.html?today=2026-11-09');
  await page.evaluate(() => document.fonts.ready);
  return { page, ctx, errors };
}
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
  assert.equal(await view(page), 'event');
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
  const { page, ctx, errors } = await open();
  await page.evaluate(() => localStorage.setItem('wdb-stage1', JSON.stringify({ cars: [
    { id: 'a', brand: 'Mercedes-Benz', model: 'E 55 AMG', year: 2001, color: 'серебристый', plate: 'А 001 АА 777', showPlate: false, photoData: '' },
    { id: 'b', brand: 'Mercedes-AMG', model: 'AMG GT C Roadster', year: 2019, color: 'жёлтый', plate: '', showPlate: false, photoData: '' },
  ], regs: {}, lastCarId: null })));
  await page.reload();
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
  await page.locator('.ev-row', { hasText: 'Клубный ужин' }).locator('.tag--full').waitFor();
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
  await page.locator('.appbar__back').click();
  await page.locator('.fact', { hasText: 'Партнёр' }).click();
  assert.equal(await view(page), 'partner');
  await page.getByText('−12% на счёт').waitFor();
  assert.equal(await page.getByText('карту участника').count(), 0);
  await shot(page, '3-02-partner');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('календарь: выбор дня и сброс; новичок в профиле', async () => {
  const { page, ctx, errors } = await open();
  await page.locator('.cal__d.is-today', { hasText: '9' }).waitFor();
  await page.locator('.cal__d.has-ev', { hasText: '21' }).click();
  await page.locator('.section-head', { hasText: '21 ноября' }).waitFor();
  assert.equal(await page.locator('.ev-row').count(), 1);
  await page.getByRole('button', { name: 'Все' }).click();
  assert.equal(await page.locator('.ev-row').count(), 5);
  await page.locator('[data-act="month"][data-d="1"]').click();
  await page.locator('.month__name', { hasText: 'Декабрь 2026' }).waitFor();
  await page.locator('.tab', { hasText: 'Профиль' }).click();
  await page.getByText('без машины на мероприятия не записаться').waitFor();
  await page.getByText('Пока пусто').waitFor();
  await shot(page, '6-01-newcomer');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('данные приложения: одно мероприятие «Вояж» 13 ноября — запись и участники (#6)', async () => {
  const { page, ctx, errors } = await open({ real: true });
  assert.equal(await page.locator('.ev-row').count(), 1);
  await page.locator('.cal__d.has-ev', { hasText: '13' }).waitFor();
  await page.locator('.ev-row', { hasText: 'Вояж' }).click();
  await page.getByText('пятница, 13 ноября').waitFor();
  await page.getByText('сбор в 9:30').waitFor();
  assert.match(await page.locator('.seats').innerText(), /12\s+из 30 мест/);
  assert.equal(await page.locator('.fact', { hasText: 'Партнёр' }).count(), 0, 'без партнёра');
  await shot(page, '6v-01-voyage');
  await page.evaluate(() => localStorage.setItem('wdb-stage1', JSON.stringify({ cars: [{ id: 'a', brand: 'Mercedes-Benz', model: 'E 55 AMG', year: 2001, color: 'серебристый', plate: '', showPlate: false, photoData: '' }], regs: {}, lastCarId: null })));
  await page.reload();
  await page.locator('.ev-row', { hasText: 'Вояж' }).click();
  await page.getByRole('button', { name: 'Записаться' }).click();
  await page.locator('.btn--done', { hasText: 'Вы записаны · E 55 AMG' }).waitFor();
  assert.match(await page.locator('.seats').innerText(), /13\s+из 30 мест/);
  await page.getByRole('button', { name: 'Все участники' }).click();
  assert.equal(await page.locator('.person').count(), 13);
  assert.deepEqual(errors, []);
  await ctx.close();
});