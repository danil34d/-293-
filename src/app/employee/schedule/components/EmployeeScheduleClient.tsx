"use client";

import { useEffect, useMemo, useState } from 'react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isToday, isBefore, addDays, subDays, isSameDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  ChevronLeft, ChevronRight as LucideChevronRight, Sun, Moon, CheckCircle2, Plus, Repeat2, UserMinus,
  PlayCircle, Clock, Users, Send, X, Check, Sparkles, SlidersHorizontal,
} from 'lucide-react';
import type { Shift, Employee, ShiftSwapRequest, ShiftAssignmentRequest } from '@/types';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { MobileSheet, MobileSheetClose } from '@/components/employee/sheets/MobileSheet';
import { EmployeeAvatar } from '@/components/employee/EmployeeAvatar';
import { DEFAULT_WASH_ID } from '@/lib/wash';

interface Props {
  shifts: Shift[];
  employees: Employee[];
  swapRequests: ShiftSwapRequest[];
  assignmentRequests: ShiftAssignmentRequest[];
  currentEmployeeId: string;
  currentEmployee: Employee | null;
}

type DayCardKind = 'past' | 'today-active' | 'today-empty' | 'future-shift' | 'future-empty';

// Активна ли смена прямо сейчас
function isShiftActive(shift: Shift, now: Date): boolean {
  const todayStr = format(now, 'yyyy-MM-dd');
  const yesterdayStr = format(subDays(now, 1), 'yyyy-MM-dd');
  const hour = now.getHours();
  if (shift.shiftType === 'day' && shift.date === todayStr && hour >= 8 && hour < 20) return true;
  if (shift.shiftType === 'night') {
    if (shift.date === todayStr && hour >= 20) return true;
    if (shift.date === yesterdayStr && hour < 8) return true;
  }
  return false;
}

function timeLeft(endTime: string, now: Date): string {
  const [hh, mm] = endTime.split(':').map(Number);
  const target = new Date(now);
  target.setHours(hh, mm, 0, 0);
  if (target < now) target.setDate(target.getDate() + 1);
  const min = Math.max(0, Math.round((target.getTime() - now.getTime()) / 60000));
  return `${Math.floor(min / 60)}ч ${min % 60}м`;
}

