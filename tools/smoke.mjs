// Проверка прода (#8): тестовый пользователь (ID 1) записывается на мероприятие и отменяет запись,
// создаёт и удаляет машину. Подпись — настоящим токеном бота, поэтому запускать только с компьютера владельца:
//   BOT_TOKEN=… node tools/smoke.mjs https://wdb-club.ru/
// После прогона данные пользователя 1 удаляются на ВМ: tools/smoke.mjs печатает команду.
import { signInitData } from '../server/auth.mjs';

const base = (process.argv[2] || 'https://wdb-club.ru/').replace(/\/?$/, '/');
const token = process.env.BOT_TOKEN;
if (!token) { console.error('нужен BOT_TOKEN'); process.exit(1); }
const USER = { id: 1, first_name: 'Smoke', last_name: 'Test', username: 'wdb_smoke_test' };
const auth = { authorization: 'tma ' + signInitData(USER, token), 'content-type': 'application/json' };
const call = async (method, p, body) => { const r = await fetch(base + 'api/' + p, { method, headers: auth, body: body && JSON.stringify(body) }); return { code: r.status, ...(await r.json()) }; };
const ok = (cond, msg) => { console.log(`${cond ? '✔' : '✖'} ${msg}`); if (!cond) process.exitCode = 1; };

ok((await fetch(base + 'api/state')).status === 401, 'без подписи — 401');
const s = await call('GET', 'state');
ok(s.code === 200 && s.me.name === 'Smoke Test', 'state: пользователь из initData');
const ev = s.events.find((e) => e.date >= new Date().toISOString().slice(0, 10));
ok(!!ev, `ближайшее мероприятие: ${ev?.name} ${ev?.date}, занято ${ev?.others.length} из ${ev?.cap}`);
ok(ev && ev.others.every((p) => p.name === ''), 'не записан — имён других не видно');
const jpeg = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
const c = await call('POST', 'cars', { brand: 'Mercedes-Benz', model: 'Smoke', year: '2001', color: '', plate: '', showPlate: false, photoData: jpeg });
ok(c.code === 200, 'машина создана');
const photo = c.state?.cars.find((x) => x.id === c.id)?.photo;
ok((await fetch(base + photo)).status === 200, `фото отдаётся: ${photo}`);
const r = await call('POST', `events/${ev.id}/register`, { carId: c.id });
ok(r.status === 'on' || r.status === 'wait', `запись: ${r.status}`);
ok((await call('DELETE', `cars/${c.id}`)).error === 'in-use', 'машину из записи не удалить');
ok((await call('DELETE', `events/${ev.id}/register`)).code === 200, 'запись отменена');
ok((await call('DELETE', `cars/${c.id}`)).code === 200, 'машина удалена');
console.log(`\nочистка на ВМ: ssh wdbclub "sudo -u wdbclub sqlite3 /var/lib/wdbclub/wdbclub.db \\"DELETE FROM regs WHERE user_id=1; DELETE FROM cars WHERE user_id=1; DELETE FROM users WHERE id=1;\\"" && ssh wdbclub "sudo rm -f /var/lib/wdbclub/${photo}"`);
