"use client";

import * as React from "react";
import { AlertOctagon, Calculator, Lock } from "lucide-react";

import type { SalaryScheme } from "@/types";

interface SchemeImpactPreviewProps {
  oldSchemeId: string | undefined;
  newSchemeId: string;
  schemes: SalaryScheme[];
  /**
   * Сколько месяцев сотрудник работает на старой схеме.
   * Используется для оценки накопленного эффекта (deltaPercent × months × turnover).
   */
  monthsWorked?: number;
  /**
   * Средний оборот моек сотрудника в месяц (₽).
   * Если не передан — используется placeholder.
   */
  monthlyTurnover?: number;
  /**
   * Месяц последней выплаты ("YYYY-MM"). Если есть — показывается warning
   * «возникнет расхождение факт vs выплачено за {month}».
   */
  lastPaidPeriod?: string | null;
}

/**
 * Inline «Превью пересчёта ZP» внутри DangerGate когда админ меняет
 * salarySchemeId. Показывает в рублях сколько изменится ZP за весь период.
 *
 * Работает только для type='percentage' схем — для rate-схем дельта не считается
 * напрямую (зависит от конкретных услуг).
 *
 * Mock-данные (monthsWorked, monthlyTurnover) пока берутся из props или placeholder.
 * В реальной prod-версии можно подключить GET /api/employees/[id]/scheme-impact
 * который посчитает реальный оборот за период работы.
 *
 * См. дизайн-образец: prototype/employee-edit.jsx (Phase 4D-1).
 */
export function SchemeImpactPreview({
  oldSchemeId,
  newSchemeId,
  schemes,
  monthsWorked = 8,
  monthlyTurnover = 78000,
  lastPaidPeriod,
}: SchemeImpactPreviewProps) {
  const oldScheme = schemes.find((s) => s.id === oldSchemeId);
  const newScheme = schemes.find((s) => s.id === newSchemeId);

  // Если нет изменения — ничего не показываем
  if (oldSchemeId === newSchemeId) return null;
  // Если новая схема "unassigned" — она = снятие схемы (totalImpact = -100% earnings)
  // Если старая schemе была не percentage — не считаем (нет % для дельты)
  const oldPercent = oldScheme?.type === "percentage" ? oldScheme.percentage ?? 0 : null;
  const newPercent = newScheme?.type === "percentage" ? newScheme.percentage ?? 0 : null;

  // Если одна из схем rate-based — не считаем дельту, просто показываем warning
  if (oldPercent === null || newPercent === null) {
    return (
      <div className="rounded-xl p-3 mt-3 bg-amber-50 border border-amber-200">
        <div className="flex items-center gap-2 mb-1">
          <AlertOctagon className="w-4 h-4 text-amber-700" />
          <span className="text-[11px] uppercase tracking-wider font-bold text-amber-800">
            Смена типа схемы
          </span>
        </div>
        <p className="text-[12px] text-amber-900 leading-snug">
          Меняется тип схемы (percentage ↔ rate). Точная дельта расчёта зависит от услуг
          в прошлых мойках и не может быть оценена в этом превью.
        </p>
      </div>
    );
  }

  const deltaPercent = newPercent - oldPercent;
  if (deltaPercent === 0) return null;

  const monthlyImpact = Math.round((monthlyTurnover * deltaPercent) / 100);
  const totalImpact = monthlyImpact * monthsWorked;
  const willAffectPaidPeriod = !!lastPaidPeriod;

  // Цвет: critical если затрагивает выплаченный период, иначе warn если delta != 0
  const isCritical = willAffectPaidPeriod;
  const bg = isCritical ? "#fef2f2" : "#fffbeb";
  const border = isCritical ? "#fecaca" : "#fde68a";
  const accentColor = isCritical ? "#b91c1c" : "#92400e";

  return (
    <div
      className="rounded-xl p-4 mt-3"
      style={{ background: bg, border: `1px solid ${border}` }}
    >
      <div className="flex items-center gap-2 mb-3">
        {isCritical ? (
          <AlertOctagon className="w-4 h-4" style={{ color: accentColor }} />
        ) : (
          <Calculator className="w-4 h-4" style={{ color: accentColor }} />
        )}
        <span
          className="text-[11px] uppercase tracking-wider font-bold"
          style={{ color: accentColor }}
        >
          Превью пересчёта ZP за период работы
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <ImpactCell
          label="Дельта"
          value={`${deltaPercent > 0 ? "+" : ""}${deltaPercent}%`}
          color={deltaPercent > 0 ? "#b91c1c" : "#15803d"}
        />
        <ImpactCell
          label="Период"
          value={`${monthsWorked} мес`}
          color="#0f172a"
        />
        <ImpactCell
          label="Сдвиг ZP"
          value={`${totalImpact > 0 ? "+" : ""}${totalImpact.toLocaleString("ru-RU")} ₽`}
          color={deltaPercent > 0 ? "#b91c1c" : "#15803d"}
        />
      </div>

      <div className="mt-3 text-[11px] text-gray-700 leading-snug">
        По оценке ~{monthlyTurnover.toLocaleString("ru-RU")} ₽/мес обороту каждый месяц
        даст <b>{monthlyImpact > 0 ? "+" : ""}{monthlyImpact.toLocaleString("ru-RU")} ₽</b> к
        начислению.
      </div>

      {willAffectPaidPeriod && (
        <div
          className="mt-3 pt-3 border-t flex items-start gap-2"
          style={{ borderColor: border }}
        >
          <Lock className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="text-[12px] text-rose-900 leading-snug">
            <b>За уже выплаченный период {lastPaidPeriod}</b> возникнет расхождение между
            выплаченной и пересчитанной ZP. Рекомендуется задавать новые значения{" "}
            <b>с первого числа следующего месяца</b>.
          </div>
        </div>
      )}

      <div className="mt-2 text-[10px] text-gray-500 leading-snug">
        💡 Расчёт приблизительный (оборот {monthlyTurnover.toLocaleString("ru-RU")} ₽/мес и{" "}
        {monthsWorked} мес работы — placeholder). Реальный пересчёт произойдёт после
        сохранения через EmployeeSalarySchemeHistory.
      </div>
    </div>
  );
}

function ImpactCell({
  label,
  value,
  color = "#0f172a",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-gray-500 font-bold">
        {label}
      </div>
      <div
        className="text-[18px] font-extrabold mt-0.5 tabular-nums"
        style={{ color }}
      >
        {value}
      </div>
    </div>
  );
}
