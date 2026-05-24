export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import { getEmployeeChangeLog } from '@/lib/data';

/**
 * GET /api/employees/[id]/changelog?limit=50
 *
 * Phase 29 / V2-NEW-3: возвращает audit-журнал опасных правок Employee.
 * Newest first. requireAdmin — этим логом могут смотреть только админы.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(200, Number(searchParams.get('limit') ?? 50) || 50);
    const log = await getEmployeeChangeLog(params.id, limit);
    return NextResponse.json(log);
  } catch (error: any) {
    console.error('Error fetching employee change log:', error);
    return NextResponse.json({ error: error.message ?? 'Internal Server Error' }, { status: 500 });
  }
}
