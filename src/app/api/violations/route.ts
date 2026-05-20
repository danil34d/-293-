export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import type { Violation, ViolationType, EmployeeTransaction } from '@/types';
import { getViolationsData, getEmployeeTransactions } from '@/lib/data';
import { saveEntity, saveEmployeeTransactions } from '@/lib/data/write-helpers';
import { requireAuth, requireAdmin } from '@/lib/server-auth';

// Phase 44 / ТЕХ-#7: deterministic id для связанной EmployeeTransaction (loan).
// Позволяет POST/PATCH/DELETE синхронно править одну транзакцию без новой колонки в Violation.
function violationLoanTxId(violationId: string): string {
  return `loan_v_${violationId}`;
}

async function syncViolationPenaltyTransaction(
  violation: Violation,
  adminId: string,
): Promise<void> {
  const txId = violationLoanTxId(violation.id);
  const existingTxs = await getEmployeeTransactions(violation.employeeId);
  const otherTxs = existingTxs.filter((t: EmployeeTransaction) => t.id !== txId);
  const shouldHaveTx = typeof violation.penaltyAmount === 'number' && violation.penaltyAmount > 0;

  if (shouldHaveTx) {
    const loanTx: EmployeeTransaction = {
      id: txId,
      employeeId: violation.employeeId,
      date: violation.date + 'T12:00:00.000Z',
      type: 'loan',
      amount: violation.penaltyAmount!,
      description: `Штраф (${violation.type})${violation.description ? ': ' + violation.description : ''}`,
    };
    await saveEmployeeTransactions(violation.employeeId, [...otherTxs, loanTx]);
    console.log(`[violations] auto-${otherTxs.length === existingTxs.length ? 'create' : 'update'} loan tx ${txId} for employee ${violation.employeeId} by admin ${adminId}`);
  } else if (otherTxs.length !== existingTxs.length) {
    // Было penalty (есть tx), сейчас 0 / отсутствует → delete tx
    await saveEmployeeTransactions(violation.employeeId, otherTxs);
    console.log(`[violations] auto-delete loan tx ${txId} for employee ${violation.employeeId} by admin ${adminId}`);
  }
}

const VALID_TYPES: ViolationType[] = [
  'lateness', 'early_leave', 'no_show', 'equipment_damage',
  'client_complaint', 'quality_issue', 'safety_violation', 'other',
];

export async function GET(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId');
    const date = searchParams.get('date');
    const month = searchParams.get('month');
    const type = searchParams.get('type');

    let violations = await getViolationsData();

    if (employeeId) {
      violations = violations.filter(v => v.employeeId === employeeId);
    }
    if (date) {
      violations = violations.filter(v => v.date === date);
    }
    if (month) {
      violations = violations.filter(v => v.date.startsWith(month));
    }
    if (type) {
      violations = violations.filter(v => v.type === type);
    }

    return NextResponse.json(violations);
  } catch (error) {
    console.error('Error reading violations:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();

    if (!body.employeeId || typeof body.employeeId !== 'string') {
      return NextResponse.json({ error: 'employeeId обязателен' }, { status: 400 });
    }
    if (!body.type || !VALID_TYPES.includes(body.type)) {
      return NextResponse.json({ error: 'Некорректный тип нарушения' }, { status: 400 });
    }
    if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      return NextResponse.json({ error: 'Некорректная дата' }, { status: 400 });
    }

    const violation: Violation = {
      id: `viol_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      employeeId: body.employeeId,
      date: body.date,
      type: body.type,
      description: body.description || '',
      penaltyAmount: typeof body.penaltyAmount === 'number' ? body.penaltyAmount : undefined,
      shiftId: body.shiftId || undefined,
      createdBy: auth.id,
      createdAt: new Date().toISOString(),
      resolved: false,
    };

    await saveEntity('violation', violation);

    // Phase 44 / ТЕХ-#7: если есть penaltyAmount > 0 — автоматически создаём loan
    // EmployeeTransaction. Раньше админ должен был помнить вручную → риск рассинхрона.
    try {
      await syncViolationPenaltyTransaction(violation, auth.id);
    } catch (txErr) {
      // Не блокируем создание violation если transaction sync упал. Logging-only.
      console.error('[violations POST] penalty tx sync failed:', txErr);
    }

    return NextResponse.json({ violation }, { status: 201 });
  } catch (error) {
    console.error('Error creating violation:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json({ error: 'id обязателен' }, { status: 400 });
    }

    const violations = await getViolationsData();
    const existing = violations.find(v => v.id === body.id);
    if (!existing) {
      return NextResponse.json({ error: 'Нарушение не найдено' }, { status: 404 });
    }

    const updated: Violation = {
      ...existing,
      description: body.description ?? existing.description,
      penaltyAmount: body.penaltyAmount !== undefined ? body.penaltyAmount : existing.penaltyAmount,
      resolved: body.resolved !== undefined ? body.resolved : existing.resolved,
      resolvedComment: body.resolvedComment ?? existing.resolvedComment,
    };

    await saveEntity('violation', updated);

    // Phase 44 / ТЕХ-#7: если penaltyAmount изменился (или resolved=true) — пере-синхронизируем
    // связанную loan-транзакцию. resolved=true НЕ удаляет penalty: админ может пометить
    // нарушение «обсуждено», но штраф остаётся. Удаление штрафа = явно penaltyAmount=0.
    if (existing.penaltyAmount !== updated.penaltyAmount) {
      try {
        await syncViolationPenaltyTransaction(updated, auth.id);
      } catch (txErr) {
        console.error('[violations PATCH] penalty tx sync failed:', txErr);
      }
    }

    return NextResponse.json({ violation: updated });
  } catch (error) {
    console.error('Error updating violation:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
