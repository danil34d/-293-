// Data adapter switcher: JSON files or PostgreSQL
// Controlled by DATA_SOURCE env variable ('json' | 'postgres')
// Default: 'json' (backward compatible)

import type {
  WashEvent, Aggregator, CounterAgent, Employee, SalaryScheme,
  EmployeeTransaction, ClientTransaction, RetailPriceConfig,
  Expense, Shift, ShiftSwapRequest, ShiftAssignmentRequest,
  EmployeeDayStatusEntry, SchedulePlan, Inventory, StockMovement,
  EmployeeChemicalCanister, ActiveSession, Violation,
  Invoice, InvoiceItems,
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

// Phase 6.2: employee archive / impact pre-check
export const archiveEmployee: (id: string) => Promise<void> =
  adapter.archiveEmployee ?? (async () => { throw new Error('archiveEmployee requires DATA_SOURCE=postgres'); });
export const unarchiveEmployee: (id: string) => Promise<void> =
  adapter.unarchiveEmployee ?? (async () => { throw new Error('unarchiveEmployee requires DATA_SOURCE=postgres'); });
export const getEmployeeImpact: (id: string) => Promise<{
  washEvents: number;
  transactions: number;
  shifts: number;
  violations: number;
  canisters: number;
  dayStatuses: number;
}> = adapter.getEmployeeImpact ?? (async () => ({ washEvents: 0, transactions: 0, shifts: 0, violations: 0, canisters: 0, dayStatuses: 0 }));

// Phase 7: Backend polish — реальные метрики, recompute, aggregator/agent pre-check
export const getEmployeeSchemeImpact: (id: string) => Promise<{
  monthsWorked: number;
  monthlyTurnover: number;
  washEventsCount: number;
  firstWashAt: string | null;
  lastWashAt: string | null;
  currentMonthTurnover: number;
}> =
  adapter.getEmployeeSchemeImpact ?? (async () => ({
    monthsWorked: 0,
    monthlyTurnover: 0,
    washEventsCount: 0,
    firstWashAt: null,
    lastWashAt: null,
    currentMonthTurnover: 0,
  }));

export const recomputeInventoryStock: (apply: boolean) => Promise<{
  materials: Array<{
    id: string;
    name: string;
    currentStock: number;
    computedStock: number;
    delta: number;
    movementCount: number;
  }>;
  applied: boolean;
}> =
  adapter.recomputeInventoryStock ?? (async () => { throw new Error('recomputeInventoryStock requires DATA_SOURCE=postgres'); });

export const archiveAggregator: (id: string) => Promise<void> =
  adapter.archiveAggregator ?? (async () => { throw new Error('archiveAggregator requires DATA_SOURCE=postgres'); });
export const unarchiveAggregator: (id: string) => Promise<void> =
  adapter.unarchiveAggregator ?? (async () => { throw new Error('unarchiveAggregator requires DATA_SOURCE=postgres'); });

export const getAggregatorImpact: (id: string) => Promise<{
  washEvents: number;
  clientTransactions: number;
  schemesUsingAsRateSource: Array<{ id: string; name: string; type: string }>;
}> =
  adapter.getAggregatorImpact ?? (async () => ({ washEvents: 0, clientTransactions: 0, schemesUsingAsRateSource: [] }));

export const getCounterAgentImpact: (id: string) => Promise<{
  washEvents: number;
  clientTransactions: number;
  schemesUsingAsRateSource: Array<{ id: string; name: string; type: string }>;
}> =
  adapter.getCounterAgentImpact ?? (async () => ({ washEvents: 0, clientTransactions: 0, schemesUsingAsRateSource: [] }));

export const findSchemesUsingRateSource: (
  sourceType: 'aggregator' | 'counterAgent' | 'retail',
  sourceId: string
) => Promise<Array<{ id: string; name: string; type: string }>> =
  adapter.findSchemesUsingRateSource ?? (async () => []);

// Phase 11 / finding #39: shift lookup для retroactive POST WashEvent
export const findShiftForTimestamp: (
  timestamp: Date | string,
  boxNumber: 1 | 2
) => Promise<string | null> =
  adapter.findShiftForTimestamp ?? (async () => null);

// Phase 14 / UX полировка: метрики для /employees таблицы
export const getEmployeesMetrics: () => Promise<Map<string, {
  washesThisMonth: number;
  lastWashAt: string | null;
}>> =
  adapter.getEmployeesMetrics ?? (async () => new Map());

// Phase 22 / Invoice БД
export const getInvoicesData: (filters?: {
  counterAgentId?: string;
  status?: string;
  periodFrom?: string;
  periodTo?: string;
}) => Promise<Invoice[]> =
  adapter.getInvoicesData ?? (async () => []);

export const getInvoiceById: (id: string) => Promise<Invoice | null> =
  adapter.getInvoiceById ?? (async () => null);

export const getInvoicesByCounterAgent: (counterAgentId: string) => Promise<Invoice[]> =
  adapter.getInvoicesByCounterAgent ?? (async () => []);

export const generateInvoiceNumber: (periodStart: Date) => Promise<string> =
  adapter.generateInvoiceNumber ?? (async () => 'TEMP-001');

export const buildInvoicePreview: (
  counterAgentId: string,
  periodStart: Date,
  periodEnd: Date,
  discountPercent?: number
) => Promise<{
  counterAgentId: string;
  periodStart: string;
  periodEnd: string;
  subtotal: number;
  discountPercent?: number;
  discountAmount?: number;
  prepayments: number;
  totalAmount: number;
  items: InvoiceItems;
  washCount: number;
}> =
  adapter.buildInvoicePreview ?? (async () => { throw new Error('buildInvoicePreview requires DATA_SOURCE=postgres'); });

export const createInvoice: (data: {
  counterAgentId: string;
  periodStart: Date;
  periodEnd: Date;
  subtotal: number;
  discountPercent?: number;
  discountAmount?: number;
  prepayments?: number;
  totalAmount: number;
  items: InvoiceItems;
  createdByEmployeeId?: string;
  notes?: string;
}) => Promise<Invoice> =
  adapter.createInvoice ?? (async () => { throw new Error('createInvoice requires DATA_SOURCE=postgres'); });

export const updateInvoice: (id: string, data: any) => Promise<Invoice> =
  adapter.updateInvoice ?? (async () => { throw new Error('updateInvoice requires DATA_SOURCE=postgres'); });

export const deleteInvoice: (id: string) => Promise<void> =
  adapter.deleteInvoice ?? (async () => { throw new Error('deleteInvoice requires DATA_SOURCE=postgres'); });

// Phase 20 / finding #8 АРХ-НАХОДКИ: scan orphan StockMovement (soft FK без проверки)
export const findOrphanedStockMovements: () => Promise<{
  total: number;
  orphans: Array<{
    id: string;
    materialId: string;
    type: string;
    amount: number;
    date: string;
    description: string;
    relatedEntityType: string;
    relatedEntityId: string;
    reason: string;
  }>;
  summary: {
    totalMovements: number;
    withSoftFK: number;
    orphanCount: number;
    byReason: Record<string, number>;
  };
}> =
  adapter.findOrphanedStockMovements ?? (async () => ({ total: 0, orphans: [], summary: { totalMovements: 0, withSoftFK: 0, orphanCount: 0, byReason: {} } }));

// Phase 16 / finding #35: backfill StockMovement.purchase из исторических Expense
export const backfillChemicalPurchasesFromExpenses: (apply: boolean) => Promise<{
  candidates: Array<{
    expenseId: string;
    date: string;
    category: string;
    description: string;
    quantity: number;
    unit: string;
    grams: number;
    skipReason?: string;
  }>;
  alreadyBackfilled: number;
  willCreate: number;
  skipped: number;
  applied: boolean;
}> =
  adapter.backfillChemicalPurchasesFromExpenses ?? (async () => { throw new Error('backfillChemicalPurchasesFromExpenses requires DATA_SOURCE=postgres'); });

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
