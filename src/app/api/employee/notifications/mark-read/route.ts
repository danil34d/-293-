export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { prisma } from '@/lib/db/prisma';

/**
 * POST /api/employee/notifications/mark-read
 * Body:
 *   - { id: string }        → пометить одно уведомление прочитанным
 *   - { ids: string[] }     → пометить несколько
 *   - { all: true }         → пометить все недавно показанные (передаются как ids)
 *
 * Storage: AppConfig.value['employeeReadNotifications']:
 *   { readNotifications: [{ employeeId, notifId, readAt: ISO }, ...] }
 *
 * Retention: храним последние 30 дней, обрезаем при upsert чтобы избежать раздувания.
 */

const APP_CONFIG_KEY = 'employeeReadNotifications';
const RETENTION_DAYS = 30;
const MAX_ENTRIES = 5000;

interface ReadEntry {
  employeeId: string;
  notifId: string;
  readAt: string;
}

interface ReadStore {
  readNotifications: ReadEntry[];
}

export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const employeeId = auth.id;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });
  }

  const ids: string[] = [];
  if (typeof body?.id === 'string') ids.push(body.id);
  if (Array.isArray(body?.ids)) {
    for (const v of body.ids) if (typeof v === 'string' && v) ids.push(v);
  }

  if (ids.length === 0) {
    return NextResponse.json({ error: 'Не указаны id уведомлений' }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const retentionCutoffMs = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;

  try {
    const existingRow = await prisma.appConfig.findUnique({ where: { key: APP_CONFIG_KEY } });
    const existingValue = (existingRow?.value as any) ?? { readNotifications: [] };
    const current: ReadEntry[] = Array.isArray(existingValue.readNotifications)
      ? (existingValue.readNotifications as ReadEntry[])
      : [];

    // Удаляем устаревшие + дубликаты для этого employee+notif
    const filtered = current.filter((r) => {
      if (!r || typeof r !== 'object') return false;
      if (new Date(r.readAt).getTime() < retentionCutoffMs) return false;
      // убираем дубликаты — они будут перезаписаны новыми ниже
      if (r.employeeId === employeeId && ids.includes(r.notifId)) return false;
      return true;
    });

    // Добавляем новые записи
    for (const notifId of ids) {
      filtered.push({ employeeId, notifId, readAt: nowIso });
    }

    // Хард-кэп — на всякий случай если что-то поломается
    const trimmed = filtered.length > MAX_ENTRIES
      ? filtered.slice(-MAX_ENTRIES)
      : filtered;

    const nextStore: ReadStore = { readNotifications: trimmed };

    await prisma.appConfig.upsert({
      where: { key: APP_CONFIG_KEY },
      update: { value: nextStore as any },
      create: { key: APP_CONFIG_KEY, value: nextStore as any },
    });

    return NextResponse.json({ ok: true, marked: ids.length });
  } catch (err) {
    console.error('[notifications/mark-read] error:', err);
    return NextResponse.json({ error: 'Не удалось сохранить статус' }, { status: 500 });
  }
}
