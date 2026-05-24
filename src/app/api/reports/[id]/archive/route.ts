export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import { getReportById, updateReport } from '@/lib/data';

/**
 * POST /api/reports/[id]/archive
 *
 * Phase 23: soft archive отчёта (status='archived').
 * Архивированные отчёты не показываются по дефолту в /reports — фильтр.
 * Откат: PUT /api/reports/[id] с body {status: 'draft'}.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const existing = await getReportById(params.id);
    if (!existing) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    if (existing.status === 'archived') {
      return NextResponse.json({ error: 'Отчёт уже в архиве' }, { status: 409 });
    }

    const updated = await updateReport(params.id, { status: 'archived' });
    return NextResponse.json({ message: 'Report archived', report: updated });
  } catch (error: any) {
    console.error('Error archiving report:', error);
    return NextResponse.json({ error: error.message ?? 'Internal Server Error' }, { status: 500 });
  }
}
