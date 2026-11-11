// Экраны первого этапа (#2). Только разметка на классах ДС (ds/components.css);
// вид совпадает с согласованными макетами S1–S16 (mockups/screens.js), ТЗ — docs/screens/*.md.
// Действия — атрибуты data-act (обрабатывает app/main.js).
import {
  MONTHS, MONTHS_GEN, MONTHS_SHORT, WD_SHORT, WEEKDAYS, parseDate, upcoming, isPast,
  myStatus, seatsTaken, waitPosition, queueAhead, eventState, listTag, canSeeParticipants, myRegs, splitPlate, plural, initials, BRAND_DEFAULT,
} from './logic.js';
import { EVENTS, partnerOf, img } from './data.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const ic = (n) => `<svg class="icon" aria-hidden="true"><use href="ds/icons.svg#i-${n}"/></svg>`;
const bg = (src) => (src ? ` style="background-image:url('${esc(src)}')"` : '');
const carPhoto = (car) => car.photoData || (car.photo ? img(car.photo) : '');
const evById = (id) => EVENTS.find((e) => e.id === id);
/** Миниатюра участника: фото машины, без машины (#10) — инициалы. */
const thumb = (p, style = '') => (p.car?.photo
  ? `<span class="thumbs__i" style="${style}background-image:url('${esc(img(p.car.photo))}')"></span>`
  : `<span class="thumbs__i"${style ? ` style="${style}"` : ''}>${esc(p.initials || initials(p.name || '') || '·')}</span>`);

export function plate(p) {
  const s = splitPlate(p);
  if (!s) return '';
  return `<span class="plate"><span class="plate__n">${esc(s.n)}</span>${s.r ? `<span class="plate__r">${esc(s.r)}</span>` : ''}</span>`;
}
const TAGS = {
  on: `<span class="tag tag--on">${ic('check')}Записаны</span>`,
  wait: '<span class="tag tag--wait">Ожидание</span>',
  full: '<span class="tag tag--full">Мест нет</span>',
};
const dayLabel = (e) => { const d = parseDate(e.date); return `${WD_SHORT[d.getDay()]}, ${e.time}`; };

function evRow(e, sub, tag, from) {
  const d = parseDate(e.date);
  return `<button class="ev-row" data-act="open-event" data-id="${e.id}" data-from="${from}"><span class="ev-row__date"><span class="t-num">${d.getDate()}</span><span class="t-label">${MONTHS_SHORT[d.getMonth()]}</span></span>
    <span class="ev-row__body"><span class="t-label">${esc(e.type)}</span><span class="ev-row__name">${esc(e.name)}</span><span class="t-caption">${esc(sub)}</span></span>${tag ? TAGS[tag] : '<span></span>'}</button>`;
}

// ================= Мероприятия (S1, S2; #14 — без календаря, карточки с картинкой) =================
/** Кнопка записи по состоянию: в списке (data-id) и в закреплённой панели карточки. */
function ctaFor(e, state, today, withId) {
  const st = eventState(e, state, today);
  const id = withId ? ` data-id="${e.id}"` : '';
  const reg = state.regs[e.id];
  const myCar = reg && state.cars.find((c) => c.id === reg.carId);
  if (st === 'free') return `<button class="btn" data-act="register"${id}>Записаться</button>`;
  if (st === 'full') return `<button class="btn" data-act="register"${id}>Встать в лист ожидания</button>`;
  if (st === 'on') return `<button class="btn btn--done" data-act="${withId ? 'open-event' : 'noop'}"${id}>${ic('check')}Вы записаны${myCar ? ' · ' + esc(myCar.model) : ''}</button>`;
  if (st === 'wait') return `<button class="btn btn--done" data-act="${withId ? 'open-event' : 'noop'}"${id}>Вы в листе ожидания · ${waitPosition(e, state)}-й</button>`;
  return '';
}
export function viewEvents({ state, today }) {
  const cards = upcoming(EVENTS, today).map((e) => `<div style="margin-bottom:var(--sp-32)">
    <button class="cover" style="display:block;width:100%;margin-bottom:0${e.cover ? `;background-image:url('${esc(img(e.cover))}')` : ''}" data-act="open-event" data-id="${e.id}" aria-label="${esc(e.name)}"></button>
    ${evRow(e, `${dayLabel(e)} · ${e.place}`, null, 'events')}
    <div style="margin-top:var(--sp-16)">${ctaFor(e, state, today, true)}</div></div>`).join('');
  return `<div class="screen"><span class="rubric">WDB CLUB · сезон ${today.getFullYear()}</span><h1 class="t-display" style="margin:10px 0 24px">Мероприятия</h1>
    ${cards || '<div class="empty"><h2 class="t-title">Скоро анонс</h2><p class="t-caption">Новые мероприятия появятся здесь.</p></div>'}
  </div>`;
}

