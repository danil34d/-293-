export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getEmployeesData, getShiftAssignmentRequestsData, getShiftsData, getShiftSwapRequestsData } from '@/lib/data-loader';
import { isEmployeeActiveInShift } from '@/lib/shift-state';
import { requireTelegramInternalAuth } from '@/lib/telegram-internal-auth';
import type { TelegramInternalApiResponse } from '@/types/telegram-bot';
import { isEmployeeAdmin } from '@/lib/employee-role';

export async function GET(request: Request) {
  const auth = requireTelegramInternalAuth(request);
  if (auth !== true) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId')?.trim();
    if (!employeeId) {
      return NextResponse.json({ ok: false, error: 'employeeId is required' } satisfies TelegramInternalApiResponse<never>, { status: 400 });
    }

    const [employees, shifts, swapRequests, assignmentRequests] = await Promise.all([
      getEmployeesData(),
      getShiftsData(),
      getShiftSwapRequestsData(),
      getShiftAssignmentRequestsData(),
    ]);

    const employeeMap = new Map(employees.map((e) => [e.id, e.fullName]));
    const upcomingOwnShifts = shifts
      .filter((s) => isEmployeeActiveInShift(s, employeeId) && new Date(`${s.date}T00:00:00`).getTime() >= new Date(new Date().toDateString()).getTime())
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const incomingSwap = swapRequests
      .filter((r) => r.status === 'pending' && r.targetEmployeeId === employeeId)
      .map((r) => ({
        ...r,
        requesterName: employeeMap.get(r.requesterId) || r.requesterId,
      }));

    const outgoingSwap = swapRequests
      .filter((r) => r.requesterId === employeeId)
      .map((r) => ({
        ...r,
        targetName: r.targetEmployeeId ? employeeMap.get(r.targetEmployeeId) || r.targetEmployeeId : null,
      }));

    const ownAssignments = assignmentRequests
      .filter((r) => r.employeeId === employeeId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const availableEmployees = employees
      .filter((e) => e.id !== employeeId && !isEmployeeAdmin(e))
      .map((e) => ({ id: e.id, fullName: e.fullName }));

    return NextResponse.json({
      ok: true,
      data: {
        employeeId,
        generatedAt: new Date().toISOString(),
        incomingSwapRequests: incomingSwap,
        outgoingSwapRequests: outgoingSwap,
        assignmentRequests: ownAssignments,
        ownUpcomingShifts: upcomingOwnShifts,
        availableEmployees,
      },
    } satisfies TelegramInternalApiResponse<unknown>);
  } catch (error) {
    console.error('Error building telegram requests:', error);
    return NextResponse.json({ ok: false, error: 'Internal Server Error' } satisfies TelegramInternalApiResponse<never>, { status: 500 });
  }
}
