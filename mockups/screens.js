// Экраны первого этапа WDB CLUB — общий источник для mockups/stage-1.html и mockups/flows.html.
// Собраны только из компонентов дизайн-системы (ds/components.css).
// ---------- данные-заглушки ----------
const IMG = n => `img/${n}.jpg`;
const ic = (n, cls = 'icon') => `<svg class="${cls}"><use href="../ds/icons.svg#i-${n}"/></svg>`;
const plate = (n, r) => `<span class="plate"><span class="plate__n">${n}</span><span class="plate__r">${r}</span></span>`;

// ---------- каркас ----------
const appbar = back => `<div class="appbar">${back ? `<button class="appbar__back">${ic('left')}${back}</button>` : '<span></span>'}<span class="logo-tile" aria-label="WDB CLUB"></span></div>`;
const tabbar = on => `<nav class="tabbar">
  <button class="tab ${on === 'ev' ? 'is-on' : ''}">${ic('cal')}Мероприятия</button>
  <button class="tab ${on === 'me' ? 'is-on' : ''}">${ic('user')}Профиль</button></nav>`;
const phone = (body, { tab = 'ev', fixed = false, overlay = '' } = {}) =>
  `<div class="phone app ${fixed ? 'is-fixed' : ''}"><div class="grow">${body}</div>${tabbar(tab)}${overlay}</div>`;

// ---------- куски экранов ----------
function calendar(sel) {
  const days = [26,27,28,29,30,31,1, 2,3,4,5,6,7,8, 9,10,11,12,13,14,15, 16,17,18,19,20,21,22, 23,24,25,26,27,28,29, 30,1,2,3,4,5,6];
  const ev = [14, 21, 27];
  const cells = days.map((d, i) => {
    const out = i < 6 || i > 36;
    const cls = ['cal__d', out ? 'is-out' : '', !out && ev.includes(d) ? 'has-ev' : '', !out && d === 9 ? 'is-today' : '', !out && d === sel ? 'is-sel' : ''].join(' ');
    return `<div class="${cls}"><span>${d}</span></div>`;
  }).join('');
  return `<div class="month"><span class="month__name">Ноябрь 2026</span><span class="month__nav"><button>${ic('left')}</button><button>${ic('right')}</button></span></div>
    <div class="cal">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(w => `<div class="cal__wd">${w}</div>`).join('')}${cells}</div>`;
}
const evRow = (d, m, name, meta, tag = '') => `<button class="ev-row"><span class="ev-row__date"><span class="t-num">${d}</span><span class="t-label">${m}</span></span>
  <span class="ev-row__body"><span class="t-label">${meta[0]}</span><span class="ev-row__name">${name}</span><span class="t-caption">${meta[1]}</span></span>${tag}</button>`;
const TAG = { on: `<span class="tag tag--on">${ic('check')}Записаны</span>`, wait: '<span class="tag tag--wait">Ожидание</span>', full: '<span class="tag tag--full">Мест нет</span>' };

