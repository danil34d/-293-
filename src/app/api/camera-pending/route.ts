export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getPendingCameraVehicles } from '@/lib/camera-pending';
import { requireAuth } from '@/lib/server-auth';

export async function GET() {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  try {
    const items = await getPendingCameraVehicles();
    return NextResponse.json({ items });
  } catch (error) {
    console.error('GET /api/camera-pending error:', error);
    return NextResponse.json(
      { error: 'Не удалось загрузить неоформленные машины' },
      { status: 500 }
    );
  }
}
