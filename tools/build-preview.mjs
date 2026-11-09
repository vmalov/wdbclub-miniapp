// Собирает превью для согласования в один самодостаточный HTML: сценарии, все экраны и
// дизайн-систему — три вкладки (#flows, #screens, #ds). Шрифты, картинки и иконки
// вшиты (data: URI), внешних загрузок нет — страницу можно опубликовать как артефакт
// claude.ai или открыть файлом. Исходники не меняет.
// Запуск: node tools/build-preview.mjs <выходной.html>
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const b64 = (p) => readFileSync(new URL(p, root)).toString('base64');
const out = process.argv[2];
if (!out) throw new Error('Укажите выходной файл: node tools/build-preview.mjs <out.html>');

// ---------- ресурсы ----------
const fontsCss = read('ds/fonts.css').replace(/url\("fonts\/([^"]+)"\)/g, (_, f) => `url("data:font/woff2;base64,${b64('ds/fonts/' + f)}")`);
const componentsCss = read('ds/components.css').replace(/url\("img\/([^"]+)"\)/g, (_, f) => `url("data:image/png;base64,${b64('ds/img/' + f)}")`);
const tokensCss = read('ds/tokens.css');
const sprite = read('ds/icons.svg').replace('<svg xmlns="http://www.w3.org/2000/svg">', '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true">');
const imgs = Object.fromEntries(readdirSync(new URL('mockups/img/', root)).filter((f) => f.endsWith('.jpg'))
  .map((f) => [f.replace('.jpg', ''), `data:image/jpeg;base64,${b64('mockups/img/' + f)}`]));
const fixRefs = (s) => s
  .replace(/(?:\.\.\/)?ds\/icons\.svg#/g, '#')
  .replace(/(?:mockups\/)?img\/([a-z0-9-]+)\.jpg/g, (m, n) => imgs[n] || m)
  .replace(/href="mockups\/stage-1\.html"/g, 'href="#screens"');

// ---------- разбор страниц ----------
function page(p) {
  const html = read(p);
  const style = (html.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];
  const body = html.slice(html.indexOf('<body'), html.indexOf('</body>'));
  const bodyClass = (body.match(/<body class="([^"]*)"/) || [, ''])[1];
  const inner = body.replace(/^<body[^>]*>/, '').replace(/<script src="[^"]*"><\/script>/g, '');
  const scripts = [...inner.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  return { style, bodyClass, markup: inner.replace(/<script>[\s\S]*?<\/script>/g, ''), scripts };
}
// Стили страницы — только внутри своей вкладки: body → #id, остальное → #id <селектор>
const scope = (css, id) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/([^{}]+)\{([^{}]*)\}/g, (m, sel, decl) => {
  if (sel.trim().startsWith('@')) return m;
  const scoped = sel.split(',').map((s) => s.trim()).filter(Boolean)
    .map((s) => (s === 'body' ? `#${id}` : s.startsWith('body') ? `#${id}${s.slice(4)}` : `#${id} ${s}`)).join(', ');
  return `${scoped} {${decl}}`;
});

const views = [
  ['flows', 'Сценарии', page('mockups/flows.html')],
  ['screens', 'Все экраны', page('mockups/stage-1.html')],
  ['ds', 'Дизайн-система', page('design-system.html')],
];
const screensSrc = read('mockups/screens.js');
const IMG_DECL = 'const IMG = n => `img/${n}.jpg`;';
if (!screensSrc.includes(IMG_DECL)) throw new Error('В screens.js изменилось объявление IMG — обновите build-preview.mjs');
const screensJs = `window.__IMG = ${JSON.stringify(imgs)};\n(function () {\n${screensSrc.replace(IMG_DECL, 'const IMG = n => window.__IMG[n];')}\n})();`;

const html = `<title>WDB Club · макеты</title>
<style>
${fontsCss}
${tokensCss}
${componentsCss}
:root { color-scheme: light; }
body { background: var(--sand); color: var(--ink); font-family: var(--sans); }
.pv-nav { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 20; display: flex; gap: 4px; flex-wrap: wrap; align-items: center;
  padding: 10px max(16px, env(safe-area-inset-right, 0px)) 10px max(16px, env(safe-area-inset-left, 0px)); background: var(--surface); border-bottom: 1px solid var(--hair); }
.pv-nav b { font: 400 22px/1 var(--serif); margin-right: 16px; }
.pv-nav a { font: 600 11px/1 var(--sans); letter-spacing: .14em; text-transform: uppercase; text-decoration: none; color: var(--ink-2); padding: 10px 12px; border-radius: var(--leaf-s); }
.pv-nav a[aria-current="page"] { color: var(--ink); background: var(--acc); }
.pv-nav a:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 30; background: var(--surface); }
${views.map(([id, , p]) => scope(p.style, 'v-' + id)).join('\n')}
#v-ds { background: var(--bg); }
</style>
${sprite}
<nav class="pv-nav"><b>WDB Club</b>${views.map(([id, t]) => `<a href="#${id}">${t}</a>`).join('')}</nav>
${views.map(([id, , p]) => `<section id="v-${id}" class="${p.bodyClass}" hidden>${fixRefs(p.markup)}</section>`).join('\n')}
<script>
${fixRefs(screensJs)}
${views.map(([, , p]) => p.scripts.map((s) => `(function () {\n${fixRefs(s)}\n})();`).join('\n')).join('\n')}
(function () {
  const ids = ${JSON.stringify(views.map(([id]) => id))};
  function show() {
    const cur = ids.includes(location.hash.slice(1)) ? location.hash.slice(1) : ids[0];
    ids.forEach((id) => { document.getElementById('v-' + id).hidden = id !== cur; });
    document.querySelectorAll('.pv-nav a').forEach((a) => a.setAttribute('aria-current', a.getAttribute('href') === '#' + cur ? 'page' : 'false'));
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', show); show();
})();
</script>
`;
writeFileSync(out, html);
console.log(`${out}: ${(html.length / 1024).toFixed(0)} КБ`);
