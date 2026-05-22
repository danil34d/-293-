export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import { getOurCompaniesData, getOurCompanyById, saveOurCompany } from '@/lib/data';

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

/** Конвертирует пустые строки в null для nullable-полей OurCompany. */
function sanitizeBody(raw: Record<string, any>) {
  const NULLABLE_STRING_FIELDS = [
    'fullName', 'inn', 'kpp', 'ogrn', 'ownerName', 'legalAddress',
    'bankName', 'settlementAccount', 'correspondentAccount', 'bik',
    'taxRegime', 'archivedAt',
  ] as const;

  const out: Record<string, any> = { ...raw };
  for (const field of NULLABLE_STRING_FIELDS) {
    if (field in out && out[field] === '') {
      out[field] = null;
    }
  }
  // Trim required fields
  if (typeof out.shortName === 'string') out.shortName = out.shortName.trim();
  if (typeof out.id === 'string') out.id = out.id.trim();
  return out;
}

export async function POST(request: Request) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const rawBody = await request.json();
    const body = sanitizeBody(rawBody);

    if (!body?.id || typeof body.id !== 'string' || !body.id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }
    if (!body?.shortName || typeof body.shortName !== 'string' || body.shortName.length < 2) {
      return NextResponse.json({ error: 'shortName required (min 2 chars)' }, { status: 400 });
    }

    // Guard: нельзя архивировать primary ИП (можно только через смену isPrimary + archive)
    if (body.archived === true) {
      const existing = await getOurCompanyById(body.id);
      if (existing?.isPrimary) {
        return NextResponse.json(
          { error: 'Нельзя архивировать основное ИП. Сначала назначьте другое ИП основным.' },
          { status: 409 },
        );
      }
    }

    const saved = await saveOurCompany(body);
    console.log(`[our-companies POST] admin=${auth.id} saved ${saved.shortName} (id=${saved.id}, primary=${saved.isPrimary}, archived=${saved.archived})`);
    return NextResponse.json({ ourCompany: saved });
  } catch (error: any) {
    console.error('[POST /api/our-companies] error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
