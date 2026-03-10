export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import {
  getEmployeeTransactions,
  getShiftAssignmentRequestsData,
  getShiftsData,
  getShiftSwapRequestsData,
  getWashEventsData,
} from '@/lib/data-loader';
import { getShiftActiveEmployeeIds, getShiftLinkedEmployeeIds, getShiftReleasedEmployeeId, isEmployeeLinkedToShift } from '@/lib/shift-state';
import { requireTelegramInternalAuth } from '@/lib/telegram-internal-auth';
import { buildEmployeeEvents } from '@/services/notification-diff-service';
import type {
  TelegramEmployeeSnapshot,
  TelegramInternalApiResponse,
  TelegramNotificationEvent,
} from '@/types/telegram-bot';

const SNAPSHOT_DIR = path.join(process.cwd(), 'data', 'telegram-bot', 'snapshot-cache');

interface SnapshotCacheEntry {
  cursor: string;
  snapshot: TelegramEmployeeSnapshot;
  updatedAt: string;
}

function createCursor(): string {
  return `cur_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureSnapshotDir() {
  await fs.mkdir(SNAPSHOT_DIR, { recursive: true });
}

async function readCachedSnapshot(employeeId: string): Promise<SnapshotCacheEntry | null> {
  await ensureSnapshotDir();
  const filePath = path.join(SNAPSHOT_DIR, `${employeeId}.json`);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as SnapshotCacheEntry;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function writeCachedSnapshot(employeeId: string, entry: SnapshotCacheEntry): Promise<void> {
  await ensureSnapshotDir();
  const filePath = path.join(SNAPSHOT_DIR, `${employeeId}.json`);
  await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8');
}

function shiftSignature(shift: {
  date: string;
  boxNumber: number;
  shiftType: string;
  startTime: string;
  endTime: string;
  employeeIds: string[];
  releasedEmployeeId?: string;
}): string {
  const sortedEmployees = [...getShiftActiveEmployeeIds(shift)].sort();
  return [
    shift.date,
    shift.boxNumber,
    shift.shiftType,
    shift.startTime,
    shift.endTime,
    sortedEmployees.join(','),
    shift.releasedEmployeeId || '',
  ].join('|');
}

async function buildSnapshot(employeeId: string): Promise<TelegramEmployeeSnapshot> {
  const [shifts, swapRequests, assignmentRequests, transactions, washEvents] = await Promise.all([
    getShiftsData(),
    getShiftSwapRequestsData(),
    getShiftAssignmentRequestsData(),
    getEmployeeTransactions(employeeId),
    getWashEventsData(),
  ]);

  return {
    employeeId,
    generatedAt: new Date().toISOString(),
    shifts: shifts
      .filter((s) => isEmployeeLinkedToShift(s, employeeId))
      .map((s) => ({
        id: s.id,
        date: s.date,
        boxNumber: s.boxNumber,
        shiftType: s.shiftType,
        startTime: s.startTime,
        endTime: s.endTime,
        employeeIds: [...getShiftLinkedEmployeeIds(s)],
        releasedEmployeeId: getShiftReleasedEmployeeId(s),
        signature: shiftSignature(s),
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    swapRequests: swapRequests
      .filter((r) => r.requesterId === employeeId || r.targetEmployeeId === employeeId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    assignmentRequests: assignmentRequests
      .filter((r) => r.employeeId === employeeId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    transactions: transactions
      .map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        description: t.description,
        date: t.date,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    washEvents: washEvents
      .filter((w) => w.employeeIds.includes(employeeId))
      .map((w) => ({
        id: w.id,
        timestamp: w.timestamp,
        vehicleNumber: w.vehicleNumber,
        totalAmount: w.totalAmount,
        paymentMethod: w.paymentMethod,
      }))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
  };
}

export async function GET(request: Request) {
  const auth = requireTelegramInternalAuth(request);
  if (auth !== true) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId')?.trim();
    const cursor = searchParams.get('cursor')?.trim() || '';

    if (!employeeId) {
      return NextResponse.json({ ok: false, error: 'employeeId is required' } satisfies TelegramInternalApiResponse<never>, { status: 400 });
    }

    const currentSnapshot = await buildSnapshot(employeeId);
    const cached = await readCachedSnapshot(employeeId);
    const newCursor = createCursor();

    let events: TelegramNotificationEvent[] = [];
    let synchronized = false;

    if (cached && cursor && cached.cursor === cursor) {
      events = buildEmployeeEvents(cached.snapshot, currentSnapshot);
      synchronized = true;
    }

    await writeCachedSnapshot(employeeId, {
      cursor: newCursor,
      snapshot: currentSnapshot,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      data: {
        employeeId,
        cursor: newCursor,
        synchronized,
        generatedAt: currentSnapshot.generatedAt,
        counts: {
          shifts: currentSnapshot.shifts.length,
          swapRequests: currentSnapshot.swapRequests.length,
          assignmentRequests: currentSnapshot.assignmentRequests.length,
          transactions: currentSnapshot.transactions.length,
          washEvents: currentSnapshot.washEvents.length,
        },
        events,
      },
    } satisfies TelegramInternalApiResponse<unknown>);
  } catch (error) {
    console.error('Error building telegram snapshot:', error);
    return NextResponse.json({ ok: false, error: 'Internal Server Error' } satisfies TelegramInternalApiResponse<never>, { status: 500 });
  }
}
