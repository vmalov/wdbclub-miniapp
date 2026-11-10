// HTTP API (#8): /api/* поверх server/core.mjs. ТЗ — docs/server.md («API»).
import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { verifyInitData } from './auth.mjs';
import * as core from './core.mjs';

const MAX_BODY = 3 * 1024 * 1024;
const MAX_PHOTO = 1.5 * 1024 * 1024;

function send(res, code, body) {
  const s = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(s);
}
async function readJson(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > MAX_BODY) throw Object.assign(new Error('too-large'), { code: 413 }); chunks.push(c); }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('bad-json'), { code: 400 }); }
}
/** Фото из data URL → файл в photosDir, имя — случайный UUID. Возвращает путь для фронта или ошибку. */
async function savePhoto(photosDir, dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
  if (!m) return { error: 'bad-photo' };
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > MAX_PHOTO) return { error: 'bad-photo' };
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const name = `${randomUUID()}.${ext}`;
  await mkdir(photosDir, { recursive: true });
  await writeFile(path.join(photosDir, name), buf);
  return { photo: `photos/${name}` };
}

/**
 * Обработчик запросов /api/*. opts: db, botToken, organizers (Telegram ID), photosDir,
 * allowToday — принимать заголовок x-today (только для тестов: подмена «сегодня»).
 */
export function makeApi({ db, botToken, organizers = [], photosDir, allowToday = false, log = console }) {
  return async function api(req, res) {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith('/api/')) return false;
    try {
      const auth = String(req.headers.authorization || '');
      const user = auth.startsWith('tma ') ? verifyInitData(auth.slice(4), botToken) : null;
      if (!user) { send(res, 401, { error: 'unauthorized' }); return true; }
      core.touchUser(db, user);
      const today = allowToday && req.headers['x-today'] ? new Date(req.headers['x-today'] + 'T12:00:00') : new Date();
      const state = () => core.stateFor(db, user.id, { organizers });
      const p = url.pathname.split('/').filter(Boolean); // ['api', ...]
      const m = req.method;

      if (m === 'GET' && p[1] === 'state' && p.length === 2) { send(res, 200, state()); return true; }

      if (p[1] === 'events' && p[3] === 'register' && p.length === 4) {
        if (m === 'POST') {
          const body = await readJson(req);
          const r = core.register(db, user.id, p[2], String(body.carId ?? ''), today);
          if (r.error) { send(res, r.error === 'not-found' ? 404 : 409, { error: r.error }); return true; }
          send(res, 200, { status: r.status, state: state() }); return true;
        }
        if (m === 'DELETE') {
          const r = core.unregister(db, user.id, p[2]);
          if (r.error) { send(res, 409, { error: r.error }); return true; }
          send(res, 200, { was: r.was, state: state() }); return true;
        }
      }

      if (p[1] === 'cars' && (p.length === 2 || p.length === 3)) {
        const id = p[2] ?? null;
        if ((m === 'POST' && !id) || (m === 'PUT' && id)) {
          const body = await readJson(req);
          let photo;
          if (typeof body.photoData === 'string' && body.photoData.startsWith('data:')) {
            const ph = await savePhoto(photosDir, body.photoData);
            if (ph.error) { send(res, 400, { error: 'invalid', errors: { photo: 'Не удалось сохранить фото, выберите другое' } }); return true; }
            photo = ph.photo;
          }
          const r = core.saveCar(db, user.id, body, { id, photo, today });
          if (r.error) { send(res, r.error === 'not-found' ? 404 : 400, r); return true; }
          send(res, 200, { id: r.id, state: state() }); return true;
        }
        if (m === 'DELETE' && id) {
          const r = core.deleteCar(db, user.id, id, today);
          if (r.error) { send(res, r.error === 'not-found' ? 404 : 409, r); return true; }
          send(res, 200, { state: state() }); return true;
        }
      }
      send(res, 404, { error: 'not-found' });
    } catch (e) {
      if (e.code === 413 || e.code === 400) send(res, e.code, { error: e.message });
      else { log.error?.(e); send(res, 500, { error: 'server' }); }
    }
    return true;
  };
}
