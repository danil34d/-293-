export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import { findOrphanedStockMovements } from '@/lib/data';

/**
 * GET /api/inventory/orphan-stock
 *
 * Phase 20 / finding #8 АРХ-НАХОДКИ: scan orphan StockMovement.
 *
 * StockMovement имеет soft FK (`relatedEntityType` + `relatedEntityId`) без
 * constraint'а на уровне БД. DELETE WashEvent / Expense оставляет «висящие»
 * движения склада. Этот endpoint сканирует все movement'ы с soft FK и
 * возвращает orphan'ы для UI-маркера «связь утеряна».
 *
 * Поддерживаемые relatedEntityType:
 *   - 'wash_event' → WashEvent
 *   - 'expense' → Expense
 *   - 'employee' → Employee
 *   - 'canister' → EmployeeCanister
 *   - other → пропускаются (unknown type, не считаются orphan'ом)
 *
 * НЕ удаляет orphan'ы автоматически (история ценна). Только репортит.
 * Auth: requireAdmin.
 */
export async function GET() {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const result = await findOrphanedStockMovements();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error scanning orphan stock movements:', error);
    return NextResponse.json(
      { error: error.message ?? 'Internal Server Error' },
      { status: 500 }
    );
  }
}
