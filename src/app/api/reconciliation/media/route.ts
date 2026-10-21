import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import { getReconciliation } from '@/lib/data';
import { shiftId, validateShift } from '@/lib/reconciliation/shift';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const auth = requireAdmin(); if (auth instanceof NextResponse) return auth;
  const params = request.nextUrl.searchParams;
  const kind = params.get('kind');
  if (kind !== 'thumbnail' && kind !== 'plate' && kind !== 'video') return new NextResponse('Неизвестный вид записи.', { status: 400 });
  try {
    const shift = validateShift({ date: params.get('date') || '', period: params.get('period') as 'day' | 'night' });
    const doc = await getReconciliation(shiftId(shift));
    const observation = doc?.source.snapshot?.observations.find(row => row.evidence.id === params.get('id'));
    if (!observation || /[\\/\x00-\x1f:]/.test(observation.dirName) || !/^\d{4}-\d{2}-\d{2}_/.test(observation.dirName)) return new NextResponse('Запись камеры недоступна.', { status: 404 });
    const filename = kind === 'video' ? 'grid.mp4' : `${kind}.jpg`;
    const base = new URL(process.env.CAMERA_DASHBOARD_BASE_URL?.trim() || 'http://192.168.1.59:8050');
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('Invalid camera URL');
    const url = new URL(`/media/box${observation.evidence.box}/${encodeURIComponent(observation.dirName)}/${filename}`, base);
    const range = request.headers.get('range');
    if (range && !/^bytes=\d+-\d*$/.test(range)) return new NextResponse(null, { status: 416 });
    const response = await fetch(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(kind === 'video' ? 120000 : 15000), headers: kind === 'video' && range ? { Range: range } : {} });
    if (!response.ok) return new NextResponse('Кадр или видео отсутствует на камере.', { status: response.status === 404 ? 404 : 502 });
    const headers = new Headers({ 'Content-Type': kind === 'video' ? 'video/mp4' : 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    for (const name of ['content-length', 'content-range', 'accept-ranges']) { const value = response.headers.get(name); if (value) headers.set(name, value); }
    return new NextResponse(response.body, { status: response.status, headers });
  } catch { return new NextResponse('Не удалось загрузить запись камеры.', { status: 502 }); }
}
