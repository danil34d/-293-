export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import { recomputeInventoryStock, invalidateInventoryCache, invalidateStockMovementsCache } from '@/lib/data';

/**
 * POST /api/inventory/recompute
 *
 * UX-safety / Phase 7: пересчёт остатков склада из StockMovement.
 *
 * За время работы system счётчик `InventoryMaterial.currentStock` мог разъехаться
 * с реальным состоянием (race conditions, ручные правки, незавершённые транзакции).
 * Endpoint позволяет:
 *   1. preview — посмотреть diff (по умолчанию, без apply)
 *   2. apply  — применить пересчёт (body: { apply: true })
 *
 * Безопасно: рассчитывает SUM(StockMovement.amount) per material, где
 * amount хранится со знаком (purchase = +, consumption = -).
 *
 * Закрывает арх-находку #7 (Inventory↔Expense drift).
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
    const result = await recomputeInventoryStock(apply);

    if (apply) {
      await invalidateInventoryCache();
      await invalidateStockMovementsCache();
    }

    const summary = {
      total: result.materials.length,
      changed: result.materials.filter(m => m.delta !== 0).length,
      totalDeltaAbs: result.materials.reduce((sum, m) => sum + Math.abs(m.delta), 0),
    };

    return NextResponse.json({
      ...result,
      summary,
    });
  } catch (error: any) {
    console.error('Error recomputing inventory stock:', error);
    return NextResponse.json(
      { error: error.message ?? 'Internal Server Error' },
      { status: 500 }
    );
  }
}

/** GET — быстрый preview без apply (alias of POST с body {apply:false}). */
export async function GET() {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const result = await recomputeInventoryStock(false);
    const summary = {
      total: result.materials.length,
      changed: result.materials.filter(m => m.delta !== 0).length,
      totalDeltaAbs: result.materials.reduce((sum, m) => sum + Math.abs(m.delta), 0),
    };
    return NextResponse.json({ ...result, summary });
  } catch (error: any) {
    console.error('Error previewing recompute:', error);
    return NextResponse.json(
      { error: error.message ?? 'Internal Server Error' },
      { status: 500 }
    );
  }
}
