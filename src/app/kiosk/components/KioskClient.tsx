'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClipboardList, History, CalendarDays, Sun, Moon, MapPin, Users, Car } from 'lucide-react';
import type { Employee, Shift, WashEvent } from '@/types';
import Link from 'next/link';

interface KioskClientProps {
  todayShifts: Shift[];
  tomorrowShifts: Shift[];
  todayEmployeeIds: string[];
  employees: Employee[];
  todayEvents: WashEvent[];
}

function ShiftRow({ shift, employees }: { shift: Shift; employees: Employee[] }) {
  const isDay = shift.shiftType === 'day';
  const names = shift.employeeIds
    .map(id => employees.find(e => e.id === id))
    .filter(Boolean)
    .map(e => e!.fullName.split(' ').slice(0, 2).join(' '));

  return (
    <div className="flex items-center justify-between py-3 px-4 border-b last:border-0">
      <div className="flex items-center gap-3">
        {isDay ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-indigo-500" />}
        <div>
          <span className="font-medium text-sm">Бокс {shift.boxNumber}</span>
          <span className="text-muted-foreground text-sm ml-2">{shift.startTime}—{shift.endTime}</span>
        </div>
      </div>
      <div className="text-right">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="h-3 w-3" />
          {names.length > 0 ? names.join(', ') : 'Нет сотрудников'}
        </div>
      </div>
    </div>
  );
}

function EventRow({ event, employees }: { event: WashEvent; employees: Employee[] }) {
  const time = event.timestamp ? new Date(event.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
  const employeeNames = (event.employeeIds || [])
    .map(id => employees.find(e => e.id === id)?.fullName?.split(' ')[0] || '')
    .filter(Boolean)
    .join(', ');

  return (
    <div className="flex items-center justify-between py-2.5 px-4 border-b last:border-0">
      <div className="flex items-center gap-3">
        <Car className="h-4 w-4 text-muted-foreground" />
        <div>
          <span className="font-medium text-sm">{event.vehicleNumber || 'Без номера'}</span>
          {employeeNames && <span className="text-xs text-muted-foreground ml-2">{employeeNames}</span>}
        </div>
      </div>
      <div className="text-right">
        <span className="text-sm font-medium">{event.totalAmount ? `${event.totalAmount} ₽` : ''}</span>
        <span className="text-xs text-muted-foreground ml-2">{time}</span>
      </div>
    </div>
  );
}

export function KioskClient({
  todayShifts,
  tomorrowShifts,
  todayEmployeeIds,
  employees,
  todayEvents,
}: KioskClientProps) {
  const todayEmployees = employees.filter(e => todayEmployeeIds.includes(e.id));
  const sortedEvents = [...todayEvents].sort((a, b) => {
    const ta = a.timestamp || '';
    const tb = b.timestamp || '';
    return tb.localeCompare(ta); // newest first
  });

  const todayTotal = todayEvents.reduce((sum, e) => sum + (e.totalAmount || 0), 0);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Today's team */}
      <Card>
        <CardHeader className="pb-2 px-4 pt-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-600" />
            Сегодня на смене
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {todayEmployees.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет запланированных смен на сегодня</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {todayEmployees.map(emp => (
                <span key={emp.id} className="inline-flex items-center px-3 py-1.5 rounded-full bg-blue-100 text-blue-800 text-sm font-medium">
                  {emp.fullName.split(' ').slice(0, 2).join(' ')}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main action — go to workstation */}
      <Button className="w-full h-16 text-lg font-semibold" asChild>
        <Link href="/employee/workstation">
          <ClipboardList className="mr-3 h-6 w-6" />
          Оформить заказ
        </Link>
      </Button>

      {/* Tabs: History & Schedule */}
      <Tabs defaultValue="history">
        <TabsList className="w-full">
          <TabsTrigger value="history" className="flex-1 gap-1.5">
            <History className="h-4 w-4" />
            История
          </TabsTrigger>
          <TabsTrigger value="schedule" className="flex-1 gap-1.5">
            <CalendarDays className="h-4 w-4" />
            График
          </TabsTrigger>
        </TabsList>

        <TabsContent value="history">
          <Card>
            <CardHeader className="pb-2 px-4 pt-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Заказы сегодня</CardTitle>
                <span className="text-sm font-semibold text-green-700">{todayTotal.toLocaleString('ru-RU')} ₽</span>
              </div>
              <p className="text-xs text-muted-foreground">Всего: {todayEvents.length} заказов</p>
            </CardHeader>
            <CardContent className="p-0">
              {sortedEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground px-4 py-6 text-center">Заказов пока нет</p>
              ) : (
                <div className="max-h-[400px] overflow-y-auto">
                  {sortedEvents.map(event => (
                    <EventRow key={event.id} event={event} employees={employees} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule">
          <div className="space-y-3">
            <Card>
              <CardHeader className="pb-2 px-4 pt-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="text-green-600 font-bold">Сегодня</span>
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Мойка 1</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {todayShifts.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-4 py-4 text-center">Нет смен на сегодня</p>
                ) : (
                  todayShifts.map(shift => (
                    <ShiftRow key={shift.id} shift={shift} employees={employees} />
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 px-4 pt-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="text-blue-600 font-bold">Завтра</span>
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Мойка 1</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {tomorrowShifts.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-4 py-4 text-center">Нет смен на завтра</p>
                ) : (
                  tomorrowShifts.map(shift => (
                    <ShiftRow key={shift.id} shift={shift} employees={employees} />
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
