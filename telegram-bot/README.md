# Telegram-бот сотрудника

Эта папка содержит отдельный процесс Telegram-бота и его локальную конфигурацию.

## Что внутри
- `worker.mjs` - основной процесс бота (long polling).
- `.env.local` - локальные настройки бота (токен, секрет, интервалы, привязки).
- `ЖУРНАЛ-РАБОТ.md` - журнал изменений по Telegram-боту.
- `ЛОГИКА-БОТА-И-МЕНЮ.md` - назначение бота, меню, команды, кнопки и переходы.

## Быстрый старт
1. Создайте `telegram-bot/.env.local` на основе `telegram-bot/.env.example` и заполните значения.
2. Запустите проект через `START.bat` или `START.ps1` (бот поднимется автоматически).
3. Либо запустите бота вручную:
```bash
npm run bot:telegram
```

## Где заполнять ENV
- Корневой `.env.local` - общие настройки проекта (Go backend, AI), `TELEGRAM_BOT_SECRET` для internal API в Next.js и `TELEGRAM_WEBAPP_SESSION_TTL_SEC`.
- `telegram-bot/.env.local` - только настройки Telegram-бота.

## Пример запуска
```bash
TELEGRAM_BOT_ENABLED=false npm run bot:telegram
```
Ожидаемое поведение: бот завершается корректно с сообщением, что он отключен.

## Типовые ошибки
- `TELEGRAM_BOT_TOKEN is required`:
  - не заполнен `TELEGRAM_BOT_TOKEN` в `telegram-bot/.env.local`.
- `TELEGRAM_BOT_SECRET is required`:
  - не заполнен `TELEGRAM_BOT_SECRET` в `telegram-bot/.env.local`.
- `Failed to refresh employee mappings from web`:
  - приложение недоступно по `TELEGRAM_APP_BASE_URL` или секрет не совпадает.
- Бот не отвечает сотруднику:
  - у сотрудника не заполнен `Telegram Chat ID` в `/employees`
  - или отсутствует привязка в `TELEGRAM_EMPLOYEE_CHAT_MAP_JSON`.

## Примечания
- Бот использует internal API: `/api/telegram/internal/*`.
- Внутренние запросы защищены заголовком `x-telegram-bot-secret`.
- Основной рабочий сценарий: `/wash` (чатовый мастер оформления мойки).
- Команда `/credentials` выдает сотруднику его логин/пароль от веба (только для привязанного `chatId`).
- Для запуска рабочей станции из Telegram используется WebApp-вход:
  - internal: `POST /api/telegram/internal/webapp-session/create`;
  - public: `GET /api/telegram/webapp-login?token=...`.
- Если `TELEGRAM_APP_BASE_URL` на `http://localhost`/`http://127.0.0.1`, бот отправляет ссылку текстом (без URL-кнопки), потому что Telegram отклоняет localhost URL в inline-клавиатуре.
- Привязка сотрудника к chatId задается:
  - через `TELEGRAM_EMPLOYEE_CHAT_MAP_JSON`;
  - или через поле `Telegram Chat ID` в вебе (`/employees`).
- `/wash` запускается только если сотрудник назначен в смену на сегодня.
- В `/wash` можно:
  - выбрать команду исполнителей;
  - ввести номер текстом или отправить фото для OCR;
  - выбрать оплату (нал/карта/перевод/агрегатор/по договору);
  - выбрать услуги (поиск, повтор прошлой мойки, произвольные услуги);
  - подтвердить и зарегистрировать мойку.
- Новая команда сотрудника: `/workstation` (выдает одноразовую кнопку открытия `/employee/workstation`).
- Команда `/wash` добавлена в главное меню кнопкой `🚗 Оформить мойку`.
- Главное меню структурировано по блокам (станция, график, заявки, финансы, помощь) и показывает краткую сводку по сотруднику.
- В мастере заявки на смену поддерживаются даты в форматах `YYYY-MM-DD` и `DD.MM.YYYY`.
