# CLAUDE.md — ZORIN Car Wash

Веб-приложение управления автомойкой: админка владельца + терминал в боксе + мобильный кабинет сотрудника.

## Стек

Next.js 14.2.35 (App Router) · React 18.3.1 · TypeScript · Prisma 5 · **PostgreSQL** · @radix-ui · react-hook-form 7.55 + zod 3.25 · lucide-react · Tailwind

## ⚠️ Критические правила

### 1. PostgreSQL — единственная основная БД

- Новый код импортирует **только** `@/lib/data` (switcher), НЕ `data-loader.ts` напрямую
- Прямой `fs.readFile(data/...)` в новом коде запрещён
- На проде `DATA_SOURCE=postgres`
- `data-loader.ts` НЕ удалять — dev-fallback
- Модули данных и сервисы **не помечать `'use server'`**: с этой директивой каждая экспортируемая функция становится server action, которую можно вызвать POST-запросом с любой страницы (включая публичную `/login`) в обход проверок ролей. До 28.09.2026 так было открыто 227 функций. Клиентские компоненты получают данные только через API-роуты

```
src/lib/data/index.ts (switcher)
  ├─ pg-adapter.ts     ← прод (Postgres)
  └─ data-loader.ts    ← dev fallback (JSON)
```

### 2. Prisma: FK только через relation connect

Prisma 5.22 Checked-create **не принимает** scalar `<relation>Id` — даёт 500 «Unknown argument».

```ts
// ❌ НЕЛЬЗЯ
await tx.washEvent.create({ data: { counterAgentId: id } });

// ✅ НАДО
await tx.washEvent.create({ data: { counterAgent: { connect: { id } } } });
```

Есть helper: `import { fkConnect } from '@/lib/data/prisma-helpers'` → `counterAgent: fkConnect(id)`.
Там же `createStockMovement()` и `parseEnum()` — использовать вместо копипасты и `as any`.

### 3. Deploy — только через навык `prod-deploy-guard`, ветку указывать ЯВНО

Код уходит прямо в репозиторий сервера, минуя GitHub (`origin/main` разошёлся с продом, на проде 146+ коммитов не в GitHub):

```bash
git push carwash:/home/carwash/Project <ветка>:<ветка>
ssh carwash 'cd /home/carwash/Project && git merge --ff-only <ветка> && DATA_SOURCE=postgres npm run build && sudo systemctl restart carwash-web'
```

- Ветку создавать от продового `main` (`git fetch carwash:/home/carwash/Project main:refs/remotes/prod/main`), не от `origin/main`
- **Голый `git pull` на проде сломает прод** — втянет squash-коммит `origin/main` поверх разошедшейся истории
- Деплой — только после «да» владельца

**После правки `prisma/schema.prisma`** добавить перед build:
```bash
DATA_SOURCE=postgres npx prisma generate
```
Иначе Prisma client не знает новых полей → прод 500.

### 4. Роли

Роли: `admin`, `employee`, `kiosk`/`kiosk1` (терминал — устройство, не человек). Проверять через хелперы `src/lib/employee-role.ts` (`isKiosk`, `hasAdminAccess`), **не литералом** `role === 'kiosk'` — литерал пропускает `kiosk1`. Список ролей для `parseEnum` в `pg-adapter` обязан быть полным: неполный список тихо подменяет данные.

Админские страницы защищает middleware по роли из подписанной куки; правило «куда пускают не-админа» — `isNonAdminAppPath` в `src/lib/public-routes.ts`.

### 5. Privacy на терминале

Сотрудникам на `/kiosk`, `/workstation`, `/employee/*` показываем **только** нал/карта/перевод.
Безнал, агрегаторы, контрагенты, размер кикбеков водителям — финансы владельца, скрыто.

## Инфраструктура

| Что | Где |
|---|---|
| Прод | `192.168.1.150:3000`, ssh alias `carwash`, путь `/home/carwash/Project` |
| Терминал в боксе | TECNO BG6, `192.168.1.57`, APK `com.carwash.local.kiosk` |
| Камер-дашборд | `192.168.1.59:8050` (YOLO-детекция номеров) |
| Учётки | в vault, не в репозитории (репо публичное) |

## Команды

```bash
npm run dev         # localhost:3000
npm run build       # прод-сборка
npm run typecheck   # tsc через tsconfig.typecheck.json (исключает .next/types)
npm run lint
npm run bot:telegram # отдельный long-polling процесс
node --experimental-strip-types scripts/test-without-device-employees.mjs
node --experimental-strip-types scripts/test-non-admin-paths.mjs
```

## Структура

**Живое:**
- `src/app/` — страницы (App Router), `src/components/` — UI
- `src/lib/data/` — слой данных, `src/lib/crypto/` — AES-256-GCM для секретов
- `prisma/schema.prisma` — 28 моделей
- `scripts/windows/` — START/STOP/health для локалки, `scripts/ocr/` — Python plate-reader (systemd)
- `ops/systemd/` — юниты прода; `ops/deploy.sh` и `ops/linux/deploy-from-repo.sh` устарели и сами останавливаются (откатили бы прод на `origin/main`)

**Осторожно (устарело / не трогать без нужды):**
- `docs/` — часть файлов описывает JSON-эру до Prisma (`04-СТАТУС-СИСТЕМЫ.md` от 02.2026)
- `mobile/android-local-client/` — стаб-WebView, реальный APK живёт вне репо (`D:\автомойка\ANDROID\APK-PROJECT`)
- `ops/Dockerfile` + `docker-compose.yml` — Docker-контур, противоречит systemd-проду (монтирует JSON-волюм)
- `backend-go` — **фантом**, не существует; упоминания в `START.ps1`, `.env.example`, `.gitignore` — мёртвые
- `tools/live_linux_admin.py` — нигде не упомянут
- `data/` — локальная JSON-песочница, в git не попадает

## Авторизация

`requireAdmin()` / `requireAuth()` из `src/lib/server-auth.ts`. Каждый API-route должен иметь гард; всё, что касается денег, расходов, зарплат, реквизитов, — `requireAdmin`. Неподписанная кука не принимается. Сотрудники в ответах — без поля `password` (`withoutPassword` из `src/lib/employee-safe.ts`).
Исключения задокументированы: `/api/auth/*`, `/api/app-version`, `/api/download/*`, `telegram/internal/*` (свой guard).

## Стиль

- Комментарии и UI-тексты — на русском
- Коммиты — Conventional Commits, тело на русском
- Фазы работ нумеруются (`Phase 60P`) и попадают в сообщение коммита
