"use client";

import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Mobile-friendly bottom-sheet.
 *
 * Wrapper над shadcn Sheet (Radix Dialog).
 * - Поднимается снизу с rounded-top-3xl
 * - Имеет swipe-handle вверху
 * - Backdrop полупрозрачный с тапом для закрытия
 * - Кастомный закрывающий ✕ в правом верхнем углу хедера
 */

interface MobileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  /** Sub-title под заголовком */
  description?: string;
  children: React.ReactNode;
  /** Позволяет прятать handle (e.g. для confirm-диалогов) */
  hideHandle?: boolean;
  /** Скрыть x-кнопку (если внутри свои) */
  hideClose?: boolean;
  /** Дополнительные классы для контента */
  className?: string;
}

export function MobileSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  hideHandle,
  hideClose,
  className,
}: MobileSheetProps) {
  return (
    <SheetPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <SheetPrimitive.Portal>
        <SheetPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-200",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-200",
          )}
        />
        <SheetPrimitive.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50",
            "mx-auto max-w-[420px] w-full",
            "rounded-t-3xl bg-white shadow-2xl",
            "max-h-[86vh] overflow-y-auto",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=open]:duration-300",
            "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=closed]:duration-200",
            "scrollbar-thin",
            className,
          )}
        >
          {!hideHandle && (
            <div
              className="mx-auto mt-2 mb-1 h-1 w-10 rounded-full bg-slate-300"
              aria-hidden
            />
          )}
          {(title || !hideClose) && (
            <div className="flex items-start justify-between gap-2 px-4 pt-2 pb-3">
              {title && (
                <div className="flex-1">
                  <SheetPrimitive.Title className="text-xl font-bold text-gray-900">
                    {title}
                  </SheetPrimitive.Title>
                  {description && (
                    <SheetPrimitive.Description className="text-xs text-gray-500 mt-0.5">
                      {description}
                    </SheetPrimitive.Description>
                  )}
                </div>
              )}
              {!hideClose && (
                <SheetPrimitive.Close
                  aria-label="Закрыть"
                  className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 transition"
                >
                  <X className="h-5 w-5" />
                </SheetPrimitive.Close>
              )}
            </div>
          )}
          <div className="px-4 pb-5">{children}</div>
        </SheetPrimitive.Content>
      </SheetPrimitive.Portal>
    </SheetPrimitive.Root>
  );
}

export const MobileSheetClose = SheetPrimitive.Close;
