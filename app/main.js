// Мини-апп WDB Club (#2, сервер — #8): навигация, действия, Telegram.
// Экраны — app/views.js, правила — app/logic.js, данные — с сервера через app/api.js (docs/server.md).
import { defaultCarId, validateCar, ics, myStatus, BRAND_DEFAULT } from './logic.js';
import { EVENTS, PARTNERS, setEvents, img } from './data.js';
import { makeApi } from './api.js';
import * as V from './views.js';

const tg = window.Telegram?.WebApp?.initData ? window.Telegram.WebApp : null;
const tgUser = tg?.initDataUnsafe?.user;
let me = {
  name: tgUser ? [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') : '',
  tg: tgUser?.username ? '@' + tgUser.username : '',
  photo: tgUser?.photo_url || '',
};
// Сегодня: в тестах подменяется параметром ?today=YYYY-MM-DD (сервер принимает его только в тестовом режиме).
const qToday = new URLSearchParams(location.search).get('today');
const today = qToday ? new Date(qToday + 'T12:00:00') : new Date();
const api = tg ? makeApi(tg.initData, { today: qToday }) : null;

let state = { cars: [], regs: {}, lastCarId: null, organizer: false };
let phase = tg ? 'loading' : 'no-tg'; // loading | ready | error | no-tg
let busy = false;
const ui = {};
let stack = [['events']];
let sheet = null; // { kind: 'pick'|'need', eventId, carId }
let form = null; // { carId, eventId, draft, errors }

const app = document.getElementById('app');
const layer = document.getElementById('layer');
const cur = () => stack[stack.length - 1];
const ctx = () => ({ state, today, ui, me });
/** Принять состояние с сервера. */
function apply(s) {
  state = { cars: s.cars, regs: s.regs, lastCarId: s.lastCarId, organizer: !!s.organizer };
  setEvents(s.events);
  if (s.me) me = { name: s.me.name || me.name, tg: s.me.tg, photo: s.me.photo || me.photo };
  // экран удалённой машины или мероприятия, которого больше нет, — назад
  stack = stack.filter(([v, a]) => !((v === 'car' && !state.cars.some((c) => c.id === a)) || ((v === 'event' || v === 'participants') && !EVENTS.some((e) => e.id === a))));
  if (!stack.length) stack = [['events']];
}
const NET = 'Нет связи, попробуйте ещё раз';
/** Вызов API с защитой от двойного нажатия. Ошибка сети — тост; неверная подпись — экран «Откройте в Telegram». */
async function run(fn) {
  if (busy) return null;
  busy = true;
  try {
    const r = await fn();
    if (r.error === 'unauthorized') { phase = 'no-tg'; render(true); return null; }
    if (r.error === 'network' || r.error === 'server') { toast(NET); haptic('error'); return null; }
    if (r.state) apply(r.state);
    return r;
  } finally { busy = false; }
}
async function boot() {
  phase = 'loading'; render();
  const r = await api.state();
  if (r.error === 'unauthorized') phase = 'no-tg';
  else if (r.error) phase = 'error';
  else { apply(r); phase = 'ready'; }
  render(true);
}
const haptic = (kind) => { try { kind ? tg?.HapticFeedback?.notificationOccurred(kind) : tg?.HapticFeedback?.selectionChanged(); } catch { /* вне Telegram */ } };

// ---------- навигация ----------
const BACK = { events: 'Мероприятия', profile: 'Профиль' };
function backLabel() {
  if (stack.length < 2) return null;
  const [view, arg] = stack[stack.length - 2];
  if (view === 'event' || view === 'participants') return shortName(EVENTS.find((e) => e.id === arg).name);
  if (view === 'car') return 'Машина';
  return BACK[view] || 'Назад';
}
const shortName = (s) => (s.length > 18 ? s.split(' ').slice(0, 2).join(' ') : s);
function go(...route) { stack.push(route); render(true); haptic(); }
function back() { if (stack.length > 1) { stack.pop(); if (cur()[0] !== 'carForm') form = null; render(true); } }
function tab(t) { stack = [[t]]; form = null; render(true); haptic(); }

function render(scrollTop) {
  if (phase !== 'ready') {
    app.innerHTML = `<div class="appbar"><span></span><span class="logo-tile" role="img" aria-label="WDB Club"></span></div><main class="grow" data-view="${phase}">${phase === 'no-tg' ? V.viewOpenInTelegram() : phase === 'error' ? V.viewLoadError() : V.viewLoading()}</main>`;
    if (tg) tg.BackButton.hide();
    return;
  }
  const [view, arg] = cur();
  const root = stack[0][0];
  let html = '';
  if (view === 'events') html = V.viewEvents(ctx());
  if (view === 'event') html = V.viewEvent(ctx(), arg);
  if (view === 'participants') html = V.viewParticipants(ctx(), arg);
  if (view === 'partner') html = V.viewPartner(ctx(), PARTNERS.find((p) => p.id === arg));
  if (view === 'profile') html = V.viewProfile(ctx());
  if (view === 'car') html = V.viewCar(ctx(), arg);
  if (view === 'carForm') html = V.viewCarForm(ctx(), form);
  const bl = backLabel();
  // кнопка записи на карточке мероприятия закреплена над таб-баром (#14)
  const dock = view === 'event' ? V.eventDock(ctx(), arg) : '';
  app.innerHTML = `<div class="appbar">${bl && !tg ? `<button class="appbar__back" data-act="back">${V.ic('left')}${V.esc(bl)}</button>` : '<span></span>'}<span class="logo-tile" role="img" aria-label="WDB Club"></span></div>
    <main class="grow" data-view="${view}">${html}</main>
    <div class="dock">${dock ? `<div>${dock}</div>` : ''}<nav class="tabbar"><button class="tab${root === 'events' ? ' is-on' : ''}" data-act="tab" data-tab="events">${V.ic('cal')}Мероприятия</button><button class="tab${root === 'profile' ? ' is-on' : ''}" data-act="tab" data-tab="profile">${V.ic('user')}Профиль</button></nav></div>`;
  if (tg) stack.length > 1 ? tg.BackButton.show() : tg.BackButton.hide();
  renderSheet();
  if (scrollTop) window.scrollTo(0, 0);
}

// ---------- шторка и тост ----------
function renderSheet() {
  layer.querySelector('.scrim')?.remove();
  if (!sheet) return;
  const e = EVENTS.find((x) => x.id === sheet.eventId);
  const inner = sheet.kind === 'pick' ? V.sheetPickCar(ctx(), e, sheet.carId)
    : sheet.kind === 'delete' ? V.sheetDeleteCar(state.cars.find((c) => c.id === sheet.carId)) : V.sheetNeedCar();
  layer.insertAdjacentHTML('beforeend', `<div class="scrim" data-act="close-sheet"><div class="sheet" role="dialog" aria-modal="true">${inner}</div></div>`);
}
function toast(text) {
  layer.querySelector('.toast')?.remove();
  layer.insertAdjacentHTML('beforeend', `<div class="toast" role="status">${V.ic('check')}${V.esc(text)}</div>`);
  const el = layer.lastElementChild;
  setTimeout(() => el.remove(), 2600);
}

// ---------- запись ----------
function startRegister(eventId) {
  if (EVENTS.find((x) => x.id === eventId)?.noCar) { doRegister(eventId, null); return; } // без машины (#10)
  if (!state.cars.length) { sheet = { kind: 'need', eventId }; renderSheet(); return; }
  if (state.cars.length === 1) { doRegister(eventId, state.cars[0].id); return; }
  sheet = { kind: 'pick', eventId, carId: defaultCarId(state) }; renderSheet();
}
async function doRegister(eventId, carId) {
  const e = EVENTS.find((x) => x.id === eventId);
  const r = await run(() => api.register(eventId, carId));
  if (!r) return;
  sheet = null;
  if (r.error) { toast(r.error === 'past' ? 'Мероприятие уже прошло' : r.error === 'already' ? 'Вы уже записаны' : NET); render(); return; }
  haptic('success');
  toast(r.status === 'on' ? `Вы записаны на «${e.name}»` : 'Вы в листе ожидания');
  // запись из карточки или списка участников — остаёмся там; из формы машины — на карточку мероприятия
  if (!['event', 'participants'].includes(cur()[0])) stack.push(['event', eventId]);
  render(true);
}

// ---------- форма машины ----------
function openForm(carId, eventId) {
  const c = carId ? state.cars.find((x) => x.id === carId) : null;
  form = { carId, eventId, errors: {}, draft: c ? { ...c, photoData: img(c.photo) } : { brand: BRAND_DEFAULT, model: '', year: '', color: '', plate: '', showPlate: false, photoData: '' } };
  sheet = null;
  go('carForm');
}
function readForm() {
  const f = app.querySelector('form[data-form="car"]');
  if (!f) return;
  for (const n of ['brand', 'model', 'year', 'color', 'plate']) form.draft[n] = f.elements[n].value;
}
async function submitForm() {
  readForm();
  const v = validateCar(form.draft, today);
  if (!v.ok) {
    form.errors = v.errors; render(); haptic('error');
    const first = ['brand', 'model', 'year'].find((n) => v.errors[n]);
    app.querySelector(`#f-${first}`)?.focus();
    return;
  }
  // фото отправляем, только если выбрано новое (data URL); иначе на сервере остаётся прежнее
  const photoData = form.draft.photoData?.startsWith('data:') ? form.draft.photoData : undefined;
  const r = await run(() => api.saveCar({ ...v.car, photoData }, form.carId));
  if (!r) return;
  if (r.error) { form.errors = r.errors || {}; render(); toast(r.errors?.photo || NET); return; }
  const { eventId } = form;
  form = null;
  if (eventId) { stack.pop(); doRegister(eventId, r.id); return; }
  stack.pop();
  toast('Машина сохранена');
  render(true);
}
async function pickPhoto(file) {
  try {
    if (!file || !file.type.startsWith('image/')) throw new Error('not image');
    const url = URL.createObjectURL(file);
    const im = await new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = url; });
    const w = Math.min(900, im.naturalWidth), h = Math.round(im.naturalHeight * (w / im.naturalWidth));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(im, 0, 0, w, h);
    URL.revokeObjectURL(url);
    readForm();
    form.draft.photoData = c.toDataURL('image/jpeg', 0.8);
    delete form.errors.photo;
  } catch {
    readForm();
    form.errors = { ...form.errors, photo: 'Не удалось открыть фото, выберите другое' };
  }
  render();
}
function downloadIcs(e) {
  const blob = new Blob([ics(e)], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `wdb-${e.id}.ics`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- действия ----------
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const arg = cur()[1];
  if (act === 'close-sheet' && ev.target !== el) return; // клик внутри шторки
  if (act !== 'tg') ev.preventDefault();
  switch (act) {
    case 'back': back(); break;
    case 'tab': tab(el.dataset.tab); break;
    case 'open-event': go('event', el.dataset.id); break;
    case 'open-partner': go('partner', el.dataset.id); break;
    case 'open-people': go('participants', arg); break;
    case 'register': startRegister(el.dataset.id || arg); break;
    case 'pick-car': sheet.carId = el.dataset.id; renderSheet(); haptic(); break;
    case 'confirm-register': doRegister(sheet.eventId, sheet.carId); break;
    case 'close-sheet': sheet = null; renderSheet(); break;
    case 'add-car-for-event': openForm(null, sheet.eventId); break;
    case 'unregister': { const w = myStatus(state, arg) === 'wait'; run(() => api.unregister(arg)).then((r) => { if (!r) return; render(); toast(r.error ? NET : w ? 'Вы вышли из листа ожидания' : 'Запись отменена'); }); break; }
    case 'delete-car': sheet = { kind: 'delete', carId: el.dataset.id }; renderSheet(); break;
    case 'confirm-delete-car': {
      run(() => api.deleteCar(el.dataset.id)).then((r) => {
        if (!r) return;
        sheet = null;
        if (r.error === 'in-use') { renderSheet(); toast(`Машина записана на «${r.event}» — сначала отмените запись`); haptic('error'); return; }
        if (r.error) { renderSheet(); toast(NET); return; }
        render(true); toast('Машина удалена');
      });
      break;
    }
    case 'reload': boot(); break;
    case 'ics': downloadIcs(EVENTS.find((e) => e.id === arg)); break;
    case 'add-car': openForm(null, null); break;
    case 'open-car': go('car', el.dataset.id); break;
    case 'edit-car': openForm(el.dataset.id, null); break;
    case 'pick-photo': app.querySelector('#f-photo').click(); break;
    case 'toggle-plate': readForm(); form.draft.showPlate = !form.draft.showPlate; render(); haptic(); break;
    case 'tg': if (tg) { ev.preventDefault(); tg.openTelegramLink('https://t.me/' + el.dataset.tg); } break;
    default: break;
  }
});
document.addEventListener('submit', (ev) => { if (ev.target.matches('form[data-form="car"]')) { ev.preventDefault(); submitForm(); } });
document.addEventListener('change', (ev) => { if (ev.target.id === 'f-photo') pickPhoto(ev.target.files[0]); });
document.addEventListener('input', (ev) => {
  const n = ev.target.name;
  if (form && n && form.errors[n]) { delete form.errors[n]; const f = ev.target.closest('.field'); f?.classList.remove('is-error'); f?.querySelector('.field__err')?.remove(); }
});

// ---------- Telegram ----------
if (tg) {
  tg.ready(); tg.expand();
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  try { tg.setHeaderColor(bg); tg.setBackgroundColor(bg); tg.setBottomBarColor?.(bg); } catch { /* старые клиенты */ }
  tg.BackButton.onClick(back);
  boot();
} else {
  render();
}
