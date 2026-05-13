"use client";

import * as React from "react";
import {
  AlertOctagon,
  AlertTriangle,
  Info,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * UX-safety hazard level palette.
 *
 * Used across all admin UI to communicate consequences of an action:
 *  - critical: cascade delete, salary scheme change, role change, AI plan finalize
 *  - warn:     WRITE с эффектами (payment, edit username, refund)
 *  - info:     controlled WRITE (toggle, обычное поле)
 *  - safe:     READ / navigation
 *
 * Палитра согласована с brief'ом дизайнера v1 (admin_safety) — см.
 * `АДМИНКА-РЕДИЗАЙН-V1-ОЦЕНКА.md`.
 */
export type HazardLevel = "critical" | "warn" | "info" | "safe";

export interface HazardSpec {
  /** Foreground / accent text color (badge text + dark accents). */
  text: string;
  /** Light background fill — for pills and SafetyBar tinted areas. */
  bg: string;
  /** Border / focus accent — typically same as `text` or a saturated variant. */
  border: string;
  /** Lucide icon component. */
  icon: LucideIcon;
  /** Default label shown if no `children` passed. */
  label: string;
}

export const HAZARD_COLORS: Record<HazardLevel, HazardSpec> = {
  critical: {
    text: "#b91c1c",
    bg: "#fef2f2",
    border: "#e11d48",
    icon: AlertOctagon,
    label: "КРИТИЧНО",
  },
  warn: {
    text: "#92400e",
    bg: "#fffbeb",
    border: "#f59e0b",
    icon: AlertTriangle,
    label: "ВАЖНО",
  },
  info: {
    text: "#1d4ed8",
    bg: "#eff6ff",
    border: "#3b82f6",
    icon: Info,
    label: "СРЕДНЕ",
  },
  safe: {
    text: "#15803d",
    bg: "#f0fdf4",
    border: "#16a34a",
    icon: ShieldCheck,
    label: "БЕЗОПАСНО",
  },
};

export interface HazardPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Hazard severity — picks color, icon, default label. */
  level: HazardLevel;
  /** Optional custom label (overrides default). */
  children?: React.ReactNode;
  /** Hide the icon (text-only pill). */
  hideIcon?: boolean;
}

/**
 * Compact badge communicating action hazard level.
 *
 * Example:
 *   <HazardPill level="critical" />            // → "КРИТИЧНО" with octagon
 *   <HazardPill level="warn">ВЫПЛАТА</HazardPill>
 */
export const HazardPill = React.forwardRef<HTMLSpanElement, HazardPillProps>(
  ({ level, children, hideIcon, className, ...rest }, ref) => {
    const spec = HAZARD_COLORS[level];
    const Icon = spec.icon;
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap",
          className
        )}
        style={{ background: spec.bg, color: spec.text }}
        {...rest}
      >
        {!hideIcon && <Icon className="w-3 h-3" aria-hidden />}
        {children ?? spec.label}
      </span>
    );
  }
);
HazardPill.displayName = "HazardPill";
