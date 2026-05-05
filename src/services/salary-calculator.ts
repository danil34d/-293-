
'use server';

import type { WashEvent, Employee, SalaryScheme, SalaryRate, SalaryReportData, SalaryBreakdownItem, Violation, SalaryPenaltyItem } from '@/types';
import { isKiosk } from '@/lib/employee-role';

// Helper to determine the source type from a wash event
function getWashSourceType(washEvent: WashEvent): 'retail' | 'aggregator' | 'counterAgent' | null {
  switch (washEvent.paymentMethod) {
    case 'cash':
    case 'card':
    case 'transfer':
      return 'retail';
    case 'aggregator':
      return 'aggregator';
    case 'counterAgentContract':
      return 'counterAgent';
    default:
      return null;
  }
}


/**
 * Formats a number as Russian rubles string
 */
function formatRubles(amount: number): string {
  return amount.toLocaleString('ru-RU') + ' руб.';
}

/**
 * Calculates the salary for a single employee for a specific wash event.
 * It determines the employee's share of the work and applies their specific salary scheme to that share.
 * @returns The calculated salary for this employee for this wash, formula description, and a list of any services for which no rate was found.
 */
function calculateIndividualShare(
  employeeScheme: SalaryScheme,
  washEvent: WashEvent,
  numEmployeesOnWash: number
): { earnings: number; unpaidServices: string[]; formula: string } {
  const result: { earnings: number; unpaidServices: string[]; formula: string } = { earnings: 0, unpaidServices: [], formula: '' };

  if (numEmployeesOnWash <= 0) return result;

  if (employeeScheme.type === 'percentage') {
    // For percentage-based schemes:
    const totalBaseAmount = washEvent.netAmount !== undefined ? washEvent.netAmount : washEvent.totalAmount;
    const totalAmountAfterDeduction = totalBaseAmount - (employeeScheme.fixedDeduction ?? 0);
    const percentage = employeeScheme.percentage ?? 0;
    const totalSalaryPool = totalAmountAfterDeduction * (percentage / 100);
    const earning = totalSalaryPool / numEmployeesOnWash;

    result.earnings = earning > 0 ? Math.round(earning * 100) / 100 : 0;

    // Build formula string
    let formulaParts: string[] = [];
    if (employeeScheme.fixedDeduction && employeeScheme.fixedDeduction > 0) {
      formulaParts.push(`(${formatRubles(totalBaseAmount)} - ${formatRubles(employeeScheme.fixedDeduction)})`);
    } else {
      formulaParts.push(formatRubles(totalBaseAmount));
    }
    formulaParts.push(`× ${percentage}%`);
    if (numEmployeesOnWash > 1) {
      formulaParts.push(`/ ${numEmployeesOnWash} чел.`);
    }
    result.formula = formulaParts.join(' ');

    return result;
  }

  if (employeeScheme.type === 'rate') {
    // For rate-based schemes:
    const schemeSource = employeeScheme.rateSource;

    // 1. If a source is defined, check if the scheme is applicable to this specific wash.
    if (schemeSource) {
      const washSourceType = getWashSourceType(washEvent);

      if (schemeSource.type !== washSourceType) return result;

      const washSourceId = washSourceType === 'retail' ? 'retail' : washEvent.sourceId;
      if (schemeSource.id !== washSourceId) return result;

      // Additional check for aggregator price list name
      if (washSourceType === 'aggregator' && schemeSource.priceListName && washEvent.priceListName !== schemeSource.priceListName) {
        return result;
      }
    }
    // If no source is defined (schemeSource is undefined), the scheme is universal and applies to any wash.


    // 2. Calculate the total rate for all services performed, applying per-service deductions.
    const allServices = [washEvent.services.main, ...washEvent.services.additional];
    let totalRateForWash = 0;
    const rateMap = new Map<string, SalaryRate>(employeeScheme.rates?.map(r => [r.serviceName, r]) || []);
    const rateDetails: string[] = [];

    for (const service of allServices) {
      if (!service?.serviceName) continue;
      const rateItem = rateMap.get(service.serviceName);
      if (rateItem && rateItem.rate > 0) {
        const earningForService = (rateItem.rate ?? 0) - (rateItem.deduction ?? 0);
        if (earningForService > 0) {
          totalRateForWash += earningForService;
          if (rateItem.deduction && rateItem.deduction > 0) {
            rateDetails.push(`${rateItem.rate} - ${rateItem.deduction}`);
          } else {
            rateDetails.push(`${rateItem.rate}`);
          }
        }
      } else if (!rateItem || rateItem.rate <= 0) {
        // Avoid duplicates in unpaidServices array
        if (!result.unpaidServices.includes(service.serviceName)) {
          result.unpaidServices.push(service.serviceName);
        }
      }
    }

    // 3. The employee's earning is their share of the total calculated rate.
    const earning = totalRateForWash / numEmployeesOnWash;
    result.earnings = earning > 0 ? Math.round(earning * 100) / 100 : 0;

    // Build formula string for rate-based
    if (rateDetails.length > 0) {
      let formula = `(${rateDetails.join(' + ')}) руб.`;
      if (numEmployeesOnWash > 1) {
        formula += ` / ${numEmployeesOnWash} чел.`;
      }
      result.formula = formula;
    }

    return result;
  }

  return result;
}


