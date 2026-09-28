import type { Employee } from '@/types';

/**
 * Сотрудник без пароля — для всего, что уходит в браузер.
 * В поле password лежит scrypt-хеш, а у старых учёток — пароль открытым текстом.
 */
export function withoutPassword(employee: Employee): Omit<Employee, 'password'> {
  const { password: _password, ...safe } = employee;
  return safe;
}
