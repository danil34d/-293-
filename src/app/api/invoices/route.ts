export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import { getInvoicesData, buildInvoicePreview, createInvoice } from '@/lib/data';

/**
 * GET /api/invoices?counterAgentId=&status=&periodFrom=&periodTo=
 *
 * Phase 22: список счетов с фильтрами. requireAdmin (только admin видит invoices).
 */
export async function GET(request: NextRequest) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const filters = {
      counterAgentId: searchParams.get('counterAgentId') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      periodFrom: searchParams.get('periodFrom') ?? undefined,
      periodTo: searchParams.get('periodTo') ?? undefined,
    };
    const invoices = await getInvoicesData(filters);
    return NextResponse.json(invoices);
  } catch (error: any) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json({ error: error.message ?? 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST /api/invoices
 *
 * Phase 22: создание Invoice из периода.
 * Body: { counterAgentId, periodStart, periodEnd, discountPercent?, notes? }
 *
 * Workflow:
 *  1. buildInvoicePreview собирает WashEvent + ClientTransaction за период → items snapshot
 *  2. createInvoice сохраняет в БД с auto-number
 *  3. Возвращает Invoice
 *
 * Если body.preview=true — возвращает только preview без сохранения.
 */
export async function POST(request: NextRequest) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { counterAgentId, periodStart, periodEnd, discountPercent, notes, preview } = body;

    if (!counterAgentId || !periodStart || !periodEnd) {
      return NextResponse.json(
        { error: 'counterAgentId, periodStart, periodEnd обязательны' },
        { status: 400 }
      );
    }

    const startDate = new Date(periodStart);
    const endDate = new Date(periodEnd);
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) {
      return NextResponse.json({ error: 'Неверный формат дат' }, { status: 400 });
    }
    if (startDate > endDate) {
      return NextResponse.json({ error: 'periodStart должен быть ≤ periodEnd' }, { status: 400 });
    }

    const previewData = await buildInvoicePreview(counterAgentId, startDate, endDate, discountPercent);

    if (previewData.washCount === 0) {
      return NextResponse.json(
        { error: 'Нет завершённых моек за указанный период для этого контрагента', preview: previewData },
        { status: 409 }
      );
    }

    // Preview mode — без сохранения
    if (preview === true) {
      return NextResponse.json({ preview: previewData });
    }

    // Сохраняем
    const invoice = await createInvoice({
      counterAgentId,
      periodStart: startDate,
      periodEnd: endDate,
      subtotal: previewData.subtotal,
      discountPercent: previewData.discountPercent,
      discountAmount: previewData.discountAmount,
      prepayments: previewData.prepayments,
      totalAmount: previewData.totalAmount,
      items: previewData.items,
      createdByEmployeeId: auth.id,
      notes,
    });

    return NextResponse.json({ message: 'Invoice created', invoice }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating invoice:', error);
    return NextResponse.json({ error: error.message ?? 'Internal Server Error' }, { status: 500 });
  }
}
