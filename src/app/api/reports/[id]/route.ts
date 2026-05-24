export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import { getReportById, updateReport, deleteReport } from '@/lib/data';

/**
 * GET /api/reports/[id]
 *
 * Phase 23: получить один сохранённый отчёт. requireAdmin.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const report = await getReportById(params.id);
    if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    return NextResponse.json(report);
  } catch (error: any) {
    console.error('Error fetching report:', error);
    return NextResponse.json({ error: error.message ?? 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * PUT /api/reports/[id]
 *
 * Phase 23: обновить title/notes/status сохранённого отчёта.
 * Body: { title?, notes?, status? } — markdown не редактируется (immutable snapshot).
 */
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const existing = await getReportById(params.id);
    if (!existing) return NextResponse.json({ error: 'Report not found' }, { status: 404 });

    const body = await request.json();
    const patch: { title?: string; notes?: string; status?: any } = {};

    if (typeof body.title === 'string') {
      const t = body.title.trim();
      if (!t) return NextResponse.json({ error: 'title не может быть пустым' }, { status: 400 });
      patch.title = t;
    }
    if (typeof body.notes === 'string') patch.notes = body.notes;
    if (body.status && ['draft', 'archived'].includes(body.status)) patch.status = body.status;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Нет полей для обновления' }, { status: 400 });
    }

    const updated = await updateReport(params.id, patch);
    return NextResponse.json({ message: 'Report updated', report: updated });
  } catch (error: any) {
    console.error('Error updating report:', error);
    return NextResponse.json({ error: error.message ?? 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * DELETE /api/reports/[id]
 *
 * Phase 23: удалить отчёт. Без ограничений по статусу — это AI-аналитика
 * без финансовых эффектов, можно удалять и archived.
 */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const existing = await getReportById(params.id);
    if (!existing) return NextResponse.json({ error: 'Report not found' }, { status: 404 });

    await deleteReport(params.id);
    return NextResponse.json({ message: 'Report deleted' });
  } catch (error: any) {
    console.error('Error deleting report:', error);
    return NextResponse.json({ error: error.message ?? 'Internal Server Error' }, { status: 500 });
  }
}
