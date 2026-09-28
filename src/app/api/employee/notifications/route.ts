export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import {
  getShiftSwapRequestsData,
  getShiftAssignmentRequestsData,
  getShiftsData,
  getEmployeesData,
} from '@/lib/data';
import { prisma } from '@/lib/db/prisma';

/**
 * Уведомления сотрудника — агрегатор из 3 источников:
 *   1) pending swap-requests где targetEmployeeId === auth.id
 *   2) недавние (за 7 дней) assignment-requests где employeeId === auth.id и status !== 'pending'
 *   3) недавно созданные shifts (createdAt > now-3d) где employeeIds включают auth.id
 *
 * Read-state хранится в AppConfig.value['employeeReadNotifications']:
 *   { readNotifications: Array<{ employeeId, notifId, readAt }> }
 *
 * Возвращаемые items уже отфильтрованы по непрочитанным (если ?includeRead=1 — все).
 */

export type NotificationLevel = 'info' | 'warn' | 'success';

export interface NotificationItem {
  /** Стабильный id — используем как ключ для mark-read */
  id: string;
  /** Семантический тип (для иконок/цветов в UI) */
  type: 'swap-incoming' | 'request-approved' | 'request-rejected' | 'shift-assigned' | 'info';
  title: string;
  body?: string;
  /** ISO timestamp */
  createdAt: string;
  link?: string;
  level?: NotificationLevel;
}

const APP_CONFIG_KEY = 'employeeReadNotifications';
const READ_RETENTION_DAYS = 30;
const MAX_RESULTS = 20;

interface ReadEntry {
  employeeId: string;
  notifId: string;
  readAt: string; // ISO
}

interface ReadStore {
  readNotifications: ReadEntry[];
}

async function getReadStore(): Promise<ReadStore> {
  try {
    const row = await prisma.appConfig.findUnique({ where: { key: APP_CONFIG_KEY } });
    if (!row) return { readNotifications: [] };
    const value = row.value as any;
    if (!value || !Array.isArray(value.readNotifications)) {
      return { readNotifications: [] };
    }
    return { readNotifications: value.readNotifications as ReadEntry[] };
  } catch {
    // JSON-fallback (нет postgres) — храним read-state только в памяти процесса бесполезно,
    // поэтому в этом случае всё считается «непрочитанным» (это OK для dev).
    return { readNotifications: [] };
  }
}

function formatRussianDate(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split('-');
  if (!y || !m || !d) return yyyyMmDd;
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const mi = parseInt(m, 10) - 1;
  return `${parseInt(d, 10)} ${months[mi] ?? m}`;
}

function shiftTypeRu(type: string): string {
  if (type === 'day') return 'День';
  if (type === 'night') return 'Ночь';
  return type;
}

export async function GET(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  const employeeId = auth.id;
  const url = new URL(request.url);
  const includeRead = url.searchParams.get('includeRead') === '1';

  const now = Date.now();
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

  const items: NotificationItem[] = [];

  // ─── 1) Pending swap-requests targeted at me ────────────────────────
  try {
    const [swaps, employees] = await Promise.all([
      getShiftSwapRequestsData(),
      getEmployeesData(),
    ]);
    const empMap = new Map(employees.map((e) => [e.id, e]));

    for (const sw of swaps) {
      if (sw.targetEmployeeId !== employeeId) continue;
      if (sw.status !== 'pending') continue;

      const requester = sw.requesterId ? empMap.get(sw.requesterId) : null;
      const requesterName = requester?.fullName || 'Сотрудник';

      // Date of requester shift — нужно подтянуть, чтобы показать дату
      let dateLabel = '';
      try {
        const shifts = await getShiftsData();
        const reqShift = shifts.find((s) => s.id === sw.requesterShiftId);
        if (reqShift) dateLabel = ` · ${formatRussianDate(reqShift.date)}`;
      } catch {
        // ignore
      }

      const typeLabel = sw.type === 'swap' ? 'Запрос обмена сменой' : 'Хотят отдать смену';

      items.push({
        id: `swap:${sw.id}`,
        type: 'swap-incoming',
        title: typeLabel,
        body: `От ${requesterName}${dateLabel}`,
        createdAt: sw.createdAt,
        link: '/employee/schedule?tab=swaps',
        level: 'info',
      });
    }
  } catch (err) {
    console.error('[notifications] swap-requests error:', err);
  }

  // ─── 2) Resolved assignment-requests за последние 7 дней ────────────
  try {
    const assignments = await getShiftAssignmentRequestsData();
    for (const ar of assignments) {
      if (ar.employeeId !== employeeId) continue;
      if (ar.status === 'pending') continue;

      // Используем resolvedAt если есть, иначе createdAt
      const resolvedTs = ar.resolvedAt ? new Date(ar.resolvedAt).getTime() : 0;
      const createdTs = new Date(ar.createdAt).getTime();
      const eventTs = resolvedTs || createdTs;
      if (now - eventTs > SEVEN_DAYS_MS) continue;

      const accepted = ar.status === 'accepted';
      const title = accepted ? 'Заявка принята' : 'Заявка отклонена';
      const dateLabel = formatRussianDate(ar.date);
      const body = `${dateLabel} · Бокс ${ar.boxNumber} · ${shiftTypeRu(ar.shiftType)}`;

      items.push({
        id: `assignment:${ar.id}`,
        type: accepted ? 'request-approved' : 'request-rejected',
        title,
        body,
        createdAt: ar.resolvedAt || ar.createdAt,
        link: '/employee/schedule',
        level: accepted ? 'success' : 'warn',
      });
    }
  } catch (err) {
    console.error('[notifications] assignment-requests error:', err);
  }

  // ─── 3) Newly assigned shifts (createdAt > now-3d) ──────────────────
  // Shift.createdAt не экспортирован в TS Shift, читаем напрямую через prisma.
  try {
    const cutoff = new Date(now - THREE_DAYS_MS);
    const recentShifts = await prisma.shift.findMany({
      where: {
        createdAt: { gte: cutoff },
        employees: { some: { employeeId } },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    for (const sh of recentShifts) {
      const dateLabel = formatRussianDate(sh.date);
      const body = `${dateLabel} · Бокс ${sh.boxNumber} · ${shiftTypeRu(sh.shiftType)}`;
      items.push({
        id: `shift:${sh.id}`,
        type: 'shift-assigned',
        title: 'Назначена новая смена',
        body,
        createdAt: sh.createdAt.toISOString(),
        link: '/employee/schedule',
        level: 'info',
      });
    }
  } catch (err) {
    // JSON-fallback / prisma недоступен — пропускаем источник
    console.error('[notifications] recent-shifts error (skipped):', err);
  }

  // ─── Read-filter ───────────────────────────────────────────────────
  const store = await getReadStore();
  const readSet = new Set(
    store.readNotifications
      .filter((r) => r.employeeId === employeeId)
      .map((r) => r.notifId),
  );

  const filtered = includeRead
    ? items
    : items.filter((it) => !readSet.has(it.id));

  // ─── Sort & limit ──────────────────────────────────────────────────
  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const limited = filtered.slice(0, MAX_RESULTS);

  return NextResponse.json({ items: limited });
}
