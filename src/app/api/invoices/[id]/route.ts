export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import { getInvoiceById, updateInvoice, deleteInvoice } from '@/lib/data';

/** GET /api/invoices/[id] — один счёт. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const invoice = await getInvoiceById(params.id);
  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }
  return NextResponse.json(invoice);
}

/**
 * PUT /api/invoices/[id]
 *
 * Phase 22: edit Invoice. Только для draft. Можно менять: discountPercent, prepayments,
 * totalAmount (если recalculate), notes. items НЕ перезаписываются (immutable snapshot).
 *
 * Для смены status (draft→sent→paid) — использовать dedicated endpoints `/send`, `/paid`.
 */
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const existing = await getInvoiceById(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    if (existing.status !== 'draft') {
      return NextResponse.json(
        { error: `Редактировать можно только draft. Текущий статус: ${existing.status}` },
        { status: 409 }
      );
    }

    const body = await request.json();
    const allowed: any = {};
    if ('discountPercent' in body) allowed.discountPercent = body.discountPercent ?? null;
    if ('discountAmount' in body) allowed.discountAmount = body.discountAmount;
    if ('prepayments' in body) allowed.prepayments = body.prepayments;
    if ('totalAmount' in body) allowed.totalAmount = body.totalAmount;
    if ('notes' in body) allowed.notes = body.notes;

    const updated = await updateInvoice(params.id, allowed);
    return NextResponse.json({ message: 'Invoice updated', invoice: updated });
  } catch (error: any) {
    console.error('Error updating invoice:', error);
    return NextResponse.json({ error: error.message ?? 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * DELETE /api/invoices/[id]
 *
 * Phase 22: удаление Invoice. Только для draft (sent/paid — audit, не удаляем).
 */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const existing = await getInvoiceById(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    if (existing.status !== 'draft') {
      return NextResponse.json(
        {
          error: `Удалить можно только draft. Текущий статус: ${existing.status}. Используйте /cancel чтобы отменить.`,
        },
        { status: 409 }
      );
    }

    await deleteInvoice(params.id);
    return NextResponse.json({ message: 'Invoice deleted' });
  } catch (error: any) {
    console.error('Error deleting invoice:', error);
    return NextResponse.json({ error: error.message ?? 'Internal Server Error' }, { status: 500 });
  }
}
