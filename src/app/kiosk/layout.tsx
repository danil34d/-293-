'use client';
import type { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, Monitor } from 'lucide-react';

export default function KioskLayout({ children }: { children: ReactNode }) {
  const { logout, employee } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-gray-100">
      {/* Kiosk header */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-white px-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Monitor className="h-5 w-5 text-blue-600" />
          <h1 className="text-base font-bold text-gray-800">Терминал — Мойка 1</h1>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-red-600 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span>Выход</span>
        </button>
      </header>

      {/* Main content */}
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
