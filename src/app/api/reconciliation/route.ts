import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import { getReconciliation, saveReconciliation, getReconciliationHistory, getReconciliations } from '@/lib/data';
import { createLiveReconciliation, applyReconciliationCommand, receiveCameraSnapshot, recordCameraFailure } from '@/lib/reconciliation/live-model';
import { fetchReconciliationCameraSnapshot } from '@/lib/reconciliation/camera-source';
import { shiftId, validateShift } from '@/lib/reconciliation/shift';
import { ReconciliationConflict } from '@/lib/reconciliation/postgres-store';
import { readReconciliationBody, reconciliationRequestSchema, isSameOrigin } from '@/lib/reconciliation/request';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: NextRequest) {
  const auth = requireAdmin(); if (auth instanceof NextResponse) return auth;
  const params = request.nextUrl.searchParams;
  try {
    if (params.get('list') === '1') return json({ shifts: await getReconciliations() });
    const shift = validateShift({ date: params.get('date') || '', period: params.get('period') as 'day' | 'night' });
    const id = shiftId(shift);
    if (params.get('history') === '1') return json({ history: await getReconciliationHistory(id) });
    return json(await getReconciliation(id) ?? createLiveReconciliation(shift));
  } catch (error) {
    console.error('reconciliation GET failed', error instanceof Error ? error.name : 'unknown');
    return json({ error: 'Не удалось открыть сверку. Проверьте дату, доступность PostgreSQL и установку таблиц сверки.' }, 503);
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAdmin(); if (auth instanceof NextResponse) return auth;
  // Подписанная cookie + проверка Origin для всех изменений из браузера.
  const origin = request.headers.get('origin');
  if (!isSameOrigin(origin, request.headers.get('host'), request.nextUrl.protocol)) return json({ error: 'Запрос с другого адреса запрещён.' }, 403);
  let body: ReturnType<typeof reconciliationRequestSchema.parse>;
  try { body = reconciliationRequestSchema.parse(await readReconciliationBody(request)); validateShift(body); }
  catch { return json({ error: 'Некорректное действие, дата или поля сверки.' }, 400); }
  try {
    const { date, period, expectedRevision, command } = body;
    const current = await getReconciliation(shiftId({ date, period })) ?? createLiveReconciliation({ date, period });
    if (current.state.revision !== expectedRevision) throw new ReconciliationConflict();
    let next;
    if (command.type === 'refresh') {
      try {
        const snapshot = await fetchReconciliationCameraSnapshot(
          process.env.CAMERA_DASHBOARD_BASE_URL?.trim() || 'http://192.168.1.59:8050', { date, period });
        next = receiveCameraSnapshot(current, snapshot);
      } catch (error) {
        next = recordCameraFailure(current, error instanceof Error ? error.message : 'Ошибка чтения камер.', new Date().toISOString());
      }
    } else {
      try { next = applyReconciliationCommand(current, command, new Date().toISOString()); }
      catch (error) { return json({ error: error instanceof Error ? error.message : 'Не удалось выполнить действие.' }, 400); }
    }
    return json(await saveReconciliation(next, expectedRevision, auth.id, command.type));
  } catch (error) {
    if (error instanceof ReconciliationConflict) return json({ error: error.message }, 409);
    console.error('reconciliation POST failed', error instanceof Error ? error.name : 'unknown');
    return json({ error: 'Не удалось сохранить в PostgreSQL. Ввод остаётся на экране; результат не подтверждён.' }, 503);
  }
}
