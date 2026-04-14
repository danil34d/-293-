'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { Employee } from '@/types';
import { usePathname, useRouter } from 'next/navigation';
import { getDefaultRouteForRole } from '@/lib/employee-role';
import { isLoginPath, isPublicAppPath } from '@/lib/public-routes';

interface AuthContextType {
  isAuthenticated: boolean;
  employee: Employee | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<Employee>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isPublicAppPath(pathname)) {
      setIsLoading(false);
      return;
    }

    if (employee) {
      setIsLoading(false);
      return;
    }

    let isCancelled = false;

    const checkUser = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/auth/me', { method: 'GET', cache: 'no-store' });
        if (!response.ok) {
          if (!isCancelled) {
            setEmployee(null);
          }
          return;
        }

        const data = await response.json();
        if (!isCancelled) {
          setEmployee(data.employee ?? null);
        }
      } catch (error) {
        console.error('Failed to check auth session', error);
        if (!isCancelled) {
          setEmployee(null);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    checkUser();
    return () => {
      isCancelled = true;
    };
  }, [employee, pathname]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const isAuthPage = isLoginPath(pathname);
    const isPublicPath = isPublicAppPath(pathname);

    if (employee && isAuthPage) {
      router.push(getDefaultRouteForRole(employee));
    } else if (!employee && !isPublicPath) {
      router.push('/login');
    }
  }, [employee, isLoading, pathname, router]);

  const login = async (username: string, password: string): Promise<Employee> => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Ошибка входа');
    }

    const { employee: loggedInEmployee } = await response.json();
    setEmployee(loggedInEmployee);
    return loggedInEmployee;
  };

  const logout = async () => {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) {
        console.error('Logout API returned', response.status);
      }
    } catch (error) {
      console.error('Logout failed', error);
    }
    // Всегда очищаем состояние на клиенте
    setEmployee(null);
    router.push('/login');
  };

  const isAuthenticated = !!employee;

  return (
    <AuthContext.Provider value={{ isAuthenticated, employee, isLoading, login, logout }}>
      {isLoading ? (
        <div className='flex h-screen w-full items-center justify-center' />
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
