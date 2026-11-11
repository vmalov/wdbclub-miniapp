# WDB CLUB — мини-приложение

Telegram-мини-апп Клуба WDB CLUB: запись на мероприятия, профиль машины, участники. Сервер с общей базой (#8): приложение и API на одной ВМ в Yandex Cloud, работает только внутри Telegram (@wdbclub_bot).

- Приложение: https://wdb-club.ru/ (временный адрес до делегирования домена — https://84-201-147-75.sslip.io/)
- Прототип без сервера (первый этап): https://vmalov.github.io/wdbclub-miniapp/
- Дизайн-система: https://vmalov.github.io/wdbclub-miniapp/design-system.html
- Сценарии: https://vmalov.github.io/wdbclub-miniapp/mockups/flows.html

Документы — `docs/` (сервер и выкатка — `docs/server.md`, правила записи — `docs/registration.md`, экраны — `docs/screens/`), контекст для разработки — `CLAUDE.md`. Тесты: `npm test`, `npm run e2e`. Выкатка: `tools/deploy.sh`, проверка прода: `BOT_TOKEN=… node tools/smoke.mjs <адрес>`.
