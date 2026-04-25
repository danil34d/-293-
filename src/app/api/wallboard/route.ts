import { NextResponse } from 'next/server';

import { getWallboardSnapshot } from '@/lib/wallboard';
import { requireAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  try {
    const snapshot = await getWallboardSnapshot();
    return NextResponse.json(snapshot);
  } catch (error: any) {
    console.error('Failed to build wallboard snapshot', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to build wallboard snapshot' },
      { status: 500 }
    );
  }
}
