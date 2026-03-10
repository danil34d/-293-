
"use client";
import type { ReactNode } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/contexts/AuthContext';
import { AppLayout } from './AppLayout';

export function AppProviders({ children, newServicesCount }: { children: ReactNode, newServicesCount?: number }) {
  return (
    <AuthProvider>
      <AppLayout newServicesCount={newServicesCount}>
         {children}
      </AppLayout>
      <Toaster />
    </AuthProvider>
  );
}
