export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import { importPlanimumSchedule } from '@/lib/planimum-import';

export async function POST(request: Request) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { url, washId, clearExisting } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { success: false, error: 'URL is required' },
        { status: 400 }
      );
    }

    if (washId && washId !== 'wash_1' && washId !== 'wash_2') {
      return NextResponse.json(
        { success: false, error: 'Invalid washId. Allowed: wash_1, wash_2' },
        { status: 400 }
      );
    }

    const result = await importPlanimumSchedule({
      url: url.trim(),
      washId: washId || 'wash_1',
      clearExisting: clearExisting !== false,
    });

    return NextResponse.json(result, {
      status: result.success ? 200 : 422,
    });
  } catch (error: any) {
    console.error('[Planimum Import] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
