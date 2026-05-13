"use client";

import * as React from "react";
import * as LucideIcons from "lucide-react";

import { cn } from "@/lib/utils";
import { HAZARD_COLORS, type HazardLevel } from "./HazardPill";

export interface SafetyBarItem {
  /** Lucide icon name (e.g. "users", "banknote"). */
  icon?: string;
  /** Short label of the metric. */
  label: React.ReactNode;
  /** Value (bold, primary content). */
  value: React.ReactNode;
}

export interface SafetyBarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Hazard color level — affects background and accents (default: warn). */
  level?: HazardLevel;
  /** 1–6 facts to display in horizontal layout. */
  items: SafetyBarItem[];
}

/**
 * Compact status bar shown at the top of dangerous pages.
 *
 * Instead of a tall red banner, presents 3+ key facts about the entity state
 * in a single horizontal strip. Color signals overall hazard level (warn →
 * safe after critical action is resolved).
 *
 * Example:
 *   <SafetyBar level="warn" items={[
 *     { icon: 'users',    label: 'Сотрудников на схемах', value: '10 из 13' },
 *     { icon: 'banknote', label: 'Последняя выплата ЗП',  value: '30 апр 2026' },
 *     { icon: 'history',  label: 'История смен схем',     value: 'не ведётся' },
 *   ]} />
 */
export function SafetyBar({
  level = "warn",
  items,
  className,
  ...rest
}: SafetyBarProps) {
  const spec = HAZARD_COLORS[level];
  const HeaderIcon = spec.icon;

  return (
    <div
      className={cn(
        "rounded-xl p-4 flex items-start gap-3",
        className
      )}
      style={{
        background: spec.bg,
        border: `1px solid ${spec.border}40`,
      }}
      {...rest}
    >
      <div
        className="rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ width: 36, height: 36, background: "#fff", color: spec.text }}
        aria-hidden
      >
        <HeaderIcon className="w-5 h-5" />
      </div>
      <div
        className={cn(
          "flex-1 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-1 text-[12px]",
          items.length > 3 && "md:grid-cols-4"
        )}
        style={{ color: spec.text }}
      >
        {items.map((it, i) => {
          const Icon = it.icon ? resolveLucideIcon(it.icon) : null;
          return (
            <div key={i} className="flex items-center gap-1.5 min-w-0">
              {Icon && <Icon className="w-3 h-3 opacity-70 shrink-0" aria-hidden />}
              <span className="opacity-80 truncate">{it.label}:</span>
              <span className="font-bold truncate">{it.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function resolveLucideIcon(
  name: string
): React.ComponentType<{ className?: string; "aria-hidden"?: boolean }> | null {
  const pascal = name
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
  const lib = LucideIcons as unknown as Record<
    string,
    React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  >;
  return lib[pascal] ?? null;
}
