export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import type { SchedulePlan } from '@/types';
import {
  getSchedulePlansData,
  invalidateSchedulePlansCache
} from '@/lib/data-loader';
import { requireAdmin } from '@/lib/server-auth';
import { normalizeWashId } from '@/lib/wash';

const dataDir = path.join(process.cwd(), 'data', 'schedule-plans');

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
          const otherFilePath = path.join(dataDir, `${otherPlan.id}.json`);
          await fs.writeFile(otherFilePath, JSON.stringify(otherPlan, null, 2), 'utf-8');
        }
      }
    }

    const filePath = path.join(dataDir, `${id}.json`);
    await fs.writeFile(filePath, JSON.stringify(updatedPlan, null, 2), 'utf-8');
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
    const filePath = path.join(dataDir, `${id}.json`);

    try {
      await fs.access(filePath);
    } catch {
      return NextResponse.json({ error: 'Schedule plan not found' }, { status: 404 });
    }

    await fs.unlink(filePath);
    invalidateSchedulePlansCache();

    return NextResponse.json({ message: 'Schedule plan deleted successfully' });
  } catch (error) {
    console.error('Error deleting schedule plan:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
