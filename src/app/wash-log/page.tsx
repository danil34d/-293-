export const dynamic = 'force-dynamic';

import "@/styles/wash-log.css";
import { WashLogPageWrapper } from './components/WashLogPageWrapper';
import { getWashEventsData, getEmployeesData } from '@/lib/data-loader';

export default async function WashLogPage() {
  const [washEvents, employees] = await Promise.all([
    getWashEventsData(),
    getEmployeesData()
  ]);

  return <WashLogPageWrapper initialWashEvents={washEvents} initialEmployees={employees} />;
}