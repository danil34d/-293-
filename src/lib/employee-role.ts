import type { Employee, EmployeeRole } from '@/types';

const VALID_ROLES: EmployeeRole[] = ['admin', 'employee', 'kiosk'];

export function resolveEmployeeRole(employee: Partial<Employee> | null | undefined): EmployeeRole {
  if (!employee) return 'employee';
  if (employee.role && VALID_ROLES.includes(employee.role)) return employee.role;
  // Обратная совместимость: username 'admin' → admin
  if (employee.username === 'admin') return 'admin';
  // Обратная совместимость: старые роли manager/operator/cashier → employee
  return 'employee';
}

export function isEmployeeAdmin(employee: Partial<Employee> | null | undefined): boolean {
  return resolveEmployeeRole(employee) === 'admin';
}

export function isKiosk(employee: Partial<Employee> | null | undefined): boolean {
  return resolveEmployeeRole(employee) === 'kiosk';
}

/** Проверяет, имеет ли сотрудник доступ к админ-панели */
export function hasAdminAccess(employee: Partial<Employee> | null | undefined): boolean {
  return resolveEmployeeRole(employee) === 'admin';
}

/** Проверяет, является ли роль "рабочей" (сотрудник или киоск) */
export function isFieldRole(employee: Partial<Employee> | null | undefined): boolean {
  const role = resolveEmployeeRole(employee);
  return role === 'employee' || role === 'kiosk';
}

/** Получить маршрут по умолчанию для роли */
export function getDefaultRouteForRole(employee: Partial<Employee> | null | undefined): string {
  const role = resolveEmployeeRole(employee);
  switch (role) {
    case 'admin': return '/dashboard';
    case 'employee': return '/employee/workstation';
    case 'kiosk': return '/employee/workstation';
    default: return '/employee/workstation';
  }
}
