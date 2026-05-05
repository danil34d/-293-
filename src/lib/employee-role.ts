import type { Employee, EmployeeRole } from '@/types';

// 🔥 ФИКС 2026-05-05: добавлен 'kiosk1' (терминал в боксе с расширенными правами).
// ⚠ АРХИТЕКТУРНАЯ ЗАМЕТКА: kiosk и kiosk1 — это НЕ люди, а МЕТКИ типа устройства
//   (как POS-терминал в магазине). Сейчас они хранятся в таблице Employee как
//   «техническая запись» — но по смыслу это devices, не employees:
//     • НЕ должны попадать в зарплату
//     • НЕ должны быть в графиках смен
//     • НЕ должны фильтроваться как «сотрудники для выбора в команду»
//     • НЕ должны вводить пароль (LAN-trust + device-token)
//   В долгосрочной миграции — вынести в отдельную таблицу Device.
const VALID_ROLES = ['admin', 'employee', 'kiosk', 'kiosk1'] as const;
type ExtendedRole = typeof VALID_ROLES[number];

export function resolveEmployeeRole(employee: Partial<Employee> | null | undefined): EmployeeRole {
  if (!employee) return 'employee';
  if (employee.role && (VALID_ROLES as readonly string[]).includes(employee.role)) {
    return employee.role as EmployeeRole;
  }
  // Обратная совместимость: username 'admin' → admin
  if (employee.username === 'admin') return 'admin';
  // Обратная совместимость: старые роли manager/operator/cashier → employee
  return 'employee';
}

export function isEmployeeAdmin(employee: Partial<Employee> | null | undefined): boolean {
  return resolveEmployeeRole(employee) === 'admin';
}

/** Любой терминал-устройство (kiosk или kiosk1). Это НЕ человек! */
export function isKiosk(employee: Partial<Employee> | null | undefined): boolean {
  const role = resolveEmployeeRole(employee) as string;
  return role === 'kiosk' || role === 'kiosk1';
}

/** Расширенный терминал (kiosk1) — может PATCH-нуть любую мойку (admin для бокса). */
export function isKioskTerminal(employee: Partial<Employee> | null | undefined): boolean {
  return (resolveEmployeeRole(employee) as string) === 'kiosk1';
}

/** Это устройство (терминал), не сотрудник. Использовать для фильтров «убрать из списка людей». */
export function isDevice(employee: Partial<Employee> | null | undefined): boolean {
  return isKiosk(employee);
}

/** Проверяет, имеет ли сотрудник доступ к админ-панели */
export function hasAdminAccess(employee: Partial<Employee> | null | undefined): boolean {
  return resolveEmployeeRole(employee) === 'admin';
}

/** Проверяет, является ли сотрудник менеджером или выше (для управления нарушениями и т.д.) */
export function isManagerOrAbove(employee: Partial<Employee> | null | undefined): boolean {
  return resolveEmployeeRole(employee) === 'admin';
}

/** Проверяет, является ли роль "рабочей" (сотрудник или терминал) */
export function isFieldRole(employee: Partial<Employee> | null | undefined): boolean {
  const role = resolveEmployeeRole(employee) as string;
  return role === 'employee' || role === 'kiosk' || role === 'kiosk1';
}

/** Получить маршрут по умолчанию для роли */
export function getDefaultRouteForRole(employee: Partial<Employee> | null | undefined): string {
  const role = resolveEmployeeRole(employee) as string;
  switch (role) {
    case 'admin': return '/dashboard';
    case 'employee': return '/employee';
    case 'kiosk': return '/kiosk';
    case 'kiosk1': return '/kiosk';   // 🔥 терминал в боксе → kiosk-UI, не employee
    default: return '/employee';
  }
}
