// Клиент API (#8, docs/server.md). Каждый запрос подписан initData из Telegram.
// Ошибка сети — { error: 'network' }, неверная подпись — { error: 'unauthorized' }.
export function makeApi(initData, { today = null } = {}) {
  async function call(method, path, body) {
    const headers = { authorization: 'tma ' + initData };
    if (body) headers['content-type'] = 'application/json';
    if (today) headers['x-today'] = today; // только для тестов, сервер на проде заголовок игнорирует
    let res;
    try { res = await fetch('api/' + path, { method, headers, body: body ? JSON.stringify(body) : undefined }); } catch { return { error: 'network' }; }
    let data = {};
    try { data = await res.json(); } catch { /* пустой ответ */ }
    if (!res.ok) return { error: data.error || (res.status === 401 ? 'unauthorized' : 'network'), ...data };
    return data;
  }
  return {
    state: () => call('GET', 'state'),
    register: (eventId, carId) => call('POST', `events/${encodeURIComponent(eventId)}/register`, { carId }),
    unregister: (eventId) => call('DELETE', `events/${encodeURIComponent(eventId)}/register`),
    saveCar: (car, id) => call(id ? 'PUT' : 'POST', id ? `cars/${encodeURIComponent(id)}` : 'cars', car),
    deleteCar: (id) => call('DELETE', `cars/${encodeURIComponent(id)}`),
  };
}