/** Закреплённая панель записи на карточке мероприятия (#14). */
export function eventDock({ state, today }, id) {
  const e = evById(id);
  if (!e) return '';
  const st = eventState(e, state, today);
  let extra = '';
  if (st === 'full') { const n = queueAhead(e); extra = `<div class="actions" style="margin-top:var(--sp-8)"><span class="t-caption">${n ? `Перед вами в очереди ${n} ${plural(n, 'участник', 'участника', 'участников')}` : 'Вы будете первым в очереди'}</span></div>`; }
  if (st === 'past') return '<div class="actions" style="margin-top:0"><span class="t-caption">Мероприятие прошло</span></div>';
  return ctaFor(e, state, today, false) + extra;
}

// ================= Карточка мероприятия (S3, S6–S8) =================
export function viewEvent({ state, today }, id) {
  const e = evById(id);
  const d = parseDate(e.date);
  const st = eventState(e, state, today);
  const taken = seatsTaken(e, state);
  const full = taken >= e.cap;
  const reg = state.regs[e.id];
  const myCar = reg && state.cars.find((c) => c.id === reg.carId);
  const partner = partnerOf(e);
  const seeAll = canSeeParticipants(state, e.id);
  const thumbs = e.others.slice(0, 4).map((p) => thumb(p)).join('');
  const rest = e.others.length - Math.min(4, e.others.length);
  // основная кнопка — в закреплённой панели (eventDock, #14); здесь — календарь и отмена
  let cta = '';
  if (st === 'on') cta = '<div class="actions"><button class="link" data-act="ics">Добавить в календарь</button><button class="link link--quiet" data-act="unregister">Отменить запись</button></div>';
  if (st === 'wait') cta = '<div class="actions"><button class="link link--quiet" data-act="unregister">Выйти из листа ожидания</button></div>';
  const tag = st === 'on' || st === 'wait' || st === 'full' ? TAGS[st] : '';
  return `<div class="cover"${bg(img(e.cover))}></div>
    <div class="screen" style="padding-top:0">
      <div style="display:flex;justify-content:space-between;align-items:center"><span class="rubric">${esc(e.type)} · ${MONTHS[d.getMonth()].toLowerCase()}</span>${tag}</div>
      <h1 class="t-display" style="margin:10px 0 10px">${esc(e.name)}</h1>
      <p class="t-lede">${esc(e.desc)}</p>
      <div class="facts">
        <div class="fact">${ic('cal')}<span class="t-label">Дата</span><span class="fact__v">${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}</span></div>
        <div class="fact">${ic('clock')}<span class="t-label">Время</span><span class="fact__v">${esc(e.time)}${e.gather ? `<small>сбор в ${esc(e.gather)}</small>` : ''}</span></div>
        <div class="fact">${ic('pin')}<span class="t-label">${e.type === 'Заезд' ? 'Старт' : 'Место'}</span><span class="fact__v">${esc(e.place)}${e.address ? `<small>${esc(e.address)}</small>` : ''}</span></div>
        ${partner ? `<button class="fact" data-act="open-partner" data-id="${partner.id}">${ic('hand')}<span class="t-label">Партнёр</span><span class="fact__v">${esc(partner.name)} ›</span></button>` : ''}
      </div>
      <div class="seats"><span><span class="t-num">${taken}</span> <span class="t-caption">из ${e.cap} мест</span></span>${full ? '<span class="t-label">Мест нет</span>' : `<span class="t-caption">осталось ${e.cap - taken}</span>`}</div>
      <div class="meter${full ? ' meter--full' : ''}"><div class="meter__fill" style="width:${Math.min(100, Math.round((taken / e.cap) * 100))}%"></div></div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <button class="thumbs" data-act="open-people" aria-label="Участники">${thumbs}${rest > 0 ? `<span class="thumbs__i">+${rest}</span>` : ''}</button>
        ${seeAll ? '<button class="link" data-act="open-people">Все участники</button>' : `<span class="t-caption">${e.noCar ? 'Кто идёт — после записи' : 'Имена и машины — после записи'}</span>`}
      </div>
      ${cta}
    </div>`;
}

