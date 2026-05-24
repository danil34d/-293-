export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import { getInvoiceById, updateInvoice } from '@/lib/data';

/**
 * POST /api/invoices/[id]/paid
 *
 * Phase 22: переключает Invoice в status='paid'. Set paidAt = now, paidVia.
 * Body (optional): { paidVia: 'cash'|'card'|'transfer', paidTransactionId? }
 *
 * НЕ создаёт ClientTransaction автоматически — баланс контрагента и так считается
 * через WashEvent. paidTransactionId — для ссылки на уже созданную транзакцию (опц.).
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const existing = await getInvoiceById(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    if (existing.status !== 'sent' && existing.status !== 'draft') {
      return NextResponse.json(
        { error: `Можно оплатить только draft или sent. Текущий статус: ${existing.status}` },
        { status: 409 }
      );
    }

    let paidVia: string | null = null;
    let paidTransactionId: string | null = null;
    try {
      const body = await request.json();
      if (body?.paidVia && ['cash', 'card', 'transfer'].includes(body.paidVia)) {
        paidVia = body.paidVia;
      }
      if (body?.paidTransactionId) paidTransactionId = String(body.paidTransactionId);
    } catch { /* no body — ok */ }

    const updated = await updateInvoice(params.id, {
      status: 'paid',
      paidAt: new Date(),
      paidVia,
      paidTransactionId,
    });

    return NextResponse.json({ message: 'Invoice marked as paid', invoice: updated });
  } catch (error: any) {
    console.error('Error marking invoice paid:', error);
    return NextResponse.json({ error: error.message ?? 'Internal Server Error' }, { status: 500 });
  }
}
