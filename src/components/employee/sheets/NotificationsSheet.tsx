"use client";

import { useRouter } from "next/navigation";
import { Repeat2, CheckCircle2, BellOff } from "lucide-react";
import { MobileSheet } from "./MobileSheet";

export interface NotificationItem {
  id: string;
  kind: "swap-incoming" | "swap-accepted" | "request-approved" | "request-rejected" | "info";
  title: string;
  subtitle?: string;
  ago: string; // "2 мин назад" / "Вчера"
  /** Куда редиректит при тапе (URL) */
  href?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: NotificationItem[];
  onMarkAllRead: () => void;
}

const KIND_STYLES = {
  "swap-incoming": {
    bg: "from-amber-50 to-orange-100 ring-orange-200 hover:from-amber-100",
    iconBg: "from-amber-400 to-orange-500 shadow-orange-500/30",
    iconColor: "text-white",
    Icon: Repeat2,
    label: "text-orange-700/80",
  },
  "swap-accepted": {
    bg: "from-emerald-50 to-teal-100 ring-emerald-200 hover:from-emerald-100",
    iconBg: "from-emerald-400 to-teal-500 shadow-emerald-500/30",
    iconColor: "text-white",
    Icon: CheckCircle2,
    label: "text-emerald-700/80",
  },
  "request-approved": {
    bg: "from-sky-50 to-blue-100 ring-sky-200 hover:from-sky-100",
    iconBg: "from-sky-400 to-blue-500 shadow-sky-500/30",
    iconColor: "text-white",
    Icon: CheckCircle2,
    label: "text-sky-700/80",
  },
  "request-rejected": {
    bg: "from-rose-50 to-red-100 ring-rose-200 hover:from-rose-100",
    iconBg: "from-rose-400 to-red-500 shadow-rose-500/30",
    iconColor: "text-white",
    Icon: BellOff,
    label: "text-rose-700/80",
  },
  info: {
    bg: "from-gray-50 to-gray-100 ring-gray-200 hover:from-gray-100",
    iconBg: "from-gray-400 to-gray-500 shadow-gray-500/30",
    iconColor: "text-white",
    Icon: BellOff,
    label: "text-gray-700/80",
  },
} as const;

export function NotificationsSheet({
  open,
  onOpenChange,
  items,
  onMarkAllRead,
}: Props) {
  const router = useRouter();

  return (
    <MobileSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Уведомления"
      description={items.length === 0 ? "Все прочитано" : `${items.length} непрочитанных`}
    >
      {items.length === 0 ? (
        <div className="py-12 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
            <BellOff className="h-7 w-7 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500">Здесь будут показаны новые запросы и обмены сменами.</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {items.map((item) => {
              const style = KIND_STYLES[item.kind];
              const Icon = style.Icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onOpenChange(false);
                    if (item.href) router.push(item.href);
                  }}
                  className={`flex w-full items-start gap-3 rounded-2xl bg-gradient-to-br ${style.bg} p-3 text-left ring-1 transition active:scale-[0.99]`}
                >
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${style.iconBg} shadow-md`}>
                    <Icon className={`h-4 w-4 ${style.iconColor}`} strokeWidth={2.5} />
                  </div>
                  <div className="flex-1">
                    <div className={`text-xs font-bold uppercase ${style.label}`}>{item.ago}</div>
                    <div className="mt-0.5 text-sm font-semibold text-gray-900">{item.title}</div>
                    {item.subtitle && (
                      <div className="text-[11px] text-gray-700">{item.subtitle}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <button
            onClick={() => {
              onMarkAllRead();
              onOpenChange(false);
            }}
            className="mt-4 w-full rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-200 transition"
          >
            Отметить все прочитанными
          </button>
        </>
      )}
    </MobileSheet>
  );
}
