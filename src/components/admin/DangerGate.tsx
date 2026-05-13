"use client";

import * as React from "react";
import { Lock, Unlock, Pencil } from "lucide-react";

import { cn } from "@/lib/utils";
import { HazardPill, HAZARD_COLORS, type HazardLevel } from "./HazardPill";

export interface DangerGateProps {
  /** Field label (e.g. "Схема зарплаты"). */
  label: React.ReactNode;
  /** Hazard severity — default critical. */
  level?: HazardLevel;
  /** Whether the field is currently locked. */
  locked: boolean;
  /** Called when user clicks "Изменить" to unlock the field. */
  onUnlock: () => void;
  /** Optional callback to relock the field (e.g. "Отменить изменение"). */
  onRelock?: () => void;
  /** Current value displayed when locked (read-only summary). */
  currentValue: React.ReactNode;
  /** Optional impact description shown under currentValue when locked. */
  impact?: React.ReactNode;
  /** Children rendered when unlocked — the actual editable field(s). */
  children?: React.ReactNode;
  /** Optional className for outer container. */
  className?: string;
}

/**
 * Lock-by-default field for dangerous Employee/Scheme edits.
 *
 * Three states:
 *  1. Locked (default): shows `currentValue` + `impact` + "Изменить" button.
 *  2. Unlocked: shows `children` editor; outer container highlighted with
 *     ring-2 in hazard color; "Отменить изменение" link if `onRelock` is set.
 *  3. Unlocked + dirty: caller renders a live-impact preview inside `children`.
 *
 * Example:
 *   <DangerGate
 *     label="Схема зарплаты"
 *     level="critical"
 *     locked={!schemeUnlocked}
 *     onUnlock={() => setSchemeUnlocked(true)}
 *     onRelock={() => { setSchemeUnlocked(false); setScheme(originalScheme); }}
 *     currentValue="Стандарт 45% · 45% от выручки"
 *     impact="Изменение пересчитает ЗП за 8 мес работы."
 *   >
 *     <Select value={scheme} onValueChange={setScheme}>...</Select>
 *     {schemeChanged && <Impact ...>...</Impact>}
 *   </DangerGate>
 */
export function DangerGate({
  label,
  level = "critical",
  locked,
  onUnlock,
  onRelock,
  currentValue,
  impact,
  children,
  className,
}: DangerGateProps) {
  const spec = HAZARD_COLORS[level];

  return (
    <div
      className={cn(
        "rounded-xl border bg-white transition-all",
        className
      )}
      style={{
        borderColor: locked ? "#e2e8f0" : spec.border,
        boxShadow: locked ? undefined : `0 0 0 2px ${spec.bg}`,
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center gap-2 border-b"
        style={{ borderColor: "#e2e8f0" }}
      >
        {locked ? (
          <Lock className="w-4 h-4" style={{ color: "#94a3b8" }} aria-hidden />
        ) : (
          <Unlock className="w-4 h-4" style={{ color: spec.text }} aria-hidden />
        )}
        <span className="text-[13px] font-semibold text-gray-800">{label}</span>
        <HazardPill level={level} className="ml-auto" />
      </div>

      {/* Body */}
      <div className="p-4">
        {locked ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-medium text-gray-900 truncate">
                {currentValue}
              </div>
              {impact && (
                <div className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                  {impact}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onUnlock}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold whitespace-nowrap transition-colors active:scale-[0.98]"
              style={{ background: spec.bg, color: spec.text }}
            >
              <Pencil className="w-3.5 h-3.5" aria-hidden />
              Изменить
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {children}
            {onRelock && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={onRelock}
                  className="text-[11px] text-gray-500 hover:text-gray-700 underline underline-offset-2"
                >
                  Отменить изменение
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
