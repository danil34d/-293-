# Менеджер автомойки

Система управления автомойкой: учёт моек, сотрудники, смены, зарплата, расходы, склад химии, контрагенты, агрегаторы, счета и аналитика. Рядом — терминал в боксе (Android APK), кабинет сотрудника, Telegram-бот и дашборд камер с распознаванием номеров.

> Обновлено 28.09.2026. Документы в `docs/` написаны в марте 2026, до перехода на PostgreSQL, — это история, а не инструкция. Живая база знаний — Obsidian vault `D:\автомойка\ВАЖНОЕ-АВТОМОЙКА 01\`.

## Технологии

- **Приложение:** Next.js 14 (App Router) — страницы и API-роуты, React 18, TypeScript, Tailwind, shadcn/ui (Radix)
- **Данные:** PostgreSQL через Prisma 5 (`prisma/schema.prisma`, 28 моделей). SQLite — только для AI-ассистента (`data/ai-assistant.db`)
- **AI:** GLM API (ассистент, фоновый анализ), Genkit (AI-отчёт)
- **Telegram:** Node.js worker (`telegram-bot/worker.mjs`)
- **Камеры и OCR:** отдельный FastAPI-дашборд на машине с камерами (`CAMERA_DASHBOARD_BASE_URL`, по умолчанию `192.168.1.59:8050`)

## Где что работает

| Что | Где |
|---|---|
| Прод | `192.168.1.150:3000`, systemd-сервис `carwash-web`, код в `/srv/carwash/app` (`/home/carwash/Project` — symlink на него) |
| Конфиг прода | `/etc/default/carwash` (`DATA_SOURCE`, `DATABASE_URL`, `COOKIE_SECRET`, …) |
| База | PostgreSQL `carwash` на том же сервере |
| Терминал | APK `com.carwash.local.kiosk` на телефоне в боксе, открывает `/k` → `/kiosk` |

## Слой данных — правило

Код ходит в данные **только через `@/lib/data`** (`src/lib/data/index.ts`). Он выбирает адаптер по `DATA_SOURCE`:

- `postgres` → `src/lib/data/pg-adapter.ts` — **прод**;
- `json` → `src/lib/data-loader.ts` — фолбэк для локальной разработки без базы (не удалять).

Модули данных — серверные и **не помечаются `'use server'`**: с этой директивой каждая экспортируемая функция становится server action без проверки ролей. Клиентские компоненты получают данные только через API-роуты с `requireAdmin` / `requireAuth` (`src/lib/server-auth.ts`).

Роли: `admin`, `employee`, `kiosk` / `kiosk1` (терминал — устройство, не человек; проверять через `isKiosk()` из `src/lib/employee-role.ts`, не литералом).

## Разработка

```bash
npm install
cp .env.example .env.local   # заполнить DATABASE_URL, COOKIE_SECRET
npx prisma generate
npm run dev
```

Проверки:

```bash
npm run typecheck
node --experimental-strip-types scripts/test-without-device-employees.mjs
node --experimental-strip-types scripts/test-non-admin-paths.mjs
node scripts/test-middleware-cookie.mjs
```

## Деплой

Только по навыку Claude `prod-deploy-guard`. Коротко:

```bash
git push carwash:/home/carwash/Project <ветка>:<ветка>
ssh carwash 'cd /home/carwash/Project && git merge --ff-only <ветка> && DATA_SOURCE=postgres npm run build && sudo systemctl restart carwash-web'
```

- ветка — от продового `main`, не от `origin/main` на GitHub (они разошлись);
- **никогда** голый `git pull` на проде;
- `DATA_SOURCE=postgres` обязателен при сборке;
- после изменения `schema.prisma` — `DATA_SOURCE=postgres npx prisma generate` перед сборкой. Схема не под Prisma Migrate: SQL-изменения лежат в `prisma/migrations-pending/` и применяются вручную.

Скрипты `ops/deploy.sh` и `ops/linux/deploy-from-repo.sh` устарели и сами останавливаются: они откатили бы прод на `origin/main`.

## Структура

```
src/
  app/          страницы и API-роуты
  components/   UI-компоненты
  lib/          данные (lib/data), авторизация, роли, утилиты
  services/     бизнес-логика (зарплата, смены, отчёты, Telegram)
  types/        доменные типы
prisma/         схема и ручные SQL-миграции
telegram-bot/   worker бота сотрудника
scripts/        проверки, миграция JSON → PG (история), OCR
ops/            устаревшие скрипты деплоя и Docker (не используются)
docs/           документация марта 2026 (история)
```

## Переменные окружения

Пример — `.env.example` и `telegram-bot/.env.example`. На проде — `/etc/default/carwash`. Секреты не коммитить.
