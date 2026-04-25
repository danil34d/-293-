export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import type { SchedulePlan } from '@/types';
import { getSchedulePlansData, invalidateSchedulePlansCache } from '@/lib/data';
import { requireAdmin } from '@/lib/server-auth';
import { isWashId, normalizeWashId } from '@/lib/wash';
import { saveEntity } from '@/lib/data/write-helpers';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month'); // YYYY-MM format
    const activeOnly = searchParams.get('activeOnly') === 'true';
    const washId = searchParams.get('washId');

    let plans = await getSchedulePlansData();

    if (month) {
      plans = plans.filter(p => p.month === month);
    }

    if (activeOnly) {
      plans = plans.filter(p => p.isActive);
    }

    if (washId) {
      if (!isWashId(washId)) {
        return NextResponse.json({ error: 'Invalid washId. Allowed: wash_1, wash_2' }, { status: 400 });
      }
      plans = plans.filter(p => p.washId === washId);
    }

    return NextResponse.json(plans);
  } catch (error) {
    console.error('Error reading schedule plans:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const newPlan: SchedulePlan = await request.json();

    if (!newPlan.id) {
      return NextResponse.json({ error: 'Plan ID is required' }, { status: 400 });
    }

    // Set default values
    if (!newPlan.createdAt) newPlan.createdAt = new Date().toISOString();
    if (newPlan.isActive === undefined) newPlan.isActive = false;
    if (!newPlan.employeeConfigs) newPlan.employeeConfigs = [];
    if (!newPlan.dailyRequirements) newPlan.dailyRequirements = [];
    newPlan.washId = normalizeWashId(newPlan.washId);

    await saveEntity('schedulePlan', newPlan);
    invalidateSchedulePlansCache();

    return NextResponse.json({ message: 'Schedule plan created successfully', plan: newPlan }, { status: 201 });
  } catch (error) {
    console.error('Error creating schedule plan:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
