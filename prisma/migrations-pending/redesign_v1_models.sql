-- Redesign V1 (admin_safety pilot) — UX-safety schema additions
-- Дата: 2026-05-13
-- Применять на проде: psql $DATABASE_URL -f redesign_v1_models.sql
-- Или: npx prisma db push (применит весь schema.prisma)
--
-- Все изменения ADDITIVE only — существующие данные не затрагиваются.
-- Откат: см. в конце файла.

BEGIN;

-- 1. SalaryScheme: soft-delete через Archive
ALTER TABLE "SalaryScheme"
  ADD COLUMN IF NOT EXISTS "archived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "archivedAt" TEXT;

CREATE INDEX IF NOT EXISTS "SalaryScheme_archived_idx" ON "SalaryScheme"("archived");

-- 2. SalaryPeriod: закрытый период ЗП (для 423 Locked в /api/wash-events/[id])
CREATE TABLE IF NOT EXISTS "SalaryPeriod" (
  "id"        TEXT PRIMARY KEY,
  "month"     TEXT NOT NULL UNIQUE,
  "closed"    BOOLEAN NOT NULL DEFAULT false,
  "closedBy"  TEXT,
  "closedAt"  TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "SalaryPeriod_month_idx" ON "SalaryPeriod"("month");
CREATE INDEX IF NOT EXISTS "SalaryPeriod_closed_idx" ON "SalaryPeriod"("closed");

-- 3. EmployeeSalarySchemeHistory: история смены схемы (для эффективного расчёта ZP)
CREATE TABLE IF NOT EXISTS "EmployeeSalarySchemeHistory" (
  "id"            TEXT PRIMARY KEY,
  "employeeId"    TEXT NOT NULL,
  "schemeId"      TEXT,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo"   TIMESTAMP(3),
  "changedBy"     TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "EmployeeSalarySchemeHistory_employeeId_idx" ON "EmployeeSalarySchemeHistory"("employeeId");
CREATE INDEX IF NOT EXISTS "EmployeeSalarySchemeHistory_effectiveFrom_idx" ON "EmployeeSalarySchemeHistory"("effectiveFrom");

COMMIT;

-- ────────────────────────────────────────────────────────────
-- Откат (rollback) — все изменения additive, удалять обычно не нужно.
-- Если очень надо:
--
-- BEGIN;
--   DROP TABLE IF EXISTS "EmployeeSalarySchemeHistory";
--   DROP TABLE IF EXISTS "SalaryPeriod";
--   ALTER TABLE "SalaryScheme" DROP COLUMN IF EXISTS "archived";
--   ALTER TABLE "SalaryScheme" DROP COLUMN IF EXISTS "archivedAt";
-- COMMIT;
