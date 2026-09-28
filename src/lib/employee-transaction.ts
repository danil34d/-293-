import type { EmployeeTransactionType } from '@/types';

/**
 * Знак операции сотрудника в его балансе: +1 — работодатель должен больше
 * (премия, списание долга), −1 — меньше (выплата, аванс, покупка, удержание).
 * Суммы в EmployeeTransaction.amount всегда положительные, знак берётся отсюда.
 *
 * Единственный источник правды: Record требует ключ для каждого типа, поэтому
 * новый тип без знака не скомпилируется.
 *
 * 🔥 ФИКС 2026-09-28: знак был выписан в шести местах по-разному, и тип
 * 'salary-deduction' (канистра «в счёт ЗП», Phase 52) знали не все. Первое же
 * такое удержание роняло /salary-report на TypeError, а карточка сотрудника
 * у админа и сводка в Telegram его не вычитали.
 */
export const TRANSACTION_SIGN: Record<EmployeeTransactionType, 1 | -1> = {
  payment: -1,
  loan: -1,
  purchase: -1,
  'salary-deduction': -1,
  bonus: 1,
  debt_write_off: 1,
};

/** Неизвестный тип из старых данных считаем удержанием, как и раньше делали страницы сотрудника. */
export function transactionSign(type: string): 1 | -1 {
  return (TRANSACTION_SIGN as Record<string, 1 | -1>)[type] ?? -1;
}
