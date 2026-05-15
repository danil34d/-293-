"use client";

import * as React from "react";
import Link from "next/link";
import { PlusCircle, Edit, UserCog, Check, XIcon, Wallet, WalletCards, Trash2, Archive, RotateCcw, Lock, Search, Activity, Droplets } from "lucide-react";
import { ROLE_LABELS, type Employee, type EmployeeRole, type SalaryScheme } from "@/types";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SafetyBar, HazardPill } from "@/components/admin";
import { EmployeeDeleteModal } from "./EmployeeDeleteModal";

export interface EmployeesTableProps {
  employees: Employee[];
  salarySchemes: SalaryScheme[];
  /** Phase 14: метрики для UI колонок (Моек/мес + Последняя активность). */
  metrics?: Record<string, { washesThisMonth: number; lastWashAt: string | null }>;
}

function formatRelativeDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays === 1) return "вчера";
  if (diffDays < 7) return `${diffDays} дн назад`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} нед назад`;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
}

function activityColor(iso: string | null): string {
  if (!iso) return "#9ca3af"; // gray
  const diffDays = (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays < 1) return "#15803d"; // green-700
  if (diffDays < 7) return "#0369a1"; // sky-700
  if (diffDays < 30) return "#92400e"; // amber-800
  return "#b91c1c"; // red-700
}

/**
 * UX-safety редизайн /employees (Phase 6.2).
 *
 * Дизайн-образец: admin-pilot/employees-list.jsx.
 * Защищает АРХ-НАХОДКИ #1: cascade DELETE на 7 таблиц.
 *
 * Фичи:
 * - SafetyBar с 3 счётчиками (активных / в архиве / защищено от delete)
 * - 3 фильтра: active / all / archived (filter)
 * - Role фильтр: все / employee / admin / kiosk
 * - Search по ФИО / логину
 * - Защита admin/kiosk: нет кнопки 🗑 (только Edit/Finance)
 * - Архивные строки: пониженная прозрачность + кнопка «Восстановить»
 * - EmployeeDeleteModal с 2 режимами (choose → hard-delete)
 */
export function EmployeesTable({ employees, salarySchemes, metrics = {} }: EmployeesTableProps) {
  const router = useRouter();
  const { toast } = useToast();
  const schemeMap = new Map(salarySchemes.map((s) => [s.id, s.name]));

  const [deleteEmployee, setDeleteEmployee] = React.useState<Employee | null>(null);
  const [filter, setFilter] = React.useState<"active" | "all" | "archived">("active");
  const [roleFilter, setRoleFilter] = React.useState<"all" | "employee" | "admin" | "kiosk">("all");
  const [search, setSearch] = React.useState("");

  const filtered = React.useMemo(() => {
    return employees.filter((e) => {
      // Filter by archived state
      if (filter === "active" && e.archived) return false;
      if (filter === "archived" && !e.archived) return false;
      // Filter by role
      if (roleFilter !== "all" && e.role !== roleFilter) return false;
      // Search
      if (search) {
        const s = search.toLowerCase();
        if (
          !e.fullName.toLowerCase().includes(s) &&
          !(e.username || "").toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    });
  }, [employees, filter, roleFilter, search]);

  const activeCount = employees.filter((e) => !e.archived).length;
  const archivedCount = employees.filter((e) => !!e.archived).length;
  const protectedCount = employees.filter((e) => e.id === "emp_manager_admin" || e.role === "kiosk").length;

  async function handleUnarchive(emp: Employee) {
    try {
      const r = await fetch(`/api/employees/${emp.id}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unarchive" }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${r.status}`);
      }
      toast({ title: "Восстановлен", description: `${emp.fullName} снова в активных списках.` });
      router.refresh();
    } catch (e: any) {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    }
  }

  return (
    <div className="employees space-y-4">
      {/* Header */}
      <div className="flex items-end justify-between pt-2">
        <div>
          <div className="text-[11px] uppercase tracking-wider font-bold text-rose-600 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> Удаление = каскад 7 таблиц
          </div>
          <h1 className="text-[26px] font-bold text-gray-900 mt-1 leading-tight">
            Сотрудники
          </h1>
          <p className="text-[13px] text-gray-500 mt-1">
            Управление профилями, доступом и историей моек
          </p>
        </div>
        <Link
          href="/employees/new"
          className="inline-flex items-center gap-2 rounded-lg bg-[#0088CC] hover:bg-[#0077B5] text-white px-4 py-2.5 text-[13px] font-semibold transition-colors"
        >
          <PlusCircle className="w-4 h-4" /> Добавить сотрудника
        </Link>
      </div>

      {/* SafetyBar */}
      <SafetyBar
        level="info"
        items={[
          { icon: "users", label: "Активных", value: `${activeCount}` },
          {
            icon: "archive",
            label: "В архиве",
            value: archivedCount > 0 ? `${archivedCount}` : "—",
          },
          {
            icon: "shield",
            label: "Защищено",
            value: `${protectedCount} (admin/kiosk)`,
          },
        ]}
      />

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {([
            ["active", "Активные", activeCount],
            ["all", "Все", employees.length],
            ["archived", "В архиве", archivedCount],
          ] as const).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className="rounded-md px-3 py-1.5 text-[12px] font-semibold flex items-center gap-1.5 transition-all"
              style={{
                background: filter === id ? "#fff" : "transparent",
                color: filter === id ? "#0088CC" : "#64748b",
                boxShadow: filter === id ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
              }}
            >
              {label} <span className="text-[10px] opacity-70">{count}</span>
            </button>
          ))}
        </div>

        <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {([
            ["all", "Все роли"],
            ["employee", "Сотрудники"],
            ["admin", "Админ"],
            ["kiosk", "Терминалы"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setRoleFilter(id)}
              className="rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-all"
              style={{
                background: roleFilter === id ? "#fff" : "transparent",
                color: roleFilter === id ? "#0088CC" : "#64748b",
                boxShadow: roleFilter === id ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-[280px] ml-auto">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ФИО или логин"
            className="pl-9 text-[13px]"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-slate-50/60 border-b border-gray-100 text-left text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                <th className="px-5 py-2.5">Сотрудник</th>
                <th className="px-3 py-2.5">Роль</th>
                <th className="px-3 py-2.5">Схема ЗП</th>
                <th className="px-3 py-2.5 text-center" title="Моек за этот месяц">Моек/мес</th>
                <th className="px-3 py-2.5" title="Последняя мойка">Активность</th>
                <th className="px-3 py-2.5">Логин · Телефон</th>
                <th className="px-3 py-2.5 text-center">Авто</th>
                <th className="px-3 py-2.5 text-right w-[160px]">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((e) => {
                const isArchived = !!e.archived;
                const isProtected =
                  e.id === "emp_manager_admin" || e.role === "kiosk";
                const isOwner = e.id === "emp_manager_admin";
                const isKiosk = e.role === "kiosk";
                const noLogin = !e.username && !isProtected;
                return (
                  <tr
                    key={e.id}
                    className="hover:bg-slate-50/40 transition-colors"
                    style={isArchived ? { opacity: 0.55 } : {}}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">{e.fullName}</span>
                        {isOwner && (
                          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[9px] font-bold uppercase">
                            владелец
                          </span>
                        )}
                        {isKiosk && (
                          <span className="px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded text-[9px] font-bold uppercase">
                            устройство
                          </span>
                        )}
                        {noLogin && (
                          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[9px] font-bold uppercase">
                            нет логина
                          </span>
                        )}
                        {isArchived && <HazardPill level="info">в архиве</HazardPill>}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                        style={
                          e.role === "admin"
                            ? { background: "#fef3c7", color: "#92400e" }
                            : e.role === "kiosk"
                              ? { background: "#ede9fe", color: "#5b21b6" }
                              : { background: "#dbeafe", color: "#1d4ed8" }
                        }
                      >
                        {ROLE_LABELS[(e.role || "employee") as EmployeeRole] ?? e.role}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[12px] text-gray-700">
                      {e.salarySchemeId ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Wallet className="w-3 h-3 text-emerald-600" />
                          {schemeMap.get(e.salarySchemeId) || "—"}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    {/* Phase 14: Моек за месяц + Последняя активность */}
                    <td className="px-3 py-3 text-center">
                      {(() => {
                        const m = metrics[e.id];
                        const count = m?.washesThisMonth ?? 0;
                        return (
                          <span
                            className="inline-flex items-center gap-1 text-[12px] tabular-nums font-semibold"
                            style={{ color: count > 0 ? "#0369a1" : "#9ca3af" }}
                          >
                            <Droplets className="w-3 h-3" />
                            {count > 0 ? count : "—"}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-3 text-[11px]">
                      {(() => {
                        const m = metrics[e.id];
                        const lastAt = m?.lastWashAt ?? null;
                        const color = activityColor(lastAt);
                        return (
                          <span
                            className="inline-flex items-center gap-1 font-medium"
                            style={{ color }}
                            title={lastAt ? new Date(lastAt).toLocaleString("ru-RU") : "Никогда не мыла"}
                          >
                            <Activity className="w-3 h-3" />
                            {formatRelativeDate(lastAt)}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-3 text-[11px] text-gray-600">
                      {e.username && (
                        <code className="bg-gray-100 px-1 rounded text-[10px]">
                          {e.username}
                        </code>
                      )}
                      {e.phone && <div className="text-gray-500">{e.phone}</div>}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div
                        className="inline-flex items-center justify-center w-6 h-6 rounded"
                        style={{
                          background: e.hasCar ? "#dcfce7" : "#fee2e2",
                          color: e.hasCar ? "#15803d" : "#b91c1c",
                        }}
                      >
                        {e.hasCar ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <XIcon className="w-3.5 h-3.5" />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="inline-flex items-center justify-end gap-1">
                        {!isProtected && !isArchived && (
                          <Link
                            href={`/employees/${e.id}/finance`}
                            title="Финансы"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50 transition-colors"
                          >
                            <WalletCards className="w-4 h-4" />
                          </Link>
                        )}
                        {!isArchived && (
                          <Link
                            href={`/employees/${e.id}/edit`}
                            title="Редактировать"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </Link>
                        )}
                        {!isProtected && !isArchived && (
                          <button
                            type="button"
                            onClick={() => setDeleteEmployee(e)}
                            title="Архивировать или удалить"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-rose-600 hover:bg-rose-50 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        {isArchived && (
                          <button
                            type="button"
                            onClick={() => handleUnarchive(e)}
                            title="Восстановить из архива"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50 transition-colors"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                        {isProtected && (
                          <span
                            title="Защищённая запись — удалить нельзя"
                            className="inline-flex h-8 w-8 items-center justify-center text-gray-300"
                          >
                            <Lock className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div className="px-5 py-12 text-center">
                      <UserCog className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <div className="text-[14px] font-semibold text-gray-700">
                        Никого не найдено
                      </div>
                      <div className="text-[12px] text-gray-500 mt-1">
                        Попробуйте сменить фильтр или очистить поиск
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <EmployeeDeleteModal
        open={!!deleteEmployee}
        onOpenChange={(o) => !o && setDeleteEmployee(null)}
        employee={deleteEmployee}
        onChange={() => setDeleteEmployee(null)}
      />
    </div>
  );
}
