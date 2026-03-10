export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import { getShiftsData, getWashEventsData } from '@/lib/data-loader';
import { eachDayOfInterval, endOfMonth, format, startOfMonth } from 'date-fns';
import fs from 'fs/promises';
import path from 'path';
import { classifyGoodWeather, classifyStrongPrecip, getVyaznikiDailyForecast } from '@/services/weather-forecast-service';
import type { Shift, WashEvent } from '@/types';

type WashPaymentMethod = WashEvent['paymentMethod'];

function isMonthKey(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

function slotKeyOfShift(shift: Shift): 'box1Day' | 'box1Night' | 'box2Day' | 'box2Night' | null {
  if (shift.boxNumber === 1 && shift.shiftType === 'day') return 'box1Day';
  if (shift.boxNumber === 1 && shift.shiftType === 'night') return 'box1Night';
  if (shift.boxNumber === 2 && shift.shiftType === 'day') return 'box2Day';
  if (shift.boxNumber === 2 && shift.shiftType === 'night') return 'box2Night';
  return null;
}

function safeDateFromWashEvent(ev: WashEvent): string | null {
  if (typeof ev?.timestamp !== 'string') return null;
  // ISO timestamp: YYYY-MM-DD...
  if (ev.timestamp.length < 10) return null;
  return ev.timestamp.slice(0, 10);
}

function addPaymentBucket(buckets: Record<string, number>, method: WashPaymentMethod, amount: number) {
  buckets[method] = (buckets[method] || 0) + amount;
}

export async function GET(request: Request) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const month = String(searchParams.get('month') || '').trim();

    if (!month) {
      return NextResponse.json({ error: 'month is required (YYYY-MM)' }, { status: 400 });
    }
    if (!isMonthKey(month)) {
      return NextResponse.json({ error: 'month must be in YYYY-MM format' }, { status: 400 });
    }

    const monthStart = startOfMonth(new Date(`${month}-01T00:00:00`));
    const monthEnd = endOfMonth(monthStart);
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

    const [shiftsAll, washesAll] = await Promise.all([
      getShiftsData(),
      getWashEventsData(),
    ]);

    const shifts = shiftsAll.filter((s) => typeof s?.date === 'string' && s.date.startsWith(month));
    const washes = washesAll.filter((w) => typeof w?.timestamp === 'string' && w.timestamp.startsWith(month));

    // Weather: forecast only (future window). For historical months it will likely be empty.
    let forecastByDate: Map<string, any> = new Map();
    let forecastMeta: any = { available: false };
    try {
      const forecast = await getVyaznikiDailyForecast();
      forecastMeta = {
        available: true,
        stale: forecast.stale,
        window: forecast.forecastWindow,
        generatedAt: forecast.fetchedAt,
        source: forecast.source,
      };
      for (const d of forecast.days) {
        forecastByDate.set(d.date, {
          precipMm: d.precipMm,
          snowCm: d.snowCm,
          weatherCode: d.weatherCode,
          isStrongPrecip: classifyStrongPrecip(d),
          isGoodWeather: classifyGoodWeather(d),
        });
      }
    } catch {
      forecastMeta = { available: false };
      forecastByDate = new Map();
    }

    const washByDate: Record<string, { count: number; revenueTotal: number; paymentBuckets: Record<string, number> }> = {};
    for (const ev of washes) {
      const date = safeDateFromWashEvent(ev);
      if (!date) continue;
      washByDate[date] ||= { count: 0, revenueTotal: 0, paymentBuckets: {} };
      washByDate[date].count += 1;
      const amount = Number(ev.totalAmount) || 0;
      washByDate[date].revenueTotal += amount;
      addPaymentBucket(washByDate[date].paymentBuckets, ev.paymentMethod, amount);
    }

    // Shift slots per date: keep max employees per slot to protect against accidental duplicate shift files.
    const shiftSlotsByDate: Record<string, { box1Day: number; box1Night: number; box2Day: number; box2Night: number }> = {};
    for (const sh of shifts) {
      const date = sh.date;
      if (typeof date !== 'string') continue;
      const slot = slotKeyOfShift(sh);
      if (!slot) continue;
      const count = Array.isArray(sh.employeeIds) ? sh.employeeIds.length : 0;
      shiftSlotsByDate[date] ||= { box1Day: 0, box1Night: 0, box2Day: 0, box2Night: 0 };
      shiftSlotsByDate[date][slot] = Math.max(shiftSlotsByDate[date][slot], count);
    }

    const days = daysInMonth.map((day) => {
      const date = format(day, 'yyyy-MM-dd');
      const wash = washByDate[date] || { count: 0, revenueTotal: 0, paymentBuckets: {} };
      const slots = shiftSlotsByDate[date] || { box1Day: 0, box1Night: 0, box2Day: 0, box2Night: 0 };
      const scheduledEmployees = slots.box1Day + slots.box1Night + slots.box2Day + slots.box2Night;
      const weather = forecastByDate.get(date) || null;

      return {
        date,
        washCount: wash.count,
        revenueTotal: Math.round(wash.revenueTotal * 100) / 100,
        paymentBuckets: wash.paymentBuckets,
        shifts: {
          ...slots,
          scheduledEmployees,
        },
        weather,
      };
    });

    const topWashDays = [...days]
      .sort((a, b) => (b.washCount - a.washCount) || a.date.localeCompare(b.date))
      .slice(0, 7)
      .map((d) => ({ date: d.date, washCount: d.washCount }));

    const topRevenueDays = [...days]
      .sort((a, b) => (b.revenueTotal - a.revenueTotal) || a.date.localeCompare(b.date))
      .slice(0, 7)
      .map((d) => ({ date: d.date, revenueTotal: d.revenueTotal }));

    const payload = {
      ok: true,
      month,
      generatedAt: new Date().toISOString(),
      sources: {
        washEvents: { count: washes.length },
        shifts: { count: shifts.length },
        forecast: forecastMeta,
      },
      highlights: {
        topWashDays,
        topRevenueDays,
      },
      days,
    };

    try {
      const journalDir = path.join(process.cwd(), 'data', '_meta', 'pattern-journal');
      await fs.mkdir(journalDir, { recursive: true });
      const journalFile = path.join(journalDir, `monthly-${month}.json`);
      await fs.writeFile(journalFile, JSON.stringify(payload, null, 2), 'utf-8');
      (payload as any).journalFile = `data/_meta/pattern-journal/monthly-${month}.json`;
    } catch {
      // ignore journal write errors
    }

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error('Pattern journal error:', error);
    return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}
