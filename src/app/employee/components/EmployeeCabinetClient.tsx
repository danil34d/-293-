'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CalendarDays, Wallet, ClipboardList, Sun, Moon, MapPin, AlertTriangle } from 'lucide-react';
import type { Employee, Shift } from '@/types';
import Link from 'next/link';

interface EmployeeCabinetProps {
  employee: Employee | null;
  todayShift: Shift | null;
  tomorrowShift: Shift | null;
  monthShiftCount: number;
  employees: Employee[];
}

function ShiftCard({ shift, label, variant, employees }: {
  shift: Shift | null;
  label: string;
  variant: 'today' | 'tomorrow';
  employees: Employee[];
}) {
  if (!shift) {
    return (
      <Card className={`border-dashed ${variant === 'today' ? 'border-gray-300' : 'border-gray-200'}`}>
        <CardContent className="pt-5 pb-4 px-4">
          <p className="text-sm text-muted-foreground font-medium">{label}</p>
          <p className="text-base mt-1 text-muted-foreground">Нет смены</p>
        </CardContent>
      </Card>
    );
  }

  const isDay = shift.shiftType === 'day';
  const washLabel = shift.washId === 'wash_1' ? 'Циолковского' : shift.washId === 'wash_2' ? 'Мокрово' : '';
  const teammates = shift.employeeIds
    .filter(id => id !== '')
    .map(id => employees.find(e => e.id === id)?.fullName || id)
    .join(', ');

  return (
    <Card className={`${variant === 'today' ? 'border-green-300 bg-green-50' : 'border-blue-200 bg-blue-50'}`}>
      <CardContent className="pt-5 pb-4 px-4">
        <div className="flex items-center justify-between mb-2">
          <p className={`text-sm font-semibold ${variant === 'today' ? 'text-green-700' : 'text-blue-700'}`}>{label}</p>
          <div className="flex items-center gap-1.5">
            {isDay ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-indigo-500" />}
            <span className="text-sm font-medium">{isDay ? 'День' : 'Ночь'}</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">Бокс {shift.boxNumber}</span>
            <span className="text-muted-foreground">|</span>
            <span>{shift.startTime} — {shift.endTime}</span>
          </div>
          {washLabel && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {washLabel}
            </div>
          )}
          {teammates && (
            <p className="text-xs text-muted-foreground mt-1">Коллеги: {teammates}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function EmployeeCabinetClient({
  employee,
  todayShift,
  tomorrowShift,
  monthShiftCount,
  employees,
}: EmployeeCabinetProps) {
  if (!employee) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="max-w-sm w-full">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
            <p className="text-lg font-semibold">Не удалось загрузить профиль</p>
            <p className="text-sm text-muted-foreground mt-1">Попробуйте войти заново</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      {/* Greeting */}
      <div className="px-1">
        <h2 className="text-xl font-bold">
          {getGreeting()}, {employee.fullName.split(' ')[1] || employee.fullName.split(' ')[0]}!
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Смен в этом месяце: {monthShiftCount}
        </p>
      </div>

      {/* Today & Tomorrow shifts */}
      <div className="space-y-3">
        <ShiftCard shift={todayShift} label="Сегодня" variant="today" employees={employees} />
        <ShiftCard shift={tomorrowShift} label="Завтра" variant="tomorrow" employees={employees} />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" className="h-20 flex flex-col gap-2" asChild>
          <Link href="/employee/schedule">
            <CalendarDays className="h-6 w-6 text-blue-600" />
            <span className="text-sm font-medium">Мой график</span>
          </Link>
        </Button>
        <Button variant="outline" className="h-20 flex flex-col gap-2" asChild>
          <Link href="/employee/finance">
            <Wallet className="h-6 w-6 text-green-600" />
            <span className="text-sm font-medium">Моя зарплата</span>
          </Link>
        </Button>
      </div>

      {/* Go to workstation */}
      <Button className="w-full h-14 text-base" asChild>
        <Link href="/employee/workstation">
          <ClipboardList className="mr-2 h-5 w-5" />
          Оформить заказ
        </Link>
      </Button>
    </div>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return 'Доброй ночи';
  if (hour < 12) return 'Доброе утро';
  if (hour < 18) return 'Добрый день';
  return 'Добрый вечер';
}
