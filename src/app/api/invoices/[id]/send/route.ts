export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import { getInvoiceById, updateInvoice } from '@/lib/data';

/**
 * POST /api/invoices/[id]/send
 *
 * Phase 22: переключает Invoice в status='sent'. Set sentAt = now.
 * Body (optional): { sentToEmail: string }
 *
 * Email отправка не реализована (отложено) — пока только маркируем статус.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const existing = await getInvoiceById(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    if (existing.status !== 'draft') {
      return NextResponse.json(
        { error: `Можно отправить только draft. Текущий статус: ${existing.status}` },
        { status: 409 }
      );
    }

    let sentToEmail: string | null = null;
    try {
      const body = await request.json();
      if (body?.sentToEmail) sentToEmail = String(body.sentToEmail).trim() || null;
    } catch { /* no body — ok */ }

    const updated = await updateInvoice(params.id, {
      status: 'sent',
      sentAt: new Date(),
      sentToEmail,
    });

    return NextResponse.json({
      message: 'Invoice marked as sent',
      invoice: updated,
      hint: 'Email-отправка пока не реализована, статус обновлён в БД.',
    });
  } catch (error: any) {
    console.error('Error sending invoice:', error);
    return NextResponse.json({ error: error.message ?? 'Internal Server Error' }, { status: 500 });
  }
}
