"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  Edit,
  Globe,
  ListTodo,
  Percent,
  PlusCircle,
  Trash2,
  Wallet,
  Users,
  Lock,
} from "lucide-react";

import type { SalaryScheme, Aggregator, CounterAgent, Employee } from "@/types";
import { HazardPill, SafetyBar, Impact } from "@/components/admin";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface SchemesTableProps {
  schemes: SalaryScheme[];
  employees: Employee[];
  aggregators: Aggregator[];
  counterAgents: CounterAgent[];
}

/**
 * UX-safety redesign /salary-schemes (Phase 4C1):
 *  - SafetyBar сверху со счётчиками (схем, сотрудников, в архиве)
 *  - Колонка «На схеме» — сколько Employee.salarySchemeId === scheme.id
 *  - Trash кнопка открывает модал с 2 ветками:
 *     * employees > 0 → ТОЛЬКО Archive (без кнопки Delete) — закрывает АРХ-НАХОДКИ #1
 *     * employees === 0 → Confirm с вводом названия (если есть history) или просто confirm
 *  - Архивные схемы в свернутом `<details>` внизу с кнопкой «Восстановить»
 *
 * См. план: C:\Users\S\.claude\plans\tender-drifting-journal.md (Phase 4C1).
 */
export function SchemesTable({
  schemes,
  employees,
  aggregators,
  counterAgents,
}: SchemesTableProps) {
  const router = useRouter();
  const { toast } = useToast();

  // Counts employees per scheme (для колонки «На схеме»)
  const employeesBySchemeId = React.useMemo(() => {
    const map = new Map<string, Employee[]>();
    for (const emp of employees) {
      if (emp.salarySchemeId) {
        const list = map.get(emp.salarySchemeId) ?? [];
        list.push(emp);
        map.set(emp.salarySchemeId, list);
      }
    }
    return map;
  }, [employees]);

  // Split schemes by archived flag
  const activeSchemes = schemes.filter((s) => !s.archived);
  const archivedSchemes = schemes.filter((s) => s.archived);

  const totalActiveOnSchemes = employees.filter((e) => {
    if (!e.salarySchemeId) return false;
    const scheme = schemes.find((s) => s.id === e.salarySchemeId);
    return scheme && !scheme.archived;
  }).length;
  const totalActiveEmployees = employees.filter((e) => e.role !== "kiosk" && e.role !== "admin").length;

  // Modal state
  const [schemeToArchive, setSchemeToArchive] = React.useState<SalaryScheme | null>(null);

  const getRateSourceName = (scheme: SalaryScheme): string => {
    const source = scheme.rateSource;
    if (!source) return "Все прайс-листы (Универсальная)";
    if (source.type === "retail") return "Розничный прайс-лист (Наличка)";
    if (source.type === "counterAgent") {
      const agent = counterAgents.find((a) => a.id === source.id);
      return agent?.name || "Не найден";
    }
    if (source.type === "aggregator") {
      const aggregator = aggregators.find((a) => a.id === source.id);
      if (!aggregator) return "Не найден";
      return `${aggregator.name} (${source.priceListName || "Активный"})`;
    }
    return "Неизвестный источник";
  };

  const handleArchive = async (scheme: SalaryScheme) => {
    try {
      const response = await fetch(`/api/salary-schemes/${scheme.id}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${response.status}`);
      }
      toast({
        title: "Схема архивирована",
        description: `«${scheme.name}» больше не показывается в списках. Восстановить можно в разделе «В архиве».`,
      });
      setSchemeToArchive(null);
      router.refresh();
    } catch (error: any) {
      toast({
        title: "Не удалось архивировать",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleUnarchive = async (scheme: SalaryScheme) => {
    // Reuse PUT to set archived=false (упрощение — без отдельного unarchive endpoint в UI).
    try {
      const response = await fetch(`/api/salary-schemes/${scheme.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...scheme, archived: false, archivedAt: null }),
      });
      if (!response.ok) throw new Error("Не удалось восстановить");
      toast({
        title: "Схема восстановлена",
        description: `«${scheme.name}» снова доступна.`,
      });
      router.refresh();
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleHardDelete = async (scheme: SalaryScheme) => {
    try {
      const response = await fetch(`/api/salary-schemes/${scheme.id}`, {
        method: "DELETE",
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 409) {
        // Backend pre-check — на этой странице UI уже не пропустит, но защита остаётся.
        toast({
          title: "Удаление заблокировано",
          description: `${body.error}. Используйте архивацию.`,
          variant: "destructive",
        });
        return;
      }
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      toast({
        title: "Схема удалена",
        description: `«${scheme.name}» удалена без возможности восстановления.`,
      });
      setSchemeToArchive(null);
      router.refresh();
    } catch (error: any) {
      toast({
        title: "Ошибка удаления",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider font-bold text-rose-600 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Критичная сущность
          </div>
          <h1 className="text-[26px] font-bold text-gray-900 mt-1 leading-tight">
            Схемы зарплат
          </h1>
          <p className="text-[13px] text-gray-500 mt-1">
            Базовые правила расчёта ЗП. Изменения влияют на всех сотрудников схемы.
          </p>
        </div>
        <Link
          href="/salary-schemes/new"
          className="inline-flex items-center gap-2 rounded-lg bg-[#0088CC] hover:bg-[#0077B5] text-white px-4 py-2.5 text-[13px] font-semibold transition-colors"
        >
          <PlusCircle className="w-4 h-4" /> Создать схему
        </Link>
      </div>

      {/* SafetyBar */}
      <SafetyBar
        level="warn"
        items={[
          {
            icon: "layers",
            label: "Активных схем",
            value: `${activeSchemes.length} из ${schemes.length}`,
          },
          {
            icon: "users",
            label: "Сотрудников на схемах",
            value: `${totalActiveOnSchemes} из ${totalActiveEmployees}`,
          },
          {
            icon: "archive",
            label: "В архиве",
            value: archivedSchemes.length > 0 ? `${archivedSchemes.length}` : "—",
          },
        ]}
      />

      {/* Active schemes table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
          <Wallet className="w-4 h-4 text-blue-600" />
          <span className="text-[13px] font-bold text-gray-700">Активные схемы</span>
          <span className="ml-2 text-[11px] text-gray-500">
            {activeSchemes.length} {activeSchemes.length === 1 ? "схема" : "схем"}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-slate-50/60 border-b border-gray-100 text-left text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                <th className="px-5 py-2.5">Название</th>
                <th className="px-3 py-2.5">Тип</th>
                <th className="px-3 py-2.5">Значение</th>
                <th className="px-3 py-2.5">На схеме</th>
                <th className="px-3 py-2.5 text-right w-[120px]">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {activeSchemes.map((scheme) => {
                const empCount = employeesBySchemeId.get(scheme.id)?.length ?? 0;
                return (
                  <tr key={scheme.id} className="hover:bg-slate-50/40 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-semibold text-gray-900">{scheme.name}</div>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                        style={{
                          background: scheme.type === "percentage" ? "#ecfeff" : "#fdf4ff",
                          color: scheme.type === "percentage" ? "#0e7490" : "#86198f",
                        }}
                      >
                        {scheme.type === "percentage" ? (
                          <>
                            <Percent className="w-3 h-3" /> Процент
                          </>
                        ) : (
                          <>
                            <ListTodo className="w-3 h-3" /> Ставка
                          </>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-gray-700">
                      {scheme.type === "percentage" ? (
                        <div className="text-[13px]">
                          <b>{scheme.percentage}%</b> от выручки
                          {scheme.fixedDeduction ? (
                            <span className="text-gray-500">
                              {" "}
                              (вычет <b>{scheme.fixedDeduction} ₽</b>)
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-[12px]">
                          {!scheme.rateSource && <Globe className="w-3.5 h-3.5 text-gray-400" />}
                          <span>
                            {scheme.rates?.length || 0} услуг по ставке из{" "}
                            <b>«{getRateSourceName(scheme)}»</b>
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {empCount > 0 ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-blue-600" />
                          <span className="font-bold text-blue-700">{empCount}</span>
                          <span className="text-[11px] text-gray-500">
                            {empCount === 1 ? "чел." : "чел."}
                          </span>
                        </span>
                      ) : (
                        <span className="text-[11px] text-gray-400">никого</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="inline-flex items-center justify-end gap-1">
                        <Link
                          href={`/salary-schemes/${scheme.id}/edit`}
                          aria-label={`Редактировать ${scheme.name}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Редактировать схему"
                        >
                          <Edit className="w-4 h-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => setSchemeToArchive(scheme)}
                          aria-label={`Архивировать или удалить ${scheme.name}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-rose-600 hover:bg-rose-50 transition-colors"
                          title={
                            empCount > 0
                              ? `Архивировать (на схеме ${empCount} чел.)`
                              : "Архивировать или удалить"
                          }
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {activeSchemes.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="px-5 py-12 text-center">
                      <Wallet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <div className="text-[14px] font-semibold text-gray-700">
                        Активных схем нет
                      </div>
                      <div className="text-[12px] text-gray-500 mt-1">
                        Создайте новую схему или восстановите из архива
                      </div>
                      <Link
                        href="/salary-schemes/new"
                        className="inline-flex items-center gap-2 mt-4 rounded-lg bg-[#0088CC] hover:bg-[#0077B5] text-white px-3 py-2 text-[13px] font-semibold"
                      >
                        <PlusCircle className="w-4 h-4" /> Создать схему
                      </Link>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Archived section */}
      {archivedSchemes.length > 0 && (
        <details className="bg-white rounded-2xl border border-gray-200 px-5 py-4">
          <summary className="cursor-pointer text-[13px] font-semibold text-gray-700 flex items-center gap-2 list-none">
            <Archive className="w-4 h-4 text-gray-500" />
            <span>В архиве ({archivedSchemes.length})</span>
            <span className="text-[11px] text-gray-500 font-normal ml-2">
              Не используются в новых расчётах. История ZP сохраняется.
            </span>
          </summary>
          <div className="mt-3 space-y-1.5">
            {archivedSchemes.map((scheme) => {
              const empCount = employeesBySchemeId.get(scheme.id)?.length ?? 0;
              return (
                <div
                  key={scheme.id}
                  className="flex items-center justify-between gap-2 text-[12px] py-2 px-3 rounded-lg bg-gray-50"
                >
                  <span className="flex items-center gap-2 text-gray-700">
                    <Archive className="w-3.5 h-3.5 text-gray-400" />
                    <b>{scheme.name}</b>
                    {empCount > 0 && (
                      <span className="text-gray-500">· {empCount} сотр. на схеме</span>
                    )}
                    {scheme.archivedAt && (
                      <span className="text-gray-400 text-[11px]">
                        · с {new Date(scheme.archivedAt).toLocaleDateString("ru-RU")}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleUnarchive(scheme)}
                    className="text-[11px] text-blue-600 hover:text-blue-700 font-semibold"
                  >
                    Восстановить
                  </button>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* Archive / Delete modal */}
      <ArchiveOrDeleteSchemeModal
        scheme={schemeToArchive}
        employeesOnScheme={
          schemeToArchive ? (employeesBySchemeId.get(schemeToArchive.id) ?? []) : []
        }
        onClose={() => setSchemeToArchive(null)}
        onArchive={() => schemeToArchive && handleArchive(schemeToArchive)}
        onHardDelete={() => schemeToArchive && handleHardDelete(schemeToArchive)}
      />
    </div>
  );
}

/* ─────────────── Archive-or-Delete Modal ──────────────────── */

interface ArchiveOrDeleteSchemeModalProps {
  scheme: SalaryScheme | null;
  employeesOnScheme: Employee[];
  onClose: () => void;
  onArchive: () => void;
  onHardDelete: () => void;
}

function ArchiveOrDeleteSchemeModal({
  scheme,
  employeesOnScheme,
  onClose,
  onArchive,
  onHardDelete,
}: ArchiveOrDeleteSchemeModalProps) {
  const [confirmName, setConfirmName] = React.useState("");

  React.useEffect(() => {
    if (!scheme) setConfirmName("");
  }, [scheme]);

  if (!scheme) return null;

  const hasEmployees = employeesOnScheme.length > 0;
  const canHardDelete = !hasEmployees && confirmName === scheme.name;

  return (
    <Dialog
      open={!!scheme}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div
              className="rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                width: 40,
                height: 40,
                background: hasEmployees ? "#fef2f2" : "#fffbeb",
                color: hasEmployees ? "#b91c1c" : "#92400e",
              }}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <HazardPill level={hasEmployees ? "critical" : "warn"} />
              <DialogTitle className="text-[18px] font-bold text-gray-900 leading-tight mt-1.5">
                {hasEmployees
                  ? `На схеме ${employeesOnScheme.length} ${
                      employeesOnScheme.length === 1 ? "сотрудник" : "сотрудников"
                    }`
                  : `Удалить «${scheme.name}»?`}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Архивация или удаление схемы зарплат
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {hasEmployees ? (
          <div className="space-y-4">
            <p className="text-[14px] text-gray-700 leading-relaxed">
              Удаление сейчас обнулит расчёт ЗП у{" "}
              <b>{employeesOnScheme.length} сотрудников</b> — их прошлые выплаты останутся,
              но новые мойки будут считаться без схемы (0 ₽).
            </p>

            <Impact icon="x" level="critical">
              <b>Не рекомендуется удалять.</b> Сначала переведите этих сотрудников на другую
              схему через «Сотрудники → Edit».
            </Impact>

            <div>
              <div className="text-[11px] uppercase tracking-wider font-bold text-gray-500 mb-2">
                Останутся без схемы
              </div>
              <div className="flex flex-wrap gap-1.5">
                {employeesOnScheme.map((emp) => (
                  <span
                    key={emp.id}
                    className="rounded-full bg-rose-50 text-rose-700 px-2.5 py-1 text-[11px] font-medium border border-rose-200"
                  >
                    {emp.fullName}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
                  <Archive className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-bold text-emerald-900">
                    Безопасная альтернатива: архивировать
                  </div>
                  <div className="text-[12px] text-emerald-800 mt-1 leading-snug">
                    Сотрудники остаются с привязкой, история сохраняется. Схема больше не
                    показывается в выпадающих списках при создании новых сотрудников. В
                    любой момент можно восстановить.
                  </div>
                  <Button
                    type="button"
                    onClick={onArchive}
                    className="mt-3 bg-emerald-600 hover:bg-emerald-700 text-white"
                    size="sm"
                  >
                    <Archive className="w-3.5 h-3.5 mr-1.5" /> Архивировать
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Impact icon="trash-2" level="warn">
              На схеме нет сотрудников, удаление безопасно.
            </Impact>
            <Impact icon="archive" level="info">
              Альтернатива — архивация. Восстановить можно в любой момент, удаление
              необратимо.
            </Impact>

            <div>
              <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">
                Для подтверждения введите название схемы:
              </label>
              <div className="text-[11px] text-gray-500 mb-1.5">
                <code className="bg-gray-100 px-1.5 py-0.5 rounded">{scheme.name}</code>
              </div>
              <Input
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={scheme.name}
                className="text-[13px]"
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {hasEmployees ? "Закрыть" : "Отмена"}
          </Button>
          {!hasEmployees && (
            <>
              <Button
                type="button"
                onClick={onArchive}
                variant="outline"
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              >
                <Archive className="w-3.5 h-3.5 mr-1.5" /> Архивировать
              </Button>
              <Button
                type="button"
                onClick={onHardDelete}
                disabled={!canHardDelete}
                className="bg-rose-600 hover:bg-rose-700 text-white disabled:bg-rose-200"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Удалить навсегда
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