export async function generateSalaryReport(
  washEvents: WashEvent[],
  employees: Employee[],
  salarySchemes: SalaryScheme[],
  violations?: Violation[]
): Promise<SalaryReportData[]> {
  const schemeMap = new Map(salarySchemes.map(s => [s.id, s]));
  const salaryData: Record<string, SalaryReportData> = {};

  // Initialize data for all employees
  for (const emp of employees) {
    salaryData[emp.id] = {
      employeeId: emp.id,
      employeeName: emp.fullName,
      totalEarnings: 0,
      totalPenalties: 0,
      penalties: [],
      breakdown: [],
    };
  }

  for (const event of washEvents) {
    if (!event.employeeIds || event.employeeIds.length === 0) continue;

    // 🔥 ФИКС 2026-05-05: исключаем терминалы (kiosk/kiosk1) из расчёта зарплаты.
    // Терминал — это устройство (телефон на стене), не сотрудник. Раньше если в
    // employeeIds попадал emp_kiosk — мойка делилась на N+1 чел., и устройство
    // получало свою долю (1800 × 45% / 3, где 1 из 3 — терминал = ошибка).
    const realEmployeeIds = event.employeeIds.filter((id) => {
      const emp = employees.find((e) => e.id === id);
      return emp && !isKiosk(emp);
    });
    if (realEmployeeIds.length === 0) continue;

    const numEmployeesOnWash = realEmployeeIds.length;
    const employeesOnWash = realEmployeeIds.map(id => employees.find(e => e.id === id)).filter(Boolean) as Employee[];
    if (employeesOnWash.length === 0) continue;

    for (const employee of employeesOnWash) {
        if (!employee.salarySchemeId) continue;
        const scheme = schemeMap.get(employee.salarySchemeId);
        if (!scheme) continue;

        const { earnings, unpaidServices, formula } = calculateIndividualShare(scheme, event, numEmployeesOnWash);

        // Add to breakdown if there are earnings OR if there are unpaid services to report
        if (earnings > 0 || unpaidServices.length > 0) {
            salaryData[employee.id].totalEarnings += earnings;
            salaryData[employee.id].breakdown.push({
                washEventId: event.id,
                timestamp: event.timestamp,
                vehicleNumber: event.vehicleNumber,
                earnings: earnings,
                unpaidServices: unpaidServices,
                formula: formula,
            });
        }
    }
  }
  
  // Apply violations/penalties
  if (violations && violations.length > 0) {
    for (const v of violations) {
      if (!v.penaltyAmount || v.penaltyAmount <= 0) continue;
      const data = salaryData[v.employeeId];
      if (!data) continue;
      data.totalPenalties += v.penaltyAmount;
      data.penalties.push({
        violationId: v.id,
        date: v.date,
        type: v.type,
        description: v.description || '',
        amount: v.penaltyAmount,
      });
    }
  }

  // Return sorted by total earnings descending
  return Object.values(salaryData).sort((a, b) => b.totalEarnings - a.totalEarnings);
}
