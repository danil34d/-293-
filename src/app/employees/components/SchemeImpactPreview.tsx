"use client";

import * as React from "react";
import { AlertOctagon, Calculator, Lock, Loader2 } from "lucide-react";

import type { SalaryScheme } from "@/types";

interface SchemeImpactPreviewProps {
  /**
   * Сотрудник, для которого считается impact. Если задан — компонент сделает
   * fetch /api/employees/[id]/scheme-impact и подставит реальные monthsWorked +
   * monthlyTurnover из WashEvent. Если не задан — будут показаны placeholder
   * значения из props (legacy fallback для NEW employee).
   */
  employeeId?: string;
  oldSchemeId: string | undefined;
  newSchemeId: string;
  schemes: SalaryScheme[];
  /**
   * Сколько месяцев сотрудник работает на старой схеме (placeholder).
   * Используется только если employeeId не передан или fetch ещё в loading.
   */
  monthsWorked?: number;
  /**
   * Средний оборот моек сотрудника в месяц (₽), placeholder.
   */
  monthlyTurnover?: number;
  /**
   * Месяц последней выплаты ("YYYY-MM"). Если есть — показывается warning
   * «возникнет расхождение факт vs выплачено за {month}».
   */
  lastPaidPeriod?: string | null;
}

interface SchemeImpactResponse {
  monthsWorked: number;
  monthlyTurnover: number;
  washEventsCount: number;
  firstWashAt: string | null;
  lastWashAt: string | null;
  currentMonthTurnover: number;
  projection: {
    deltaPercent: number | null;
    monthlyDeltaRub: number | null;
    totalDeltaRub: number | null;
    reason?: string;
  } | null;
}

/**
 * Inline «Превью пересчёта ZP» внутри DangerGate когда админ меняет
 * salarySchemeId. Phase 7: подключён GET /api/employees/[id]/scheme-impact —
 * показывает реальный оборот сотрудника и месяцы работы вместо placeholder.
 */
export function SchemeImpactPreview({
  employeeId,
  oldSchemeId,
  newSchemeId,
  schemes,
  monthsWorked: monthsWorkedProp = 8,
  monthlyTurnover: monthlyTurnoverProp = 78000,
  lastPaidPeriod,
}: SchemeImpactPreviewProps) {
  const oldScheme = schemes.find((s) => s.id === oldSchemeId);
  const newScheme = schemes.find((s) => s.id === newSchemeId);

  // Phase 7: fetch реальные метрики если есть employeeId и есть изменение схемы.
  const [realImpact, setRealImpact] = React.useState<SchemeImpactResponse | null>(null);
  const [isFetching, setIsFetching] = React.useState(false);

  React.useEffect(() => {
    if (!employeeId || oldSchemeId === newSchemeId) {
      setRealImpact(null);
      return;
    }
    let cancelled = false;
    setIsFetching(true);
    fetch(`/api/employees/${employeeId}/scheme-impact?newSchemeId=${encodeURIComponent(newSchemeId)}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: SchemeImpactResponse | null) => {
        if (!cancelled && data) setRealImpact(data);
      })
      .catch(() => { /* silent — UI fallback на placeholder */ })
      .finally(() => { if (!cancelled) setIsFetching(false); });
    return () => { cancelled = true; };
  }, [employeeId, oldSchemeId, newSchemeId]);

  // Если нет изменения — ничего не показываем
  if (oldSchemeId === newSchemeId) return null;

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

  // Реальные значения, если есть; иначе placeholder из props
  const monthsWorked = realImpact?.monthsWorked ?? monthsWorkedProp;
  const monthlyTurnover = realImpact?.monthlyTurnover ?? monthlyTurnoverProp;
  const isRealData = !!realImpact && realImpact.washEventsCount > 0;

  const monthlyImpact = realImpact?.projection?.monthlyDeltaRub
    ?? Math.round((monthlyTurnover * deltaPercent) / 100);
  const totalImpact = realImpact?.projection?.totalDeltaRub
    ?? (monthlyImpact * monthsWorked);
  const willAffectPaidPeriod = !!lastPaidPeriod;

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
          className="text-[11px] uppercase tracking-wider font-bold flex-1"
          style={{ color: accentColor }}
        >
          Превью пересчёта ZP за период работы
        </span>
        {isFetching && <Loader2 className="w-3 h-3 animate-spin text-gray-500" />}
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
        По {isRealData ? "реальному обороту" : "приблизительной оценке"}{" "}
        ~{monthlyTurnover.toLocaleString("ru-RU")} ₽/мес каждый месяц
        даст <b>{monthlyImpact > 0 ? "+" : ""}{monthlyImpact.toLocaleString("ru-RU")} ₽</b> к
        начислению.
        {realImpact && realImpact.washEventsCount > 0 && (
          <span className="text-gray-500">
            {" "}(на основе {realImpact.washEventsCount} моек)
          </span>
        )}
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
        {isRealData ? (
          <>✓ Реальные данные. Расчёт по фактическим мойкам сотрудника. После сохранения создастся запись в EmployeeSalarySchemeHistory.</>
        ) : (
          <>💡 Расчёт приблизительный (placeholder — у сотрудника нет моек или данные ещё грузятся).</>
        )}
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
