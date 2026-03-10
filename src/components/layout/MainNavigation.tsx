
"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroupLabel,
} from '@/components/ui/sidebar';
import { Home, Users, Briefcase, DollarSign, BrainCircuit, Settings, WashingMachine, Clipboard, UserCog, Wallet, BookCheck, FilePieChart, LogOut, ShoppingCart, FileText, LineChart, Warehouse, Bell } from 'lucide-react';

const navGroups = [
  {
    title: 'Главное',
    items: [
      { href: '/dashboard', label: 'Панель управления', icon: Home },
      { href: '/employee/workstation', label: 'Рабочая станция', icon: Clipboard },
      { href: '/wash-log', label: 'Журнал моек', icon: BookCheck },
    ],
  },
  {
    title: 'Управление',
    items: [
      { href: '/employees', label: 'Сотрудники', icon: UserCog },
      { href: '/counter-agents', label: 'Контрагенты', icon: Users },
      { href: '/aggregators', label: 'Агрегаторы', icon: Briefcase },
      { href: '/salary-schemes', label: 'Схемы зарплат', icon: Wallet },
      { href: '/expenses', label: 'Расходы', icon: ShoppingCart },
      { href: '/inventory', label: 'Склад', icon: Warehouse },
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
    ],
  },
];

interface MainNavigationProps {
  onLogout: () => void;
  newServicesCount: number;
}

export function MainNavigation({ onLogout, newServicesCount }: MainNavigationProps) {
  const pathname = usePathname();

  return (
    <>
      <SidebarMenu className="flex-1">
        {navGroups.map((group) => (
          (group.items.length > 0 && 
          <React.Fragment key={group.title}>
            <SidebarMenuItem className="pointer-events-none mt-2">
              <SidebarGroupLabel className="px-2 pb-1 text-xs uppercase tracking-wider text-sidebar-foreground/70">
                {group.title}
              </SidebarGroupLabel>
            </SidebarMenuItem>
            {group.items.map((item) => {
              const showNotification = item.notificationKey === 'newServices' && newServicesCount > 0 && pathname !== item.href;
              return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))}
                  tooltip={{ children: item.label, side: 'right', align: 'center' }}
                >
                  <Link href={item.href}>
                    <item.icon />
                    <span>{item.label}</span>
                    {showNotification && (
                       <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs font-bold">
                        {newServicesCount}
                       </span>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )})}
          </React.Fragment>
          )
        ))}
      </SidebarMenu>
      
      <SidebarMenu className="mt-auto p-2">
        <SidebarMenuItem>
            <SidebarMenuButton
              onClick={onLogout}
              className="bg-destructive/20 text-destructive-foreground/80 hover:bg-destructive/40 hover:text-destructive-foreground"
              tooltip={{ children: "Выход", side: 'right', align: 'center' }}
            >
              <LogOut />
              <span>Выход</span>
            </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </>
  );
}
