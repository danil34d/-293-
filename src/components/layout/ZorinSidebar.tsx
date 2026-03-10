"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Home,
  Users,
  UserCog,
  Briefcase,
  Wallet,
  ShoppingCart,
  Warehouse,
  Settings,
  DollarSign,
  FilePieChart,
  LineChart,
  FileText,
  BrainCircuit,
  BookCheck,
  Clipboard,
  LogOut,
  WashingMachine,
  CalendarDays,
  Calculator,
  Bot
} from 'lucide-react';
import type { Employee } from '@/types';
import { isEmployeeAdmin } from '@/lib/employee-role';

interface ZorinSidebarProps {
  onLogout: () => void;
  newServicesCount: number;
  isOpen?: boolean;
  onToggle?: () => void;
  employee: Employee | null;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  notificationKey?: 'newServices';
  adminOnly?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: 'Главное',
    items: [
      { href: '/dashboard', label: 'Дашборд', icon: Home },
      { href: '/employee/workstation', label: 'Рабочая станция', icon: Clipboard },
      { href: '/wash-log', label: 'Журнал моек', icon: BookCheck },
    ],
  },
  {
    title: 'Управление',
    items: [
      { href: '/employees', label: 'Сотрудники', icon: UserCog },
      { href: '/schedule', label: 'Смены', icon: CalendarDays },
      { href: '/counter-agents', label: 'Контрагенты', icon: Users },
      { href: '/aggregators', label: 'Агрегаторы', icon: Briefcase },
      { href: '/salary-schemes', label: 'Схемы зарплат', icon: Wallet },
      { href: '/expenses', label: 'Расходы', icon: ShoppingCart },
      { href: '/inventory', label: 'Склад', icon: Warehouse },
      { href: '/calculator', label: 'Калькулятор мойки', icon: Calculator, adminOnly: true },
      { href: '/settings', label: 'Прайс-лист "Наличка"', icon: Settings, notificationKey: 'newServices' },
    ],
  },
  {
    title: 'Финансы и отчеты',
    items: [
      { href: '/transactions', label: 'Розничные транзакции', icon: DollarSign },
      { href: '/salary-report', label: 'Отчет по зарплате', icon: FilePieChart },
      { href: '/client-analytics', label: 'Анализ клиентов', icon: LineChart },
      { href: '/invoices', label: 'Счета', icon: FileText },
      { href: '/reports', label: 'AI-Аналитика', icon: BrainCircuit },
      { href: '/ai-assistant', label: 'AI Помощник', icon: Bot },
    ],
  },
];

export function ZorinSidebar({ onLogout, newServicesCount, isOpen = true, onToggle, employee }: ZorinSidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    return pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
  };

  const isAdmin = isEmployeeAdmin(employee);

  return (
    <div className={cn(
      "zorin-sidebar",
      "flex flex-col h-full",
      isOpen ? "w-[280px]" : "w-[80px]"
    )} data-state={isOpen ? "open" : "collapsed"}>

      {/* Sidebar Header */}
      <div className="zorin-sidebar-header">
        <Link href="/dashboard" className="zorin-logo-link">
          <WashingMachine className="zorin-logo-icon" />
          <span className="zorin-logo-text">АвтомойкаПро</span>
        </Link>

        <div className="flex items-center gap-1">
          {/* Settings gear icon */}
          <Link
            href="/settings"
            title="Настройки"
            className={cn(
              "p-2 rounded-md transition-colors",
              "hover:bg-gray-100 text-gray-500 hover:text-gray-800"
            )}
            aria-label="Настройки"
          >
            <Settings className="w-4 h-4" />
          </Link>

          {/* Mobile Toggle Button */}
          <button
            onClick={onToggle}
            className="lg:hidden p-2 rounded-md hover:bg-gray-100 transition-colors"
            aria-label="Toggle sidebar"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 12h18M3 6h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Sidebar Navigation */}
      <nav className="zorin-sidebar-nav">
        {navGroups.map((group) => {
          const filteredItems = group.items.filter(item => !item.adminOnly || isAdmin);
          if (filteredItems.length === 0) return null;

          return (
            <div key={group.title} className="zorin-nav-group">
              <h3 className="zorin-nav-group-title">{group.title}</h3>
              <ul className="space-y-1">
                {filteredItems.map((item) => {
                  const showNotification = item.notificationKey === 'newServices' && newServicesCount > 0 && !isActive(item.href);

                  return (
                    <li key={item.href} className="zorin-nav-item">
                      <Link
                        href={item.href}
                        className={cn(
                          "zorin-nav-link",
                          isActive(item.href) && "active"
                        )}
                      >
                        <item.icon className="zorin-nav-icon" />
                        <span className="zorin-nav-text">{item.label}</span>
                        {showNotification && (
                          <span className="zorin-nav-badge">
                            {newServicesCount}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* Sidebar Footer */}
      <div className="zorin-sidebar-footer">
        <button onClick={onLogout} className="zorin-logout-link">
          <LogOut className="zorin-nav-icon" />
          <span className="zorin-nav-text">Выйти</span>
        </button>
      </div>
    </div>
  );
}
