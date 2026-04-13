export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { getShiftReportsData } from '@/lib/data';
import { requireAuth } from '@/lib/server-auth';

export async function GET(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const month = searchParams.get('month');

    let reports = await getShiftReportsData();

    if (date) {
      reports = reports.filter((r: any) => r.date === date);
    }
    if (month) {
      reports = reports.filter((r: any) => r.date.startsWith(month));
    }

    return NextResponse.json(reports);
  } catch (error) {
    console.error('Error reading shift reports:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
