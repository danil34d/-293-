export const dynamic = 'force-dynamic';

import "@/styles/wash-log.css";
import { WashLogPageWrapper } from './components/WashLogPageWrapper';
import { ShiftReportsTab } from './components/ShiftReportsTab';
import { ViolationsTab } from './components/ViolationsTab';
import { WashLogTabs } from './components/WashLogTabs';
import { getWashEventsData, getEmployeesData, getViolationsData, getShiftReportsData } from '@/lib/data-loader';

export default async function WashLogPage() {
  const [washEvents, employees, violations, shiftReports] = await Promise.all([
    getWashEventsData(),
    getEmployeesData(),
    getViolationsData(),
    getShiftReportsData(),
  ]);

  return (
    <WashLogTabs
      washLogContent={
        <WashLogPageWrapper initialWashEvents={washEvents} initialEmployees={employees} />
      }
      shiftsContent={
        <ShiftReportsTab reports={shiftReports} employees={employees} />
      }
      violationsContent={
        <ViolationsTab initialViolations={violations} employees={employees} />
      }
    />
  );
}
