"use client";

import React, { useEffect, useState } from 'react';
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
  Bot,
  ListChecks,
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
  /**
   * Phase 54 / по карте handoff: danger-индикатор (красная точка) для пунктов
   * с потенциально опасными действиями. Только визуальный hint — без блокировки.
   */
  danger?: 'critical' | 'warn';
  /**
   * Phase 54: ключ для динамического count badge.
   * Sidebar лениво фетчит /api/sidebar-counts при mount и подставляет число.
   */
  countKey?: 'employees' | 'counterAgents' | 'aggregators' | 'canisters' | 'driverKickbacksPending';
}

/** Phase 54: shape ответа /api/sidebar-counts */
interface SidebarCounts {
  employees?: number;
  counterAgents?: number;
  aggregators?: number;
  canisters?: number;
  driverKickbacksPending?: number;
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
      { href: '/operations', label: 'Центр управления', icon: Clipboard },
      { href: '/wash-log', label: 'Журнал моек', icon: BookCheck },
    ],
  },
  {
    title: 'Управление',
    items: [
      { href: '/employees', label: 'Сотрудники', icon: UserCog, countKey: 'employees' },
      { href: '/schedule', label: 'Смены', icon: CalendarDays },
      { href: '/counter-agents', label: 'Контрагенты', icon: Users, countKey: 'counterAgents' },
      { href: '/aggregators', label: 'Агрегаторы', icon: Briefcase, countKey: 'aggregators' },
      // Phase 54: danger — DELETE → onDelete:SetNull cascade на всех сотрудников схемы
      { href: '/salary-schemes', label: 'Схемы зарплат', icon: Wallet, danger: 'critical' },
      { href: '/expenses', label: 'Расходы', icon: ShoppingCart },
      { href: '/inventory', label: 'Склад', icon: Warehouse, countKey: 'canisters' },
      { href: '/calculator', label: 'Калькулятор мойки', icon: Calculator, adminOnly: true },
      { href: '/price-lists', label: 'Прайс-листы', icon: ListChecks, adminOnly: true },
      // Phase 54: danger — 4-уровневая DANGER zone (cache-clear, inventory-reset, reset-data, db-wipe)
      { href: '/settings', label: 'Прайс-лист "Наличка"', icon: Settings, notificationKey: 'newServices', danger: 'warn' },
    ],
  },
  {
    title: 'Финансы и отчеты',
    items: [
      { href: '/transactions', label: 'Розничные транзакции', icon: DollarSign },
      // Phase 54: danger — закрытие периода ZP блокирует PUT/DELETE wash-events (423 Locked)
      { href: '/salary-report', label: 'Отчет по зарплате', icon: FilePieChart, danger: 'warn' },
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

  // Phase 54 / по карте: lazy-fetch counts при mount для bage отображения.
  // Endpoint /api/sidebar-counts возвращает {employees, counterAgents, aggregators, canisters, driverKickbacksPending}.
  // Не блокирующий, если упадёт — counts не показываются (graceful degradation).
  const [counts, setCounts] = useState<SidebarCounts>({});

  useEffect(() => {
    let cancelled = false;
    fetch('/api/sidebar-counts', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data === 'object') {
          setCounts(data as SidebarCounts);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <div className={cn(
      "zorin-sidebar",
      "flex flex-col h-full",
      isOpen ? "w-[220px]" : "w-[64px]"
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
                  // Phase 54 / по карте: count badge для пунктов с countKey
                  const countValue = item.countKey ? counts[item.countKey] : undefined;
                  const showCountBadge = typeof countValue === 'number' && countValue > 0 && !showNotification;
                  // Phase 54: danger-индикатор (🔴 critical / 🟠 warn) — только если не active
                  const showDanger = item.danger && !isActive(item.href);
                  const dangerColor = item.danger === 'critical' ? '#ef4444' : '#f59e0b';

                  return (
                    <li key={item.href} className="zorin-nav-item">
                      <Link
                        href={item.href}
                        className={cn(
                          "zorin-nav-link",
                          isActive(item.href) && "active"
                        )}
                        title={
                          item.danger === 'critical' ? 'Опасные действия — DELETE с каскадом' :
                          item.danger === 'warn' ? 'Содержит блокирующие действия' :
                          undefined
                        }
                      >
                        <span className="relative inline-flex">
                          <item.icon className="zorin-nav-icon" />
                          {/* Phase 54: danger-точка в правом верхнем углу иконки */}
                          {showDanger && (
                            <span
                              className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ring-1 ring-white"
                              style={{ background: dangerColor }}
                              aria-label={item.danger === 'critical' ? 'опасные действия' : 'требует внимания'}
                            />
                          )}
                        </span>
                        <span className="zorin-nav-text">{item.label}</span>
                        {showNotification && (
                          <span className="zorin-nav-badge">
                            {newServicesCount}
                          </span>
                        )}
                        {showCountBadge && (
                          <span
                            className="zorin-nav-badge"
                            style={{ background: '#e0e7ff', color: '#3730a3' }}
                            title={`${countValue} активных`}
                          >
                            {countValue}
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
