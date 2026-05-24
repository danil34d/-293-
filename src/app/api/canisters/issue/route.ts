export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import { issueCanisterAtomic } from '@/lib/data';
import type { CanisterMode } from '@/types';

const VALID_MODES: CanisterMode[] = ['purchase', 'bonus', 'gift', 'salary-deduction'];

/**
 * Phase 52a / V2-NEW-1: выдача канистры сотруднику с 4 режимами.
 *
 * POST /api/canisters/issue
 * Body: {
 *   employeeId: string,
 *   mode: 'purchase' | 'bonus' | 'gift' | 'salary-deduction',
 *   amountGrams?: number (default 22000 = 1 канистра 22кг),
 *   priceRub?: number (default 3000 ₽; для bonus игнорируется),
 *   washPoint?: 'wash_1' | 'wash_2',
 *   notes?: string,
 *   materialId?: string (default — первый chemical+isActive)
 * }
 *
 * Atomic в $transaction:
 *  - EmployeeCanister(active, mode, issuedBy)
 *  - StockMovement (issue, warehouse='main', -amountGrams)
 *  - По mode: EmployeeTransaction либо Expense
 *  - canister.transactionId связан с созданной транзакцией/Expense
 *
 * Под requireAdmin.
 */
export async function POST(request: Request) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const employeeId = typeof body?.employeeId === 'string' ? body.employeeId : '';
    const mode = body?.mode as CanisterMode | undefined;

    if (!employeeId) {
      return NextResponse.json({ error: 'employeeId required' }, { status: 400 });
    }
    if (!mode || !VALID_MODES.includes(mode)) {
      return NextResponse.json(
        { error: `mode должен быть одним из: ${VALID_MODES.join(', ')}` },
        { status: 400 }
      );
    }

    const amountGrams =
      typeof body?.amountGrams === 'number' && body.amountGrams > 0 ? body.amountGrams : undefined;
    const priceRub =
      typeof body?.priceRub === 'number' && body.priceRub >= 0 ? body.priceRub : undefined;
    const washPoint = typeof body?.washPoint === 'string' ? body.washPoint : undefined;
    const notes = typeof body?.notes === 'string' ? body.notes : undefined;
    const materialId = typeof body?.materialId === 'string' ? body.materialId : undefined;

    const canister = await issueCanisterAtomic({
      employeeId,
      mode,
      amountGrams,
      priceRub,
      washPoint,
      notes,
      issuedBy: auth.id,
      materialId,
    });

    console.log(
      `[canisters/issue] admin=${auth.id} выдал канистру ${canister.id} ${mode} → ${employeeId} (${amountGrams ?? 22000}г, ${canister.priceRub}₽)`
    );

    return NextResponse.json({ canister });
  } catch (error: any) {
    console.error('[POST /api/canisters/issue] error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
