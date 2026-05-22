export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import { getOurCompaniesData, saveOurCompany } from '@/lib/data';

/**
 * Phase 57b / multi-company: CRUD endpoint для OurCompany.
 *
 * GET /api/our-companies → OurCompany[] (sorted by isPrimary desc, archived asc, shortName asc)
 * POST /api/our-companies { id?, shortName, ... } → upsert (saveOurCompany handles primary toggle in $transaction)
 *
 * Под requireAdmin (только admin может редактировать наши юр.лица).
 */
export async function GET() {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const items = await getOurCompaniesData();
    return NextResponse.json(items);
  } catch (error: any) {
    console.error('[GET /api/our-companies] error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    if (!body?.id || typeof body.id !== 'string') {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }
    if (!body?.shortName || typeof body.shortName !== 'string' || body.shortName.trim().length < 2) {
      return NextResponse.json({ error: 'shortName required (min 2 chars)' }, { status: 400 });
    }

    const saved = await saveOurCompany(body);
    console.log(`[our-companies POST] admin=${auth.id} saved ${saved.shortName} (id=${saved.id}, primary=${saved.isPrimary})`);
    return NextResponse.json({ ourCompany: saved });
  } catch (error: any) {
    console.error('[POST /api/our-companies] error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