export function EmployeeScheduleClient({
  shifts: initialShifts, employees, swapRequests, assignmentRequests, currentEmployeeId, currentEmployee,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [now] = useState(() => new Date());
  const [weekOffset, setWeekOffset] = useState(0);
  const [shifts, setShifts] = useState<Shift[]>(initialShifts);

  useEffect(() => setShifts(initialShifts), [initialShifts]);

  const canSwap = currentEmployee?.canSwapShifts !== false;

  // Текущая неделя (с учётом offset)
  const weekStart = useMemo(() => startOfWeek(addDays(now, weekOffset * 7), { weekStartsOn: 1 }), [now, weekOffset]);
  const weekEnd = useMemo(() => endOfWeek(weekStart, { weekStartsOn: 1 }), [weekStart]);
  const weekDays = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), [weekStart, weekEnd]);
  const monthLabel = format(weekStart, 'LLLL yyyy', { locale: ru });

  const incomingRequests = swapRequests.filter(r => r.status === 'pending' && r.targetEmployeeId === currentEmployeeId);
  const outgoingRequests = swapRequests.filter(r => r.status === 'pending' && r.requesterId === currentEmployeeId);
  const myAssignmentRequests = assignmentRequests.filter(r => r.employeeId === currentEmployeeId);

  // Sheets state
  const [sheetActions, setSheetActions] = useState<{ shift: Shift; kind: 'past' | 'today' | 'future' } | null>(null);
  const [sheetRequest, setSheetRequest] = useState<{ presetDate?: string } | null>(null);
  const [sheetSwap, setSheetSwap] = useState<{ shift: Shift } | null>(null);
  const [sheetRelease, setSheetRelease] = useState<{ shift: Shift } | null>(null);
  const [sheetPrefs, setSheetPrefs] = useState(false);

  // ─── Handlers ───
  const submitAssignmentRequest = async (data: { date: string; shiftType: 'day' | 'night'; boxNumber: 1 | 2; comment?: string }) => {
    if (!data.date) { toast({ title: 'Выберите дату', variant: 'destructive' }); return false; }
    if (isBefore(new Date(data.date), now) && !isSameDay(new Date(data.date), now)) {
      toast({ title: 'Дата уже прошла', variant: 'destructive' }); return false;
    }
    try {
      const res = await fetch('/api/shift-assignment-requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: `assignment_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          washId: DEFAULT_WASH_ID, createdAt: new Date().toISOString(),
          employeeId: currentEmployeeId, date: data.date, shiftType: data.shiftType,
          boxNumber: data.boxNumber, status: 'pending', comment: data.comment || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      toast({ title: '✓ Запрос отправлен админу' });
      router.refresh();
      return true;
    } catch {
      toast({ title: 'Ошибка отправки', variant: 'destructive' }); return false;
    }
  };

  const respondToRequest = async (requestId: string, accept: boolean) => {
    try {
      const res = await fetch(`/api/shift-swap-requests/${requestId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: accept ? 'accepted' : 'rejected' }),
      });
      if (!res.ok) throw new Error();
      toast({ title: accept ? '✓ Принято' : 'Отклонено' });
      router.refresh();
    } catch {
      toast({ title: 'Ошибка', variant: 'destructive' });
    }
  };

  const cancelAssignment = async (requestId: string) => {
    try {
      const res = await fetch(`/api/shift-assignment-requests/${requestId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      if (!res.ok) throw new Error();
      toast({ title: 'Запрос отменён' });
      router.refresh();
    } catch {
      toast({ title: 'Ошибка', variant: 'destructive' });
    }
  };

  const submitSwap = async (data: { mySift: Shift; targetEmployeeId: string; targetShiftId?: string }) => {
    if (!data.targetEmployeeId) { toast({ title: 'Выберите коллегу', variant: 'destructive' }); return false; }
    try {
      const res = await fetch('/api/shift-swap-requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: `swap_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          type: data.targetShiftId ? 'swap' : 'giveaway',
          createdAt: new Date().toISOString(),
          requesterId: currentEmployeeId,
          requesterShiftId: data.mySift.id,
          targetEmployeeId: data.targetEmployeeId,
          targetShiftId: data.targetShiftId,
          status: 'pending',
        }),
      });
      if (!res.ok) throw new Error();
      toast({ title: '✓ Запрос отправлен' });
      router.refresh();
      return true;
    } catch {
      toast({ title: 'Ошибка', variant: 'destructive' }); return false;
    }
  };

  const releasePartner = async (shift: Shift, partnerId: string) => {
    try {
      const res = await fetch(`/api/shifts/${shift.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...shift, releasedEmployeeId: partnerId }),
      });
      if (!res.ok) throw new Error();
      setShifts(prev => prev.map(s => s.id === shift.id ? { ...s, releasedEmployeeId: partnerId } : s));
      toast({ title: '✓ Напарник отпущен' });
      router.refresh();
    } catch {
      toast({ title: 'Ошибка', variant: 'destructive' });
    }
  };

  // ─── Helpers ───
  const findShiftForDay = (day: Date): Shift | undefined =>
    shifts.find(s => s.date === format(day, 'yyyy-MM-dd') && s.employeeIds.includes(currentEmployeeId));

  const employeeName = (id: string) => employees.find(e => e.id === id)?.fullName || 'Неизвестно';
  const partnerOf = (shift: Shift): Employee | undefined => {
    const pid = shift.employeeIds.find(id => id !== currentEmployeeId);
    return pid ? employees.find(e => e.id === pid) : undefined;
  };

  const colleagues = employees.filter(e => e.id !== currentEmployeeId && e.role === 'employee');

  return (
    <div className="max-w-2xl mx-auto space-y-3 px-1 pb-4">
      {/* Заголовок + Настройки */}
      <section className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Мой график</h1>
          <p className="text-xs text-gray-500 capitalize">
            {monthLabel} · {shifts.filter(s => s.employeeIds.includes(currentEmployeeId) && s.date.slice(0, 7) === format(weekStart, 'yyyy-MM')).length} смен
          </p>
        </div>
        <button
          onClick={() => setSheetPrefs(true)}
          className="flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition active:scale-95"
        >
          <SlidersHorizontal className="h-3 w-3" />
          <span>Настройки</span>
        </button>
      </section>

      {/* Навигация по неделям */}
      <section className="flex items-center justify-between rounded-2xl bg-white p-2 shadow-sm ring-1 ring-gray-100">
        <button
          onClick={() => setWeekOffset(o => o - 1)}
          aria-label="Предыдущая неделя"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition active:scale-95"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex flex-col items-center">
          <div className="text-sm font-bold text-gray-900">
            {format(weekStart, 'd MMM', { locale: ru })} — {format(weekEnd, 'd MMM', { locale: ru })}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500">{monthLabel}</div>
        </div>
        <button
          onClick={() => setWeekOffset(o => o + 1)}
          aria-label="Следующая неделя"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition active:scale-95"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </section>

      {/* Hero — сегодняшняя смена (если есть и активна) */}
      {(() => {
        const todayShift = shifts.find(s => s.date === format(now, 'yyyy-MM-dd') && s.employeeIds.includes(currentEmployeeId));
        if (!todayShift || !isShiftActive(todayShift, now)) return null;
        const left = timeLeft(todayShift.endTime, now);
        const partner = partnerOf(todayShift);
        const heroGradient = todayShift.shiftType === 'night' ? 'from-indigo-600 via-purple-700 to-purple-900' : 'from-blue-500 via-blue-600 to-indigo-700';
        return (
          <button
            onClick={() => setSheetActions({ shift: todayShift, kind: 'today' })}
            className={`relative w-full overflow-hidden rounded-3xl px-5 py-4 text-left text-white shadow-xl shadow-blue-500/30 bg-gradient-to-br ${heroGradient}`}
          >
            <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute right-4 bottom-2 opacity-20">
              {todayShift.shiftType === 'day' ? <Sun className="h-20 w-20 text-white" strokeWidth={1.2} /> : <Moon className="h-20 w-20 text-white" strokeWidth={1.2} />}
            </div>
            <div className="relative">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/80">
                  <PlayCircle className="h-3.5 w-3.5" />
                  <span>Сегодня · {format(now, 'EEEE d MMM', { locale: ru })}</span>
                </div>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase text-white">LIVE</span>
              </div>
              <div className="mt-1 text-xl font-extrabold drop-shadow-sm">
                {todayShift.shiftType === 'day' ? 'Дневная' : 'Ночная'} · Бокс {todayShift.boxNumber}
              </div>
              <div className="mt-2 flex items-center gap-3 text-sm text-white/90">
                <div className="flex items-center gap-1.5"><Clock className="h-4 w-4" /><span>{todayShift.startTime} → {todayShift.endTime}</span></div>
                {partner && (
                  <>
                    <div className="text-white/40">·</div>
                    <div className="flex items-center gap-1.5"><Users className="h-4 w-4" /><span>{partner.fullName.split(' ')[1] || partner.fullName}</span></div>
                  </>
                )}
              </div>
              <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 backdrop-blur-md">
                <Clock className="h-3 w-3 text-white" />
                <span className="text-xs font-bold">Осталось {left} · тап для действий</span>
              </div>
            </div>
          </button>
        );
      })()}

      {/* Лента дней недели */}
      <section className="space-y-2">
        {weekDays.map(day => {
          const shift = findShiftForDay(day);
          const isPast = isBefore(day, now) && !isSameDay(day, now);
          const today = isSameDay(day, now);
          const dayLabel = format(day, 'EE', { locale: ru }).toUpperCase();
          const dateNum = format(day, 'd');
          const partner = shift ? partnerOf(shift) : undefined;

          if (!shift) {
            // Empty day
            return (
              <div
                key={day.toISOString()}
                className={`rounded-2xl p-3 ${today ? 'border-2 border-blue-300 bg-blue-50/50' : 'border-2 border-dashed border-gray-300 bg-white/50 opacity-90'}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 flex-col items-center justify-center rounded-xl ${today ? 'bg-blue-100 text-blue-700' : 'bg-gray-50 text-gray-500'}`}>
                      <span className="text-[9px] font-bold uppercase">{dayLabel}</span>
                      <span className="text-sm font-bold">{dateNum}</span>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-gray-600">{today ? 'Сегодня · выходной' : 'Выходной'}</div>
                      <div className="text-[11px] text-gray-400">{isPast ? 'Не было смены' : 'Можно взять смену'}</div>
                    </div>
                  </div>
                  {!isPast && (
                    <button
                      onClick={() => setSheetRequest({ presetDate: format(day, 'yyyy-MM-dd') })}
                      className="flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1.5 text-[11px] font-bold text-blue-700 hover:bg-blue-200 transition active:scale-95"
                    >
                      <Plus className="h-3 w-3" /><span>Запросить</span>
                    </button>
                  )}
                </div>
              </div>
            );
          }

          // С сменой
          const cardKind = today ? (isShiftActive(shift, now) ? 'today-active' : 'today-empty') : (isPast ? 'past' : 'future-shift');
          const isLive = isShiftActive(shift, now);
          return (
            <button
              key={day.toISOString()}
              onClick={() => setSheetActions({ shift, kind: isPast ? 'past' : (today ? 'today' : 'future') })}
              className={[
                'block w-full rounded-2xl p-3 text-left shadow-sm transition active:scale-[0.99]',
                isPast ? 'bg-white opacity-70 ring-1 ring-gray-200 hover:opacity-100' : '',
                today ? 'bg-blue-50 ring-2 ring-blue-400 hover:bg-blue-100' : '',
                !today && !isPast ? 'bg-white ring-1 ring-gray-200 hover:ring-blue-300' : '',
              ].join(' ')}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 flex-col items-center justify-center rounded-xl ${today ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/30' : 'bg-gray-100 text-gray-700'}`}>
                    <span className="text-[9px] font-bold uppercase">{dayLabel}</span>
                    <span className="text-sm font-bold">{dateNum}</span>
                  </div>
                  <div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${shift.shiftType === 'day' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
                        {shift.shiftType === 'day' ? '☀ День' : '🌙 Ночь'}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${shift.boxNumber === 1 ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        Б{shift.boxNumber}
                      </span>
                      {isLive && (
                        <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white animate-pulse">LIVE</span>
                      )}
                    </div>
                    <div className={`mt-1 text-xs ${today ? 'font-medium text-gray-700' : 'text-gray-500'}`}>
                      {shift.startTime}–{shift.endTime}
                      {partner && <> · {partner.fullName.split(' ')[1] || partner.fullName} {partner.fullName.split(' ')[0]?.[0]}.</>}
                    </div>
                  </div>
                </div>
                {isPast ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <ChevronRight className="h-5 w-5 text-gray-400" />}
              </div>
            </button>
          );
        })}
      </section>

      {/* Запросы и обмены — фиолетовая плашка */}
      {(incomingRequests.length > 0 || outgoingRequests.length > 0 || myAssignmentRequests.filter(r => r.status === 'pending').length > 0) && (
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-violet-50 via-purple-50 to-fuchsia-50 p-4 shadow-sm ring-1 ring-violet-200/50">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-md shadow-violet-500/30">
              <Repeat2 className="h-4 w-4 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <div className="text-sm font-bold text-violet-900">Запросы и обмены</div>
              <div className="text-[11px] text-violet-700/70">
                {incomingRequests.length} входящих · {outgoingRequests.length + myAssignmentRequests.filter(r => r.status === 'pending').length} отправленных
              </div>
            </div>
          </div>

          {/* Входящие */}
          {incomingRequests.map(req => (
            <div key={req.id} className="mb-2 rounded-2xl bg-white p-3 ring-1 ring-violet-200">
              <div className="flex items-start gap-2">
                <EmployeeAvatar seed={req.requesterId} fullName={employeeName(req.requesterId)} size="xs" />
                <div className="flex-1">
                  <div className="text-xs font-bold text-gray-900">{employeeName(req.requesterId)} {req.type === 'giveaway' ? 'передаёт смену' : 'хочет поменяться'}</div>
                  <div className="text-[11px] text-gray-600">{req.type === 'giveaway' ? 'Берёшь его смену себе' : 'Обмен сменами'}</div>
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => respondToRequest(req.id, true)}
                  className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-white shadow-md shadow-emerald-500/30 hover:bg-emerald-600 active:scale-[0.99] transition"
                ><Check className="h-3.5 w-3.5" /><span>Принять</span></button>
                <button
                  onClick={() => respondToRequest(req.id, false)}
                  className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-gray-100 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-200 active:scale-[0.99] transition"
                ><X className="h-3.5 w-3.5" /><span>Отклонить</span></button>
              </div>
            </div>
          ))}

          {/* Отправленные assignment */}
          {myAssignmentRequests.filter(r => r.status === 'pending').map(req => (
            <div key={req.id} className="mb-2 rounded-2xl bg-white p-3 ring-1 ring-violet-200">
              <div className="flex items-start gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-orange-100">
                  <Clock className="h-3.5 w-3.5 text-orange-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <div className="text-xs font-bold text-gray-900">Запрос на {format(new Date(req.date), 'd MMM', { locale: ru })}</div>
                    <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[9px] font-bold uppercase text-orange-700">Ожидает</span>
                  </div>
                  <div className="text-[11px] text-gray-600">{req.shiftType === 'day' ? '☀ День' : '🌙 Ночь'} · Бокс {req.boxNumber}</div>
                </div>
              </div>
              <button
                onClick={() => cancelAssignment(req.id)}
                className="mt-2 w-full rounded-xl bg-rose-50 px-3 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100 active:scale-[0.99] transition"
              >Отменить запрос</button>
            </div>
          ))}
        </section>
      )}

      {/* Большая CTA Запросить смену */}
      {canSwap && (
        <button
          onClick={() => setSheetRequest({})}
          className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700 px-5 py-4 text-white shadow-lg shadow-blue-500/30 hover:shadow-xl active:scale-[0.99] transition"
        >
          <Plus className="h-5 w-5" />
          <span className="font-bold">Запросить дополнительную смену</span>
        </button>
      )}

      {/* ─── Sheets ─── */}
      {sheetActions && (
        <ShiftActionsSheet
          shift={sheetActions.shift}
          kind={sheetActions.kind}
          partner={partnerOf(sheetActions.shift)}
          canSwap={canSwap}
          onClose={() => setSheetActions(null)}
          onSwap={() => { const s = sheetActions.shift; setSheetActions(null); setTimeout(() => setSheetSwap({ shift: s }), 100); }}
          onRelease={() => { const s = sheetActions.shift; setSheetActions(null); setTimeout(() => setSheetRelease({ shift: s }), 100); }}
        />
      )}
      {sheetRequest && (
        <RequestShiftSheet
          presetDate={sheetRequest.presetDate}
          onClose={() => setSheetRequest(null)}
          onSubmit={async (data) => { const ok = await submitAssignmentRequest(data); if (ok) setSheetRequest(null); }}
        />
      )}
      {sheetSwap && (
        <SwapShiftSheet
          shift={sheetSwap.shift}
          colleagues={colleagues}
          allShifts={shifts}
          onClose={() => setSheetSwap(null)}
          onSubmit={async (data) => { const ok = await submitSwap({ mySift: sheetSwap.shift, ...data }); if (ok) setSheetSwap(null); }}
        />
      )}
      {sheetRelease && (
        <ReleasePartnerSheet
          shift={sheetRelease.shift}
          partner={partnerOf(sheetRelease.shift)}
          onClose={() => setSheetRelease(null)}
          onConfirm={async (pid) => { await releasePartner(sheetRelease.shift, pid); setSheetRelease(null); }}
        />
      )}
      {sheetPrefs && (
        <PreferencesSheet
          employee={currentEmployee}
          onClose={() => setSheetPrefs(false)}
          onSave={async (target) => {
            try {
              await fetch('/api/employee/preferences', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetShiftsPerMonth: target }),
              });
              toast({ title: '✓ Сохранено' });
              setSheetPrefs(false);
              router.refresh();
            } catch {
              toast({ title: 'Ошибка', variant: 'destructive' });
            }
          }}
        />
      )}
    </div>
  );
}