function eventScreen({ state, seats = 24, cap = 40 }) {
  const full = seats >= cap;
  const pct = Math.min(100, Math.round(seats / cap * 100));
  let cta = '';
  if (state === 'free') cta = `<button class="btn">Записаться</button>`;
  if (state === 'on') cta = `<button class="btn btn--done">${ic('check')}Вы записаны · E 55 AMG</button><div class="actions"><button class="link">Добавить в календарь</button><button class="link link--quiet">Отменить запись</button></div>`;
  if (state === 'full') cta = `<button class="btn">Встать в лист ожидания</button><div class="actions"><span class="t-caption">Перед вами в очереди 2 участника</span></div>`;
  if (state === 'wait') cta = `<button class="btn btn--done">Вы в листе ожидания · 3-й</button><div class="actions"><button class="link link--quiet">Выйти из листа ожидания</button></div>`;
  const tag = { on: TAG.on, wait: TAG.wait, full: TAG.full }[state] || '';
  const people = state === 'on' || state === 'wait'
    ? `<button class="link">Все участники</button>`
    : `<span class="t-caption">Имена и машины — после записи</span>`;
  return `${appbar('Мероприятия')}
    <div class="cover" style="background-image:url(${IMG('event-bashnya')})"></div>
    <div class="screen" style="padding-top:0">
      <div style="display:flex;justify-content:space-between;align-items:center"><span class="rubric">Заезд · ноябрь</span>${tag}</div>
      <h1 class="t-display" style="margin:10px 0 10px">Ночной заезд по&nbsp;Москве</h1>
      <p class="t-lede">Садовое кольцо, набережные, Воробьёвы горы. Финиш — кофе у партнёра.</p>
      <div class="facts">
        <div class="fact">${ic('cal')}<span class="t-label">Дата</span><span class="fact__v">суббота, 14 ноября</span></div>
        <div class="fact">${ic('clock')}<span class="t-label">Время</span><span class="fact__v">22:00<small>сбор в 21:30</small></span></div>
        <div class="fact">${ic('pin')}<span class="t-label">Старт</span><span class="fact__v">КВЦ «Башня»<small>Волоколамское ш., 71Ас1</small></span></div>
        <button class="fact">${ic('hand')}<span class="t-label">Партнёр</span><span class="fact__v">Винотека «Лоза» ›</span></button>
      </div>
      <div class="seats"><span><span class="t-num">${seats}</span> <span class="t-caption">из ${cap} мест</span></span>${full ? '<span class="t-label">Мест нет</span>' : `<span class="t-caption">осталось ${cap - seats}</span>`}</div>
      <div class="meter ${full ? 'meter--full' : ''}"><div class="meter__fill" style="width:${pct}%"></div></div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div class="thumbs"><span class="thumbs__i" style="background-image:url(${IMG('car-sls')})"></span><span class="thumbs__i" style="background-image:url(${IMG('car-amg-gt')})"></span><span class="thumbs__i" style="background-image:url(${IMG('car-w210-black')})"></span><span class="thumbs__i" style="background-image:url(${IMG('car-w210')})"></span><span class="thumbs__i">+${seats - 4}</span></div>
        ${people}
      </div>
      ${cta}
    </div>`;
}

const carCard = ({ owner = 'Иван Петров', brand = 'Mercedes-Benz', year = 2001, model = 'E 55 AMG', color = 'серебристый', photo = 'car-w210', plateHtml = plate('А 001 АА', '777'), badge = true }) =>
  `<div class="car-card"><div class="car-card__in">
    <div class="car-card__top"><span><b>${brand}</b> <span style="color:var(--ink-2)">| ${year}</span></span>${badge ? `<span class="car-card__badge">${owner}</span>` : ''}</div>
    <div class="car-card__rule"></div>
    <div class="car-card__model t-display">${model}</div>
    <div class="car-card__sub">${color}</div>
    <div class="car-card__photo" style="background-image:url(${IMG(photo)})"></div>
    <div class="car-card__specs">
      <div class="spec">${ic('brand')}<span class="t-label">Марка</span><span class="spec__v">${brand}</span></div>
      <div class="spec">${ic('car')}<span class="t-label">Модель</span><span class="spec__v">${model}</span></div>
      <div class="spec">${ic('cal')}<span class="t-label">Год выпуска</span><span class="spec__v">${year}</span></div>
      <div class="spec">${ic('drop')}<span class="t-label">Цвет</span><span class="spec__v">${color}</span></div>
      <div class="spec">${ic('plate')}<span class="t-label">Госномер</span><span class="spec__v">${plateHtml}</span></div>
    </div>
    <div class="car-card__foot"><span class="t-label">WDB CLUB</span><span class="t-label">№ 1 из 2</span></div>
  </div></div>`;

const carTile = (model, sub, photo) => `<button class="car-tile"><div class="car-tile__photo" style="background-image:url(${IMG(photo)})"></div><div class="car-tile__body"><div class="car-tile__model">${model}</div><div class="t-caption">${sub}</div></div></button>`;
const carOpt = (model, sub, photo, on) => `<button class="car-opt ${on ? 'is-on' : ''}"><span class="car-opt__photo" style="background-image:url(${IMG(photo)})"></span><span><span class="car-opt__model">${model}</span><span class="t-caption" style="display:block">${sub}</span></span><span class="radio"></span></button>`;
const person = (name, tg, model, sub, photo, plateHtml) => `<div class="person"><span class="person__photo" style="background-image:url(${IMG(photo)})"></span>
  <span><span class="person__name">${name}</span><span class="person__car" style="display:block">${model}</span><span class="person__meta"><span class="t-caption">${sub}</span>${plateHtml || ''}<a class="link" href="#">${ic('tg')}${tg}</a></span></span></div>`;

