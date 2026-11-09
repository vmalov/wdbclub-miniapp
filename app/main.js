// Мини-апп WDB Club, первый этап (#2): навигация, действия, Telegram.
// Экраны — app/views.js, правила — app/logic.js, данные — app/data.js.
import { register, unregister, defaultCarId, validateCar, upsertCar, ics, myStatus, BRAND_DEFAULT } from './logic.js';
import { EVENTS, PARTNERS } from './data.js';
import { load, save } from './store.js';
import * as V from './views.js';

const tg = window.Telegram?.WebApp?.initData ? window.Telegram.WebApp : null;
const tgUser = tg?.initDataUnsafe?.user;
const me = {
  name: tgUser ? [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') : 'Иван Петров',
  tg: tgUser?.username ? '@' + tgUser.username : tgUser ? '' : '@ivan_petrov',
  photo: tgUser?.photo_url || '',
};
// Сегодня: в тестах подменяется параметром ?today=YYYY-MM-DD.
const qToday = new URLSearchParams(location.search).get('today');
const today = qToday ? new Date(qToday + 'T12:00:00') : new Date();

let state = load();
const ui = { month: [today.getFullYear(), today.getMonth()], sel: null };
let stack = [['events']];
let sheet = null; // { kind: 'pick'|'need', eventId, carId }
let form = null; // { carId, eventId, draft, errors }

const app = document.getElementById('app');
const layer = document.getElementById('layer');
const cur = () => stack[stack.length - 1];
const ctx = () => ({ state, today, ui, me });
const persist = () => { if (!save(state)) toast('Не удалось сохранить: в браузере не хватает места'); };
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
  app.innerHTML = `<div class="appbar">${bl && !tg ? `<button class="appbar__back" data-act="back">${V.ic('left')}${V.esc(bl)}</button>` : '<span></span>'}<span class="logo-tile" role="img" aria-label="WDB Club"></span></div>
    <main class="grow" data-view="${view}">${html}</main>
    <nav class="tabbar"><button class="tab${root === 'events' ? ' is-on' : ''}" data-act="tab" data-tab="events">${V.ic('cal')}Мероприятия</button><button class="tab${root === 'profile' ? ' is-on' : ''}" data-act="tab" data-tab="profile">${V.ic('user')}Профиль</button></nav>`;
  if (tg) stack.length > 1 ? tg.BackButton.show() : tg.BackButton.hide();
  renderSheet();
  if (scrollTop) window.scrollTo(0, 0);
}

// ---------- шторка и тост ----------
function renderSheet() {
  layer.querySelector('.scrim')?.remove();
  if (!sheet) return;
  const e = EVENTS.find((x) => x.id === sheet.eventId);
  const inner = sheet.kind === 'pick' ? V.sheetPickCar(ctx(), e, sheet.carId) : V.sheetNeedCar();
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
  if (!state.cars.length) { sheet = { kind: 'need', eventId }; renderSheet(); return; }
  if (state.cars.length === 1) { doRegister(eventId, state.cars[0].id); return; }
  sheet = { kind: 'pick', eventId, carId: defaultCarId(state) }; renderSheet();
}
function doRegister(eventId, carId) {
  const e = EVENTS.find((x) => x.id === eventId);
  const r = register(state, e, carId, today);
  if (r.error) return;
  state = r.state; persist(); sheet = null;
  haptic('success');
  toast(r.status === 'on' ? `Вы записаны на «${e.name}»` : 'Вы в листе ожидания');
  // запись из карточки или списка участников — остаёмся там; из формы машины — на карточку мероприятия
  if (!['event', 'participants'].includes(cur()[0])) stack.push(['event', eventId]);
  render(true);
}

// ---------- форма машины ----------
function openForm(carId, eventId) {
  const c = carId ? state.cars.find((x) => x.id === carId) : null;
  form = { carId, eventId, errors: {}, draft: c ? { ...c } : { brand: BRAND_DEFAULT, model: '', year: '', color: '', plate: '', showPlate: false, photoData: '' } };
  sheet = null;
  go('carForm');
}
function readForm() {
  const f = app.querySelector('form[data-form="car"]');
  if (!f) return;
  for (const n of ['brand', 'model', 'year', 'color', 'plate']) form.draft[n] = f.elements[n].value;
}
function submitForm() {
  readForm();
  const v = validateCar(form.draft, today);
  if (!v.ok) {
    form.errors = v.errors; render(); haptic('error');
    const first = ['brand', 'model', 'year'].find((n) => v.errors[n]);
    app.querySelector(`#f-${first}`)?.focus();
    return;
  }
  const r = upsertCar(state, { ...v.car, photoData: form.draft.photoData || '' }, form.carId, () => 'c' + Date.now().toString(36));
  state = r.state; persist();
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
    case 'month': { let [y, m] = ui.month; m += +el.dataset.d; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } ui.month = [y, m]; ui.sel = null; render(); break; }
    case 'pick-day': ui.sel = ui.sel === el.dataset.key ? null : el.dataset.key; render(); haptic(); break;
    case 'clear-day': ui.sel = null; render(); break;
    case 'open-event': go('event', el.dataset.id); break;
    case 'open-partner': go('partner', el.dataset.id); break;
    case 'open-people': go('participants', arg); break;
    case 'register': startRegister(arg); break;
    case 'pick-car': sheet.carId = el.dataset.id; renderSheet(); haptic(); break;
    case 'confirm-register': doRegister(sheet.eventId, sheet.carId); break;
    case 'close-sheet': sheet = null; renderSheet(); break;
    case 'add-car-for-event': openForm(null, sheet.eventId); break;
    case 'unregister': { const w = myStatus(state, arg) === 'wait'; state = unregister(state, arg); persist(); render(); toast(w ? 'Вы вышли из листа ожидания' : 'Запись отменена'); break; }
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
}
render();
