'use client';

import { useState } from 'react';
import type { Employee, WashEvent } from '@/types';
import { ZorinWorkstationConsole } from '@/components/employee/ZorinWorkstationConsole';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Car, History, ChevronDown, ChevronUp, Box } from 'lucide-react';

interface KioskOrderClientProps {
  box1Employees: Employee[];
  box2Employees: Employee[];
  todayEvents: WashEvent[];
  allEmployees: Employee[];
}

function EventRow({ event, employees }: { event: WashEvent; employees: Employee[] }) {
  const time = event.timestamp ? new Date(event.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
  const names = (event.employeeIds || [])
    .map(id => employees.find(e => e.id === id)?.fullName?.split(' ')[0] || '')
    .filter(Boolean)
    .join(', ');

  return (
    <div className="flex items-center justify-between py-2 px-4 border-b last:border-0">
      <div className="flex items-center gap-2.5">
        <Car className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <div>
          <span className="font-medium text-sm">{event.vehicleNumber || '—'}</span>
          {names && <span className="text-xs text-muted-foreground ml-1.5">{names}</span>}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <span className="text-sm font-medium">{event.totalAmount ? `${event.totalAmount} ₽` : ''}</span>
        <span className="text-xs text-muted-foreground ml-1.5">{time}</span>
      </div>
    </div>
  );
}

export function KioskOrderClient({ box1Employees, box2Employees, todayEvents, allEmployees }: KioskOrderClientProps) {
  const [showHistory, setShowHistory] = useState(false);

  const sortByTime = (events: WashEvent[]) => [...events].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

  const box1Events = todayEvents.filter(e => e.boxNumber === 1);
  const box2Events = todayEvents.filter(e => e.boxNumber === 2);
  const unassignedEvents = todayEvents.filter(e => !e.boxNumber);

  const totalAmount = todayEvents.reduce((sum, e) => sum + (e.totalAmount || 0), 0);
  const box1Total = box1Events.reduce((sum, e) => sum + (e.totalAmount || 0), 0);
  const box2Total = box2Events.reduce((sum, e) => sum + (e.totalAmount || 0), 0);

  return (
    <div className="space-y-4">
      {/* Workstation */}
      <ZorinWorkstationConsole
        isKioskMode={true}
        scheduleByBox={{ box1: box1Employees, box2: box2Employees }}
      />

      {/* Today's history — collapsible */}
      <div className="px-0">
        <Button
          variant="outline"
          className="w-full justify-between h-12 text-base"
          onClick={() => setShowHistory(!showHistory)}
        >
          <div className="flex items-center gap-2">
            <History className="h-4 w-4" />
            <span>Заказы сегодня: {todayEvents.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-green-700">{totalAmount.toLocaleString('ru-RU')} ₽</span>
            {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </Button>

        {showHistory && (
          <div className="mt-2 space-y-2">
            {/* Box 1 */}
            <Card>
              <CardHeader className="pb-1 px-4 pt-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-1.5 text-blue-600">
                    <Box className="h-3.5 w-3.5" />
                    Бокс 1
                    <span className="text-muted-foreground font-normal ml-1">({box1Events.length})</span>
                  </CardTitle>
                  <span className="text-sm font-semibold text-green-700">{box1Total.toLocaleString('ru-RU')} ₽</span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {box1Events.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-4 py-3 text-center">Нет заказов</p>
                ) : (
                  <div className="max-h-[200px] overflow-y-auto">
                    {sortByTime(box1Events).map(event => (
                      <EventRow key={event.id} event={event} employees={allEmployees} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Box 2 */}
            <Card>
              <CardHeader className="pb-1 px-4 pt-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-1.5 text-emerald-600">
                    <Box className="h-3.5 w-3.5" />
                    Бокс 2
                    <span className="text-muted-foreground font-normal ml-1">({box2Events.length})</span>
                  </CardTitle>
                  <span className="text-sm font-semibold text-green-700">{box2Total.toLocaleString('ru-RU')} ₽</span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {box2Events.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-4 py-3 text-center">Нет заказов</p>
                ) : (
                  <div className="max-h-[200px] overflow-y-auto">
                    {sortByTime(box2Events).map(event => (
                      <EventRow key={event.id} event={event} employees={allEmployees} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Old events without box number */}
            {unassignedEvents.length > 0 && (
              <Card>
                <CardHeader className="pb-1 px-4 pt-3">
                  <CardTitle className="text-xs text-muted-foreground">Без бокса ({unassignedEvents.length})</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-[150px] overflow-y-auto">
                    {sortByTime(unassignedEvents).map(event => (
                      <EventRow key={event.id} event={event} employees={allEmployees} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