// ================= Шторки записи (S4, S5) =================
export function sheetPickCar({ state }, e, selected) {
  const opts = state.cars.map((c) => `<button class="car-opt${c.id === selected ? ' is-on' : ''}" data-act="pick-car" data-id="${c.id}"><span class="car-opt__photo"${bg(carPhoto(c))}></span><span><span class="car-opt__model">${esc(c.model)}</span><span class="t-caption" style="display:block">${esc([c.brand, c.year, c.color].filter(Boolean).join(' · '))}</span></span><span class="radio"></span></button>`).join('');
  const d = parseDate(e.date);
  return `<div class="sheet__grab"></div><span class="rubric">${esc(e.name)} · ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}</span><h2 class="t-title" style="margin:8px 0 8px">На какой машине едете?</h2>${opts}
    <div style="margin-top:20px"><button class="btn" data-act="confirm-register">${seatsTaken(e, state) < e.cap ? 'Записаться' : 'Встать в лист ожидания'}</button></div>`;
}
export const sheetNeedCar = () => `<div class="sheet__grab"></div>
  <div class="empty" style="padding:8px 0 24px"><h2 class="t-title">Сначала — машина</h2><p class="t-caption">На мероприятия Клуба записываются вместе с машиной. Добавьте её — это займёт минуту, после сохранения вернём сюда.</p></div>
  <button class="btn" data-act="add-car-for-event">${ic('plus')}Добавить машину</button>`;

export const sheetDeleteCar = (c) => `<div class="sheet__grab"></div>
  <div class="empty" style="padding:8px 0 24px"><h2 class="t-title">Удалить ${esc(c.model)}?</h2><p class="t-caption">Машина пропадёт из профиля. Прошлые записи на ней останутся у организаторов.</p></div>
  <button class="btn" data-act="confirm-delete-car" data-id="${c.id}">Удалить</button>
  <div class="actions"><button class="link link--quiet" data-act="close-sheet">Отмена</button></div>`;

// ================= Вне Telegram и загрузка (#8) =================
export const viewOpenInTelegram = () => `<div class="screen"><div class="empty" style="padding:48px 0 24px"><h2 class="t-title">Откройте в Telegram</h2><p class="t-caption">Запись на мероприятия Клуба работает внутри Telegram: так мы знаем, кто записывается.</p></div>
  <a class="btn" href="https://t.me/wdbclub_bot" style="text-decoration:none">${ic('tg')}Открыть @wdbclub_bot</a></div>`;
export const viewLoading = () => '<div class="screen"><div class="empty" style="padding:48px 0"><p class="t-caption">Загружаем…</p></div></div>';
export const viewLoadError = () => `<div class="screen"><div class="empty" style="padding:48px 0 24px"><h2 class="t-title">Нет связи</h2><p class="t-caption">Не удалось загрузить данные Клуба.</p></div>
  <button class="btn" data-act="reload">Попробовать ещё раз</button></div>`;

// ================= Участники (S9, S10) =================
export function viewParticipants({ state, today, me }, id) {
  const e = evById(id);
  const d = parseDate(e.date);
  const taken = seatsTaken(e, state);
  const head = `<span class="rubric">${esc(e.name)} · ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}</span><h1 class="t-display" style="margin:10px 0 6px">Участники</h1><p class="t-lede">${taken} из ${e.cap} мест</p>`;
  if (!canSeeParticipants(state, e.id)) {
    const grid = e.others.slice(0, 12).map((p) => thumb(p, 'width:56px;height:56px;')).join('');
    const rest = e.others.length - Math.min(12, e.others.length);
    return `<div class="screen">${head}
      ${e.others.length ? `<div class="thumbs" style="flex-wrap:wrap;gap:10px 0;padding-left:10px">${grid}${rest > 0 ? `<span class="thumbs__i" style="width:56px;height:56px">+${rest}</span>` : ''}</div>` : ''}
      <div class="empty" style="padding:24px 0"><h2 class="t-title">${e.others.length ? (e.noCar ? 'Кто идёт — после записи' : 'Кто едет — после записи') : 'Пока никого'}</h2><p class="t-caption">${e.others.length ? (e.noCar ? 'Имена и контакты участников видны тем, кто записан на мероприятие.' : 'Имена, машины и контакты участников видны тем, кто записан на мероприятие.') : 'Станьте первым.'}</p></div>
      ${isPast(e, today) ? '' : `<button class="btn" data-act="register">${seatsTaken(e, state) < e.cap ? 'Записаться' : 'Встать в лист ожидания'}</button>`}</div>`;
  }
  const reg = state.regs[e.id];
  const myCar = reg && state.cars.find((c) => c.id === reg.carId);
  // без машины (#10): вместо фото машины — аватар с инициалами (компонент ДС .avatar), без модели
  const person = (name, tg, car, plateHtml, photo) => `<div class="person">${car ? `<span class="person__photo"${bg(photo)}></span>` : `<span class="avatar">${esc(initials(name))}</span>`}
    <span><span class="person__name">${esc(name)}</span>${car ? `<span class="person__car" style="display:block">${esc(car.model)}</span>` : ''}<span class="person__meta">${car ? `<span class="t-caption">${esc([car.color, car.year].filter(Boolean).join(', '))}</span>` : ''}${plateHtml}${tg ? `<a class="link" href="https://t.me/${esc(tg.slice(1))}" data-act="tg" data-tg="${esc(tg.slice(1))}">${ic('tg')}${esc(tg)}</a>` : ''}</span></span></div>`;
  const mine = myCar ? person(`${me.name} · вы`, me.tg, myCar, myCar.showPlate ? plate(myCar.plate) : '', carPhoto(myCar))
    : reg ? person(`${me.name} · вы`, me.tg, null, '', '') : '';
  const others = e.others.map((p) => person(p.name, p.tg, p.car, p.car?.plate ? plate(p.car.plate) : '', p.car ? img(p.car.photo) : '')).join('');
  return `<div class="screen">${head}<div style="margin-top:20px;border-top:1px solid var(--ink)"></div>${mine}${others}</div>`;
}