// ---------- экраны ----------
const S = [];
S.push(['Мероприятия', 'S1', 'Мероприятия', 'Календарь месяца и ближайшие мероприятия. Жёлтый день — есть мероприятие, обведён — сегодня. Справа статус участника.', phone(`${appbar()}
  <div class="screen"><span class="rubric">WDB CLUB · сезон 2026</span><h1 class="t-display" style="margin-top:10px">Мероприятия</h1>
  ${calendar()}
  <div class="section-head"><h2 class="t-title">Ближайшие</h2></div>
  ${evRow(14, 'ноя', 'Ночной заезд по Москве', ['Заезд', 'сб, 22:00 · КВЦ «Башня»'], TAG.on)}
  ${evRow(21, 'ноя', 'Клубный ужин', ['Встреча', 'сб, 19:00 · Винотека «Лоза»'], TAG.wait)}
  ${evRow(27, 'ноя', 'Уход за кузовом зимой', ['Мастер-класс', 'пт, 18:00 · Детейлинг «Стар»'], TAG.full)}
  </div>`)]);
S.push(['Мероприятия', 'S2', 'Мероприятия · выбран день', 'Тап по дню показывает мероприятия этого дня.', phone(`${appbar()}
  <div class="screen"><span class="rubric">WDB CLUB · сезон 2026</span><h1 class="t-display" style="margin-top:10px">Мероприятия</h1>
  ${calendar(21)}
  <div class="section-head"><h2 class="t-title">21 ноября</h2><button class="link link--quiet">Все</button></div>
  ${evRow(21, 'ноя', 'Клубный ужин', ['Встреча', 'сб, 19:00 · Винотека «Лоза»'], TAG.wait)}
  </div>`)]);
S.push(['Запись на мероприятие', 'S3', 'Мероприятие · места есть', 'Участник не записан: участники видны только миниатюрами.', phone(eventScreen({ state: 'free' }))]);
S.push(['Запись на мероприятие', 'S4', 'Выбор машины при записи', 'Машин несколько — участник выбирает, на какой едет.', phone(eventScreen({ state: 'free' }), { fixed: true, overlay: `<div class="scrim"><div class="sheet"><div class="sheet__grab"></div>
  <span class="rubric">Ночной заезд · 14 ноября</span><h2 class="t-title" style="margin:8px 0 8px">На какой машине едете?</h2>
  ${carOpt('E 55 AMG', 'Mercedes-Benz · 2001 · серебристый', 'car-w210', true)}${carOpt('AMG GT C Roadster', 'Mercedes-AMG · 2019 · жёлтый', 'car-amg-gt', false)}
  <div style="margin-top:20px"><button class="btn">Записаться</button></div></div></div>` })]);
S.push(['Запись на мероприятие', 'S5', 'Записаться без машины', 'Без машины записаться нельзя: шторка ведёт на добавление машины.', phone(eventScreen({ state: 'free' }), { fixed: true, overlay: `<div class="scrim"><div class="sheet"><div class="sheet__grab"></div>
  <div class="empty" style="padding:8px 0 24px"><h2 class="t-title">Сначала — машина</h2><p class="t-caption">На мероприятия клуба записываются вместе с машиной. Добавьте её — это займёт минуту, после сохранения вернём сюда.</p></div>
  <button class="btn">${ic('plus')}Добавить машину</button></div></div>` })]);
S.push(['Запись на мероприятие', 'S6', 'Мероприятие · вы записаны', 'Подтверждение тостом; в кнопке — машина, на которой едет участник.', phone(eventScreen({ state: 'on', seats: 25 }), { fixed: false, overlay: `<div class="toast">${ic('check')}Вы записаны на «Ночной заезд по Москве»</div>` })]);
S.push(['Запись на мероприятие', 'S7', 'Мероприятие · мест нет', 'Лимит набран — можно встать в лист ожидания.', phone(eventScreen({ state: 'full', seats: 40 }))]);
S.push(['Запись на мероприятие', 'S8', 'Мероприятие · в листе ожидания', 'Видна очередь участника, можно выйти.', phone(eventScreen({ state: 'wait', seats: 40 }))]);
S.push(['Участники', 'S9', 'Участники · вы записаны', 'Полный список: имя, машина, фото, Telegram. Госномер — только если владелец машины разрешил.', phone(`${appbar('Ночной заезд')}
  <div class="screen"><span class="rubric">Ночной заезд · 14 ноября</span><h1 class="t-display" style="margin:10px 0 6px">Участники</h1><p class="t-lede">25 из 40 мест</p>
  <div style="margin-top:20px;border-top:1px solid var(--ink)"></div>
  ${person('Иван Петров · вы', '@ivan_petrov', 'E 55 AMG', 'серебристый, 2001', 'car-w210', plate('А 001 АА', '777'))}
  ${person('Анна Кузнецова', '@anna_k', 'SLS AMG', 'белый, 2011', 'car-sls', plate('М 707 ММ', '799'))}
  ${person('Михаил Соколов', '@msokolov', 'E 430', 'чёрный, 2000', 'car-w210-black')}
  ${person('Дмитрий Волков', '@volkov_d', 'AMG GT C Roadster', 'жёлтый, 2019', 'car-amg-gt')}
  </div>`)]);
