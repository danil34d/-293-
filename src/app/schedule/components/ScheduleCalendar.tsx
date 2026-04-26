"use client";

import { useEffect, useMemo, useState } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, getDay, isToday as dateIsToday } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Phone, ArrowRightLeft, Check, X, Users, Sun, Moon, Download, Printer, UserPlus, Loader2, Search, CalendarDays, CheckSquare, Trash2, XCircle } from 'lucide-react';
import type { Shift, Employee, ShiftSwapRequest, ShiftAssignmentRequest, ShiftType, WashId } from '@/types';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';
import { normalizeWashId } from '@/lib/wash';

// --- Weather types ---
interface WeatherDay {
  date: string;
  tMin: number | null;
  tMax: number | null;
  icon: string;
  loadLevel: 'low' | 'normal' | 'high' | 'peak';
  hint: string;
  windHint: string | null;
}

const LOAD_BG: Record<string, string> = {
  low:    'bg-green-100',
  normal: 'bg-yellow-50',
  high:   'bg-orange-100',
  peak:   'bg-red-100',
};

const LOAD_HEADER_BG: Record<string, string> = {
  low:    'bg-green-800',
  normal: '',
  high:   'bg-orange-900',
  peak:   'bg-red-900',
};

interface ScheduleCalendarProps {
  initialShifts: Shift[];
  initialMonth?: string; // YYYY-MM
  initialWashId?: WashId;
  employees: Employee[];
  pendingRequests: ShiftSwapRequest[];
  assignmentRequests: ShiftAssignmentRequest[];
}

function parseMonthKey(month: string | undefined): Date | null {
  if (!month) return null;
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const dt = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function uniqEmployeeIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean)));
}

function isSameShiftSlot(
  a: Pick<Shift, 'date' | 'washId' | 'boxNumber' | 'shiftType'>,
  b: Pick<Shift, 'date' | 'washId' | 'boxNumber' | 'shiftType'>
): boolean {
  return (
    a.date === b.date &&
    normalizeWashId(a.washId) === normalizeWashId(b.washId) &&
    a.boxNumber === b.boxNumber &&
    a.shiftType === b.shiftType
  );
}

function mergeShiftInState(prev: Shift[], saved: Shift): Shift[] {
  const next: Shift[] = [];
  let inserted = false;

  for (const shift of prev) {
    if (isSameShiftSlot(shift, saved)) {
      if (!inserted) {
        next.push({
          ...shift,
          ...saved,
          employeeIds: uniqEmployeeIds([...(shift.employeeIds || []), ...(saved.employeeIds || [])]),
        });
        inserted = true;
      }
      continue;
    }
    next.push(shift);
  }

  if (!inserted) {
    next.push(saved);
  }

  return next;
}

