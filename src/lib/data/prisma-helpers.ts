/**
 * Prisma helpers — общие утилиты для безопасной работы с FK, enum'ами и
 * единообразное создание частоиспользуемых записей (StockMovement).
 *
 * NOT a Server Actions module: fkConnect/parseEnum синхронные.
 * Импортируется только из pg-adapter ('use server'), сами утилиты — internal.
 *
 * Зачем:
 *  - Phase 60 (24.05) выявил, что Prisma 5.22 Checked-create внутри
 *    `tx.*.create({})` падает с "Unknown argument <field>Id" если
 *    использовать scalar FK syntax. Переход на `relation: { connect: { id } }`.
 *  - Это создало дубликаты helper-паттернов (4 копии stockMovement.create).
 *  - 46 мест в pg-adapter используют `row.X as any` для enum полей.
 *
 * Помощники централизуют эти паттерны и снижают риск регрессий.
 */

// ─── FK Connect helpers ──────────────────────────────────────

/**
 * Превращает FK-id в Prisma `connect` relation safely.
 *
 * Используется в `create` контекстах (включая upsert.create блоки):
 *   data: { ..., aggregator: fkConnect(aggregatorId), ... }
 *
 *  - id передан        → `{ connect: { id } }`
 *  - id null/undefined → `undefined` (поле не устанавливается → FK = null в БД)
 *
 * ВАЖНО: В `update` контекстах upsert'а с НУЛЛАБЕЛЬНЫМ FK где user
 * может ОЧИСТИТЬ существующую связь — `undefined` оставит старую связь,
 * а нам нужно её отвязать. Для таких случаев используй `fkConnectOrClear`.
 */
export function fkConnect<T extends string = string>(id: T | null | undefined) {
  return id ? { connect: { id } } : undefined;
}

/**
 * Версия для `update` (или `upsert.update`) контекстов, где null означает
 * "очистить связь":
 *
 *  - id передан        → `{ connect: { id } }`
 *  - id === null       → `{ disconnect: true }` (явно отвязываем)
 *  - id === undefined  → `undefined` (поле не трогаем — для частичных update'ов)
 *
 * НЕ использовать в `create` контекстах — Prisma `create` не принимает
 * `disconnect`, упадёт с TS-ошибкой.
 */
export function fkConnectOrClear<T extends string = string>(id: T | null | undefined) {
  if (id === undefined) return undefined;
  if (id === null) return { disconnect: true as const };
  return { connect: { id } };
}

// ─── StockMovement factory ───────────────────────────────────

/**
 * Единая фабрика для `tx.stockMovement.create` — устраняет 4 копии
 * одинакового кода с relation connect для material/employee.
 *
 * Используется в:
 *  - reverseExpenseStockMovements (auto-reversal при DELETE Expense)
 *  - createWashEventWithSideEffects (chemical-consumption per wash)
 *  - issueCanisterAtomic (выдача канистры)
 *  - backfill scripts (Phase 16 chemical purchases)
 *
 * Принимает `tx` любого типа (может быть как `prisma`, так и `Prisma.TransactionClient`).
 */
export async function createStockMovement(tx: any, params: {
  id: string;
  materialId: string;
  type: 'purchase' | 'issue' | 'adjustment' | 'consumption' | 'return' | 'write_off';
  amount: number;
  balanceAfter: number;
  date: Date;
  description: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  employeeId?: string | null;
  createdBy?: string | null;
  warehouse?: string;
}) {
  return await tx.stockMovement.create({
    data: {
      id: params.id,
      material: { connect: { id: params.materialId } },
      type: params.type,
      amount: params.amount,
      balanceAfter: params.balanceAfter,
      date: params.date,
      description: params.description,
      relatedEntityType: params.relatedEntityType ?? null,
      relatedEntityId: params.relatedEntityId ?? null,
      ...(params.employeeId ? { employee: { connect: { id: params.employeeId } } } : {}),
      createdBy: params.createdBy ?? null,
      ...(params.warehouse ? { warehouse: params.warehouse } : {}),
    },
  });
}

// ─── Enum parsing helper ─────────────────────────────────────

/**
 * Безопасный enum-каст с fallback вместо `as any`.
 *
 * Зачем: 46 мест в pg-adapter используют `row.X as any` для enum полей
 * (paymentMethod, role, status, mode и др). Это маскирует баги
 * — если в БД оказалось значение вне enum (legacy / битая миграция),
 * runtime получает мусорное значение которое потом ломает UI/логику.
 *
 * Использование:
 *   const allowed = ['cash', 'card', 'transfer'] as const;
 *   paymentMethod: parseEnum(row.paymentMethod, allowed, 'cash')
 */
export function parseEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  return fallback;
}
