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

### 3. Deploy — ветку указывать ЯВНО

```bash
git push origin claude/beautiful-haibt-8da811
ssh carwash 'cd /home/carwash/Project && git pull origin claude/beautiful-haibt-8da811 && DATA_SOURCE=postgres npm run build && sudo systemctl restart carwash-web'
```

**Голый `git pull` сломает прод** — втянет squash-коммит `origin/main` поверх разошедшейся истории.
Прод сидит на локальной `main`, тянет из feature-ветки.

**После правки `prisma/schema.prisma`** добавить перед build:
```bash
DATA_SOURCE=postgres npx prisma generate
```
Иначе Prisma client не знает новых полей → прод 500.

### 4. Privacy на терминале

Сотрудникам на `/kiosk`, `/workstation`, `/employee/*` показываем **только** нал/карта/перевод.
Безнал, агрегаторы, контрагенты, размер кикбеков водителям — финансы владельца, скрыто.

## Инфраструктура

| Что | Где |
|---|---|
| Прод | `192.168.1.150:3000`, ssh alias `carwash`, путь `/home/carwash/Project` |
| Терминал в боксе | TECNO BG6, `192.168.1.57`, APK `com.carwash.local.kiosk` |
| Камер-дашборд | `192.168.1.59:8050` (YOLO-детекция номеров) |
| Учётки | `admin/admin` (владелец), `kiosk/kiosk` (терминал) |

## Команды

```bash
npm run dev         # localhost:3000
npm run build       # прод-сборка
npm run typecheck   # tsc через tsconfig.typecheck.json (исключает .next/types)
npm run lint
npm run bot:telegram # отдельный long-polling процесс
```

## Структура

**Живое:**
- `src/app/` — страницы (App Router), `src/components/` — UI
- `src/lib/data/` — слой данных, `src/lib/crypto/` — AES-256-GCM для секретов
- `prisma/schema.prisma` — 27 моделей
- `scripts/windows/` — START/STOP/health для локалки, `scripts/ocr/` — Python plate-reader (systemd)
- `ops/linux/` + `ops/systemd/` — боевой контур деплоя

**Осторожно (устарело / не трогать без нужды):**
- `docs/` — часть файлов описывает JSON-эру до Prisma (`04-СТАТУС-СИСТЕМЫ.md` от 02.2026)
- `mobile/android-local-client/` — стаб-WebView, реальный APK живёт вне репо (`D:\автомойка\ANDROID\APK-PROJECT`)
- `ops/Dockerfile` + `docker-compose.yml` — Docker-контур, противоречит systemd-проду (монтирует JSON-волюм)
- `backend-go` — **фантом**, не существует; упоминания в `START.ps1`, `.env.example`, `.gitignore` — мёртвые
- `tools/live_linux_admin.py` — нигде не упомянут
- `data/` — локальная JSON-песочница, в git не попадает

## Авторизация

`requireAdmin()` / `requireAuth()` из `src/lib/server-auth.ts`. Каждый API-route должен иметь гард.
Исключения задокументированы: `/api/auth/*`, `/api/app-version`, `/api/download/*`, `telegram/internal/*` (свой guard).

## Стиль

- Комментарии и UI-тексты — на русском
- Коммиты — Conventional Commits, тело на русском
- Фазы работ нумеруются (`Phase 60P`) и попадают в сообщение коммита
