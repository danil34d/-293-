export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import type { EmployeeDayStatusEntry } from '@/types';
import {
  getEmployeeDayStatusesData,
  invalidateEmployeeDayStatusesCache
} from '@/lib/data';
import { requireAdmin } from '@/lib/server-auth';
import { saveEntity, deleteEntity } from '@/lib/data/write-helpers';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const statuses = await getEmployeeDayStatusesData();
    const status = statuses.find(s => s.id === id);

    if (!status) {
      return NextResponse.json({ error: 'Employee day status not found' }, { status: 404 });
    }
    return NextResponse.json(status);
  } catch (error) {
    console.error('Error reading employee day status:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const statuses = await getEmployeeDayStatusesData();
    const existingStatus = statuses.find(s => s.id === id);

    if (!existingStatus) {
      return NextResponse.json({ error: 'Employee day status not found' }, { status: 404 });
    }

    const updatedData: Partial<EmployeeDayStatusEntry> = await request.json();
    const updatedStatus: EmployeeDayStatusEntry = { ...existingStatus, ...updatedData, id };

    await saveEntity('employeeDayStatus', updatedStatus);
    invalidateEmployeeDayStatusesCache();

    return NextResponse.json({ message: 'Employee day status updated successfully', status: updatedStatus });
  } catch (error) {
    console.error('Error updating employee day status:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const statuses = await getEmployeeDayStatusesData();
    const existing = statuses.find(s => s.id === id);

    if (!existing) {
      return NextResponse.json({ error: 'Employee day status not found' }, { status: 404 });
    }

    await deleteEntity('employeeDayStatus', id);
    invalidateEmployeeDayStatusesCache();

    return NextResponse.json({ message: 'Employee day status deleted successfully' });
  } catch (error) {
    console.error('Error deleting employee day status:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
