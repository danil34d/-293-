-- Phase 62P. Только новые таблицы сверки; WashEvent, деньги и исходники камер не изменяются.
-- Запускать один раз после свежей резервной копии и проверки на отдельной PostgreSQL.
BEGIN;
CREATE TABLE "ReconciliationShift" (
  "id" TEXT PRIMARY KEY,
  "date" TEXT NOT NULL,
  "period" TEXT NOT NULL CHECK ("period" IN ('day', 'night')),
  "revision" INTEGER NOT NULL CHECK ("revision" > 0),
  "document" JSONB NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ReconciliationShift_date_period_key" ON "ReconciliationShift" ("date", "period");
CREATE TABLE "ReconciliationRevision" (
  "shiftId" TEXT NOT NULL REFERENCES "ReconciliationShift"("id") ON DELETE RESTRICT,
  "revision" INTEGER NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "document" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("shiftId", "revision")
);
CREATE TABLE "ReconciliationPaperImage" (
  "id" TEXT PRIMARY KEY,
  "shiftId" TEXT NOT NULL REFERENCES "ReconciliationShift"("id") ON DELETE RESTRICT,
  "mime" TEXT NOT NULL CHECK ("mime" IN ('image/jpeg', 'image/png', 'image/webp')),
  "bytes" BYTEA NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ReconciliationPaperImage_shiftId_idx" ON "ReconciliationPaperImage" ("shiftId");
COMMIT;
