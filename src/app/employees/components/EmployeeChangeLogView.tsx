"use client";

import * as React from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { History, Lock, User, Key, Archive, Phone, CreditCard, BadgeCheck, FileText, ChevronDown, ChevronUp } from "lucide-react";
import type { EmployeeChangeLogEntry, Employee } from "@/types";

/**
 * Phase 29b: UI для просмотра audit-журнала EmployeeChangeLog.
 * Раскрывается аккордеоном в /employees/[id]/edit (не загружается пока не открыт).
 */

const FIELD_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string; level: 'critical' | 'warn' | 'info' }> = {
  salarySchemeId:  { label: "Схема ЗП",         icon: BadgeCheck,   color: "#dc2626", level: 'critical' },
  role:            { label: "Роль",              icon: Lock,         color: "#dc2626", level: 'critical' },
  username:        { label: "Логин",             icon: User,         color: "#f59e0b", level: 'warn' },
  password:        { label: "Пароль",            icon: Key,          color: "#f59e0b", level: 'warn' },
  archived:        { label: "Архивация",         icon: Archive,      color: "#f59e0b", level: 'warn' },
  fullName:        { label: "ФИО",               icon: User,         color: "#3b82f6", level: 'info' },
  phone:           { label: "Телефон",           icon: Phone,        color: "#3b82f6", level: 'info' },
  paymentDetails:  { label: "Реквизиты выплаты", icon: CreditCard,   color: "#3b82f6", level: 'info' },
};

function FieldIcon({ field }: { field: string }) {
  const meta = FIELD_META[field];
  const Icon = meta?.icon ?? FileText;
  return <Icon className="w-3.5 h-3.5" style={{ color: meta?.color ?? "#64748b" }} />;
}

function fieldLabel(field: string): string {
  return FIELD_META[field]?.label ?? field;
}

function formatValue(field: string, value: string | null): string {
  if (value === null || value === undefined) return '—';
  if (field === 'password') return '***';
  if (field === 'archived') return value === 'true' ? 'архивирован' : 'активен';
  if (value.length > 60) return value.slice(0, 57) + '...';
  return value;
}

export function EmployeeChangeLogView({ employeeId, employees }: {
  employeeId: string;
  /** Список всех сотрудников для маппинга changedBy → имя */
  employees?: Employee[];
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [entries, setEntries] = React.useState<EmployeeChangeLogEntry[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(false);

  const adminMap = React.useMemo(() => {
    const m = new Map<string, string>();
    if (employees) for (const e of employees) m.set(e.id, e.fullName);
    return m;
  }, [employees]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/employees/${employeeId}/changelog?limit=50`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Не удалось загрузить журнал');
      setEntries(Array.isArray(data) ? data : []);
      setLoaded(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleExpanded() {
    setExpanded(prev => {
      const next = !prev;
      if (next && !loaded) load();
      return next;
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={toggleExpanded}
        className="w-full px-5 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0">
          <History className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold text-slate-900">📜 Audit-журнал изменений</div>
          <div className="text-[11px] text-slate-500">
            Phase 29 · все правки role / username / password / схема ЗП / архивация / ФИО / тел / реквизиты
          </div>
        </div>
        {loaded && entries.length > 0 && (
          <span className="text-[11px] font-bold text-slate-600 tabular-nums bg-slate-100 px-2 py-0.5 rounded">
            {entries.length}
          </span>
        )}
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {expanded && (
        <div className="border-t border-slate-100 p-4 space-y-2">
          {loading && (
            <div className="text-[12px] text-slate-500 text-center py-6">Загружаю журнал…</div>
          )}
          {error && (
            <div className="text-[12px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
              Ошибка: {error}
            </div>
          )}
          {!loading && !error && entries.length === 0 && (
            <div className="text-[12px] text-slate-500 text-center py-6">
              <History className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              Журнал пуст — у этого сотрудника не было опасных правок (или audit включился позже).
            </div>
          )}
          {!loading && entries.length > 0 && (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-100">
                  <th className="py-2 px-2">Когда</th>
                  <th className="py-2 px-2">Поле</th>
                  <th className="py-2 px-2">Было</th>
                  <th className="py-2 px-2">Стало</th>
                  <th className="py-2 px-2">Кто</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map(e => {
                  const meta = FIELD_META[e.fieldName];
                  const adminName = adminMap.get(e.changedBy) ?? e.changedBy.slice(0, 12);
                  const dt = new Date(e.createdAt);
                  return (
                    <tr key={e.id} className="hover:bg-slate-50/40">
                      <td className="py-2 px-2 text-slate-600 tabular-nums whitespace-nowrap">
                        {format(dt, "d MMM HH:mm", { locale: ru })}
                      </td>
                      <td className="py-2 px-2">
                        <span className="inline-flex items-center gap-1.5"
                          style={{ color: meta?.color ?? "#64748b" }}>
                          <FieldIcon field={e.fieldName} />
                          <span className="font-semibold">{fieldLabel(e.fieldName)}</span>
                        </span>
                      </td>
                      <td className="py-2 px-2 text-slate-500 line-through">
                        {formatValue(e.fieldName, e.oldValue)}
                      </td>
                      <td className="py-2 px-2 text-slate-900 font-medium">
                        {formatValue(e.fieldName, e.newValue)}
                      </td>
                      <td className="py-2 px-2 text-slate-700">{adminName}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
