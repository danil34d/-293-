
"use client";
import type { ReactNode } from 'react';
import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Settings, Menu } from 'lucide-react';
import { ZorinSidebar } from './ZorinSidebar';
import { useAuth } from '@/contexts/AuthContext';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { isEmployeeAdmin } from '@/lib/employee-role';

export function AppLayout({ children, newServicesCount = 0 }: { children: ReactNode, newServicesCount?: number }) {
  const { isAuthenticated, employee, isLoading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  // Handle mobile detection
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth < 768) {
        setIsSidebarOpen(false);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const sidebarIsEffectivelyOpen = isSidebarOpen;
  
  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // If we are on the login page, render only the children (the login form itself)
  if (pathname.startsWith('/login')) {
      return <>{children}</>;
  }

  // If we are not on login and not authenticated, we're in a redirect state.
  // Show a loader to prevent layout flicker.
  if (!isAuthenticated) {
     return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // For regular employees on their dedicated layout
  const isEmployeeOnlyPage = pathname.startsWith('/employee') && !isEmployeeAdmin(employee);
  if (isEmployeeOnlyPage) {
    return <>{children}</>;
  }

  // Redirect non-admin employees to their workstation if they try to access manager pages
  const isManagerPage = !pathname.startsWith('/employee') && !pathname.startsWith('/login');
  if (isManagerPage && !isEmployeeAdmin(employee)) {
    router.push('/employee/workstation');
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // For the main manager layout
  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* ZORIN Styled Sidebar - Fixed Position */}
      <div className={cn(
        "fixed left-0 top-0 h-full z-50 transition-all duration-300 print:hidden",
        isMobile ? (isSidebarOpen ? "translate-x-0" : "-translate-x-full") : "translate-x-0"
      )}>
        <ZorinSidebar
          onLogout={logout}
          newServicesCount={newServicesCount}
          isOpen={sidebarIsEffectivelyOpen}
          onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
          employee={employee}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col zorin-main-content transition-all duration-300 print:!ml-0"
           style={{ marginLeft: isMobile ? 0 : (sidebarIsEffectivelyOpen ? '280px' : '80px') }}>

        {/* Top Bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-white/90 px-4 backdrop-blur-sm md:px-6 shadow-sm print:hidden">
          <div className="flex items-center gap-4">
            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="lg:hidden p-2 rounded-md hover:bg-gray-100 transition-colors"
              aria-label="Toggle sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Desktop Menu Toggle */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="hidden lg:flex p-2 rounded-md hover:bg-gray-100 transition-colors"
              aria-label="Toggle sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>

          <div className="flex items-center gap-4">
            {employee && (
              <span className="text-sm text-gray-600 hidden sm:inline">
                {employee.fullName}
              </span>
            )}

            {/* Settings Button */}
            <Link href="/settings" aria-label="Настройки">
              <Button variant="ghost" size="icon" aria-label="Настройки" asChild>
                <span><Settings className="h-5 w-5" /></span>
              </Button>
            </Link>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-50">
          {children}
        </main>
      </div>

      {/* Mobile Sidebar Overlay */}
      {isMobile && isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden print:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
}
