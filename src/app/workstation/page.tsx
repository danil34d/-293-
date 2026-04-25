export const dynamic = 'force-dynamic';

import { getShiftsData, getEmployeesData } from '@/lib/data';
import { resolveCurrentBoxShiftStates } from '@/lib/current-box-team';
import { ZorinWorkstationConsole } from '@/components/employee/ZorinWorkstationConsole';

interface Props {
  searchParams: { box?: string };
}

export default async function AdminWorkstationPage({ searchParams }: Props) {
  const today = new Date().toISOString().slice(0, 10);

  const [shifts, employees] = await Promise.all([
    getShiftsData(),
    getEmployeesData(),
  ]);

  // Current shift type by hour
  const hour = new Date().getHours();
  const currentShiftType = (hour >= 8 && hour < 20) ? 'day' : 'night';

  const realEmployees = employees.filter(e => e.role !== 'kiosk');
  const boxShiftStates = resolveCurrentBoxShiftStates({
    shifts,
    employees: realEmployees,
    date: today,
    shiftType: currentShiftType,
  });

  // Pre-select box from query param
  const initialBox = searchParams.box === '2' ? 2 : searchParams.box === '1' ? 1 : undefined;

  return (
    <ZorinWorkstationConsole
      scheduleByBox={{
        box1: boxShiftStates.box1.employees,
        box2: boxShiftStates.box2.employees,
      }}
      shiftStateByBox={{
        box1: {
          shiftId: boxShiftStates.box1.shiftId,
          isShiftActive: boxShiftStates.box1.isShiftActive,
        },
        box2: {
          shiftId: boxShiftStates.box2.shiftId,
          isShiftActive: boxShiftStates.box2.isShiftActive,
        },
      }}
      initialBoxNumber={initialBox}
    />
  );
}
