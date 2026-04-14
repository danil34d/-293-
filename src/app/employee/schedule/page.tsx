import { getShiftsData, getEmployeesData, getShiftSwapRequestsData, getShiftAssignmentRequestsData } from '@/lib/data-loader';
import { EmployeeScheduleClient } from './components/EmployeeScheduleClient';
import { cookies } from 'next/headers';
import { verifyCookieValue } from '@/lib/employee-auth-cookie';

export const dynamic = 'force-dynamic';

export default async function EmployeeSchedulePage() {
  const [shifts, employees, swapRequests, assignmentRequests] = await Promise.all([
    getShiftsData(),
    getEmployeesData(),
    getShiftSwapRequestsData(),
    getShiftAssignmentRequestsData()
  ]);

  // Get current employee from cookie
  const cookieStore = cookies();
  const authCookie = cookieStore.get('employee_auth_sim');
  let currentEmployeeId = '';

  if (authCookie?.value) {
    try {
      let rawPayload = verifyCookieValue(authCookie.value);
      if (!rawPayload) rawPayload = authCookie.value;
      const authData = JSON.parse(rawPayload);
      currentEmployeeId = authData.id;
    } catch (e) {}
  }

  const currentEmployee = employees.find(e => e.id === currentEmployeeId) || null;

  return (
    <div className="min-h-screen bg-gray-50">
      <EmployeeScheduleClient
        shifts={shifts}
        employees={employees}
        swapRequests={swapRequests}
        assignmentRequests={assignmentRequests}
        currentEmployeeId={currentEmployeeId}
        currentEmployee={currentEmployee}
      />
    </div>
  );
}