const ChevronRight = LucideChevronRight;

// ─── Sheets ───────────────────────────────────────────────────

function ShiftActionsSheet({ shift, kind, partner, canSwap, onClose, onSwap, onRelease }: {
  shift: Shift; kind: 'past' | 'today' | 'future'; partner?: Employee; canSwap: boolean;
  onClose: () => void; onSwap: () => void; onRelease: () => void;
}) {
  const dateLabel = format(new Date(shift.date), 'EEEE d MMMM', { locale: ru });
  const title = kind === 'past' ? 'Прошедшая смена' : kind === 'today' ? 'Сегодня' : 'Будущая смена';
  return (
    <MobileSheet open onOpenChange={(o) => !o && onClose()} title={title} description={dateLabel}>
      <div className="mb-3 rounded-2xl bg-blue-50 p-3 ring-1 ring-blue-200">
        <div className="flex items-center gap-3 text-sm">
          {shift.shiftType === 'day' ? <Sun className="h-4 w-4 text-amber-600" /> : <Moon className="h-4 w-4 text-indigo-600" />}
          <span className="font-bold">{shift.shiftType === 'day' ? 'Дневная' : 'Ночная'} · Бокс {shift.boxNumber}</span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-sm text-gray-700">
          <Clock className="h-4 w-4 text-gray-500" /><span>{shift.startTime} → {shift.endTime}</span>
        </div>
        {partner && (
          <div className="mt-1 flex items-center gap-2 text-sm text-gray-700">
            <Users className="h-4 w-4 text-gray-500" /><span>с {partner.fullName}</span>
          </div>
        )}
      </div>
      {kind === 'today' && (
        <div className="space-y-2">
          <a
            href="/employee/workstation"
            className="flex w-full items-center justify-between rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 p-3 text-white shadow-lg shadow-blue-500/30"
          >
            <div className="flex items-center gap-2"><PlayCircle className="h-5 w-5" /><span className="font-bold">Открыть Заказы</span></div>
          </a>
          {canSwap && (
            <button onClick={onSwap} className="flex w-full items-center justify-between rounded-xl bg-white p-3 ring-1 ring-gray-200 hover:bg-gray-50 active:scale-[0.99]">
              <div className="flex items-center gap-2"><Repeat2 className="h-5 w-5 text-violet-600" /><span className="text-sm font-semibold">Поменяться с коллегой</span></div>
            </button>
          )}
          {partner && (
            <button onClick={onRelease} className="flex w-full items-center justify-between rounded-xl bg-white p-3 ring-1 ring-gray-200 hover:bg-gray-50 active:scale-[0.99]">
              <div className="flex items-center gap-2"><UserMinus className="h-5 w-5 text-amber-600" /><span className="text-sm font-semibold">Отпустить напарника</span></div>
            </button>
          )}
        </div>
      )}
      {kind === 'future' && canSwap && (
        <div className="space-y-2">
          <button onClick={onSwap} className="flex w-full items-center justify-between rounded-xl bg-white p-3 ring-1 ring-gray-200 hover:bg-gray-50 active:scale-[0.99]">
            <div className="flex items-center gap-2"><Repeat2 className="h-5 w-5 text-violet-600" /><span className="text-sm font-semibold">Поменяться с коллегой</span></div>
          </button>
        </div>
      )}
      {kind === 'past' && (
        <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
          <div className="flex items-center gap-2 text-emerald-800">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-bold text-sm">Смена завершена</span>
          </div>
        </div>
      )}
    </MobileSheet>
  );
}

