// Точка входа сервера (#8). На проде статику и /photos отдаёт Caddy, сюда приходит только /api/*.
// Локально и в e2e (staticRoot задан) сервер сам отдаёт приложение и фото — один origin, как на проде.
//
// Переменные окружения (на проде — /etc/wdbclub/env):
//   BOT_TOKEN   токен @wdbclub_bot (обязателен)
//   ORGANIZERS  Telegram ID организаторов через запятую
//   DATA_DIR    база и фото (по умолчанию /var/lib/wdbclub)
//   PORT        порт на 127.0.0.1 (по умолчанию 8787)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, upsertEvents } from './core.mjs';
import { makeApi } from './api.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

export const parseOrganizers = (s) => String(s || '').split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0);

export async function loadEvents(file = path.join(here, 'events.json')) {
  return JSON.parse(await readFile(file, 'utf8'));
}

/** Собрать сервер. staticRoot — отдавать файлы приложения (локально и в e2e). */
export function createServer({ db, botToken, organizers = [], dataDir, staticRoot = null, allowToday = false, log = console }) {
  const photosDir = path.join(dataDir, 'photos');
  const api = makeApi({ db, botToken, organizers, photosDir, allowToday, log });
  return http.createServer(async (req, res) => {
    if (await api(req, res)) return;
    if (!staticRoot || req.method !== 'GET') { res.writeHead(404); res.end(); return; }
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    const base = rel.startsWith('photos/') ? dataDir : staticRoot;
    const file = path.resolve(base, rel);
    if (!file.startsWith(path.resolve(base) + path.sep)) { res.writeHead(404); res.end(); return; }
    try {
      const d = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(d);
    } catch { res.writeHead(404); res.end(); }
  });
}

// Запуск как процесс: node server/main.mjs
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const botToken = process.env.BOT_TOKEN;
  if (!botToken) { console.error('BOT_TOKEN не задан'); process.exit(1); }
  const dataDir = process.env.DATA_DIR || '/var/lib/wdbclub';
  const db = openDb(path.join(dataDir, 'wdbclub.db'));
  upsertEvents(db, await loadEvents());
  const port = Number(process.env.PORT || 8787);
  const server = createServer({ db, botToken, organizers: parseOrganizers(process.env.ORGANIZERS), dataDir, staticRoot: process.env.STATIC_ROOT || null });
  server.listen(port, '127.0.0.1', () => console.log(`wdbclub api on 127.0.0.1:${port}`));
  const stop = () => server.close(() => { db.close(); process.exit(0); });
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
