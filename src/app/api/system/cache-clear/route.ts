export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import {
  invalidateWashEventsCache,
  invalidateAllEmployeeTransactionsCache,
  invalidateAllClientTransactionsCache,
  invalidateExpensesCache,
  invalidateStockMovementsCache,
  invalidateAggregatorsCache,
  invalidateCounterAgentsCache,
  invalidateInventoryCache,
  invalidateEmployeesCache,
  invalidateSalarySchemesCache,
} from '@/lib/data';

/**
 * POST /api/system/cache-clear
 *
 * Phase 30a / V2-#17 «Cache clear» (safe action, без phrase).
 *
 * Удаляет ВСЕ in-memory caches data-loader/pg-adapter. Безопасная операция —
 * следующее обращение прочитает свежие данные из БД. Полезно после ручных
 * SQL-правок (или для отладки).
 *
 * Не требует phrase (safe-level). Только requireAdmin.
 */
export async function POST() {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const cleared: string[] = [];
  const helpers: Array<[string, () => void | Promise<void>]> = [
    ['wash-events',           invalidateWashEventsCache],
    ['employee-transactions', invalidateAllEmployeeTransactionsCache],
    ['client-transactions',   invalidateAllClientTransactionsCache],
    ['expenses',              invalidateExpensesCache],
    ['stock-movements',       invalidateStockMovementsCache],
    ['aggregators',           invalidateAggregatorsCache],
    ['counter-agents',        invalidateCounterAgentsCache],
    ['inventory',             invalidateInventoryCache],
    ['employees',             invalidateEmployeesCache],
    ['salary-schemes',        invalidateSalarySchemesCache],
  ];

  for (const [name, fn] of helpers) {
    try {
      await Promise.resolve(fn());
      cleared.push(name);
    } catch (e: any) {
      console.warn(`[cache-clear] ${name} failed:`, e?.message);
    }
  }

  console.warn(`[cache-clear] CONFIRMED by admin ${auth.id} (${auth.fullName}) at ${new Date().toISOString()} — cleared: ${cleared.join(', ')}`);
  return NextResponse.json({
    message: 'In-memory caches очищены',
    cleared,
    hint: 'Следующее обращение прочитает свежие данные из БД (или JSON в dev).',
  });
}
