// Data adapter switcher: JSON files or PostgreSQL
// Controlled by DATA_SOURCE env variable ('json' | 'postgres')
// Default: 'json' (backward compatible)

import type {
  WashEvent, Aggregator, CounterAgent, Employee, SalaryScheme,
  EmployeeTransaction, ClientTransaction, RetailPriceConfig,
  Expense, Shift, ShiftSwapRequest, ShiftAssignmentRequest,
  EmployeeDayStatusEntry, SchedulePlan, Inventory, StockMovement,
  EmployeeChemicalCanister, ActiveSession, Violation,
} from '@/types';

const usePostgres = process.env.DATA_SOURCE === 'postgres';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const adapter = usePostgres
  ? require('./pg-adapter')
  : require('@/lib/data-loader');

// ─── Read functions ─────────────────────────────────────────

export const getWashEventsData: () => Promise<WashEvent[]> = adapter.getWashEventsData;
export const getWashEventById: (id: string) => Promise<WashEvent | null> = adapter.getWashEventById;
export const getAggregatorsData: () => Promise<Aggregator[]> = adapter.getAggregatorsData;
export const getAggregatorById: (id: string) => Promise<Aggregator | null> = adapter.getAggregatorById;
export const getCounterAgentsData: () => Promise<CounterAgent[]> = adapter.getCounterAgentsData;
export const getActiveCounterAgentsData: () => Promise<CounterAgent[]> = adapter.getActiveCounterAgentsData;
export const getCounterAgentById: (id: string) => Promise<CounterAgent | null> = adapter.getCounterAgentById;
export const getEmployeesData: () => Promise<Employee[]> = adapter.getEmployeesData;
export const getEmployeeById: (id: string) => Promise<Employee | null> = adapter.getEmployeeById;
export const getSalarySchemesData: () => Promise<SalaryScheme[]> = adapter.getSalarySchemesData;
export const getSalarySchemeById: (id: string) => Promise<SalaryScheme | null> = adapter.getSalarySchemeById;
export const getExpensesData: () => Promise<Expense[]> = adapter.getExpensesData;
export const getExpenseById: (id: string) => Promise<Expense | null> = adapter.getExpenseById;
export const getAllEmployeeTransactions: () => Promise<EmployeeTransaction[]> = adapter.getAllEmployeeTransactions;
export const getEmployeeTransactions: (employeeId: string) => Promise<EmployeeTransaction[]> = adapter.getEmployeeTransactions;
export const getClientTransactions: (clientId: string) => Promise<ClientTransaction[]> = adapter.getClientTransactions;
export const getRetailPriceConfig: () => Promise<RetailPriceConfig> = adapter.getRetailPriceConfig;
export const getInventory: () => Promise<Inventory> = adapter.getInventory;
export const getActiveSession: () => Promise<ActiveSession> = adapter.getActiveSession;
export const saveActiveSession: (session: ActiveSession) => Promise<void> = adapter.saveActiveSession;
export const getStockMovementsData: () => Promise<StockMovement[]> = adapter.getStockMovementsData;
export const getStockMovementsByMaterial: (materialId: string) => Promise<StockMovement[]> = adapter.getStockMovementsByMaterial;
export const getEmployeeCanistersData: () => Promise<EmployeeChemicalCanister[]> = adapter.getEmployeeCanistersData;
export const getEmployeeCanistersByEmployee: (employeeId: string) => Promise<EmployeeChemicalCanister[]> = adapter.getEmployeeCanistersByEmployee;
export const getActiveCanisterForEmployee: (employeeId: string) => Promise<EmployeeChemicalCanister | null> = adapter.getActiveCanisterForEmployee;
export const getShiftsData: () => Promise<Shift[]> = adapter.getShiftsData;
export const getShiftById: (id: string) => Promise<Shift | null> = adapter.getShiftById;
export const getShiftSwapRequestsData: () => Promise<ShiftSwapRequest[]> = adapter.getShiftSwapRequestsData;
export const getShiftSwapRequestById: (id: string) => Promise<ShiftSwapRequest | null> = adapter.getShiftSwapRequestById;
export const getShiftAssignmentRequestsData: () => Promise<ShiftAssignmentRequest[]> = adapter.getShiftAssignmentRequestsData;
export const getEmployeeDayStatusesData: () => Promise<EmployeeDayStatusEntry[]> = adapter.getEmployeeDayStatusesData;
export const getEmployeeDayStatusById: (id: string) => Promise<EmployeeDayStatusEntry | null> = adapter.getEmployeeDayStatusById;
export const getEmployeeDayStatusesByEmployee: (employeeId: string) => Promise<EmployeeDayStatusEntry[]> = adapter.getEmployeeDayStatusesByEmployee;
export const getEmployeeDayStatusesByDate: (date: string) => Promise<EmployeeDayStatusEntry[]> = adapter.getEmployeeDayStatusesByDate;
export const getSchedulePlansData: () => Promise<SchedulePlan[]> = adapter.getSchedulePlansData;
export const getSchedulePlanById: (id: string) => Promise<SchedulePlan | null> = adapter.getSchedulePlanById;
export const getSchedulePlansByMonth: (month: string) => Promise<SchedulePlan[]> = adapter.getSchedulePlansByMonth;
export const getActiveSchedulePlan: (month: string) => Promise<SchedulePlan | null> = adapter.getActiveSchedulePlan;
export const getAllFinanceDataForEmployee: (employeeId: string) => Promise<{
  allWashEvents: WashEvent[];
  allSchemes: SalaryScheme[];
  initialTransactions: EmployeeTransaction[];
  allEmployees: Employee[];
}> = adapter.getAllFinanceDataForEmployee;
export const getWeatherPatterns: () => Promise<any> = adapter.getWeatherPatterns;
export const getChemicalConfig: () => Promise<any> = adapter.getChemicalConfig;
export const getVehicleTypes: () => Promise<any> = adapter.getVehicleTypes;
export const getViolationsData: () => Promise<Violation[]> = adapter.getViolationsData;
export const getShiftReportsData: () => Promise<any[]> = adapter.getShiftReportsData;
export const getAppVersion: () => Promise<any> = adapter.getAppVersion;
export const saveAppVersion: (data: any) => Promise<void> = adapter.saveAppVersion;

