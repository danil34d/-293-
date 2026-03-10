"use client";

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CalendarDays, Sparkles, CloudSun, Users, Settings2 } from 'lucide-react';
import { ScheduleCalendar } from './ScheduleCalendar';
import { PlanningDashboard } from '../planning/components/PlanningDashboard';
import WeatherPatternsTab from './WeatherPatternsTab';
import { EmployeeScheduleOverview } from './EmployeeScheduleOverview';
import { EmployeePreferencesManager } from './EmployeePreferencesManager';
import type { Shift, Employee, ShiftSwapRequest, ShiftAssignmentRequest, SchedulePlan, WashId } from '@/types';

interface ScheduleHubProps {
  shifts: Shift[];
  employees: Employee[];
  pendingRequests: ShiftSwapRequest[];
  assignmentRequests: ShiftAssignmentRequest[];
  plans: SchedulePlan[];
  initialMonth?: string;
  initialTab?: string;
  initialWashId?: WashId;
}

export function ScheduleHub({
  shifts,
  employees,
  pendingRequests,
  assignmentRequests,
  plans,
  initialMonth,
  initialTab,
  initialWashId,
}: ScheduleHubProps) {
  const [activeTab, setActiveTab] = useState(initialTab || 'calendar');

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-gray-900">Смены</h1>
        <p className="text-sm text-gray-500 mt-1">
          График, планирование и прогноз загрузки
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="calendar" className="flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" />
            График
          </TabsTrigger>
          <TabsTrigger value="planning" className="flex items-center gap-1.5">
            <Sparkles className="h-4 w-4" />
            Планирование
          </TabsTrigger>
          <TabsTrigger value="overview" className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            Обзор графика
          </TabsTrigger>
          <TabsTrigger value="preferences" className="flex items-center gap-1.5">
            <Settings2 className="h-4 w-4" />
            Предпочтения
          </TabsTrigger>
          <TabsTrigger value="weather" className="flex items-center gap-1.5">
            <CloudSun className="h-4 w-4" />
            Погода
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar">
          <ScheduleCalendar
            initialShifts={shifts}
            initialMonth={initialMonth}
            initialWashId={initialWashId}
            employees={employees}
            pendingRequests={pendingRequests}
            assignmentRequests={assignmentRequests}
          />
        </TabsContent>

        <TabsContent value="planning">
          <PlanningDashboard initialPlans={plans} employees={employees} initialWashId={initialWashId} />
        </TabsContent>

        <TabsContent value="overview">
          <EmployeeScheduleOverview shifts={shifts} employees={employees} initialMonth={initialMonth} />
        </TabsContent>

        <TabsContent value="preferences">
          <EmployeePreferencesManager employees={employees} />
        </TabsContent>

        <TabsContent value="weather">
          <WeatherPatternsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
