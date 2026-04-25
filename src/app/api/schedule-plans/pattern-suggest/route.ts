export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getShiftsData } from '@/lib/data';
import { requireAdmin } from '@/lib/server-auth';
import { suggestDailyRequirementsFromHistory } from '@/services/schedule-pattern-service';
import { normalizeWashId } from '@/lib/wash';

function parseBool(value: string | null | undefined, defaultValue: boolean): boolean {
  if (value === null || value === undefined || value === '') return defaultValue;
  return value === '1' || value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
}

export async function GET(request: Request) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const targetMonth = String(searchParams.get('targetMonth') || '').trim();
    const sourceMonth = String(searchParams.get('sourceMonth') || '').trim() || undefined;
    const includeNights = parseBool(searchParams.get('includeNights'), false);
    const box2Reserve = parseBool(searchParams.get('box2Reserve'), true);
    const washId = normalizeWashId(searchParams.get('washId'));

    if (!targetMonth) {
      return NextResponse.json({ error: 'targetMonth is required (YYYY-MM)' }, { status: 400 });
    }

    const shifts = (await getShiftsData()).filter((shift) => shift.washId === washId);
    const result = suggestDailyRequirementsFromHistory(shifts, {
      targetMonth,
      sourceMonth,
      includeNights,
      box2Reserve,
      defaultBox1DayRequired: 2,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error building schedule pattern suggestion:', error);
    return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}