// ================= Партнёр (S11) =================
export function viewPartner(_, p) {
  return `<div class="screen"><div style="display:flex;gap:16px;align-items:center;margin-top:8px"><span class="partner-mark">${esc(p.mark)}</span><span><span class="rubric">Партнёр Клуба с ${p.since}</span><h1 class="t-title" style="margin-top:6px">${esc(p.name)}</h1></span></div>
    <p class="t-lede" style="margin-top:16px">${esc(p.about)}</p>
    <div class="offer"><span class="t-label">Для участников Клуба</span><div class="offer__text">${esc(p.offer)}</div><span class="t-caption" style="color:var(--ink)">${esc(p.until)}</span></div>
    <div class="facts">
      <a class="fact" style="text-decoration:none" href="https://yandex.ru/maps/?text=${encodeURIComponent('Москва, ' + p.addr)}" target="_blank" rel="noopener">${ic('pin')}<span class="t-label">Адрес</span><span class="fact__v">${esc(p.addr)}</span></a>
      <a class="fact" style="text-decoration:none" href="tel:${esc(p.tel.replace(/[^+\d]/g, ''))}">${ic('phone')}<span class="t-label">Телефон</span><span class="fact__v">${esc(p.tel)}</span></a>
      <a class="fact" style="text-decoration:none" href="https://${esc(p.site)}" target="_blank" rel="noopener">${ic('globe')}<span class="t-label">Сайт</span><span class="fact__v">${esc(p.site)}</span></a>
    </div></div>`;
}

// ================= Профиль (S12, S13) =================
export function viewProfile({ state, today, me }) {
  const tiles = state.cars.map((c) => `<button class="car-tile" data-act="open-car" data-id="${c.id}"><div class="car-tile__photo"${bg(carPhoto(c))}></div><div class="car-tile__body"><div class="car-tile__model">${esc(c.model)}</div><div class="t-caption">${esc(c.brand)} · ${esc(c.year)}</div></div></button>`).join('');
  const strip = state.cars.length
    ? `${tiles}<button class="car-tile car-tile--add" data-act="add-car">${ic('plus')}<span class="t-label">Добавить</span></button>`
    : `<button class="car-tile car-tile--add" style="width:100%" data-act="add-car">${ic('plus')}<span class="t-label">Добавить машину</span><span class="t-caption">без машины на мероприятия не записаться</span></button>`;
  const regs = myRegs(EVENTS, state, today).map((e) => {
    const r = state.regs[e.id];
    const car = state.cars.find((c) => c.id === r.carId);
    const sub = r.status === 'on' ? (car ? `на ${car.model}` : 'записаны') : `${waitPosition(e, state)}-й в очереди`;
    return evRow(e, sub, r.status, 'profile');
  }).join('');
  return `<div class="screen"><div class="profile-head"><span class="avatar"${bg(me.photo)}>${me.photo ? '' : esc(initials(me.name))}</span><span><h1 class="t-title">${esc(me.name)}</h1><span class="t-caption">${esc([me.tg, state.organizer ? 'организатор' : ''].filter(Boolean).join(' · '))}</span></span></div>
    <div class="section-head"><h2 class="t-title">Мои машины</h2>${state.cars.length ? `<span class="t-label" style="color:var(--ink-2)">${state.cars.length}</span>` : ''}</div>
    <div class="car-strip">${strip}</div>
    <div class="section-head"><h2 class="t-title">Мои записи</h2></div>
    ${regs || '<div class="empty"><h2 class="t-title">Пока пусто</h2><p class="t-caption">Запишитесь на ближайшее мероприятие — оно появится здесь.</p><button class="link" data-act="tab" data-tab="events">К мероприятиям</button></div>'}
  </div>`;
}

