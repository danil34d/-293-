export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import type { SchedulePlan, WeeklyPattern } from '@/types';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  getSchedulePlansData,
  invalidateSchedulePlansCache
} from '@/lib/data';
import { requireAdmin } from '@/lib/server-auth';
import { normalizeWashId } from '@/lib/wash';
import { saveEntity } from '@/lib/data/write-helpers';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const { targetMonth } = await request.json(); // YYYY-MM format

    if (!targetMonth) {
      return NextResponse.json({ error: 'Target month is required' }, { status: 400 });
    }

    const plans = await getSchedulePlansData();
    const sourcePlan = plans.find(p => p.id === id);

    if (!sourcePlan) {
      return NextResponse.json({ error: 'Source plan not found' }, { status: 404 });
    }

    // Generate new plan ID
    const newPlanId = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Clone plan with new month
    const clonedPlan: SchedulePlan = {
      id: newPlanId,
      washId: normalizeWashId(sourcePlan.washId),
      name: `\u041f\u043b\u0430\u043d \u043d\u0430 ${format(new Date(targetMonth + '-01'), 'LLLL yyyy', { locale: ru })}`,
      month: targetMonth,
      createdAt: new Date().toISOString(),
      createdBy: sourcePlan.createdBy,
      clonedFrom: sourcePlan.id,
      isActive: false,

      // Copy employee configs
      employeeConfigs: sourcePlan.employeeConfigs.map(config => ({ ...config })),

      // Generate daily requirements based on weekly pattern
      dailyRequirements: [],

      // Copy weekly pattern if exists
      weeklyPattern: sourcePlan.weeklyPattern ? { ...sourcePlan.weeklyPattern } : undefined
    };

    // Generate daily requirements for target month based on weekly pattern
    if (sourcePlan.weeklyPattern) {
      const monthStart = startOfMonth(new Date(targetMonth + '-01'));
      const monthEnd = endOfMonth(new Date(targetMonth + '-01'));
      const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

      const dayNames: (keyof WeeklyPattern)[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

      clonedPlan.dailyRequirements = daysInMonth.map(day => {
        const dayOfWeek = getDay(day); // 0 = Sunday, 1 = Monday, ...
        const dayName = dayNames[dayOfWeek];
        const requiredCount = sourcePlan.weeklyPattern![dayName];

        return {
          date: format(day, 'yyyy-MM-dd'),
          requiredCount
        };
      });
    } else {
      // If no weekly pattern, copy daily requirements by mapping dates
      // This is a simple mapping - might need adjustment for month length differences
      const monthStart = startOfMonth(new Date(targetMonth + '-01'));
      const monthEnd = endOfMonth(new Date(targetMonth + '-01'));
      const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

      clonedPlan.dailyRequirements = daysInMonth.map((day) => {
        // Match by day-of-week from source to handle different month lengths
        const dayOfWeek = getDay(day);
        const sourceReq = sourcePlan.dailyRequirements.find(sr => {
          const srcDate = new Date(sr.date + 'T00:00:00');
          return getDay(srcDate) === dayOfWeek;
        }) || { requiredCount: 2 };

        return {
          date: format(day, 'yyyy-MM-dd'),
          requiredCount: sourceReq.requiredCount || 2
        };
      });
    }

    // Save cloned plan
    await saveEntity('schedulePlan', clonedPlan);
    invalidateSchedulePlansCache();

    return NextResponse.json({
      message: 'Schedule plan cloned successfully',
      plan: clonedPlan
    }, { status: 201 });
  } catch (error) {
    console.error('Error cloning schedule plan:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