function RequestShiftSheet({ presetDate, onClose, onSubmit }: {
  presetDate?: string;
  onClose: () => void;
  onSubmit: (data: { date: string; shiftType: 'day' | 'night'; boxNumber: 1 | 2; comment?: string }) => Promise<void>;
}) {
  const [date, setDate] = useState(presetDate || format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [shiftType, setShiftType] = useState<'day' | 'night'>('day');
  const [boxNumber, setBoxNumber] = useState<1 | 2>(1);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  return (
    <MobileSheet open onOpenChange={(o) => !o && onClose()} title="Запросить смену">
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-500">Дата</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-500">Тип смены</label>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setShiftType('day')} className={`rounded-xl px-4 py-3 text-sm font-bold transition active:scale-[0.97] ${shiftType === 'day' ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-amber-500/30' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              <Sun className="inline h-4 w-4 align-middle mr-1" /> День 08–20
            </button>
            <button onClick={() => setShiftType('night')} className={`rounded-xl px-4 py-3 text-sm font-bold transition active:scale-[0.97] ${shiftType === 'night' ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/30' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              <Moon className="inline h-4 w-4 align-middle mr-1" /> Ночь 20–08
            </button>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-500">Бокс</label>
          <div className="grid grid-cols-2 gap-2">
            {[1, 2].map(n => (
              <button key={n} onClick={() => setBoxNumber(n as 1 | 2)} className={`rounded-xl px-4 py-3 text-sm font-bold transition active:scale-[0.97] ${boxNumber === n ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/30' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                Бокс {n}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-500">Комментарий (опц.)</label>
          <textarea rows={2} value={comment} onChange={e => setComment(e.target.value)} placeholder="Например: «нужны деньги на ремонт»" className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-200">
          Запрос отправится администратору. Если в графике есть свободное место — он подтвердит, и смена появится у тебя.
        </div>
        <button
          disabled={submitting}
          onClick={async () => { setSubmitting(true); await onSubmit({ date, shiftType, boxNumber, comment }); setSubmitting(false); }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 px-5 py-3.5 font-bold text-white shadow-lg shadow-blue-500/30 active:scale-[0.99] transition disabled:opacity-50"
        >
          <Send className="h-4 w-4" /><span>Отправить запрос</span>
        </button>
      </div>
    </MobileSheet>
  );
}

function SwapShiftSheet({ shift, colleagues, allShifts, onClose, onSubmit }: {
  shift: Shift;
  colleagues: Employee[];
  allShifts: Shift[];
  onClose: () => void;
  onSubmit: (data: { targetEmployeeId: string; targetShiftId?: string }) => Promise<void>;
}) {
  const [targetEmployeeId, setTargetEmployeeId] = useState('');
  const [targetShiftId, setTargetShiftId] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const targetEmployeeShifts = targetEmployeeId ? allShifts.filter(s => s.employeeIds.includes(targetEmployeeId) && new Date(s.date) >= new Date()) : [];

  return (
    <MobileSheet open onOpenChange={(o) => !o && onClose()} title="Поменяться сменами">
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-500">Моя смена</label>
          <div className="rounded-xl bg-blue-50 p-3 ring-2 ring-blue-300">
            <div className="flex items-center gap-2 text-sm font-bold text-blue-900">
              {shift.shiftType === 'day' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span>{format(new Date(shift.date), 'EEE d MMM', { locale: ru })} · {shift.shiftType === 'day' ? 'Дневная' : 'Ночная'} · Б{shift.boxNumber}</span>
            </div>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-500">Кому предложить</label>
          <div className="space-y-1.5">
            {colleagues.map(c => (
              <button
                key={c.id}
                onClick={() => { setTargetEmployeeId(c.id); setTargetShiftId(undefined); }}
                className={`flex w-full items-center gap-2 rounded-xl p-2.5 transition active:scale-[0.99] ${targetEmployeeId === c.id ? 'bg-blue-50 ring-2 ring-blue-300' : 'bg-white ring-1 ring-gray-200 hover:bg-gray-50'}`}
              >
                <EmployeeAvatar seed={c.id} fullName={c.fullName} size="xs" />
                <span className="text-sm font-semibold flex-1 text-left">{c.fullName}</span>
              </button>
            ))}
            {colleagues.length === 0 && (
              <p className="text-xs text-gray-500">Нет коллег для обмена</p>
            )}
          </div>
        </div>
        {targetEmployeeId && targetEmployeeShifts.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-500">Его смена для обмена (опц.)</label>
            <div className="grid grid-cols-2 gap-2">
              {targetEmployeeShifts.slice(0, 6).map(s => (
                <button
                  key={s.id}
                  onClick={() => setTargetShiftId(s.id === targetShiftId ? undefined : s.id)}
                  className={`rounded-xl p-2 text-xs font-semibold transition ${targetShiftId === s.id ? 'bg-violet-100 text-violet-800 ring-2 ring-violet-400' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  {format(new Date(s.date), 'd MMM', { locale: ru })} {s.shiftType === 'day' ? '☀' : '🌙'} Б{s.boxNumber}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-gray-500">Не выберешь — это просто отдача смены</p>
          </div>
        )}
        <button
          disabled={!targetEmployeeId || submitting}
          onClick={async () => { setSubmitting(true); await onSubmit({ targetEmployeeId, targetShiftId }); setSubmitting(false); }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 px-5 py-3.5 font-bold text-white shadow-lg shadow-violet-500/30 active:scale-[0.99] transition disabled:opacity-50"
        >
          <Send className="h-4 w-4" /><span>Отправить запрос</span>
        </button>
      </div>
    </MobileSheet>
  );
}

function ReleasePartnerSheet({ shift, partner, onClose, onConfirm }: {
  shift: Shift; partner?: Employee; onClose: () => void; onConfirm: (partnerId: string) => Promise<void>;
}) {
  if (!partner) {
    return (
      <MobileSheet open onOpenChange={(o) => !o && onClose()} title="Нет напарника">
        <p className="text-sm text-gray-600">На этой смене нет напарника для отпуска.</p>
      </MobileSheet>
    );
  }
  return (
    <MobileSheet open onOpenChange={(o) => !o && onClose()} title="Отпустить напарника">
      <div className="mb-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-200">
        Если отпустишь — он не идёт на смену. Ты работаешь один, касса делится только на тебя.
      </div>
      <button
        onClick={() => onConfirm(partner.id)}
        className="flex w-full items-center gap-2 rounded-xl bg-white p-3 ring-2 ring-amber-300 hover:bg-amber-50 active:scale-[0.99]"
      >
        <EmployeeAvatar seed={partner.id} fullName={partner.fullName} size="xs" />
        <span className="flex-1 text-left text-sm font-semibold">{partner.fullName}</span>
        <UserMinus className="h-4 w-4 text-amber-600" />
      </button>
    </MobileSheet>
  );
}

function PreferencesSheet({ employee, onClose, onSave }: {
  employee: Employee | null; onClose: () => void; onSave: (target: number) => Promise<void>;
}) {
  const [target, setTarget] = useState(((employee as any)?.preferences?.targetShiftsPerMonth) ?? 15);
  const [saving, setSaving] = useState(false);
  return (
    <MobileSheet open onOpenChange={(o) => !o && onClose()} title="Мои предпочтения">
      <p className="mb-3 text-xs text-gray-500">Эти настройки видит админ при составлении графика.</p>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-500">Цель: смен в месяц</label>
          <div className="flex items-center gap-3">
            <button onClick={() => setTarget(Math.max(1, target - 1))} className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-95 text-xl">−</button>
            <input type="number" value={target} onChange={e => setTarget(Math.max(1, Math.min(31, +e.target.value || 15)))} className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-center text-xl font-bold" />
            <button onClick={() => setTarget(Math.min(31, target + 1))} className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-95 text-xl">+</button>
          </div>
        </div>
        <button
          disabled={saving}
          onClick={async () => { setSaving(true); await onSave(target); setSaving(false); }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 px-5 py-3.5 font-bold text-white shadow-lg shadow-blue-500/30 active:scale-[0.99] disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" /><span>Сохранить</span>
        </button>
      </div>
    </MobileSheet>
  );
}