// ================= Машина (S14) =================
export function viewCar({ state, me }, id) {
  const c = state.cars.find((x) => x.id === id);
  const k = state.cars.indexOf(c) + 1;
  return `<div class="screen" style="padding-top:4px"><div class="car-card"><div class="car-card__in">
    <div class="car-card__top"><span><b>${esc(c.brand)}</b> <span style="color:var(--ink-2)">| ${esc(c.year)}</span></span><span class="car-card__badge">${esc(me.name)}</span></div>
    <div class="car-card__rule"></div>
    <div class="car-card__model t-display">${esc(c.model)}</div>
    <div class="car-card__sub">${esc(c.color || ' ')}</div>
    <div class="car-card__photo"${bg(carPhoto(c))}></div>
    <div class="car-card__specs">
      <div class="spec">${ic('brand')}<span class="t-label">Марка</span><span class="spec__v">${esc(c.brand)}</span></div>
      <div class="spec">${ic('car')}<span class="t-label">Модель</span><span class="spec__v">${esc(c.model)}</span></div>
      <div class="spec">${ic('cal')}<span class="t-label">Год выпуска</span><span class="spec__v">${esc(c.year)}</span></div>
      <div class="spec">${ic('drop')}<span class="t-label">Цвет</span><span class="spec__v">${esc(c.color || '—')}</span></div>
      <div class="spec">${ic('plate')}<span class="t-label">Госномер</span><span class="spec__v">${plate(c.plate) || '—'}</span></div>
    </div>
    <div class="car-card__foot"><span class="t-label">WDB CLUB</span><span class="t-label">№ ${k} из ${state.cars.length}</span></div>
  </div></div>
  <div class="actions"><button class="link" data-act="edit-car" data-id="${c.id}">Изменить</button><button class="link link--quiet" data-act="delete-car" data-id="${c.id}">Удалить</button></div></div>`;
}

// ================= Форма машины (S15, S16) =================
export function viewCarForm({ state }, { carId, eventId, draft, errors = {} }) {
  const c = draft;
  const e = eventId && evById(eventId);
  const editing = carId && state.cars.some((x) => x.id === carId);
  const field = (name, label, ph, cls = '') => `<label class="field${errors[name] ? ' is-error' : ''}${cls}"><span class="field__label t-label">${label}</span><input class="field__input" id="f-${name}" name="${name}" value="${esc(c[name] ?? '')}" placeholder="${ph}" autocomplete="off"${name === 'year' ? ' inputmode="numeric" maxlength="4"' : ''}>${errors[name] ? `<span class="field__err">${errors[name]}</span>` : ''}</label>`;
  return `<form class="screen" data-form="car" novalidate><span class="rubric">${e ? `Для записи на ${esc(e.name.toLowerCase())}` : 'Моя машина'}</span><h1 class="t-display" style="margin:10px 0 20px">${editing ? esc(c.model || 'Машина') : 'Новая машина'}</h1>
    <button type="button" class="upload" style="width:100%${c.photoData ? `;background-image:url('${c.photoData}');background-size:cover;background-position:center` : ''}" data-act="pick-photo" aria-label="Фото машины">${c.photoData ? '' : `${ic('camera')}<span class="t-label">Фото машины</span><span class="t-caption">лучше сбоку, при дневном свете</span>`}</button>
    <input type="file" id="f-photo" accept="image/*" hidden>
    ${errors.photo ? `<span class="field__err">${errors.photo}</span>` : ''}
    ${field('brand', 'Марка', BRAND_DEFAULT)}
    ${field('model', 'Модель', 'например, E 55 AMG')}
    <div class="field-row">${field('year', 'Год выпуска', '2001')}${field('color', 'Цвет', 'серебристый')}</div>
    ${field('plate', 'Госномер', 'А 001 АА 777')}
    <button type="button" class="toggle" data-act="toggle-plate" role="switch" aria-checked="${c.showPlate ? 'true' : 'false'}"><span><span style="display:block">Показывать госномер участникам</span><span class="t-caption">Владелец видит номер всегда</span></span><span class="switch${c.showPlate ? ' is-on' : ''}"></span></button>
    <div style="margin-top:28px"><button type="submit" class="btn">${e ? 'Сохранить и записаться' : 'Сохранить'}</button></div>
  </form>`;
}
