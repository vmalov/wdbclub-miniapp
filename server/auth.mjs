// Проверка подписи Telegram Mini App (#8): https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
import { createHmac, timingSafeEqual } from 'node:crypto';

const checkString = (params) => [...params.entries()].filter(([k]) => k !== 'hash')
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
const secretKey = (botToken) => createHmac('sha256', 'WebAppData').update(botToken).digest();

/**
 * initData → пользователь Telegram ({ id, first_name, … }) или null, если подпись неверна,
 * данные старше maxAgeSec или пользователя нет.
 */
export function verifyInitData(initData, botToken, { maxAgeSec = 24 * 3600, now = Date.now() } = {}) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;
  const calc = createHmac('sha256', secretKey(botToken)).update(checkString(params)).digest();
  if (!timingSafeEqual(calc, Buffer.from(hash, 'hex'))) return null;
  const authDate = Number(params.get('auth_date'));
  if (!authDate || now / 1000 - authDate > maxAgeSec) return null;
  try {
    const user = JSON.parse(params.get('user') || 'null');
    return user && Number.isInteger(user.id) ? user : null;
  } catch { return null; }
}

/** Подписать initData (для тестов и проверки прода тестовым пользователем). */
export function signInitData(user, botToken, { authDate = Math.floor(Date.now() / 1000) } = {}) {
  const params = new URLSearchParams({ auth_date: String(authDate), query_id: 'test', user: JSON.stringify(user) });
  params.set('hash', createHmac('sha256', secretKey(botToken)).update(checkString(params)).digest('hex'));
  return params.toString();
}
