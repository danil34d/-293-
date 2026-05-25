"use client";

import { cn } from "@/lib/utils";

const GRADIENTS = [
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-violet-500 to-purple-600",
  "from-sky-500 to-blue-600",
  "from-rose-500 to-pink-600",
  "from-cyan-500 to-teal-600",
  "from-fuchsia-500 to-purple-600",
];

const SHADOWS = [
  "shadow-blue-500/30",
  "shadow-emerald-500/30",
  "shadow-amber-500/30",
  "shadow-violet-500/30",
  "shadow-sky-500/30",
  "shadow-rose-500/30",
  "shadow-cyan-500/30",
  "shadow-fuchsia-500/30",
];

const SIZES = {
  xs: "h-7 w-7 text-[11px]",
  sm: "h-9 w-9 text-xs",
  md: "h-12 w-12 text-sm",
  lg: "h-16 w-16 text-base",
};

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

interface Props {
  /** Стабильный ID для гарантированно одинакового цвета */
  seed: string;
  /** Полное имя для извлечения инициалов */
  fullName: string;
  size?: keyof typeof SIZES;
  /** Белое кольцо вокруг (для контраста на цветном фоне) */
  ring?: boolean;
  className?: string;
}

export function EmployeeAvatar({
  seed,
  fullName,
  size = "sm",
  ring = false,
  className,
}: Props) {
  const idx = hashString(seed) % GRADIENTS.length;
  const gradient = GRADIENTS[idx];
  const shadow = SHADOWS[idx];

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full font-bold text-white shadow-md bg-gradient-to-br",
        gradient,
        shadow,
        SIZES[size],
        ring && "ring-2 ring-white",
        className,
      )}
      aria-label={`Аватар: ${fullName}`}
    >
      {initials(fullName)}
    </div>
  );
}
