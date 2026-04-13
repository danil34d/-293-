export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { getActiveSession, saveActiveSession } from '@/lib/data';
import { requireAuth } from '@/lib/server-auth';

export async function GET() {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const session = await getActiveSession();
    return NextResponse.json(session);
  } catch (error: any) {
    console.error('GET /api/active-session error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const session = {
      ...body,
      updatedAt: new Date().toISOString(),
    };
    await saveActiveSession(session);
    return NextResponse.json(session);
  } catch (error: any) {
    console.error('PUT /api/active-session error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
