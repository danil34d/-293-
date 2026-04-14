import type { Employee, EmployeeRole } from '@/types';

const VALID_ROLES: EmployeeRole[] = ['admin', 'operator', 'cashier', 'manager', 'employee'];

export function resolveEmployeeRole(employee: Partial<Employee> | null | undefined): EmployeeRole {
  if (!employee) return 'employee';
  if (employee.role && VALID_ROLES.includes(employee.role)) return employee.role;
  // Обратная совместимость: username 'admin' → admin
  if (employee.username === 'admin') return 'admin';
  return 'employee';
}

export function isEmployeeAdmin(employee: Partial<Employee> | null | undefined): boolean {
  return resolveEmployeeRole(employee) === 'admin';
}

export function isEmployeeOperator(employee: Partial<Employee> | null | undefined): boolean {
  return resolveEmployeeRole(employee) === 'operator';
}

export function isEmployeeCashier(employee: Partial<Employee> | null | undefined): boolean {
  return resolveEmployeeRole(employee) === 'cashier';
}

export function isEmployeeManager(employee: Partial<Employee> | null | undefined): boolean {
  return resolveEmployeeRole(employee) === 'manager';
}

/** Проверяет, имеет ли сотрудник доступ к админ-панели (admin или manager) */
export function hasAdminAccess(employee: Partial<Employee> | null | undefined): boolean {
  const role = resolveEmployeeRole(employee);
  return role === 'admin' || role === 'manager';
}

/** Проверяет, является ли роль "рабочей" (оператор, кассир, обычный сотрудник) */
export function isFieldRole(employee: Partial<Employee> | null | undefined): boolean {
  const role = resolveEmployeeRole(employee);
  return ['operator', 'cashier', 'employee'].includes(role);
}

/** Получить маршрут по умолчанию для роли */
export function getDefaultRouteForRole(employee: Partial<Employee> | null | undefined): string {
  const role = resolveEmployeeRole(employee);
  switch (role) {
    case 'admin': return '/dashboard';
    case 'manager': return '/dashboard';
    case 'operator': return '/employee/operator';
    case 'cashier': return '/employee/cashier';
    case 'employee': return '/employee/workstation';
    default: return '/employee/workstation';
  }
}