S.push(['Участники', 'S10', 'Участники · вы не записаны', 'Только миниатюры, без имён и номеров; призыв записаться.', phone(`${appbar('Ночной заезд')}
  <div class="screen"><span class="rubric">Ночной заезд · 14 ноября</span><h1 class="t-display" style="margin:10px 0 6px">Участники</h1><p class="t-lede">24 из 40 мест</p>
  <div class="thumbs" style="flex-wrap:wrap;gap:10px 0;padding-left:10px">${['car-sls','car-amg-gt','car-w210-black','car-w210','car-sls','car-amg-gt','car-w210','car-w210-black','car-amg-gt','car-sls','car-w210','car-w210-black'].map(p => `<span class="thumbs__i" style="width:56px;height:56px;background-image:url(${IMG(p)})"></span>`).join('')}<span class="thumbs__i" style="width:56px;height:56px">+12</span></div>
  <div class="empty" style="padding:24px 0"><h2 class="t-title">Кто едет — после записи</h2><p class="t-caption">Имена, машины и контакты участников видны тем, кто записан на мероприятие.</p></div>
  <button class="btn">Записаться</button></div>`)]);
S.push(['Партнёр', 'S11', 'Партнёр мероприятия', 'Открывается из карточки мероприятия. Как в прототипе, без карты участника.', phone(`${appbar('Ночной заезд')}
  <div class="screen"><div style="display:flex;gap:16px;align-items:center;margin-top:8px"><span class="partner-mark">ВЛ</span><span><span class="rubric">Партнёр клуба с 2024</span><h1 class="t-title" style="margin-top:6px">Винотека «Лоза»</h1></span></div>
  <p class="t-lede" style="margin-top:16px">Вино и бар на Пресненской набережной. Закрытые дегустации для участников клуба.</p>
  <div class="offer"><span class="t-label">Для участников клуба</span><div class="offer__text">−12% на счёт и закрытые дегустации</div><span class="t-caption" style="color:var(--ink)">Бессрочно</span></div>
  <div class="facts">
    <button class="fact">${ic('pin')}<span class="t-label">Адрес</span><span class="fact__v">Пресненская наб., 8</span></button>
    <button class="fact">${ic('phone')}<span class="t-label">Телефон</span><span class="fact__v">+7 900 000-00-06</span></button>
    <button class="fact">${ic('globe')}<span class="t-label">Сайт</span><span class="fact__v">loza-wine.ru</span></button>
  </div></div>`)]);
S.push(['Профиль и машины', 'S12', 'Профиль', 'Коллекция машин и записи участника.', phone(`${appbar()}
  <div class="screen"><div class="profile-head"><span class="avatar">ИП</span><span><h1 class="t-title">Иван Петров</h1><span class="t-caption">@ivan_petrov · в клубе с 2024</span></span></div>
  <div class="section-head"><h2 class="t-title">Мои машины</h2><span class="t-label" style="color:var(--ink-2)">2</span></div>
  <div class="car-strip">${carTile('E 55 AMG', 'Mercedes-Benz · 2001', 'car-w210')}${carTile('AMG GT C', 'Mercedes-AMG · 2019', 'car-amg-gt')}<button class="car-tile car-tile--add">${ic('plus')}<span class="t-label">Добавить</span></button></div>
  <div class="section-head"><h2 class="t-title">Мои записи</h2></div>
  ${evRow(14, 'ноя', 'Ночной заезд по Москве', ['Заезд', 'на E 55 AMG'], TAG.on)}
  ${evRow(21, 'ноя', 'Клубный ужин', ['Встреча', '3-й в очереди'], TAG.wait)}
  </div>`, { tab: 'me' })]);
