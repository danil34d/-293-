"use client";

import * as React from "react";
import * as LucideIcons from "lucide-react";

import { cn } from "@/lib/utils";
import { HAZARD_COLORS, type HazardLevel } from "./HazardPill";

export interface ImpactProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Lucide icon name (kebab-case → PascalCase resolution). */
  icon: string;
  /** Hazard color level (default: info). */
  level?: HazardLevel;
  children: React.ReactNode;
}

/**
 * Cardinal "what changes" bullet — used inside DangerGate live-preview and
 * confirmation modals to surface concrete consequences.
 *
 * Example:
 *   <Impact icon="banknote" level="critical">
 *     ЗП пересчитается за 8 мес: −93 600 ₽
 *   </Impact>
 */
export function Impact({
  icon,
  level = "info",
  children,
  className,
  ...rest
}: ImpactProps) {
  const spec = HAZARD_COLORS[level];

  // Resolve lucide icon by kebab/PascalCase name → component
  const Icon = resolveLucideIcon(icon);

  return (
    <div className={cn("flex items-start gap-2.5", className)} {...rest}>
      <div
        className="rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{
          width: 22,
          height: 22,
          background: spec.bg,
          color: spec.text,
        }}
      >
        {Icon && <Icon className="w-3 h-3" aria-hidden />}
      </div>
      <div className="text-[13px] text-gray-700 leading-snug flex-1">
        {children}
      </div>
    </div>
  );
}

/** Convert "alert-triangle" → AlertTriangle and look it up in lucide-react. */
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
  return lib[pascal] ?? lib["Info"] ?? null;
}
