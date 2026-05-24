export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { getAllFinanceDataForEmployee } from '@/lib/data';
import { generateSalaryReport } from '@/services/salary-calculator';
import type { WashEvent } from '@/types';

/**
 * Phase 47 / ТЕХ-#8: client-side sparkline period switcher.
 *
 * GET /api/employee/sparkline?days=N → array { date, amount }[]
 * Auth: requireAuth (cookie identity).
 *
 * Раньше sparkline жёстко 11 дней serverside — нельзя было сменить период
 * без F5. Этот endpoint позволяет FinanceMobile запрашивать N дней (7/14/30).
 *
 * Clamping: 1 <= days <= 90.
 */
export async function GET(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const daysRaw = parseInt(searchParams.get('days') || '11', 10);
    const days = Math.max(1, Math.min(90, Number.isFinite(daysRaw) ? daysRaw : 11));

    const { allWashEvents, allSchemes, allEmployees } = await getAllFinanceDataForEmployee(auth.id);

    const now = new Date();
    // Build array of date strings (oldest first → newest)
    const dates: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      dates.push(d.toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' }));
    }

    // Filter to employee's washes in this range
    const employee = allEmployees.find((e: any) => e.id === auth.id);
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }
    const dateSet = new Set(dates);
    const myWashes: WashEvent[] = allWashEvents.filter((w: WashEvent) => {
      if (!w.employeeIds?.includes(auth.id)) return false;
      const dateStr = new Date(w.timestamp).toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' });
      return dateSet.has(dateStr);
    });

    // Group by date
    const groupByDay = new Map<string, WashEvent[]>();
    for (const w of myWashes) {
      const dateStr = new Date(w.timestamp).toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' });
      const arr = groupByDay.get(dateStr) || [];
      arr.push(w);
      groupByDay.set(dateStr, arr);
    }

    // Compute earnings per day via salary calculator
    const sparkline = await Promise.all(
      dates.map(async (d) => {
        const dayWashes = groupByDay.get(d) || [];
        if (!dayWashes.length) return { date: d, amount: 0 };
        const r = await generateSalaryReport(dayWashes, [employee], allSchemes, undefined, allEmployees);
        return { date: d, amount: Math.round(r[0]?.totalEarnings ?? 0) };
      })
    );

    // Compute bestDay (highest non-zero amount)
    let bestDay: { date: string; amount: number } | undefined;
    for (const d of sparkline) {
      if (d.amount > 0 && (!bestDay || d.amount > bestDay.amount)) bestDay = d;
    }

    return NextResponse.json({ days, sparkline, bestDay: bestDay ?? null });
  } catch (error) {
    console.error('[/api/employee/sparkline] failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