S.push(['Профиль и машины', 'S13', 'Профиль новичка', 'Машин и записей ещё нет.', phone(`${appbar()}
  <div class="screen"><div class="profile-head"><span class="avatar">АК</span><span><h1 class="t-title">Алексей Ким</h1><span class="t-caption">@alexkim</span></span></div>
  <div class="section-head"><h2 class="t-title">Мои машины</h2></div>
  <div class="car-strip"><button class="car-tile car-tile--add" style="width:100%">${ic('plus')}<span class="t-label">Добавить машину</span><span class="t-caption">без машины на мероприятия не записаться</span></button></div>
  <div class="section-head"><h2 class="t-title">Мои записи</h2></div>
  <div class="empty"><h2 class="t-title">Пока пусто</h2><p class="t-caption">Запишитесь на ближайшее мероприятие — оно появится здесь.</p><button class="link">К мероприятиям</button></div>
  </div>`, { tab: 'me' })]);
S.push(['Профиль и машины', 'S14', 'Машина', 'Коллекционная карточка: так машину видят участники мероприятия. Госномер показан, потому что владелец разрешил.', phone(`${appbar('Профиль')}
  <div class="screen" style="padding-top:4px">${carCard({})}
  <div class="actions"><button class="link">Изменить</button></div></div>`, { tab: 'me' })]);
S.push(['Профиль и машины', 'S15', 'Добавить машину', 'Стандартные поля и фото. Переключатель решает, видят ли госномер другие участники. Пример ошибки — пустой обязательный год. Открыт из профиля (S12, S13).', phone(`${appbar('Профиль')}
  <div class="screen"><span class="rubric">Моя машина</span><h1 class="t-display" style="margin:10px 0 20px">Новая машина</h1>
  <button class="upload" style="width:100%">${ic('camera')}<span class="t-label">Фото машины</span><span class="t-caption">лучше сбоку, при дневном свете</span></button>
  <label class="field is-focus"><span class="field__label t-label">Марка</span><input class="field__input" value="Mercedes-Benz"></label>
  <label class="field"><span class="field__label t-label">Модель</span><input class="field__input" placeholder="например, E 55 AMG"></label>
  <div class="field-row"><label class="field is-error"><span class="field__label t-label">Год выпуска</span><input class="field__input" placeholder="2001"><span class="field__err">Укажите год</span></label>
  <label class="field"><span class="field__label t-label">Цвет</span><input class="field__input" placeholder="серебристый"></label></div>
  <label class="field"><span class="field__label t-label">Госномер</span><input class="field__input" placeholder="А 001 АА 777"></label>
  <button class="toggle"><span><span style="display:block">Показывать госномер участникам</span><span class="t-caption">Владелец видит номер всегда</span></span><span class="switch is-on"></span></button>
  <div style="margin-top:28px"><button class="btn">Сохранить</button></div>
  </div>`, { tab: 'me' })]);
S.push(['Профиль и машины', 'S16', 'Добавить машину · из записи', 'Открыт из шторки «Сначала — машина» (S5). Поля заполнены, фото загружено. «Сохранить и записаться» сохраняет машину, записывает на мероприятие и возвращает к нему (S6).', phone(`${appbar('Ночной заезд')}
  <div class="screen"><span class="rubric">Для записи на ночной заезд</span><h1 class="t-display" style="margin:10px 0 20px">Новая машина</h1>
  <button class="upload" style="width:100%;background-image:url(${IMG('car-w210')});background-size:cover;background-position:center"></button>
  <label class="field"><span class="field__label t-label">Марка</span><input class="field__input" value="Mercedes-Benz"></label>
  <label class="field"><span class="field__label t-label">Модель</span><input class="field__input" value="E 55 AMG"></label>
  <div class="field-row"><label class="field"><span class="field__label t-label">Год выпуска</span><input class="field__input" value="2001"></label>
  <label class="field"><span class="field__label t-label">Цвет</span><input class="field__input" value="серебристый"></label></div>
  <label class="field"><span class="field__label t-label">Госномер</span><input class="field__input" value="А 001 АА 777"></label>
  <button class="toggle"><span><span style="display:block">Показывать госномер участникам</span><span class="t-caption">Владелец видит номер всегда</span></span><span class="switch is-on"></span></button>
  <div style="margin-top:28px"><button class="btn">Сохранить и записаться</button></div>
  </div>`)]);
window.SCREENS = S;
