import { getShiftsData, getEmployeesData, getShiftSwapRequestsData, getShiftAssignmentRequestsData, getSchedulePlansData } from '@/lib/data';
import { ScheduleHub } from './components/ScheduleHub';
import '@/styles/schedule-print.css';
import { normalizeWashId } from '@/lib/wash';

export const dynamic = 'force-dynamic';

export default async function SchedulePage({ searchParams }: { searchParams?: { month?: string; tab?: string; washId?: string } }) {
  const requestedMonth = typeof searchParams?.month === 'string' && /^\d{4}-\d{2}$/.test(searchParams.month)
    ? searchParams.month
    : undefined;

  const requestedTab = typeof searchParams?.tab === 'string'
    ? searchParams.tab
    : undefined;

  const requestedWashId = normalizeWashId(searchParams?.washId);

  const [shifts, employees, swapRequests, assignmentRequests, plans] = await Promise.all([
    getShiftsData(),
    getEmployeesData(),
    getShiftSwapRequestsData(),
    getShiftAssignmentRequestsData(),
    getSchedulePlansData(),
  ]);

  const pendingRequests = swapRequests.filter(r => r.status === 'pending');

  return (
    <ScheduleHub
      shifts={shifts}
      employees={employees}
      pendingRequests={pendingRequests}
      assignmentRequests={assignmentRequests}
      plans={plans}
      initialMonth={requestedMonth}
      initialTab={requestedTab}
      initialWashId={requestedWashId}
    />
  );
}
