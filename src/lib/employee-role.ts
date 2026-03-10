import type { Employee, EmployeeRole } from '@/types';

export function resolveEmployeeRole(employee: Partial<Employee> | null | undefined): EmployeeRole {
  if (!employee) return 'employee';
  if (employee.role === 'admin' || employee.role === 'employee') return employee.role;
  return employee.username === 'admin' ? 'admin' : 'employee';
}

export function isEmployeeAdmin(employee: Partial<Employee> | null | undefined): boolean {
  return resolveEmployeeRole(employee) === 'admin';
}

