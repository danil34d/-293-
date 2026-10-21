import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import { getReconciliation, getReconciliationPaperImage, saveReconciliationPaperImage } from '@/lib/data';
import { createLiveReconciliation, attachPaperImage } from '@/lib/reconciliation/live-model';
import { validateShift, shiftId } from '@/lib/reconciliation/shift';
import { isSameOrigin } from '@/lib/reconciliation/request';
import { readPaperImage } from '@/lib/reconciliation/paper-image';
import { ReconciliationConflict } from '@/lib/reconciliation/postgres-store';
export const dynamic = 'force-dynamic';
const json = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
function shiftFor(request: NextRequest) {
  return validateShift({ date: request.nextUrl.searchParams.get('date') || '', period: request.nextUrl.searchParams.get('period') as 'day' | 'night' });
}
export async function GET(request: NextRequest) {
  const auth = requireAdmin(); if (auth instanceof NextResponse) return auth;
  try {
    const id = shiftId(shiftFor(request));
    const doc = await getReconciliation(id);
    if (!doc?.paperImageId) return json('Фото журнала ещё не добавлено.', 404);
    const image = await getReconciliationPaperImage(id, doc.paperImageId);
    if (!image) return json('Фото недоступно.', 404);
    return new NextResponse(new Uint8Array(image.bytes), { headers: { 'Content-Type': image.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" } });
  } catch { return json('Не удалось загрузить фото журнала.', 503); }
}
export async function POST(request: NextRequest) {
  const auth = requireAdmin(); if (auth instanceof NextResponse) return auth;
  if (!isSameOrigin(request.headers.get('origin'), request.headers.get('host'), request.nextUrl.protocol)) return json('Запрос с другого адреса запрещён.', 403);
  let shift, revision, image;
  try {
    shift = shiftFor(request); const raw = request.nextUrl.searchParams.get('revision') || '';
    if (!/^\d{1,10}$/.test(raw) || Number(raw) > 2147483645) throw new Error('Некорректная версия сверки.');
    revision = Number(raw); image = await readPaperImage(request);
  } catch (error) { return json(error instanceof Error ? error.message : 'Некорректное фото.', 400); }
  try {
    const current = await getReconciliation(shiftId(shift)) ?? createLiveReconciliation(shift);
    if (current.state.revision !== revision) throw new ReconciliationConflict();
    const next = attachPaperImage(current, randomUUID());
    return NextResponse.json(await saveReconciliationPaperImage(next, revision, auth.id, image.mime, image.bytes), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof ReconciliationConflict) return json(error.message, 409);
    return json('Не удалось сохранить фото. Предыдущая версия журнала сохранена.', 503);
  }
}
