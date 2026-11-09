// Проверки дизайн-системы (#1). Запуск: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const tokensCss = strip(read('ds/tokens.css'));
const componentsCss = strip(read('ds/components.css'));
const fontsCss = strip(read('ds/fonts.css'));
const icons = read('ds/icons.svg');
const mockups = read('mockups/stage-1.html') + read('mockups/screens.js') + read('mockups/flows.html');
const dsPage = read('design-system.html');

const tokens = [...tokensCss.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]);
const varsIn = (s) => [...s.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]);
const COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
const word = (name, text) => new RegExp(`(^|[^a-zA-Z0-9_-])${name.replace(/[-]/g, '\\-')}($|[^a-zA-Z0-9_-])`).test(text);

test('токены объявлены один раз', () => {
  assert.ok(tokens.length > 20);
  assert.equal(new Set(tokens).size, tokens.length);
});

test('в компонентах нет цветовых литералов — только токены', () => {
  const bad = componentsCss.split('\n').filter((l) => COLOR.test(l.replace(/url\([^)]*\)/g, '')));
  assert.deepEqual(bad, []);
});

test('компоненты, макеты и страница ДС ссылаются только на объявленные токены', () => {
  const unknown = [...new Set([...varsIn(componentsCss), ...varsIn(mockups), ...varsIn(dsPage), ...varsIn(tokensCss)])]
    .filter((t) => !tokens.includes(t));
  assert.deepEqual(unknown, []);
});

test('каждый токен где-то используется', () => {
  const used = new Set([...varsIn(componentsCss), ...varsIn(tokensCss), ...varsIn(mockups)]);
  assert.deepEqual(tokens.filter((t) => !used.has(t)), []);
});

test('каждый токен описан на живой странице ДС', () => {
  const missing = tokens.filter((t) => !dsPage.includes(`'${t}'`) && !dsPage.includes(`<code>${t}</code>`) && !dsPage.includes(`${t} /`) && !dsPage.includes(`/ ${t}`));
  assert.deepEqual(missing, []);
});

test('каждый класс компонентов стоит на макетах экранов (в ДС нет лишнего)', () => {
  const selectors = componentsCss.replace(/\{[^}]*\}/g, '{}').replace(/url\([^)]*\)/g, '');
  const classes = [...new Set([...selectors.matchAll(/\.([a-z][a-z0-9_-]*)/g)].map((m) => m[1]))].filter((c) => c !== 'app');
  assert.ok(classes.length > 40);
  assert.deepEqual(classes.filter((c) => !word(c, mockups)), []);
});

test('каждая иконка спрайта используется на макетах', () => {
  const ids = [...icons.matchAll(/<symbol id="i-([a-z]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length > 10);
  assert.deepEqual(ids.filter((n) => !mockups.includes(`ic('${n}'`)), []);
});

test('файлы шрифтов и логотипа на месте', () => {
  for (const [, p] of fontsCss.matchAll(/url\("([^"]+)"\)/g)) assert.ok(existsSync(new URL(`ds/${p}`, root)), p);
  for (const [, p] of componentsCss.matchAll(/url\("([^"]+)"\)/g)) assert.ok(existsSync(new URL(`ds/${p}`, root)), p);
});

test('макеты и страница ДС подключают все файлы ДС', () => {
  for (const [html, pre] of [[read('mockups/stage-1.html') + read('mockups/screens.js'), '../ds/'], [read('mockups/flows.html') + read('mockups/screens.js'), '../ds/'], [dsPage, 'ds/']]) {
    for (const f of ['fonts.css', 'tokens.css', 'components.css']) assert.ok(html.includes(`href="${pre}${f}"`), pre + f);
    assert.ok(html.includes(`${pre}icons.svg#i-`));
  }
});

test('приложение собрано только из классов ДС и без своих цветов (#2)', () => {
  const app = read('app/views.js') + read('app/main.js') + read('index.html');
  const own = new Set(['app', 'grow']); // каркас index.html
  const declared = new Set([...componentsCss.replace(/\{[^}]*\}/g, '{}').matchAll(/\.([a-z][a-z0-9_-]*)/g)].map((m) => m[1]));
  const used = new Set();
  for (const [, list] of app.matchAll(/class="([^"$]*)/g)) list.split(/\s+/).filter(Boolean).forEach((c) => used.add(c));
  for (const [, c] of app.matchAll(/'((?:is|has)-[a-z-]+|[a-z]+--[a-z-]+)'/g)) used.add(c);
  assert.deepEqual([...used].filter((c) => !declared.has(c) && !own.has(c)), []);
  const js = read('app/views.js') + read('app/main.js');
  assert.deepEqual(js.split('\n').filter((l) => COLOR.test(l)), []);
});