// ─── UX-safety v1 (Postgres-only — на JSON-fallback стабы выбрасывают error) ──

export const archiveSalaryScheme: (id: string) => Promise<void> =
  adapter.archiveSalaryScheme ?? (async () => { throw new Error('archiveSalaryScheme requires DATA_SOURCE=postgres'); });
export const unarchiveSalaryScheme: (id: string) => Promise<void> =
  adapter.unarchiveSalaryScheme ?? (async () => { throw new Error('unarchiveSalaryScheme requires DATA_SOURCE=postgres'); });
export const getSalaryPeriod: (month: string) => Promise<any | null> =
  adapter.getSalaryPeriod ?? (async () => null);
export const isSalaryPeriodClosed: (month: string) => Promise<boolean> =
  adapter.isSalaryPeriodClosed ?? (async () => false);
export const closeSalaryPeriod: (month: string, closedBy: string) => Promise<void> =
  adapter.closeSalaryPeriod ?? (async () => { throw new Error('closeSalaryPeriod requires DATA_SOURCE=postgres'); });
export const openSalaryPeriod: (month: string) => Promise<void> =
  adapter.openSalaryPeriod ?? (async () => { throw new Error('openSalaryPeriod requires DATA_SOURCE=postgres'); });
export const appendEmployeeSchemeHistory: (
  employeeId: string, schemeId: string | null, changedBy: string
) => Promise<void> =
  adapter.appendEmployeeSchemeHistory ?? (async () => { /* no-op for JSON */ });

// ─── Cache invalidation (no-ops for PG, real for JSON) ──────

export const invalidateWashEventsCache: () => Promise<void> = adapter.invalidateWashEventsCache;
export const invalidateAggregatorsCache: () => Promise<void> = adapter.invalidateAggregatorsCache;
export const invalidateCounterAgentsCache: () => Promise<void> = adapter.invalidateCounterAgentsCache;
export const invalidateEmployeesCache: () => Promise<void> = adapter.invalidateEmployeesCache;
export const invalidateSalarySchemesCache: () => Promise<void> = adapter.invalidateSalarySchemesCache;
export const invalidateRetailPriceConfigCache: () => Promise<void> = adapter.invalidateRetailPriceConfigCache;
export const invalidateExpensesCache: () => Promise<void> = adapter.invalidateExpensesCache;
export const invalidateInventoryCache: () => Promise<void> = adapter.invalidateInventoryCache;
export const invalidateStockMovementsCache: () => Promise<void> = adapter.invalidateStockMovementsCache;
export const invalidateEmployeeCanistersCache: () => Promise<void> = adapter.invalidateEmployeeCanistersCache;
export const invalidateEmployeeTransactionsCache: (employeeId: string) => Promise<void> = adapter.invalidateEmployeeTransactionsCache;
export const invalidateAllEmployeeTransactionsCache: () => Promise<void> = adapter.invalidateAllEmployeeTransactionsCache;
export const invalidateClientTransactionsCache: (clientId: string) => Promise<void> = adapter.invalidateClientTransactionsCache;
export const invalidateAllClientTransactionsCache: () => Promise<void> = adapter.invalidateAllClientTransactionsCache;
export const invalidateShiftsCache: () => Promise<void> = adapter.invalidateShiftsCache;
export const invalidateShiftSwapRequestsCache: () => Promise<void> = adapter.invalidateShiftSwapRequestsCache;
export const invalidateShiftAssignmentRequestsCache: () => Promise<void> = adapter.invalidateShiftAssignmentRequestsCache;
export const invalidateEmployeeDayStatusesCache: () => Promise<void> = adapter.invalidateEmployeeDayStatusesCache;
export const invalidateSchedulePlansCache: () => Promise<void> = adapter.invalidateSchedulePlansCache;
export const invalidateActiveSessionCache: () => Promise<void> = adapter.invalidateActiveSessionCache;
