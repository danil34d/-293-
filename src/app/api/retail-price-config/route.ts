export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { getRetailPriceConfig } from '@/lib/data';
import { requireAuth } from '@/lib/server-auth';

export async function GET() {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const config = await getRetailPriceConfig();
    return NextResponse.json(config);
  } catch (error) {
    console.error('Error reading retail price config:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
