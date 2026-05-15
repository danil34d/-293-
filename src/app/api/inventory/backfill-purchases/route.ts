export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import {
  backfillChemicalPurchasesFromExpenses,
  invalidateInventoryCache,
  invalidateStockMovementsCache,
} from '@/lib/data';

/**
 * GET/POST /api/inventory/backfill-purchases
 *
 * Phase 16 / finding #35: восстановление исторических StockMovement.purchase из
 * Expense с категорией matching "хими"/"chem". Закрывает дрейф currentStock,
 * который накопился из-за того что закупки не оформлялись через UI «Закупка химии».
 *
 * GET → preview (без записи), POST {apply:true} → создание StockMovement.purchase.
 *
 * После apply рекомендуется прогнать `/api/inventory/recompute` чтобы обновить
 * `InventoryMaterial.currentStock` (sum по всем StockMovement, теперь с purchase).
 *
 * Дедупликация: пропускаем Expense у которых уже есть StockMovement.purchase
 * с relatedEntityType='expense' + relatedEntityId=expense.id.
 *
 * Auth: requireAdmin.
 */
export async function POST(request: Request) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let apply = false;
  try {
    const body = await request.json().catch(() => ({}));
    apply = body?.apply === true;
  } catch { /* default false */ }

  try {
    const result = await backfillChemicalPurchasesFromExpenses(apply);
    if (apply) {
      await invalidateInventoryCache();
      await invalidateStockMovementsCache();
    }
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error backfilling chemical purchases:', error);
    return NextResponse.json(
      { error: error.message ?? 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const result = await backfillChemicalPurchasesFromExpenses(false);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error previewing backfill:', error);
    return NextResponse.json(
      { error: error.message ?? 'Internal Server Error' },
      { status: 500 }
    );
  }
}