export function ScheduleCalendar({ initialShifts, initialMonth, initialWashId, employees, pendingRequests, assignmentRequests }: ScheduleCalendarProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [currentMonth, setCurrentMonth] = useState<Date>(() => parseMonthKey(initialMonth) || new Date());
  const [selectedWashId, setSelectedWashId] = useState<WashId>(() => normalizeWashId(initialWashId));
  const [shifts, setShifts] = useState<Shift[]>(initialShifts);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedBox, setSelectedBox] = useState<1 | 2>(1);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [dialogEmployeeId, setDialogEmployeeId] = useState<string | null>(null);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [selectedShiftType, setSelectedShiftType] = useState<ShiftType>('day');
  const [isSwapRequestsDialogOpen, setIsSwapRequestsDialogOpen] = useState(false);
  const [swapRequests, setSwapRequests] = useState<ShiftSwapRequest[]>(pendingRequests);
  const [isAssignmentRequestsDialogOpen, setIsAssignmentRequestsDialogOpen] = useState(false);
  const [pendingAssignmentRequests, setPendingAssignmentRequests] = useState<ShiftAssignmentRequest[]>(
    assignmentRequests.filter((r) => r.status === 'pending' && normalizeWashId(r.washId) === normalizeWashId(initialWashId))
  );
  const [isSaving, setIsSaving] = useState(false);
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [weatherDays, setWeatherDays] = useState<WeatherDay[]>([]);

  // Multi-select mode
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [bulkShiftType, setBulkShiftType] = useState<ShiftType>('day');
  const [bulkBox, setBulkBox] = useState<1 | 2>(1);
  const [bulkEmployees, setBulkEmployees] = useState<string[]>([]);
  const [isBulkSaving, setIsBulkSaving] = useState(false);

  // Box filter for calendar display (separate from selectedBox which controls the dialog)
  const [calendarBoxFilter, setCalendarBoxFilter] = useState<1 | 2>(1);
  const selectedWashLabel = selectedWashId === 'wash_2' ? 'Мойка 2' : 'Мойка 1';

  // Fetch weather forecast for the current month
  useEffect(() => {
    const monthKey = format(currentMonth, 'yyyy-MM');
    let cancelled = false;
    fetch(`/api/weather/forecast?month=${monthKey}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data?.days) return;
        setWeatherDays(data.days.map((d: any) => ({
          date: d.date,
          tMin: d.tMin,
          tMax: d.tMax,
          icon: d.icon || '',
          loadLevel: d.loadLevel || 'normal',
          hint: d.hint || '',
          windHint: d.windHint || null,
        })));
      })
      .catch(() => { if (!cancelled) setWeatherDays([]); });
    return () => { cancelled = true; };
  }, [currentMonth]);

  // Helper: get weather for a date
  const getWeatherForDate = (dateStr: string): WeatherDay | undefined =>
    weatherDays.find(w => w.date === dateStr);

  // Keep client state in sync with refreshed server props (router.refresh()).
  useEffect(() => {
    setShifts(initialShifts);
  }, [initialShifts]);

  useEffect(() => {
    setSwapRequests(pendingRequests);
  }, [pendingRequests]);

  useEffect(() => {
    setPendingAssignmentRequests(
      assignmentRequests.filter((r) => r.status === 'pending' && normalizeWashId(r.washId) === selectedWashId)
    );
  }, [assignmentRequests, selectedWashId]);

  // Allow deep linking to a specific month via /schedule?month=YYYY-MM.
  useEffect(() => {
    const parsed = parseMonthKey(initialMonth);
    if (!parsed) return;
    setCurrentMonth(parsed);
  }, [initialMonth]);

  useEffect(() => {
    setSelectedWashId(normalizeWashId(initialWashId));
  }, [initialWashId]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Get shifts for the current month
  const monthShifts = useMemo(() => {
    const monthStr = format(currentMonth, 'yyyy-MM');
    return shifts.filter((s) => s.date.startsWith(monthStr) && normalizeWashId(s.washId) === selectedWashId);
  }, [shifts, currentMonth, selectedWashId]);

  // Get shifts for employee on specific date
  const getShiftsForEmployeeOnDate = (employeeId: string, date: string) => {
    return monthShifts.filter(s =>
      s.date === date && s.employeeIds.includes(employeeId)
    );
  };

  // Calculate stats for employee
  const getEmployeeStats = (employeeId: string) => {
    const empShifts = monthShifts.filter(s => s.employeeIds.includes(employeeId));
    const dayShifts = empShifts.filter(s => s.shiftType === 'day').length;
    const nightShifts = empShifts.filter(s => s.shiftType === 'night').length;
    const totalHours = dayShifts * 12 + nightShifts * 12;

    return {
      total: empShifts.length,
      day: dayShifts,
      night: nightShifts,
      hours: totalHours
    };
  };

  // Get employee names from IDs
  const getEmployeeNames = (ids: string[]) => {
    return ids.map(id => {
      const emp = employees.find(e => e.id === id);
      return emp ? emp.fullName.split(' ')[0] : 'Неизвестно';
    });
  };

  // Get employees not assigned on a specific date
  const getFreeEmployees = (date: string) => {
    const shiftsOnDate = shifts.filter((s) => s.date === date && normalizeWashId(s.washId) === selectedWashId);
    const assignedIds = shiftsOnDate.flatMap(s => s.employeeIds);
    return employees.filter(e => !assignedIds.includes(e.id));
  };

  const findPrimaryShiftInSlot = (date: string, boxNumber: 1 | 2, shiftType: ShiftType): Shift | undefined => {
    const slotShifts = shifts.filter((s) =>
      s.date === date &&
      s.boxNumber === boxNumber &&
      s.shiftType === shiftType &&
      normalizeWashId(s.washId) === selectedWashId
    );

    if (slotShifts.length === 0) return undefined;
    return slotShifts.reduce((best, current) =>
      current.employeeIds.length > best.employeeIds.length ? current : best
    );
  };

  const applyDialogSlotState = (date: string, boxNumber: 1 | 2, shiftType: ShiftType, fallbackEmployeeId?: string | null) => {
    const slotShift = findPrimaryShiftInSlot(date, boxNumber, shiftType);

    setSelectedBox(boxNumber);
    setSelectedShiftType(shiftType);

    if (slotShift) {
      setEditingShiftId(slotShift.id);
      setSelectedEmployees(uniqEmployeeIds(slotShift.employeeIds));
      return;
    }

    setEditingShiftId(null);
    setSelectedEmployees(fallbackEmployeeId ? [fallbackEmployeeId] : []);
  };

  const handleOpenDialog = (date: string, employeeId: string, existingShift?: Shift) => {
    // Reset dialog state to avoid stale data from previous interactions
    setSelectedEmployees([]);
    setEditingShiftId(null);
    setEmployeeFilter('');
    setSelectedDate(date);
    setDialogEmployeeId(employeeId);

    if (existingShift) {
      applyDialogSlotState(date, existingShift.boxNumber, existingShift.shiftType || 'day', employeeId);
    } else {
      const preferredBox = calendarBoxFilter;
      const preferredType = selectedShiftType;
      const slotShift = findPrimaryShiftInSlot(date, preferredBox, preferredType);

      if (slotShift) {
        applyDialogSlotState(date, preferredBox, preferredType, employeeId);
      } else {
        const alternateType: ShiftType = preferredType === 'day' ? 'night' : 'day';
        const alternateShift = findPrimaryShiftInSlot(date, preferredBox, alternateType);
        if (alternateShift) {
          applyDialogSlotState(date, preferredBox, alternateType, employeeId);
        } else {
          applyDialogSlotState(date, preferredBox, preferredType, employeeId);
        }
      }
    }

    setIsDialogOpen(true);
  };

  const handleDialogShiftTypeChange = (nextType: ShiftType) => {
    if (!selectedDate) {
      setSelectedShiftType(nextType);
      return;
    }
    const fallbackEmployeeId = dialogEmployeeId || selectedEmployees[0] || null;
    applyDialogSlotState(selectedDate, selectedBox, nextType, fallbackEmployeeId);
  };

  const handleDialogBoxChange = (nextBox: 1 | 2) => {
    if (!selectedDate) {
      setSelectedBox(nextBox);
      return;
    }
    const fallbackEmployeeId = dialogEmployeeId || selectedEmployees[0] || null;
    applyDialogSlotState(selectedDate, nextBox, selectedShiftType, fallbackEmployeeId);
  };

  const handleSaveShift = async () => {
    if (!selectedDate || selectedEmployees.length === 0) {
      toast({ title: 'Выберите хотя бы одного сотрудника', variant: 'destructive' });
      return;
    }

    const selectedEmployeeIds = uniqEmployeeIds(selectedEmployees);

    // Validation 1: Check if employee is already assigned to another box at the SAME wash
    const conflictingShifts = shifts.filter(s =>
      s.date === selectedDate &&
      s.shiftType === selectedShiftType &&
      normalizeWashId(s.washId) === selectedWashId &&
      s.id !== editingShiftId &&
      s.boxNumber !== selectedBox &&
      s.employeeIds.some(empId => selectedEmployeeIds.includes(empId))
    );

    if (conflictingShifts.length > 0) {
      const conflictEmp = employees.find(e =>
        conflictingShifts[0].employeeIds.some(id => selectedEmployeeIds.includes(id))
      );
      toast({
        title: 'Конфликт смен',
        description: `${conflictEmp?.fullName || 'Сотрудник'} уже назначен на ${selectedShiftType === 'day' ? 'дневную' : 'ночную'} смену в этот день (Бокс ${conflictingShifts[0].boxNumber})`,
        variant: 'destructive'
      });
      return;
    }

    // Validation 2: 1 бокс = 1 мойщик
    const existingShiftsInSlot = shifts.filter(s =>
      s.date === selectedDate &&
      s.boxNumber === selectedBox &&
      s.shiftType === selectedShiftType &&
      normalizeWashId(s.washId) === selectedWashId &&
      s.id !== editingShiftId
    );

    if (existingShiftsInSlot.length > 0) {
      const existingEmployeeIds = uniqEmployeeIds(existingShiftsInSlot.flatMap(s => s.employeeIds));
      const totalEmployees = uniqEmployeeIds([...existingEmployeeIds, ...selectedEmployeeIds]).length;
      if (totalEmployees > 2) {
        toast({
          title: 'Бокс переполнен',
          description: `На Бокс ${selectedBox} уже назначено ${existingEmployeeIds.length} чел. Максимум 2 сотрудника на один бокс`,
          variant: 'destructive'
        });
        return;
      }
    }

    const startTime = selectedShiftType === 'day' ? '08:00' : '20:00';
    const endTime = selectedShiftType === 'day' ? '20:00' : '08:00';

    setIsSaving(true);
    try {
      const shiftData: Shift = {
        id: editingShiftId || `shift_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        washId: selectedWashId,
        date: selectedDate,
        boxNumber: selectedBox,
        employeeIds: selectedEmployeeIds,
        shiftType: selectedShiftType,
        startTime,
        endTime
      };

      const method = editingShiftId ? 'PUT' : 'POST';
      const url = editingShiftId ? `/api/shifts/${editingShiftId}` : '/api/shifts';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shiftData)
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to save shift');
      }

      // Update local state
      const savedShift = payload?.shift as Shift | undefined;
      if (editingShiftId) {
        if (savedShift) {
          setShifts(prev => mergeShiftInState(prev, savedShift));
        } else {
          setShifts(prev => prev.map(s => s.id === editingShiftId ? shiftData : s));
        }
      } else {
        if (savedShift) {
          setShifts(prev => mergeShiftInState(prev, savedShift));
        } else {
          setShifts(prev => [...prev, shiftData]);
        }
      }

      const wasMergedIntoExisting = !editingShiftId && existingShiftsInSlot.length > 0;
      toast({
        title: editingShiftId
          ? 'Смена обновлена'
          : wasMergedIntoExisting
            ? 'Сотрудник добавлен в смену'
            : 'Смена создана'
      });
      setIsDialogOpen(false);
      setSelectedEmployees([]);
      setEditingShiftId(null);
      setDialogEmployeeId(null);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка сохранения смены';
      toast({ title: message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteShift = async () => {
    if (!editingShiftId) return;
    if (!confirm('Удалить эту смену? Это действие нельзя отменить.')) return;

    setIsSaving(true);
    try {
      const res = await fetch(`/api/shifts/${editingShiftId}`, { method: 'DELETE' });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'Failed to delete shift');

      const deletedIds = Array.isArray(payload?.deletedIds) ? payload.deletedIds : [editingShiftId];
      const deletedSet = new Set(deletedIds);
      setShifts(prev => prev.filter(s => !deletedSet.has(s.id)));
      toast({ title: 'Смена удалена' });
      setIsDialogOpen(false);
      setSelectedEmployees([]);
      setEditingShiftId(null);
      setDialogEmployeeId(null);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка удаления смены';
      toast({ title: message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleEmployee = (empId: string) => {
    setSelectedEmployees(prev => {
      if (prev.includes(empId)) {
        return prev.filter(id => id !== empId);
      } else if (prev.length < 2) {
        return [...prev, empId];
      }
      return prev;
    });
  };

  // Multi-select: toggle date
  const toggleDateSelection = (dateStr: string) => {
    setSelectedDates(prev => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
  };

  // Multi-select: bulk assign shifts
  const handleBulkAssign = async () => {
    if (selectedDates.size === 0 || bulkEmployees.length === 0) return;
    setIsBulkSaving(true);
    const startTime = bulkShiftType === 'day' ? '08:00' : '20:00';
    const endTime = bulkShiftType === 'day' ? '20:00' : '08:00';
    const bulkEmployeeIds = uniqEmployeeIds(bulkEmployees);
    let processed = 0;
    let failed = 0;

    for (const dateStr of Array.from(selectedDates).sort()) {
      const shiftData: Shift = {
        id: `shift_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${processed}`,
        washId: selectedWashId,
        date: dateStr,
        boxNumber: bulkBox,
        employeeIds: bulkEmployeeIds,
        shiftType: bulkShiftType,
        startTime,
        endTime,
      };

      try {
        const res = await fetch('/api/shifts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(shiftData),
        });
        const payload = await res.json().catch(() => null);
        if (res.ok) {
          const savedShift = payload?.shift as Shift | undefined;
          if (savedShift) {
            setShifts(prev => mergeShiftInState(prev, savedShift));
          } else {
            setShifts(prev => mergeShiftInState(prev, shiftData));
          }
          processed++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    setIsBulkSaving(false);
    setIsBulkDialogOpen(false);
    setSelectedDates(new Set());
    setMultiSelectMode(false);
    toast({
      title: `Обработано ${processed} дней`,
      description: failed > 0 ? `Ошибок: ${failed}` : undefined,
    });
    router.refresh();
  };

  // Multi-select: bulk delete shifts for selected dates
  const handleBulkDelete = async () => {
    if (selectedDates.size === 0) return;
    const datesArr = Array.from(selectedDates);
    const shiftsToDelete = monthShifts.filter((s) => datesArr.includes(s.date));
    if (shiftsToDelete.length === 0) {
      toast({ title: 'Нет смен для удаления в выбранных днях' });
      return;
    }
    if (!confirm(`Удалить ${shiftsToDelete.length} смен в ${datesArr.length} днях? Это нельзя отменить.`)) return;

    let deleted = 0;
    for (const s of shiftsToDelete) {
      try {
        const res = await fetch(`/api/shifts/${s.id}`, { method: 'DELETE' });
        if (res.ok) { deleted++; }
      } catch { /* ignore */ }
    }
    const deleteIds = new Set(shiftsToDelete.map((s) => s.id));
    setShifts(prev => prev.filter((s) => !deleteIds.has(s.id)));
    setSelectedDates(new Set());
    setMultiSelectMode(false);
    toast({ title: `Удалено ${deleted} смен` });
    router.refresh();
  };

  // Today's free employees for "call for help"
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayFreeEmployees = getFreeEmployees(todayStr);

  // Get shift by id
  const getShiftById = (id: string) => shifts.find(s => s.id === id);

  // Handle swap request approval/rejection by manager
  const handleManagerDecision = async (requestId: string, approved: boolean) => {
    try {
      const res = await fetch(`/api/shift-swap-requests/${requestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: approved ? 'accepted' : 'rejected',
          managerApproved: approved
        })
      });

      if (!res.ok) throw new Error('Failed to update request');

      setSwapRequests(prev => prev.filter(r => r.id !== requestId));
      toast({ title: approved ? 'Заявка одобрена' : 'Заявка отклонена' });
      router.refresh();
    } catch (error) {
      toast({ title: 'Ошибка обработки заявки', variant: 'destructive' });
    }
  };

  // Handle assignment request approval/rejection by manager
  const handleAssignmentDecision = async (requestId: string, approved: boolean) => {
    try {
      const res = await fetch(`/api/shift-assignment-requests/${requestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: approved ? 'accepted' : 'rejected'
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to update request');
      }

      setPendingAssignmentRequests(prev => prev.filter(r => r.id !== requestId));
      toast({ title: approved ? 'Смена назначена' : 'Запрос отклонён' });
      router.refresh();
    } catch (error: any) {
      toast({ title: error.message || 'Ошибка обработки запроса', variant: 'destructive' });
    }
  };

  // Export to Excel (filtered by current box)
  const handleExportToExcel = () => {
    try {
      const excelData: any[][] = [];

      const monthName = format(currentMonth, 'LLLL yyyy', { locale: ru });
      excelData.push([`График смен - ${monthName} - ${selectedWashLabel}`]);
      excelData.push([]);

      const headerRow = ['№', 'Сотрудник'];
      daysInMonth.forEach(day => headerRow.push(format(day, 'd')));
      headerRow.push('Смен', 'Дневных', 'Ночных', 'Часов');
      excelData.push(headerRow);

      const dayNamesRow = ['', ''];
      daysInMonth.forEach(day => dayNamesRow.push(format(day, 'EEE', { locale: ru })));
      dayNamesRow.push('', '', '', '');
      excelData.push(dayNamesRow);

      employees.forEach((employee, index) => {
        const boxShifts = monthShifts.filter(s => s.employeeIds.includes(employee.id) && s.boxNumber === calendarBoxFilter);
        const dayCount = boxShifts.filter(s => s.shiftType === 'day').length;
        const nightCount = boxShifts.filter(s => s.shiftType === 'night').length;
        const totalCount = boxShifts.length;
        const hours = totalCount * 12;
        const row: any[] = [index + 1, employee.fullName];

        daysInMonth.forEach(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const empShifts = monthShifts.filter(s =>
            s.date === dateStr && s.employeeIds.includes(employee.id) && s.boxNumber === calendarBoxFilter
          );
          if (empShifts.length > 0) {
            const labels = empShifts.map(s => `${s.boxNumber}${s.shiftType === 'day' ? 'Д' : 'Н'}`);
            row.push(labels.join(', '));
          } else {
            row.push('-');
          }
        });

        row.push(totalCount, dayCount, nightCount, hours);
        excelData.push(row);
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(excelData);

      const colWidths = [{ wch: 5 }, { wch: 25 }];
      daysInMonth.forEach(() => colWidths.push({ wch: 8 }));
      colWidths.push({ wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 8 });
      ws['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(wb, ws, 'График смен');

      const washFilePart = selectedWashLabel.replace(/\s+/g, '_');
      const filename = `График_смен_${washFilePart}_${format(currentMonth, 'yyyy_MM')}.xlsx`;
      XLSX.writeFile(wb, filename);

      toast({ title: 'Excel файл загружен' });
    } catch (error) {
      console.error('Export error:', error);
      toast({ title: 'Ошибка экспорта', variant: 'destructive' });
    }
  };

  // Print schedule - color
  const handlePrintColor = () => {
    window.print();
  };

  // Print schedule - black & white
  const handlePrintBW = () => {
    document.body.classList.add('bw-print');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('bw-print');
    }, 1000);
  };

  return (
    <div className="space-y-4">
      {/* Print-only title — visible only on paper */}
      <div className="print-only print-title">
        <div className="print-title-main">
          График — {format(currentMonth, 'LLLL yyyy', { locale: ru })}
        </div>
        <div className="print-title-sub">
          Мойка {selectedWashId === 'wash_1' ? '1' : '2'}, Бокс {calendarBoxFilter}
        </div>
      </div>

      {/* Header with navigation */}
      <div className="flex items-center justify-between print-hidden">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-xl font-medium min-w-[200px] text-center">
            {format(currentMonth, 'LLLL yyyy', { locale: ru })}
          </h2>
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date())} className="ml-2 text-xs">
            <CalendarDays className="h-3 w-3 mr-1" />
            Сегодня
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExportToExcel} className="print-hidden">
            <Download className="h-4 w-4 mr-2" />
            Скачать Excel
          </Button>
          <Button variant="outline" onClick={handlePrintColor} className="print-hidden">
            <Printer className="h-4 w-4 mr-2" />
            Печать цветная
          </Button>
          <Button variant="outline" onClick={handlePrintBW} className="print-hidden">
            ⬛ Печать ч/б
          </Button>
          {swapRequests.length > 0 && (
            <Button
              variant="outline"
              className="border-orange-300 text-orange-700 hover:bg-orange-50 print-hidden"
              onClick={() => setIsSwapRequestsDialogOpen(true)}
            >
              <ArrowRightLeft className="h-4 w-4 mr-2" />
              Заявки на обмен
              <Badge variant="destructive" className="ml-2">
                {swapRequests.length}
              </Badge>
            </Button>
          )}
          {pendingAssignmentRequests.length > 0 && (
            <Button
              variant="outline"
              className="border-blue-300 text-blue-700 hover:bg-blue-50 print-hidden"
              onClick={() => setIsAssignmentRequestsDialogOpen(true)}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Запросы на смены
              <Badge variant="destructive" className="ml-2">
                {pendingAssignmentRequests.length}
              </Badge>
            </Button>
          )}
          <Button
            variant={multiSelectMode ? 'default' : 'outline'}
            onClick={() => {
              setMultiSelectMode(prev => !prev);
              setSelectedDates(new Set());
            }}
            className="print-hidden"
          >
            <CheckSquare className="h-4 w-4 mr-2" />
            {multiSelectMode ? 'Отменить выбор' : 'Выбрать дни'}
          </Button>
          <Button variant="outline" onClick={() => setIsHelpDialogOpen(true)} className="print-hidden">
            <Phone className="h-4 w-4 mr-2" />
            Вызов на помощь
          </Button>
        </div>
      </div>

      {/* Multi-select toolbar */}
      {multiSelectMode && (
        <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg print-hidden">
          <CheckSquare className="h-5 w-5 text-blue-600" />
          <span className="text-sm font-medium text-blue-800">
            {selectedDates.size > 0
              ? `Выбрано дней: ${selectedDates.size}`
              : 'Кликайте на заголовки дней для выбора'}
          </span>
          {selectedDates.size > 0 && (
            <>
              <Button
                size="sm"
                onClick={() => { setBulkEmployees([]); setIsBulkDialogOpen(true); }}
              >
                <UserPlus className="h-4 w-4 mr-1" />
                Назначить смены
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleBulkDelete}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Удалить смены
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedDates(new Set())}
              >
                <XCircle className="h-4 w-4 mr-1" />
                Сбросить
              </Button>
            </>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-green-500 text-white rounded flex items-center justify-center font-medium">Д</div>
          <span>Дневная смена (08:00-20:00)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-blue-500 text-white rounded flex items-center justify-center font-medium">Н</div>
          <span>Ночная смена (20:00-08:00)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-gray-200 text-gray-700 rounded flex items-center justify-center font-bold">1</div>
          <span>Бокс 1</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-gray-200 text-gray-700 rounded flex items-center justify-center font-bold">2</div>
          <span>Бокс 2</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-green-500 text-white rounded flex items-center justify-center font-medium relative">
            1
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-300 text-green-800 rounded-full flex items-center justify-center text-[8px] font-bold">
              А
            </div>
          </div>
          <span>Авто-назначенная смена</span>
        </div>
      </div>

      {/* Weather load scale legend */}
      {weatherDays.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
          <span className="font-medium">Загрузка по погоде:</span>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 bg-green-100 border border-green-400 rounded" />
            <span>Мало</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 bg-yellow-50 border border-yellow-400 rounded" />
            <span>Средне</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 bg-orange-100 border border-orange-400 rounded" />
            <span>Много</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 bg-red-100 border border-red-400 rounded" />
            <span>ПИК</span>
          </div>
          <span className="text-gray-400 ml-1">(наведите на заголовок дня для подсказки)</span>
        </div>
      )}

      {/* Wash filter toggle */}
      <div className="flex items-center gap-2 print-hidden">
        <span className="text-sm font-medium text-gray-600">Мойка:</span>
        <Button
          variant={selectedWashId === 'wash_1' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSelectedWashId('wash_1')}
        >
          Мойка 1
        </Button>
        <Button
          variant={selectedWashId === 'wash_2' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSelectedWashId('wash_2')}
        >
          Мойка 2
        </Button>
      </div>

      {/* Box filter toggle */}
      <div className="flex items-center gap-2 print-hidden">
        <span className="text-sm font-medium text-gray-600">Бокс:</span>
        <Button
          variant={calendarBoxFilter === 1 ? 'default' : 'outline'}
          size="sm"
          onClick={() => setCalendarBoxFilter(1)}
        >
          Бокс 1
        </Button>
        <Button
          variant={calendarBoxFilter === 2 ? 'default' : 'outline'}
          size="sm"
          onClick={() => setCalendarBoxFilter(2)}
        >
          Бокс 2
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border rounded-lg bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-700 text-white">
              <th className="border border-slate-600 px-3 py-2 text-left w-8">#</th>
              <th className="border border-slate-600 px-3 py-2 text-left min-w-[150px]">Сотрудник</th>
              {daysInMonth.map(day => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const dayOfWeek = getDay(day);
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                const isTodayCol = dateIsToday(day);
                const w = getWeatherForDate(dateStr);
                const loadBg = w ? (LOAD_HEADER_BG[w.loadLevel] || '') : '';
                const isSelected = selectedDates.has(dateStr);
                return (
                  <th
                    key={dateStr}
                    className={`border border-slate-600 px-1 py-1 text-center min-w-[60px] ${isWeekend ? 'bg-slate-600' : ''} ${isTodayCol ? 'bg-amber-600 ring-2 ring-amber-400 ring-inset' : loadBg} ${multiSelectMode ? 'cursor-pointer hover:opacity-80' : ''} ${isSelected ? 'ring-2 ring-blue-400 ring-inset bg-blue-700' : ''}`}
                    title={w ? w.hint + (w.windHint ? `\n${w.windHint}` : '') : ''}
                    onClick={multiSelectMode ? () => toggleDateSelection(dateStr) : undefined}
                  >
                    <div className="text-xs font-bold">{format(day, 'd')}</div>
                    <div className="text-xs font-normal opacity-80">{format(day, 'EEE', { locale: ru })}</div>
                    {w && (
                      <div className="text-[10px] leading-tight mt-0.5">
                        <span>{w.icon}</span>
                        <span className="opacity-90">
                          {w.tMax !== null ? `${w.tMax > 0 ? '+' : ''}${Math.round(w.tMax)}°` : ''}
                        </span>
                      </div>
                    )}
                  </th>
                );
              })}
              <th className="border border-slate-600 px-3 py-2 text-center bg-slate-600 w-16">Смен</th>
              <th className="border border-slate-600 px-3 py-2 text-center bg-slate-600 w-12">
                <div className="w-5 h-5 bg-green-500 text-white rounded mx-auto flex items-center justify-center text-xs font-bold">Д</div>
              </th>
              <th className="border border-slate-600 px-3 py-2 text-center bg-slate-600 w-12">
                <div className="w-5 h-5 bg-blue-500 text-white rounded mx-auto flex items-center justify-center text-xs font-bold">Н</div>
              </th>
              <th className="border border-slate-600 px-3 py-2 text-center bg-slate-600 w-16">Часов</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((employee, index) => {
              const stats = getEmployeeStats(employee.id);

              return (
                <tr key={employee.id} className="hover:bg-gray-50">
                  <td className="border border-gray-300 px-3 py-2 text-center text-gray-600 font-medium">
                    {index + 1}
                  </td>
                  <td className="border border-gray-300 px-3 py-2 font-medium">
                    {employee.fullName}
                  </td>
                  {daysInMonth.map(day => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const empShifts = getShiftsForEmployeeOnDate(employee.id, dateStr).filter(s => s.boxNumber === calendarBoxFilter);
                    const dayOfWeek = getDay(day);
                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                    const isTodayCell = dateIsToday(day);
                    const wCell = getWeatherForDate(dateStr);
                    const cellLoadBg = wCell && !isTodayCell ? (LOAD_BG[wCell.loadLevel] || '') : '';

                    return (
                      <td
                        key={dateStr}
                        onClick={() => handleOpenDialog(dateStr, employee.id, empShifts[0])}
                        className={`border border-gray-300 p-1 cursor-pointer hover:bg-gray-100 ${isTodayCell ? 'bg-amber-50 border-amber-300' : isWeekend ? 'bg-gray-50' : cellLoadBg}`}
                      >
                        {empShifts.length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            {empShifts.map(shift => {
                              const isDay = shift.shiftType === 'day';
                              const box = shift.boxNumber;
                              const isAuto = shift.isAutoAssigned;

                              // Background color based on shift type
                              let bgColor = isDay ? 'bg-green-500' : 'bg-blue-500';

                              return (
                                <div
                                  key={shift.id}
                                  className={`${bgColor} text-white rounded px-1 py-0.5 text-center font-bold text-xs relative`}
                                  title={`Бокс ${box} - ${isDay ? 'Дневная' : 'Ночная'}${isAuto ? ' (Авто-назначена)' : ''}`}
                                >
                                  <span className="screen-only">{box}</span>
                                  <span className="print-only">{isDay ? 'Д' : 'Н'}</span>
                                  {isAuto && (
                                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-300 text-green-800 rounded-full flex items-center justify-center text-[8px] font-bold">
                                      А
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-center text-gray-300 text-xs">-</div>
                        )}
                      </td>
                    );
                  })}
                  <td className="border border-gray-300 px-3 py-2 text-center font-medium bg-gray-50">
                    {stats.total}
                  </td>
                  <td className="border border-gray-300 px-3 py-2 text-center bg-gray-50">
                    {stats.day}
                  </td>
                  <td className="border border-gray-300 px-3 py-2 text-center bg-gray-50">
                    {stats.night}
                  </td>
                  <td className="border border-gray-300 px-3 py-2 text-center font-medium bg-gray-50">
                    {stats.hours}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 font-medium text-sm">
              <td className="border border-gray-300 px-3 py-2" colSpan={2}>Итого за день</td>
              {daysInMonth.map(day => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const dayShiftsCount = monthShifts.filter(s => s.date === dateStr && s.boxNumber === calendarBoxFilter).reduce((acc, s) => acc + s.employeeIds.length, 0);
                const isTodayFooter = dateIsToday(day);
                const wFooter = getWeatherForDate(dateStr);
                const footerLoadBg = wFooter && !isTodayFooter ? (LOAD_BG[wFooter.loadLevel] || '') : '';
                return (
                  <td key={dateStr} className={`border border-gray-300 px-1 py-2 text-center ${isTodayFooter ? 'bg-amber-100 font-bold' : footerLoadBg}`}>
                    {dayShiftsCount > 0 ? dayShiftsCount : '-'}
                  </td>
                );
              })}
              <td className="border border-gray-300 px-3 py-2 text-center" colSpan={4}>
                {monthShifts.filter(s => s.boxNumber === calendarBoxFilter).reduce((acc, s) => acc + s.employeeIds.length, 0)} чел/смен
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Day-by-day cards: who works where */}
      {monthShifts.length > 0 && (
        <div className="mt-6 print-hidden">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Расписание по дням
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {daysInMonth.map(day => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const dayOfWeek = getDay(day);
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
              const isTodayCard = dateIsToday(day);
              const dayShifts = monthShifts.filter(s => s.date === dateStr);
              const w = getWeatherForDate(dateStr);

              // Group shifts by box and type
              const box1Day = dayShifts.filter(s => s.boxNumber === 1 && s.shiftType === 'day');
              const box1Night = dayShifts.filter(s => s.boxNumber === 1 && s.shiftType === 'night');
              const box2Day = dayShifts.filter(s => s.boxNumber === 2 && s.shiftType === 'day');
              const box2Night = dayShifts.filter(s => s.boxNumber === 2 && s.shiftType === 'night');
              const hasBox2 = box2Day.length > 0 || box2Night.length > 0;

              // Free employees
              const assignedIds = dayShifts.flatMap(s => s.employeeIds);
              const freeCount = employees.filter(e => !assignedIds.includes(e.id)).length;

              // Load level color for card border
              const loadBorder = w ? ({
                low: 'border-l-green-500',
                normal: 'border-l-yellow-400',
                high: 'border-l-orange-500',
                peak: 'border-l-red-500',
              }[w.loadLevel] || '') : 'border-l-gray-300';

              const ShiftRow = ({ label, color, shifts: rowShifts }: { label: string; color: string; shifts: Shift[] }) => (
                <div className="flex items-start gap-1.5 min-h-[22px]">
                  <span className={`${color} text-white text-[10px] font-bold px-1.5 py-0.5 rounded w-[20px] text-center flex-shrink-0`}>
                    {label}
                  </span>
                  {rowShifts.length > 0 ? (
                    <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                      {rowShifts.flatMap(s => s.employeeIds).map(empId => {
                        const emp = employees.find(e => e.id === empId);
                        return (
                          <span key={empId} className="text-xs text-gray-800">
                            {emp ? emp.fullName.split(' ').slice(0, 2).join(' ') : '?'}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-[11px] text-gray-300 italic">пусто</span>
                  )}
                </div>
              );

              return (
                <div
                  key={dateStr}
                  className={`bg-white rounded-xl border border-gray-200 border-l-4 ${loadBorder} shadow-sm hover:shadow-md transition-shadow overflow-hidden ${isTodayCard ? 'ring-2 ring-amber-400' : ''}`}
                >
                  {/* Card header */}
                  <div className={`px-3 py-2 flex items-center justify-between ${isWeekend ? 'bg-gray-50' : ''} ${isTodayCard ? 'bg-amber-50' : ''}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-900">
                        {format(day, 'd MMM', { locale: ru })}
                      </span>
                      <span className={`text-xs ${isWeekend ? 'text-red-500 font-semibold' : 'text-gray-500'}`}>
                        {format(day, 'EEEE', { locale: ru })}
                      </span>
                      {isTodayCard && (
                        <span className="text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-bold">сегодня</span>
                      )}
                    </div>
                    {w && (
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <span>{w.icon}</span>
                        <span>{w.tMax !== null ? `${w.tMax > 0 ? '+' : ''}${Math.round(w.tMax)}°` : ''}</span>
                      </div>
                    )}
                  </div>

                  {/* Card body */}
                  <div className="px-3 py-2 space-y-2">
                    {dayShifts.length > 0 ? (
                      <>
                        {/* Box 1 */}
                        <div>
                          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Бокс 1</div>
                          <div className="space-y-1">
                            <ShiftRow label="Д" color="bg-green-500" shifts={box1Day} />
                            <ShiftRow label="Н" color="bg-blue-500" shifts={box1Night} />
                          </div>
                        </div>

                        {/* Box 2 */}
                        {hasBox2 ? (
                          <div>
                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Бокс 2</div>
                            <div className="space-y-1">
                              <ShiftRow label="Д" color="bg-green-500" shifts={box2Day} />
                              <ShiftRow label="Н" color="bg-blue-500" shifts={box2Night} />
                            </div>
                          </div>
                        ) : (
                          <div className="text-[10px] text-gray-300">Бокс 2 — пусто</div>
                        )}
                      </>
                    ) : (
                      <div className="text-xs text-gray-400 italic py-1">Нет смен</div>
                    )}
                  </div>

                  {/* Footer: hint + free count */}
                  <div className="px-3 py-1.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                    {w && w.hint ? (
                      <span className="text-[10px] text-gray-500 truncate mr-2" title={w.hint}>{w.hint}</span>
                    ) : (
                      <span />
                    )}
                    <span className="text-[10px] text-gray-400 flex-shrink-0">
                      {freeCount > 0 ? `${freeCount} свободны` : 'все заняты'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit Shift Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingShiftId ? 'Редактировать смену' : 'Назначить смену'}
            </DialogTitle>
          </DialogHeader>

          {selectedDate && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-2">
                  Дата: <strong>{format(new Date(selectedDate), 'd MMMM yyyy', { locale: ru })}</strong>
                </p>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Тип смены:</p>
                <div className="flex gap-2">
                  <Button
                    variant={selectedShiftType === 'day' ? 'default' : 'outline'}
                    onClick={() => handleDialogShiftTypeChange('day')}
                    className="flex-1"
                  >
                    <Sun className="h-4 w-4 mr-2" />
                    Дневная (08:00-20:00)
                  </Button>
                  <Button
                    variant={selectedShiftType === 'night' ? 'default' : 'outline'}
                    onClick={() => handleDialogShiftTypeChange('night')}
                    className="flex-1"
                  >
                    <Moon className="h-4 w-4 mr-2" />
                    Ночная (20:00-08:00)
                  </Button>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Бокс:</p>
                <div className="flex gap-2">
                  <Button
                    variant={selectedBox === 1 ? 'default' : 'outline'}
                    onClick={() => handleDialogBoxChange(1)}
                    className="flex-1"
                  >
                    Бокс 1
                  </Button>
                  <Button
                    variant={selectedBox === 2 ? 'default' : 'outline'}
                    onClick={() => handleDialogBoxChange(2)}
                    className="flex-1"
                  >
                    Бокс 2
                  </Button>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Выберите сотрудников (макс. 2):</p>
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Поиск сотрудника..."
                    value={employeeFilter}
                    onChange={(e) => setEmployeeFilter(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-[240px] overflow-y-auto">
                  {employees.filter(emp =>
                    !employeeFilter || emp.fullName.toLowerCase().includes(employeeFilter.toLowerCase())
                  ).map(emp => {
                    const isSelected = selectedEmployees.includes(emp.id);
                    const isDisabled = !isSelected && selectedEmployees.length >= 2;

                    return (
                      <div
                        key={emp.id}
                        onClick={() => !isDisabled && toggleEmployee(emp.id)}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-blue-100 border-blue-500 text-blue-700'
                            : isDisabled
                            ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                            : 'bg-white border-gray-300 hover:border-blue-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          <span className="text-sm">{emp.fullName}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2">
            {editingShiftId && (
              <Button variant="destructive" onClick={handleDeleteShift} disabled={isSaving}>
                Удалить
              </Button>
            )}
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSaving}>
              Отмена
            </Button>
            <Button onClick={handleSaveShift} disabled={selectedEmployees.length === 0 || isSaving}>
              {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Сохраняем...</> : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Call for Help Dialog */}
      <Dialog open={isHelpDialogOpen} onOpenChange={setIsHelpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Вызов на помощь
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Сотрудники, которые не назначены на смену сегодня ({format(new Date(), 'd MMMM', { locale: ru })}):
            </p>

            {todayFreeEmployees.length > 0 ? (
              <div className="space-y-2">
                {todayFreeEmployees.map(emp => (
                  <div key={emp.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">{emp.fullName}</p>
                      <p className="text-sm text-gray-500">{emp.phone}</p>
                    </div>
                    <a
                      href={`tel:${emp.phone}`}
                      className="flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                    >
                      <Phone className="h-4 w-4" />
                      Позвонить
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-500 py-4">
                Все сотрудники сегодня на смене
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsHelpDialogOpen(false)}>
              Закрыть
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Swap Requests Dialog for Manager */}
      <Dialog open={isSwapRequestsDialogOpen} onOpenChange={setIsSwapRequestsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              Заявки на обмен сменами
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {swapRequests.length > 0 ? (
              swapRequests.map(req => {
                const requester = employees.find(e => e.id === req.requesterId);
                const target = employees.find(e => e.id === req.targetEmployeeId);
                const requesterShift = getShiftById(req.requesterShiftId);
                const targetShift = req.targetShiftId ? getShiftById(req.targetShiftId) : null;

                return (
                  <div key={req.id} className="p-4 bg-gray-50 rounded-lg border">
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant={req.type === 'giveaway' ? 'secondary' : 'outline'}>
                          {req.type === 'giveaway' ? 'Передача' : 'Обмен'}
                        </Badge>
                        <span className="text-xs text-gray-500">
                          {format(new Date(req.createdAt), 'd MMM, HH:mm', { locale: ru })}
                        </span>
                      </div>

                      <div className="text-sm space-y-1">
                        <p>
                          <strong>{requester?.fullName || 'Неизвестно'}</strong>
                          {req.type === 'giveaway' ? ' хочет передать смену' : ' предлагает обмен'}
                        </p>
                        {requesterShift && (
                          <p className="text-gray-600 flex items-center gap-1">
                            {requesterShift.shiftType === 'day' ? (
                              <Sun className="h-3 w-3 text-amber-500" />
                            ) : (
                              <Moon className="h-3 w-3 text-indigo-500" />
                            )}
                            Смена: {format(new Date(requesterShift.date), 'd MMMM', { locale: ru })}, Бокс {requesterShift.boxNumber}
                          </p>
                        )}
                        <p className="text-gray-600">
                          → <strong>{target?.fullName || 'Неизвестно'}</strong>
                        </p>
                        {targetShift && req.type === 'swap' && (
                          <p className="text-gray-600 flex items-center gap-1">
                            {targetShift.shiftType === 'day' ? (
                              <Sun className="h-3 w-3 text-amber-500" />
                            ) : (
                              <Moon className="h-3 w-3 text-indigo-500" />
                            )}
                            Взамен: {format(new Date(targetShift.date), 'd MMMM', { locale: ru })}, Бокс {targetShift.boxNumber}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleManagerDecision(req.id, true)}
                        className="flex-1"
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Одобрить
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleManagerDecision(req.id, false)}
                        className="flex-1"
                      >
                        <X className="h-4 w-4 mr-1" />
                        Отклонить
                      </Button>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-center text-gray-500 py-4">
                Нет активных заявок на обмен
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSwapRequestsDialogOpen(false)}>
              Закрыть
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assignment Requests Dialog for Manager */}
      <Dialog open={isAssignmentRequestsDialogOpen} onOpenChange={setIsAssignmentRequestsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Запросы на назначение смен
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {pendingAssignmentRequests.length > 0 ? (
              pendingAssignmentRequests.map(req => {
                const employee = employees.find(e => e.id === req.employeeId);

                return (
                  <div key={req.id} className="p-4 bg-gray-50 rounded-lg border">
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline">Запрос</Badge>
                        <span className="text-xs text-gray-500">
                          {format(new Date(req.createdAt), 'd MMM, HH:mm', { locale: ru })}
                        </span>
                      </div>

                      <div className="text-sm space-y-1">
                        <p>
                          <strong>{employee?.fullName || 'Неизвестно'}</strong> запрашивает смену
                        </p>
                        <p className="text-gray-600 flex items-center gap-1">
                          {req.shiftType === 'day' ? (
                            <Sun className="h-3 w-3 text-amber-500" />
                          ) : (
                            <Moon className="h-3 w-3 text-indigo-500" />
                          )}
                          {format(new Date(req.date), 'd MMMM yyyy (EEEE)', { locale: ru })}
                        </p>
                        <p className="text-gray-600">
                          Бокс {req.boxNumber} • {req.shiftType === 'day' ? 'Дневная (08:00-20:00)' : 'Ночная (20:00-08:00)'}
                        </p>
                        {req.comment && (
                          <p className="text-gray-500 text-xs italic mt-2 bg-white p-2 rounded">
                            {req.comment}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleAssignmentDecision(req.id, true)}
                        className="flex-1"
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Назначить
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAssignmentDecision(req.id, false)}
                        className="flex-1"
                      >
                        <X className="h-4 w-4 mr-1" />
                        Отклонить
                      </Button>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-center text-gray-500 py-4">
                Нет активных запросов на смены
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAssignmentRequestsDialogOpen(false)}>
              Закрыть
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Assignment Dialog */}
      <Dialog open={isBulkDialogOpen} onOpenChange={setIsBulkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5" />
              Массовое назначение смен
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 mb-2">
                Выбрано дней: <strong>{selectedDates.size}</strong>
              </p>
              <div className="flex flex-wrap gap-1">
                {Array.from(selectedDates).sort().map(d => (
                  <Badge key={d} variant="outline" className="text-xs">
                    {format(new Date(d), 'd MMM', { locale: ru })}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Тип смены:</p>
              <div className="flex gap-2">
                <Button
                  variant={bulkShiftType === 'day' ? 'default' : 'outline'}
                  onClick={() => setBulkShiftType('day')}
                  className="flex-1"
                >
                  <Sun className="h-4 w-4 mr-2" />
                  Дневная
                </Button>
                <Button
                  variant={bulkShiftType === 'night' ? 'default' : 'outline'}
                  onClick={() => setBulkShiftType('night')}
                  className="flex-1"
                >
                  <Moon className="h-4 w-4 mr-2" />
                  Ночная
                </Button>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Бокс:</p>
              <div className="flex gap-2">
                <Button
                  variant={bulkBox === 1 ? 'default' : 'outline'}
                  onClick={() => setBulkBox(1)}
                  className="flex-1"
                >
                  Бокс 1
                </Button>
                <Button
                  variant={bulkBox === 2 ? 'default' : 'outline'}
                  onClick={() => setBulkBox(2)}
                  className="flex-1"
                >
                  Бокс 2
                </Button>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Сотрудники (макс. 2):</p>
              <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
                {employees.map(emp => {
                  const isSelected = bulkEmployees.includes(emp.id);
                  const isDisabled = !isSelected && bulkEmployees.length >= 2;
                  return (
                    <div
                      key={emp.id}
                      onClick={() => {
                        if (isDisabled) return;
                        setBulkEmployees(prev =>
                          prev.includes(emp.id)
                            ? prev.filter(id => id !== emp.id)
                            : [...prev, emp.id]
                        );
                      }}
                      className={`p-2 rounded-lg border cursor-pointer transition-colors text-sm ${
                        isSelected
                          ? 'bg-blue-100 border-blue-500 text-blue-700'
                          : isDisabled
                          ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                          : 'bg-white border-gray-300 hover:border-blue-300'
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        <span>{emp.fullName}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkDialogOpen(false)} disabled={isBulkSaving}>
              Отмена
            </Button>
            <Button onClick={handleBulkAssign} disabled={bulkEmployees.length === 0 || isBulkSaving}>
              {isBulkSaving
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Назначаю...</>
                : `Назначить на ${selectedDates.size} дней`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

