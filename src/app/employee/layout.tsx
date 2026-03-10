'use client';
import type { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LogOut, WashingMachine, WalletCards, Clipboard } from 'lucide-react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

export default function EmployeeLayout({ children }: { children: ReactNode }) {
  const { logout, employee } = useAuth();
  const pathname = usePathname();

  if (pathname === '/login') {
    return <>{children}</>;
  }
  
  const isWorkstation = pathname.endsWith('/workstation');
  const isFinance = pathname.endsWith('/finance');

  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background px-4 md:px-6">
        <div className="flex items-center gap-2">
            <WashingMachine className="h-7 w-7 text-primary"/>
            <h1 className="text-lg font-semibold">{isWorkstation ? "Рабочая станция" : "Мои финансы"}</h1>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
           {employee && <span className="text-sm text-muted-foreground hidden sm:inline">Сотрудник: {employee.fullName}</span>}

           {!isWorkstation && (
            <Button variant="outline" size="sm" asChild>
                <Link href="/employee/workstation">
                    <Clipboard className="md:mr-2 h-4 w-4" />
                    <span className="hidden md:inline">Рабочая станция</span>
                </Link>
            </Button>
           )}

           {!isFinance && (
            <Button variant="default" size="sm" asChild>
              <Link href="/employee/finance">
                <WalletCards className="md:mr-2 h-4 w-4" />
                <span className="hidden md:inline">Мои финансы</span>
              </Link>
            </Button>
           )}
           
          <Button variant="outline" size="sm" onClick={logout}>
            <LogOut className="md:mr-2 h-4 w-4" />
            <span className="hidden md:inline">Выход</span>
          </Button>
        </div>
      </header>
      <main className="flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
