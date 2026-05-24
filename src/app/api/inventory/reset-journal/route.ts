export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import { invalidateStockMovementsCache, invalidateInventoryCache } from '@/lib/data';

const REQUIRED_CONFIRM_PHRASE = 'СБРОС СКЛАДА';

/**
 * POST /api/inventory/reset-journal
 *
 * Phase 30a / V2-#17 «Сбросить журнал склада» (warn-level, phrase 'СБРОС СКЛАДА').
 *
 * Удаляет ВСЕ StockMovement записи и обнуляет InventoryMaterial.currentStock.
 * Используется когда журнал движений рассинхронился и нужно начать с чистого
 * листа (потом владелец сделает backfill через Phase 16 кнопку в /inventory).
 *
 * Body MUST содержать: `{confirmPhrase: "СБРОС СКЛАДА"}` (server-side validation).
 * Audit: console.warn в journalctl.
 */
export async function POST(request: Request) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  if (process.env.DATA_SOURCE !== 'postgres') {
    return NextResponse.json({
      error: 'Журнал склада есть только при DATA_SOURCE=postgres. На JSON-стенде операция отключена.',
    }, { status: 501 });
  }

  // Phrase validation
  let body: any = {};
  try { body = await request.json(); } catch { /* empty body */ }
  if (!body?.confirmPhrase || String(body.confirmPhrase).trim() !== REQUIRED_CONFIRM_PHRASE) {
    console.warn(`[inventory/reset-journal] Phrase validation failed. Admin: ${auth.id}, got: "${body?.confirmPhrase}"`);
    return NextResponse.json({
      error: `Защита: body должен содержать confirmPhrase="${REQUIRED_CONFIRM_PHRASE}".`,
      hint: 'Используйте UI-кнопку в Настройках → Опасная зона.',
    }, { status: 400 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pg = require('@/lib/data/pg-adapter');
    const prisma = pg.prisma ?? (await import('@prisma/client').then(m => new m.PrismaClient()));

    console.warn(`[inventory/reset-journal] CONFIRMED by admin ${auth.id} (${auth.fullName}) at ${new Date().toISOString()}`);

    let deletedMovements = 0;
    let zeroedMaterials = 0;
    await prisma.$transaction(async (tx: any) => {
      const delRes = await tx.stockMovement.deleteMany({});
      deletedMovements = delRes.count;
      const upd = await tx.inventoryMaterial.updateMany({ data: { currentStock: 0 } });
      zeroedMaterials = upd.count;
    });

    invalidateStockMovementsCache?.();
    invalidateInventoryCache?.();

    return NextResponse.json({
      message: 'Журнал склада сброшен',
      deletedMovements,
      zeroedMaterials,
      hint: 'После сброса сделайте backfill через /inventory → «Backfill закупок химии» чтобы восстановить consumption/purchase из Expense и WashEvent.',
    });
  } catch (e: any) {
    console.error('[inventory/reset-journal] failed:', e);
    return NextResponse.json({ error: e?.message ?? 'Internal Server Error' }, { status: 500 });
  }
}
