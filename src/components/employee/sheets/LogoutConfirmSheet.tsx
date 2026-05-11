"use client";

import { LogOut } from "lucide-react";
import { MobileSheet, MobileSheetClose } from "./MobileSheet";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  username?: string;
}

export function LogoutConfirmSheet({
  open,
  onOpenChange,
  onConfirm,
  username,
}: Props) {
  return (
    <MobileSheet
      open={open}
      onOpenChange={onOpenChange}
      hideHandle
      hideClose
    >
      <div className="pt-1">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-rose-100 to-red-100">
          <LogOut className="h-7 w-7 text-red-600" />
        </div>
        <h2 className="mb-1 text-center text-xl font-bold text-gray-900">
          Выйти из аккаунта?
        </h2>
        <p className="mb-4 text-center text-sm text-gray-600">
          {username ? (
            <>
              Чтобы войти заново — потребуется логин{" "}
              <code className="rounded bg-gray-100 px-1 font-mono">{username}</code>
              {" "}и пароль
            </>
          ) : (
            "Чтобы войти заново — потребуется логин и пароль"
          )}
        </p>
        <div className="space-y-2">
          <button
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500 px-5 py-3.5 font-bold text-white shadow-md shadow-rose-500/30 active:scale-[0.99] transition hover:bg-rose-600"
          >
            <LogOut className="h-4 w-4" />
            <span>Да, выйти</span>
          </button>
          <MobileSheetClose
            asChild
          >
            <button className="w-full rounded-xl bg-gray-100 px-5 py-3 font-semibold text-gray-700 hover:bg-gray-200 active:scale-[0.99] transition">
              Отмена
            </button>
          </MobileSheetClose>
        </div>
      </div>
    </MobileSheet>
  );
}
