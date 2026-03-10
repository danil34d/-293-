export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import type { EmployeeDayStatusEntry } from '@/types';
import { getEmployeeDayStatusesData, invalidateEmployeeDayStatusesCache } from '@/lib/data-loader';
import { requireAdmin } from '@/lib/server-auth';

const dataDir = path.join(process.cwd(), 'data', 'employee-day-statuses');

async function ensureDataDirectory() {
  try {
    await fs.access(dataDir);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      await fs.mkdir(dataDir, { recursive: true });
    } else {
      throw error;
    }
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId');
    const date = searchParams.get('date');
    const month = searchParams.get('month'); // YYYY-MM format

    let statuses = await getEmployeeDayStatusesData();

    if (employeeId) {
      statuses = statuses.filter(s => s.employeeId === employeeId);
    }

    if (date) {
      statuses = statuses.filter(s => s.date === date);
    }

    if (month) {
      statuses = statuses.filter(s => s.date.startsWith(month));
    }

    return NextResponse.json(statuses);
  } catch (error) {
    console.error('Error reading employee day statuses:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    await ensureDataDirectory();
    const newStatus: EmployeeDayStatusEntry = await request.json();

    if (!newStatus.id) {
      return NextResponse.json({ error: 'Status ID is required' }, { status: 400 });
    }
    if (!newStatus.employeeId) {
      return NextResponse.json({ error: 'Employee ID is required' }, { status: 400 });
    }
    if (!newStatus.date) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 });
    }
    if (!newStatus.status) {
      return NextResponse.json({ error: 'Status value is required' }, { status: 400 });
    }

    const filePath = path.join(dataDir, `${newStatus.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(newStatus, null, 2), 'utf-8');
    invalidateEmployeeDayStatusesCache();

    return NextResponse.json({ message: 'Employee day status created successfully', status: newStatus }, { status: 201 });
  } catch (error) {
    console.error('Error creating employee day status:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
