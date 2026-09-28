import { endOfMonth, isWithinInterval, parse, startOfMonth } from 'date-fns';
import type { EmployeeTransaction, EmployeeTransactionType } from '@/types';
import type { TelegramFinanceSummary } from '@/types/telegram-bot';
import { getEmployeeById, getEmployeeTransactions, getEmployeesData, getSalarySchemesData, getViolationsData, getWashEventsData } from '@/lib/data';
import { generateSalaryReport } from './salary-calculator';
import { ServiceError } from './service-error';

function parseMonth(month: string): { start: Date; end: Date } {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new ServiceError('Некорректный месяц. Ожидается формат YYYY-MM.', 400);
  }

  const parsed = parse(`${month}-01`, 'yyyy-MM-dd', new Date());
  return {
    start: startOfMonth(parsed),
    end: endOfMonth(parsed),
  };
}

function sumTransactionsByType(transactions: EmployeeTransaction[], type: EmployeeTransactionType): number {
  return transactions.filter((t) => t.type === type).reduce((sum, t) => sum + t.amount, 0);
}

export async function getEmployeeFinanceSummary(employeeId: string, month: string): Promise<TelegramFinanceSummary> {
  const employee = await getEmployeeById(employeeId);
  if (!employee) {
    throw new ServiceError('Сотрудник не найден', 404);
  }

  const { start, end } = parseMonth(month);
  const [allWashEvents, allSchemes, allTransactions, allEmployees, allViolations] = await Promise.all([
    getWashEventsData(),
    getSalarySchemesData(),
    getEmployeeTransactions(employeeId),
    getEmployeesData(),
    getViolationsData(),
  ]);

  const employeeWashes = allWashEvents.filter(
    (event) =>
      event.employeeIds.includes(employeeId) &&
      isWithinInterval(new Date(event.timestamp), { start, end })
  );

  // 🔥 ФИКС 2026-09-28: раньше без allEmployees и violations. Без полного списка
  // сотрудников калькулятор не знает напарников — делитель мойки = 1, и мойщик
  // в паре видел в Telegram двойной заработок; штрафы не вычитались вовсе.
  // Теперь как в /salary-report.
  const monthViolations = allViolations.filter(
    (v) => v.employeeId === employeeId && v.date && isWithinInterval(new Date(v.date + 'T00:00:00'), { start, end })
  );
  const salaryReport = await generateSalaryReport(employeeWashes, [employee], allSchemes, monthViolations, allEmployees);
  const totalEarned = salaryReport[0]?.totalEarnings ?? 0;
  const totalPenalties = salaryReport[0]?.totalPenalties ?? 0;

  const filteredTransactions = allTransactions.filter((t) =>
    isWithinInterval(new Date(t.date), { start, end })
  );

  const payments = sumTransactionsByType(filteredTransactions, 'payment');
  const bonuses = sumTransactionsByType(filteredTransactions, 'bonus');
  const loans = sumTransactionsByType(filteredTransactions, 'loan');
  const purchases = sumTransactionsByType(filteredTransactions, 'purchase');
  // Канистра «в счёт ЗП» — такое же удержание, как покупка (раньше выпадала из баланса)
  const salaryDeductions = sumTransactionsByType(filteredTransactions, 'salary-deduction');
  const debtWriteOffs = sumTransactionsByType(filteredTransactions, 'debt_write_off');
  const loansAndPurchases = loans + purchases + salaryDeductions;
  const balance = totalEarned + bonuses + debtWriteOffs - payments - loansAndPurchases - totalPenalties;

  return {
    employeeId,
    month,
    totals: {
      totalEarned,
      payments,
      bonuses,
      loansAndPurchases,
      debtWriteOffs,
      balance,
    },
    washesCount: employeeWashes.length,
    transactionsCount: filteredTransactions.length,
  };
}

