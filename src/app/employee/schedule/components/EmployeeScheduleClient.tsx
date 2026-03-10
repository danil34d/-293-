"use client";

import { useEffect, useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, addMonths, subMonths, isBefore } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, Calendar, ArrowRightLeft, Gift, Bell, Home, LogOut, Ban, UserMinus, Plus, Sun, Moon } from 'lucide-react';
import type { Shift, Employee, ShiftSwapRequest, ShiftAssignmentRequest } from '@/types';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { EmployeePreferences } from './EmployeePreferences';
import { DEFAULT_WASH_ID } from '@/lib/wash';

interface EmployeeScheduleClientProps {
  shifts: Shift[];
  employees: Employee[];
  swapRequests: ShiftSwapRequest[];
  assignmentRequests: ShiftAssignmentRequest[];
  currentEmployeeId: string;
  currentEmployee: Employee | null;
}

export function EmployeeScheduleClient({
  shifts,
  employees,
  swapRequests,
  assignmentRequests,
  currentEmployeeId,
  currentEmployee: initialEmployee
}: EmployeeScheduleClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isSwapDialogOpen, setIsSwapDialogOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [swapType, setSwapType] = useState<'giveaway' | 'swap'>('giveaway');
  const [targetEmployeeId, setTargetEmployeeId] = useState<string>('');
  const [targetShiftId, setTargetShiftId] = useState<string>('');
  const [isReleaseDialogOpen, setIsReleaseDialogOpen] = useState(false);
  const [shiftToRelease, setShiftToRelease] = useState<Shift | null>(null);
  const [localShifts, setLocalShifts] = useState<Shift[]>(shifts);

  // Shift assignment request states
  const [isAssignmentDialogOpen, setIsAssignmentDialogOpen] = useState(false);
  const [requestDate, setRequestDate] = useState<string>('');
  const [requestShiftType, setRequestShiftType] = useState<'day' | 'night'>('day');
  const [requestBoxNumber, setRequestBoxNumber] = useState<1 | 2>(1);
  const [requestComment, setRequestComment] = useState<string>('');

  // Local employee state (for preferences updates)
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(initialEmployee);
  const canSwap = currentEmployee?.canSwapShifts !== false; // По умолчанию true

  useEffect(() => {
    // After router.refresh() the server props change, but local state would stay stale without sync.
    setLocalShifts(shifts);
  }, [shifts]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Get my shifts for the current month
  const myShifts = useMemo(() => {
    const monthStr = format(currentMonth, 'yyyy-MM');
    return localShifts.filter(s => s.date.startsWith(monthStr) && s.employeeIds.includes(currentEmployeeId));
  }, [localShifts, currentMonth, currentEmployeeId]);

  // Get pending requests for me (incoming)
  const incomingRequests = useMemo(() => {
    return swapRequests.filter(r => r.status === 'pending' && r.targetEmployeeId === currentEmployeeId);
  }, [swapRequests, currentEmployeeId]);

  // Get my pending outgoing requests
  const outgoingRequests = useMemo(() => {
    return swapRequests.filter(r => r.status === 'pending' && r.requesterId === currentEmployeeId);
  }, [swapRequests, currentEmployeeId]);

  // Get my pending assignment requests
  const myAssignmentRequests = useMemo(() => {
    return assignmentRequests.filter(r => r.employeeId === currentEmployeeId);
  }, [assignmentRequests, currentEmployeeId]);

  // Get other employees' shifts (for swap target selection)
  const getOtherEmployeeShifts = (employeeId: string) => {
    return shifts.filter(s =>
      s.employeeIds.includes(employeeId) &&
      !isBefore(new Date(s.date), new Date())
    );
  };

  const getEmployeeName = (id: string) => {
    const emp = employees.find(e => e.id === id);
    return emp?.fullName || 'Неизвестно';
  };

  const getShiftById = (id: string) => {
    return shifts.find(s => s.id === id);
  };

  const handleOpenSwapDialog = (shift: Shift) => {
    setSelectedShift(shift);
    setSwapType('giveaway');
    setTargetEmployeeId('');
    setTargetShiftId('');
    setIsSwapDialogOpen(true);
  };

  const handleCreateRequest = async () => {
    if (!selectedShift || !targetEmployeeId) {
      toast({ title: 'Выберите сотрудника', variant: 'destructive' });
      return;
    }

    if (swapType === 'swap' && !targetShiftId) {
      toast({ title: 'Выберите смену для обмена', variant: 'destructive' });
      return;
    }

    try {
      const requestData: ShiftSwapRequest = {
        id: `swap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: swapType,
        createdAt: new Date().toISOString(),
        requesterId: currentEmployeeId,
        requesterShiftId: selectedShift.id,
        targetEmployeeId,
        targetShiftId: swapType === 'swap' ? targetShiftId : undefined,
        status: 'pending'
      };

      const res = await fetch('/api/shift-swap-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      if (!res.ok) throw new Error('Failed to create request');

      toast({ title: 'Заявка отправлена' });
      setIsSwapDialogOpen(false);
      router.refresh();
    } catch (error) {
      toast({ title: 'Ошибка отправки заявки', variant: 'destructive' });
    }
  };

  const handleRespondToRequest = async (requestId: string, accept: boolean) => {
    try {
      const res = await fetch(`/api/shift-swap-requests/${requestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: accept ? 'accepted' : 'rejected' })
      });

      if (!res.ok) throw new Error('Failed to respond');

      toast({ title: accept ? 'Заявка принята' : 'Заявка отклонена' });
      router.refresh();
    } catch (error) {
      toast({ title: 'Ошибка', variant: 'destructive' });
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  // Handle shift assignment request
  const handleOpenAssignmentDialog = () => {
    setRequestDate('');
    setRequestShiftType('day');
    setRequestBoxNumber(1);
    setRequestComment('');
    setIsAssignmentDialogOpen(true);
  };

  const handleCreateAssignmentRequest = async () => {
    if (!requestDate) {
      toast({ title: 'Выберите дату', variant: 'destructive' });
      return;
    }

    // Check if date is in the past
    if (isBefore(new Date(requestDate), new Date())) {
      toast({ title: 'Нельзя запросить смену на прошедшую дату', variant: 'destructive' });
      return;
    }

    try {
      const requestData: ShiftAssignmentRequest = {
        id: `assignment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        washId: DEFAULT_WASH_ID,
        createdAt: new Date().toISOString(),
        employeeId: currentEmployeeId,
        date: requestDate,
        shiftType: requestShiftType,
        boxNumber: requestBoxNumber,
        status: 'pending',
        comment: requestComment || undefined
      };

      const res = await fetch('/api/shift-assignment-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      if (!res.ok) throw new Error('Failed to create assignment request');

      toast({ title: 'Запрос на смену отправлен менеджеру' });
      setIsAssignmentDialogOpen(false);
      router.refresh();
    } catch (error) {
      toast({ title: 'Ошибка отправки запроса', variant: 'destructive' });
    }
  };

  const handleCancelAssignmentRequest = async (requestId: string) => {
    try {
      const res = await fetch(`/api/shift-assignment-requests/${requestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' })
      });

      if (!res.ok) throw new Error('Failed to cancel request');

      toast({ title: 'Запрос отменён' });
      router.refresh();
    } catch (error) {
      toast({ title: 'Ошибка', variant: 'destructive' });
    }
  };

  // Отпустить напарника (если на смене 2 человека)
  const handleOpenReleaseDialog = (shift: Shift) => {
    setShiftToRelease(shift);
    setIsReleaseDialogOpen(true);
  };

  const handleReleasePartner = async (partnerIdToRelease: string) => {
    if (!shiftToRelease) return;

    try {
      const res = await fetch(`/api/shifts/${shiftToRelease.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...shiftToRelease,
          releasedEmployeeId: partnerIdToRelease
        })
      });

      if (!res.ok) throw new Error('Failed to release partner');

      // Обновляем локальный стейт
      setLocalShifts(prev => prev.map(s =>
        s.id === shiftToRelease.id
          ? { ...s, releasedEmployeeId: partnerIdToRelease }
          : s
      ));

      toast({ title: 'Напарник отпущен' });
      setIsReleaseDialogOpen(false);
      router.refresh();
    } catch (error) {
      toast({ title: 'Ошибка', variant: 'destructive' });
    }
  };

  // Get partner name for a shift
  const getPartnerInShift = (shift: Shift) => {
    const partnerId = shift.employeeIds.find(id => id !== currentEmployeeId);
    if (!partnerId) return null;
    return employees.find(e => e.id === partnerId);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calendar className="h-6 w-6 text-blue-600" />
          <h1 className="text-lg font-semibold">Мой график</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/employee/workstation">
            <Button variant="outline" size="sm">
              <Home className="h-4 w-4 mr-1" />
              Рабочая станция
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="p-4 space-y-4">
        {/* Swap Restriction Warning */}
        {!canSwap && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="py-3 px-4 flex items-center gap-3">
              <Ban className="h-5 w-5 text-red-500 flex-shrink-0" />
              <div className="text-sm text-red-700">
                Обмен и передача смен запрещены менеджером. Обратитесь к руководству.
              </div>
            </CardContent>
          </Card>
        )}

        {/* Incoming Requests */}
        {incomingRequests.length > 0 && canSwap && (
          <Card className="border-orange-200 bg-orange-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4 text-orange-500" />
                Входящие заявки ({incomingRequests.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {incomingRequests.map(req => {
                const requesterShift = getShiftById(req.requesterShiftId);
                const targetShift = req.targetShiftId ? getShiftById(req.targetShiftId) : null;

                return (
                  <div key={req.id} className="bg-white p-3 rounded-lg border">
                    <div className="text-sm mb-2">
                      <strong>{getEmployeeName(req.requesterId)}</strong>
                      {req.type === 'giveaway' ? (
                        <div className="mt-1">
                          <span> хочет передать вам смену:</span>
                          {requesterShift && (
                            <div className="flex items-center gap-1 mt-1 text-gray-600">
                              {requesterShift.shiftType === 'day' ? (
                                <Sun className="h-3 w-3 text-amber-500" />
                              ) : (
                                <Moon className="h-3 w-3 text-indigo-500" />
                              )}
                              <span>{format(new Date(requesterShift.date), 'd MMM', { locale: ru })} • Бокс {requesterShift.boxNumber} • {requesterShift.shiftType === 'day' ? 'Дневная' : 'Ночная'}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="mt-1">
                          <span> предлагает обменяться:</span>
                          <div className="mt-1 space-y-1">
                            {requesterShift && (
                              <div className="flex items-center gap-1 text-gray-600">
                                {requesterShift.shiftType === 'day' ? (
                                  <Sun className="h-3 w-3 text-amber-500" />
                                ) : (
                                  <Moon className="h-3 w-3 text-indigo-500" />
                                )}
                                <span>Его: {format(new Date(requesterShift.date), 'd MMM', { locale: ru })} • Бокс {requesterShift.boxNumber} • {requesterShift.shiftType === 'day' ? 'Дневная' : 'Ночная'}</span>
                              </div>
                            )}
                            {targetShift && (
                              <div className="flex items-center gap-1 text-gray-600">
                                {targetShift.shiftType === 'day' ? (
                                  <Sun className="h-3 w-3 text-amber-500" />
                                ) : (
                                  <Moon className="h-3 w-3 text-indigo-500" />
                                )}
                                <span>Ваша: {format(new Date(targetShift.date), 'd MMM', { locale: ru })} • Бокс {targetShift.boxNumber} • {targetShift.shiftType === 'day' ? 'Дневная' : 'Ночная'}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleRespondToRequest(req.id, true)}>
                        Принять
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleRespondToRequest(req.id, false)}>
                        Отклонить
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Month Navigation */}
        <div className="flex items-center justify-between bg-white rounded-lg p-3">
          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-lg font-medium">
            {format(currentMonth, 'LLLL yyyy', { locale: ru })}
          </h2>
          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Request Shift Button */}
        <Button
          variant="default"
          className="w-full bg-blue-600 hover:bg-blue-700"
          onClick={handleOpenAssignmentDialog}
        >
          <Plus className="h-4 w-4 mr-2" />
          Запросить смену
        </Button>

        {/* Employee Preferences */}
        {currentEmployee && (
          <EmployeePreferences
            employee={currentEmployee}
            onUpdate={(updated) => setCurrentEmployee(updated)}
          />
        )}

        {/* Next Shift Banner */}
        {(() => {
          const todayStr = format(new Date(), 'yyyy-MM-dd');
          const upcoming = localShifts
            .filter(s => s.date >= todayStr && s.employeeIds.includes(currentEmployeeId))
            .sort((a, b) => a.date.localeCompare(b.date));
          const next = upcoming[0];
          if (!next) return null;
          const isShiftToday = next.date === todayStr;
          return (
            <Card className={isShiftToday ? 'border-green-400 bg-green-50' : 'border-blue-200 bg-blue-50'}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  {next.shiftType === 'day' ? <Sun className="h-5 w-5 text-amber-500" /> : <Moon className="h-5 w-5 text-indigo-500" />}
                  <div>
                    <div className="text-sm font-medium">
                      {isShiftToday ? 'Сегодня на смене' : 'Ближайшая смена'}
                    </div>
                    <div className="text-sm text-gray-600">
                      {format(new Date(next.date + 'T00:00:00'), 'EEEE, d MMMM', { locale: ru })} — Бокс {next.boxNumber}, {next.shiftType === 'day' ? 'дневная' : 'ночная'} ({next.startTime}–{next.endTime})
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* My Shifts List */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Мои смены в {format(currentMonth, 'LLLL', { locale: ru })} ({myShifts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {myShifts.length > 0 ? (
              <div className="space-y-2">
                {myShifts.map(shift => {
                  const isPast = isBefore(new Date(shift.date), new Date()) && !isToday(new Date(shift.date + 'T00:00:00'));
                  const isShiftToday = isToday(new Date(shift.date + 'T00:00:00'));
                  const hasOutgoingRequest = outgoingRequests.some(r => r.requesterShiftId === shift.id);
                  const partner = getPartnerInShift(shift);
                  const canReleasePartner = !isPast && shift.employeeIds.length === 2 && !shift.releasedEmployeeId;
                  const isPartnerReleased = shift.releasedEmployeeId && shift.releasedEmployeeId !== currentEmployeeId;
                  const amIReleased = shift.releasedEmployeeId === currentEmployeeId;

                  return (
                    <div
                      key={shift.id}
                      className={`p-3 rounded-lg border ${isPast ? 'bg-gray-50 opacity-60' : isShiftToday ? 'bg-green-50 border-green-400 ring-1 ring-green-300' : amIReleased ? 'bg-yellow-50 border-yellow-300' : 'bg-white'}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <div className="font-medium">
                            {format(new Date(shift.date), 'EEEE, d MMMM', { locale: ru })}
                          </div>
                          <div className="text-sm text-gray-500 flex items-center gap-1">
                            {shift.shiftType === 'day' ? (
                              <Sun className="h-4 w-4 text-amber-500" />
                            ) : (
                              <Moon className="h-4 w-4 text-indigo-500" />
                            )}
                            <span>
                              Бокс {shift.boxNumber} • {shift.shiftType === 'day' ? 'Дневная' : 'Ночная'} ({shift.startTime} - {shift.endTime})
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {!isPast && !hasOutgoingRequest && canSwap && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenSwapDialog(shift)}
                            >
                              <ArrowRightLeft className="h-4 w-4 mr-1" />
                              Обмен
                            </Button>
                          )}
                          {hasOutgoingRequest && (
                            <Badge variant="secondary">Заявка отправлена</Badge>
                          )}
                        </div>
                      </div>

                      {/* Partner info and release button */}
                      {partner && (
                        <div className="flex items-center justify-between text-sm bg-gray-50 rounded p-2">
                          <div className="text-gray-600">
                            Напарник: <span className="font-medium">{partner.fullName}</span>
                            {isPartnerReleased && <Badge variant="outline" className="ml-2 text-green-600">Отпущен</Badge>}
                          </div>
                          {canReleasePartner && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                              onClick={() => handleOpenReleaseDialog(shift)}
                            >
                              <UserMinus className="h-4 w-4 mr-1" />
                              Отпустить
                            </Button>
                          )}
                        </div>
                      )}

                      {amIReleased && (
                        <div className="mt-2 text-sm text-yellow-700 bg-yellow-100 rounded p-2">
                          Вы отпущены с этой смены напарником
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center text-gray-500 py-4">
                Нет смен в этом месяце
              </p>
            )}
          </CardContent>
        </Card>

        {/* Outgoing Requests */}
        {outgoingRequests.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Мои заявки на обмен</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {outgoingRequests.map(req => {
                const shift = getShiftById(req.requesterShiftId);
                return (
                  <div key={req.id} className="p-3 bg-gray-50 rounded-lg text-sm">
                    <Badge variant="outline" className="mb-1">Ожидает</Badge>
                    <div className="mb-1">
                      {req.type === 'giveaway' ? 'Передача' : 'Обмен'} смены → {getEmployeeName(req.targetEmployeeId || '')}
                    </div>
                    {shift && (
                      <div className="flex items-center gap-1 text-gray-600">
                        {shift.shiftType === 'day' ? (
                          <Sun className="h-3 w-3 text-amber-500" />
                        ) : (
                          <Moon className="h-3 w-3 text-indigo-500" />
                        )}
                        <span>{format(new Date(shift.date), 'd MMM', { locale: ru })} • Бокс {shift.boxNumber} • {shift.shiftType === 'day' ? 'Дневная' : 'Ночная'}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Assignment Requests */}
        {myAssignmentRequests.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Запросы на смены</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {myAssignmentRequests.map(req => (
                <div key={req.id} className="p-3 bg-white rounded-lg border text-sm">
                  <div className="flex items-center justify-between mb-2">
                    <Badge
                      variant={req.status === 'pending' ? 'outline' : req.status === 'accepted' ? 'default' : 'destructive'}
                      className={req.status === 'accepted' ? 'bg-green-500' : ''}
                    >
                      {req.status === 'pending' ? 'Ожидает' : req.status === 'accepted' ? 'Одобрено' : 'Отклонено'}
                    </Badge>
                    {req.status === 'pending' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancelAssignmentRequest(req.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        Отменить
                      </Button>
                    )}
                  </div>
                  <div className="text-gray-700">
                    <strong>{format(new Date(req.date), 'd MMMM yyyy (EEEE)', { locale: ru })}</strong>
                  </div>
                  <div className="text-gray-600 mt-1">
                    Бокс {req.boxNumber} • {req.shiftType === 'day' ? 'Дневная (08:00-20:00)' : 'Ночная (20:00-08:00)'}
                  </div>
                  {req.comment && (
                    <div className="text-gray-500 text-xs mt-1 italic">
                      {req.comment}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Swap Dialog */}
      <Dialog open={isSwapDialogOpen} onOpenChange={setIsSwapDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Обмен или передача смены</DialogTitle>
          </DialogHeader>

          {selectedShift && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-sm text-gray-600">Ваша смена:</p>
                <p className="font-medium">
                  {format(new Date(selectedShift.date), 'EEEE, d MMMM', { locale: ru })}
                </p>
                <p className="text-sm text-gray-500">Бокс {selectedShift.boxNumber}</p>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Тип заявки:</p>
                <div className="flex gap-2">
                  <Button
                    variant={swapType === 'giveaway' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSwapType('giveaway')}
                    className="flex-1"
                  >
                    <Gift className="h-4 w-4 mr-1" />
                    Передать
                  </Button>
                  <Button
                    variant={swapType === 'swap' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSwapType('swap')}
                    className="flex-1"
                  >
                    <ArrowRightLeft className="h-4 w-4 mr-1" />
                    Обменяться
                  </Button>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Выберите сотрудника:</p>
                <Select value={targetEmployeeId} onValueChange={val => {
                  setTargetEmployeeId(val);
                  setTargetShiftId('');
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите сотрудника" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.filter(e => e.id !== currentEmployeeId).map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {swapType === 'swap' && targetEmployeeId && (
                <div>
                  <p className="text-sm font-medium mb-2">Выберите смену для обмена:</p>
                  <Select value={targetShiftId} onValueChange={setTargetShiftId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите смену" />
                    </SelectTrigger>
                    <SelectContent>
                      {getOtherEmployeeShifts(targetEmployeeId).map(shift => (
                        <SelectItem key={shift.id} value={shift.id}>
                          {format(new Date(shift.date), 'd MMMM', { locale: ru })} - Бокс {shift.boxNumber} - {shift.shiftType === 'day' ? 'Дневная' : 'Ночная'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSwapDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleCreateRequest}>
              Отправить заявку
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Release Partner Dialog */}
      <Dialog open={isReleaseDialogOpen} onOpenChange={setIsReleaseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отпустить напарника</DialogTitle>
          </DialogHeader>

          {shiftToRelease && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-sm text-gray-600">Смена:</p>
                <p className="font-medium">
                  {format(new Date(shiftToRelease.date), 'EEEE, d MMMM', { locale: ru })}
                </p>
                <p className="text-sm text-gray-500">
                  Бокс {shiftToRelease.boxNumber} • {shiftToRelease.startTime} - {shiftToRelease.endTime}
                </p>
              </div>

              {(() => {
                const partner = getPartnerInShift(shiftToRelease);
                if (!partner) return null;
                return (
                  <div className="bg-orange-50 p-3 rounded-lg border border-orange-200">
                    <p className="text-sm text-orange-700 mb-2">
                      Вы собираетесь отпустить напарника:
                    </p>
                    <p className="font-medium text-orange-800">{partner.fullName}</p>
                    <p className="text-sm text-orange-600 mt-2">
                      После этого вы будете работать на смене один. Напарник увидит, что отпущен.
                    </p>
                  </div>
                );
              })()}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReleaseDialogOpen(false)}>
              Отмена
            </Button>
            <Button
              variant="default"
              className="bg-orange-600 hover:bg-orange-700"
              onClick={() => {
                const partner = shiftToRelease && getPartnerInShift(shiftToRelease);
                if (partner) {
                  handleReleasePartner(partner.id);
                }
              }}
            >
              <UserMinus className="h-4 w-4 mr-1" />
              Отпустить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assignment Request Dialog */}
      <Dialog open={isAssignmentDialogOpen} onOpenChange={setIsAssignmentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Запросить смену</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">Дата смены:</p>
              <input
                type="date"
                value={requestDate}
                onChange={(e) => setRequestDate(e.target.value)}
                min={format(new Date(), 'yyyy-MM-dd')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Тип смены:</p>
              <Select value={requestShiftType} onValueChange={(val: 'day' | 'night') => setRequestShiftType(val)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Дневная (08:00-20:00)</SelectItem>
                  <SelectItem value="night">Ночная (20:00-08:00)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Бокс:</p>
              <Select value={String(requestBoxNumber)} onValueChange={(val) => setRequestBoxNumber(Number(val) as 1 | 2)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Бокс 1</SelectItem>
                  <SelectItem value="2">Бокс 2</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Комментарий (необязательно):</p>
              <textarea
                value={requestComment}
                onChange={(e) => setRequestComment(e.target.value)}
                placeholder="Укажите причину или дополнительную информацию..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
              Запрос будет отправлен менеджеру для одобрения. Вы получите уведомление о решении.
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAssignmentDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleCreateAssignmentRequest}>
              <Plus className="h-4 w-4 mr-1" />
              Отправить запрос
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
