'use client';

import { useState } from 'react';
import type { Employee, WashEvent } from '@/types';
import { ZorinWorkstationConsole } from '@/components/employee/ZorinWorkstationConsole';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Car, History, ChevronDown, ChevronUp } from 'lucide-react';

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

  const sorted = [...todayEvents].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  const totalAmount = todayEvents.reduce((sum, e) => sum + (e.totalAmount || 0), 0);

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
          <Card className="mt-2">
            <CardContent className="p-0">
              {sorted.length === 0 ? (
                <p className="text-sm text-muted-foreground px-4 py-6 text-center">Заказов пока нет</p>
              ) : (
                <div className="max-h-[350px] overflow-y-auto">
                  {sorted.map(event => (
                    <EventRow key={event.id} event={event} employees={allEmployees} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
