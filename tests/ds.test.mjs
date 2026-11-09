// Проверки дизайн-системы (#1). Запуск: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const tokensCss = stripComments(read('ds/tokens.css'));
const componentsCss = stripComments(read('ds/components.css'));
const indexHtml = read('index.html');
const dsPage = read('design-system.html');

const tokens = [...tokensCss.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]);
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

test('токены объявлены и не дублируются', () => {
  assert.ok(tokens.length > 0);
  assert.equal(new Set(tokens).size, tokens.length, 'токен объявлен дважды');
});

test('в компонентах нет цветовых литералов — только токены', () => {
  const bad = componentsCss.split('\n').filter((l) => COLOR_LITERAL.test(l.replace(/url\("data:[^"]*"\)/g, '')));
  assert.deepEqual(bad, []);
});

test('компоненты ссылаются только на объявленные токены', () => {
  const used = [...componentsCss.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]);
  const unknown = [...new Set(used)].filter((t) => !tokens.includes(t));
  assert.deepEqual(unknown, []);
});

test('каждый токен где-то используется', () => {
  const unused = tokens.filter((t) => !new RegExp(`var\\(${t}\\)`).test(componentsCss + indexHtml));
  assert.deepEqual(unused, []);
});

test('каждый токен описан на живой странице ДС', () => {
  const missing = tokens.filter((t) => t !== '--font' && !dsPage.includes(`<code>${t}</code>`));
  assert.deepEqual(missing, []);
  assert.ok(dsPage.includes('--font'), '--font не упомянут на странице');
});

test('приложение и страница ДС подключают оба файла ДС', () => {
  for (const html of [indexHtml, dsPage]) {
    assert.ok(html.includes('href="ds/tokens.css"'));
    assert.ok(html.includes('href="ds/components.css"'));
  }
});
