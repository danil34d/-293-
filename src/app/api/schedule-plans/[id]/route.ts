export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import type { SchedulePlan } from '@/types';
import {
  getSchedulePlansData,
  invalidateSchedulePlansCache
} from '@/lib/data';
import { requireAdmin } from '@/lib/server-auth';
import { normalizeWashId } from '@/lib/wash';
import { saveEntity, deleteEntity } from '@/lib/data/write-helpers';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const plans = await getSchedulePlansData();
    const plan = plans.find(p => p.id === id);

    if (!plan) {
      return NextResponse.json({ error: 'Schedule plan not found' }, { status: 404 });
    }
    return NextResponse.json(plan);
  } catch (error) {
    console.error('Error reading schedule plan:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const plans = await getSchedulePlansData();
    const existingPlan = plans.find(p => p.id === id);

    if (!existingPlan) {
      return NextResponse.json({ error: 'Schedule plan not found' }, { status: 404 });
    }

    const updatedData: Partial<SchedulePlan> = await request.json();
    const updatedPlan: SchedulePlan = {
      ...existingPlan,
      ...updatedData,
      id,
      washId: normalizeWashId(updatedData.washId ?? existingPlan.washId),
    };

    // If activating this plan, deactivate others for the same month
    if (updatedData.isActive && !existingPlan.isActive) {
      const plansInSameMonth = plans.filter(
        p => p.month === updatedPlan.month && p.washId === updatedPlan.washId && p.id !== id
      );
      for (const otherPlan of plansInSameMonth) {
        if (otherPlan.isActive) {
          otherPlan.isActive = false;
          await saveEntity('schedulePlan', otherPlan);
        }
      }
    }

    await saveEntity('schedulePlan', updatedPlan);
    invalidateSchedulePlansCache();

    return NextResponse.json({ message: 'Schedule plan updated successfully', plan: updatedPlan });
  } catch (error) {
    console.error('Error updating schedule plan:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const plans = await getSchedulePlansData();
    const existing = plans.find(p => p.id === id);

    if (!existing) {
      return NextResponse.json({ error: 'Schedule plan not found' }, { status: 404 });
    }

    await deleteEntity('schedulePlan', id);
    invalidateSchedulePlansCache();

    return NextResponse.json({ message: 'Schedule plan deleted successfully' });
  } catch (error) {
    console.error('Error deleting schedule plan:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
