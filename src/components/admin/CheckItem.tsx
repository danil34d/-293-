"use client";

import * as React from "react";
import * as LucideIcons from "lucide-react";

import { cn } from "@/lib/utils";
import { HAZARD_COLORS, type HazardLevel } from "./HazardPill";

export interface CheckItemProps {
  /** Whether the checkbox is checked. */
  checked: boolean;
  /** Called when user toggles the checkbox. */
  onCheck: (checked: boolean) => void;
  /** Optional Lucide icon shown inside the title row. */
  icon?: string;
  /** Hazard color level — affects checked state background and accent. */
  level?: HazardLevel;
  /** Title text (short, bold). */
  title: React.ReactNode;
  /** Optional secondary description. */
  desc?: React.ReactNode;
  /** Disable interaction (still shows state visually). */
  disabled?: boolean;
  /** Optional className for the outer button. */
  className?: string;
}

/**
 * Clickable check-list item — used inside confirmation modals.
 *
 * Each item represents an explicit step user must acknowledge before a
 * dangerous WRITE action. Submit button typically remains disabled until
 * all CheckItems return `checked === true`.
 *
 * Example:
 *   <CheckItem
 *     checked={periodClosed}
 *     onCheck={setPeriodClosed}
 *     icon="lock"
 *     level="safe"
 *     title="Период закрыт"
 *     desc="Правки WashEvent заблокированы"
 *   />
 */
export function CheckItem({
  checked,
  onCheck,
  icon,
  level = "info",
  title,
  desc,
  disabled,
  className,
}: CheckItemProps) {
  const spec = HAZARD_COLORS[level];
  const Icon = icon ? resolveLucideIcon(icon) : null;

  return (
    <button
      type="button"
      disabled={disabled}
      aria-checked={checked}
      role="checkbox"
      onClick={() => !disabled && onCheck(!checked)}
      className={cn(
        "w-full flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-all duration-150",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "active:scale-[0.99]",
        className
      )}
      style={{
        background: checked ? spec.bg : "#ffffff",
        borderColor: checked ? spec.border : "#e2e8f0",
      }}
    >
      {/* Custom checkbox */}
      <div
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors mt-0.5"
        style={{
          background: checked ? spec.text : "#ffffff",
          borderColor: checked ? spec.text : "#cbd5e1",
        }}
        aria-hidden
      >
        {checked && <LucideIcons.Check className="h-3.5 w-3.5 text-white" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-gray-900 flex items-center gap-1.5">
          {Icon && (
            <Icon className="w-3.5 h-3.5" style={{ color: spec.text }} aria-hidden />
          )}
          {title}
        </div>
        {desc && (
          <div className="text-[11px] text-gray-600 mt-0.5 leading-snug">
            {desc}
          </div>
        )}
      </div>
    </button>
  );
}

function resolveLucideIcon(
  name: string
): React.ComponentType<{ className?: string; style?: React.CSSProperties; "aria-hidden"?: boolean }> | null {
  const pascal = name
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
  const lib = LucideIcons as unknown as Record<
    string,
    React.ComponentType<{
      className?: string;
      style?: React.CSSProperties;
      "aria-hidden"?: boolean;
    }>
  >;
  return lib[pascal] ?? null;
}
