







export interface Owner {
  id: string;
  name: string;
}

export interface Company {
  id: string;
  name: string;
  ownerId: string;
}

export interface Car {
  id: string;
  licensePlate: string;
}

export interface CounterAgentCompany {
  companyName: string;
  ownerName: string;
  managerSocialContact?: string; 
  accountantSocialContact?: string; 

  // Fields for invoicing
  customerName?: string; // Р—Р°РєР°Р·С‡РёРє
  inn?: string; // РРќРќ
  kpp?: string; // РљРџРџ
  ogrnNumber?: string; // РћР“Р Рќ в„–
  ogrnDate?: string; // РћР“Р Рќ РѕС‚ РґР°С‚С‹
  legalAddress?: string; // РђРґСЂРµСЃ
  bankName?: string; // РёРјСЏ Р±Р°РЅРєР°
  settlementAccount?: string; // СЂ/СЃ
  correspondentAccount?: string; // Рє/СЃ
  bik?: string; // Р‘РРљ
  phone?: string; // РўРµР».:
  email?: string; // e-mail:
}

export interface MyCompanyDetails extends Omit<CounterAgentCompany, 'managerSocialContact' | 'accountantSocialContact' | 'customerName'> {
    ogrnip?: string;
}

export interface EmployeeConsumption {
  employeeId: string;
  amount: number; // in grams
}

export interface PriceListItem {
  serviceName: string;
  price: number;
  isCustom?: boolean;
  chemicalConsumption?: number; // Norma per service, in grams
  employeeConsumptions?: EmployeeConsumption[]; // Actual consumption per employee
}

export interface RetailPriceConfig {
  mainPriceList: PriceListItem[];
  additionalPriceList: PriceListItem[];
  allowCustomRetailServices?: boolean;
  cardAcquiringPercentage?: number;
  dismissedCustomServices?: string[];
}

export interface CounterAgent {
  id:string;
  name: string;
  balance?: number;
  archived?: boolean;
  archivedAt?: string;
  companies: CounterAgentCompany[];
  cars: Car[];
  priceList?: PriceListItem[];
  additionalPriceList?: PriceListItem[];
  allowCustomServices?: boolean;
}

export interface NamedPriceList {
  name: string;
  services: PriceListItem[];
}

export interface Aggregator {
  id: string;
  name: string;
  balance?: number;
  archived?: boolean;
  archivedAt?: string;
  companies?: CounterAgentCompany[];
  cars: Car[];
  priceLists: NamedPriceList[];
  activePriceListName?: string;
}

export type PaymentType = 'cash' | 'card' | 'transfer';

export interface Transaction {
  id: string;
  date: string; // ISO string
  amount: number;
  paymentType: PaymentType;
  clientName: string;
  notes?: string;
}

// For AI Report
export interface DailyRevenue {
  date: string; // YYYY-MM-DD
  amount: number;
}

export interface AggregatorPerformance {
  aggregatorName: string;
  totalRevenue: number;
  numberOfWashes: number;
}

export interface CashPayment {
  date: string; // YYYY-MM-DD
  amount: number;
  paymentMethod: 'cash' | 'card' | 'transfer';
}

export type EmployeeRole = 'admin' | 'employee' | 'kiosk';

// Человекочитаемые названия ролей
export const ROLE_LABELS: Record<EmployeeRole, string> = {
  admin: 'Администратор',
  employee: 'Сотрудник',
  kiosk: 'Киоск (терминал)',
};

// Маршруты по умолчанию для каждой роли
export const ROLE_DEFAULT_ROUTES: Record<EmployeeRole, string> = {
  admin: '/dashboard',
  employee: '/employee/workstation',
  kiosk: '/employee/workstation',
};

export interface Employee {
  id: string;
  fullName: string;
  phone: string;
  paymentDetails: string;
  hasCar: boolean;
  role?: EmployeeRole;
  telegramChatId?: string;
  username?: string;
  password?: string;
  salarySchemeId?: string;
  canSwapShifts?: boolean; // true РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ, РјРµРЅРµРґР¶РµСЂ РјРѕР¶РµС‚ Р·Р°РїСЂРµС‚РёС‚СЊ РѕР±РјРµРЅ

  // Preferences for auto-scheduling
  preferredShiftType?: 'day' | 'night' | 'any'; // РџСЂРµРґРїРѕС‡РёС‚Р°РµРјС‹Р№ С‚РёРї СЃРјРµРЅС‹
  weekdayPreferredShiftType?: 'day' | 'night' | 'any'; // РџСЂРµРґРїРѕС‡С‚РµРЅРёСЏ РІ Р±СѓРґРЅРё (РµСЃР»Рё РЅРµ Р·Р°РґР°РЅРѕ - РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ preferredShiftType)
  weekendPreferredShiftType?: 'day' | 'night' | 'any'; // РџСЂРµРґРїРѕС‡С‚РµРЅРёСЏ РІ РІС‹С…РѕРґРЅС‹Рµ (РµСЃР»Рё РЅРµ Р·Р°РґР°РЅРѕ - РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ preferredShiftType)
  targetShiftsPerMonth?: number; // Р–РµР»Р°РµРјРѕРµ РєРѕР»РёС‡РµСЃС‚РІРѕ СЃРјРµРЅ РІ РјРµСЃСЏС†
  wantsMoreShifts?: boolean; // Хочет больше смен при авторасределении (legacy)

  // Расширенные предпочтения расписания
  shiftLoadPreference?: 'less' | 'standard' | 'more'; // Нагрузка: меньше / стандарт / больше смен
  availableDays?: 'all' | 'weekdays_only' | 'weekends_only'; // Доступность: все / только будни / только выходные
  canWork24hShifts?: boolean; // Готов работать суточные (24ч) смены
  scheduleNote?: string; // Свободный комментарий сотрудника о пожеланиях

  // Менеджерские переопределения предпочтений
  managerOverrides?: {
    preferredShiftType?: 'day' | 'night' | 'any';
    weekdayPreferredShiftType?: 'day' | 'night' | 'any';
    weekendPreferredShiftType?: 'day' | 'night' | 'any';
    targetShiftsPerMonth?: number;
    shiftLoadPreference?: 'less' | 'standard' | 'more';
    availableDays?: 'all' | 'weekdays_only' | 'weekends_only';
    canWork24hShifts?: boolean;
    note?: string; // Комментарий менеджера
    updatedAt?: string; // Когда менеджер обновил
  };

  // UX-safety: soft delete (Phase 6.2).
  // Архивные сотрудники скрыты из активных списков и графиков,
  // но история WashEvent / EmployeeTransaction / Shift сохраняется.
  archived?: boolean;
  archivedAt?: string; // ISO timestamp
}

export interface SalaryRate {
  serviceName: string;
  rate: number;
  deduction?: number;
}

export interface RateSource {
  type: 'retail' | 'aggregator' | 'counterAgent';
  id: string; // 'retail' for retail, or aggregator/agent ID
  priceListName?: string; // Optional: For aggregators with multiple price lists.
}

export interface SalaryScheme {
  id: string;
  name: string;
  type: 'percentage' | 'rate';
  percentage?: number;
  fixedDeduction?: number;
  rateSource?: RateSource;
  rates?: SalaryRate[];
  // UX-safety: soft delete (см. АДМИНКА-АРХИТЕКТУРНЫЕ-НАХОДКИ #1).
  // Schemes with archived=true скрыты из основной таблицы /salary-schemes
  // и не могут быть назначены сотруднику, но история ZP сохраняется.
  archived?: boolean;
  archivedAt?: string; // ISO timestamp
}

/** Закрытый период ЗП — блокирует правки WashEvent после выплаты (423 Locked). */
export interface SalaryPeriod {
  id: string;
  month: string;       // "2026-05"
  closed: boolean;
  closedBy?: string;   // employeeId admin'а
  closedAt?: string;   // ISO
  createdAt: string;
}

/** История смены salaryScheme — для эффективного расчёта ZP по периоду. */
export interface EmployeeSalarySchemeHistoryEntry {
  id: string;
  employeeId: string;
  schemeId: string | null;
  effectiveFrom: string; // ISO
  effectiveTo: string | null;
  changedBy: string;     // employeeId admin'а
  createdAt: string;
}

export interface WashEventEditHistory {
    editedAt: string; // ISO timestamp of the edit
    editedBy: string; // ID of the employee who edited
    previousState: Partial<WashEvent>; // The state of the WashEvent before this edit
    reason?: string; // Optional reason for the edit
}

export interface WashComment {
  text: string;
  authorId: string;
  date: string; // ISO timestamp
}

export interface WashEventCameraSessionLink {
  dirName: string;
  boxNumber?: 1 | 2;
  originalPlate?: string | null;
  correctedPlate?: string | null;
  vehicleClass?: string | null;
  start?: string | null;
  end?: string | null;
  source?: 'operations-camera';
}

export interface WashEventLogTimeline {
  entryAt?: string | null;
  exitAt?: string | null;
  washDurationSeconds?: number | null;
  sessionDurationSeconds?: number | null;
  source?: 'camera-dashboard' | 'camera-session-link' | 'event-timestamp';
}

export interface WashEventDismissalMeta {
  reason: 'drive_out_without_wash';
  dismissedAt: string;
  dismissedByEmployeeId: string;
  dismissedByEmployeeName?: string;
  source: 'operations' | 'kiosk-order';
}

export interface WashEventRestorationMeta {
  restoredAt: string;
}

export interface WashEvent {
  id: string;
  timestamp: string; // ISO string
  vehicleNumber: string;
  employeeIds: string[];
  paymentMethod: 'cash' | 'card' | 'transfer' | 'aggregator' | 'counterAgentContract';
  sourceId?: string; // aggregatorId or counterAgentId
  sourceName?: string; // aggregatorName or counterAgentName
  priceListName?: string; // For aggregators, to specify which price list was used
  totalAmount: number;
  netAmount?: number; // After acquiring fee
  acquiringFee?: number;
  services: {
    main: PriceListItem & { id?: string };
    additional: (PriceListItem & { id?: string })[];
  };
  driverComments?: WashComment[];
  editHistory?: WashEventEditHistory[];
  // Chemical consumption tracking
  chemicalConsumptionGrams?: number; // Total chemical consumed for this wash
  chemicalCostRub?: number; // Cost of chemicals used (for profitability calc)
  // Tips
  tips?: number; // Чаевые в рублях
  // Wash timer
  washDurationSeconds?: number; // Длительность мойки в секундах
  // Refund tracking
  refundedAt?: string; // ISO timestamp когда был оформлен возврат
  refundReason?: string; // Причина возврата
  shiftId?: string;
  boxNumber?: 1 | 2; // Номер бокса, в котором выполнялась мойка
  cameraSession?: WashEventCameraSessionLink;
  logTimeline?: WashEventLogTimeline;
  status?: 'completed' | 'dismissed' | 'restored';
  dismissal?: WashEventDismissalMeta;
  restoration?: WashEventRestorationMeta;
  /** Phase 8 / finding #38: true если мойка создана с timestamp в уже закрытый SalaryPeriod.
   *  Не блокирует POST, но даёт админу видимый сигнал (amber-бэйдж в /wash-log).
   *  Используется для post-hoc пересчёта ZP за выплаченный период. */
  createdInClosedPeriod?: boolean;
  /** YYYY-MM месяца закрытого периода на момент создания (для аудита). */
  closedPeriodAtCreate?: string;
  /** Phase 10 / finding #40: кто фактически нажал «Сохранить» (cookie identity).
   *  Может отличаться от employeeIds — UI подсвечивает «оформил не свой». */
  createdByEmployeeId?: string;
}

// ─── Phase 22 / Invoice ─────────────────────────────────────────

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'cancelled';
export type InvoicePaidVia = 'cash' | 'card' | 'transfer';

/** Item-снепшот: агрегация по услугам (для сводной таблицы Combo-варианта). */
export interface InvoiceServiceItem {
  name: string;
  qty: number;
  pricePerUnit: number;
  total: number;
}

/** Item-снепшот: детализация по мойкам (для сворачиваемого блока Combo-варианта). */
export interface InvoiceWashItem {
  id: string;          // WashEvent.id
  date: string;        // ISO
  plate: string;
  vehicleType?: string;
  services: string;    // короткое описание услуг
  total: number;
}

export interface InvoiceItems {
  services: InvoiceServiceItem[];
  washes: InvoiceWashItem[];
}

export interface Invoice {
  id: string;
  number: string; // "2026-05-001"
  counterAgentId: string;
  counterAgentName?: string; // для UI без JOIN
  periodStart: string; // ISO
  periodEnd: string;   // ISO
  status: InvoiceStatus;

  subtotal: number;
  discountPercent?: number;
  discountAmount?: number;
  prepayments?: number;
  totalAmount: number;

  items: InvoiceItems;

  createdByEmployeeId?: string;
  sentAt?: string;
  sentToEmail?: string;
  paidAt?: string;
  paidVia?: InvoicePaidVia;
  paidTransactionId?: string;

  notes?: string;

  createdAt: string;
  updatedAt: string;
}

export type EmployeeTransactionType = 'payment' | 'loan' | 'bonus' | 'purchase' | 'debt_write_off';

export interface EmployeeTransaction {
  id: string;
  employeeId: string;
  date: string; // ISO string
  type: EmployeeTransactionType;
  amount: number; // always positive, type determines if it's a credit or debit.
  description: string;
}

export interface ClientTransaction {
  id: string;
  clientId: string;
  date: string; // ISO string
  type: 'payment';
  amount: number;
  description: string;
}


// --- Structures for Salary Report ---

export interface SalaryBreakdownItem {
  washEventId: string;
  timestamp: string;
  vehicleNumber: string;
  earnings: number;
  unpaidServices: string[];
  formula?: string; // e.g. "(3 900 СЂСѓР±. Г— 45%) / 2 С‡РµР»."
}

export interface SalaryPenaltyItem {
  violationId: string;
  date: string;
  type: ViolationType;
  description: string;
  amount: number;
}

export interface SalaryReportData {
  employeeId: string;
  employeeName: string;
  totalEarnings: number;
  totalPenalties: number;
  penalties: SalaryPenaltyItem[];
  breakdown: SalaryBreakdownItem[];
}


// --- Structures for Expenses ---

export interface Expense {
  id: string;
  date: string; // ISO string
  category: string;
  description: string;
  amount: number;
  quantity?: number;
  unit?: string;
  pricePerUnit?: number;
}

// --- Structures for Chemical Analytics ---
export interface ChemicalConsumptionReport {
  [employeeId: string]: {
    employeeName: string;
    totalConsumption: number; // in grams
    washCount: number;
  }
}

// --- Structures for Chemical Calculator ---

export interface ChemicalConfig {
  concentratePricePer22kg: number; // РЎС‚РѕРёРјРѕСЃС‚СЊ РєРѕРЅС†РµРЅС‚СЂР°С‚Р° Р·Р° 22РєРі
  volumeWeightKg: number; // Р’РµСЃ РїР°СЂС‚РёРё (5Р» РєРѕРЅС†РµРЅС‚СЂР°С‚Р°) РІ РєРі
  dilutionRatio: '1:3' | '1:1'; // Р Р°Р·РІРµРґРµРЅРёРµ (1:3 = 20Р» СЂР°СЃС‚РІРѕСЂР°, 1:1 = 10Р»)
}

export interface VehicleType {
  id: string;
  name: string; // РќР°Р·РІР°РЅРёРµ (Р¤СѓСЂР°, Р“Р°Р·РµР»СЊ 6Рј, РЎРµРґР°РЅ Рё С‚.Рґ.)
  areaM2: number; // РџР»РѕС‰Р°РґСЊ РјРѕР№РєРё РІ РјВІ
  consumptionLiters: number; // Р Р°СЃС…РѕРґ СЂР°СЃС‚РІРѕСЂР° РІ Р»РёС‚СЂР°С…
  recommendedPrice: number; // Р РµРєРѕРјРµРЅРґСѓРµРјР°СЏ С†РµРЅР° РјРѕР№РєРё
  isCustom?: boolean; // РџРѕР»СЊР·РѕРІР°С‚РµР»СЊСЃРєРёР№ С‚РёРї РјР°С€РёРЅС‹
}

export interface ChemicalCostType {
  type: 'gift' | 'sale'; // РџРѕРґР°СЂРѕРє (СЂР°СЃС…РѕРґ РјРѕР№РєРё) РёР»Рё РїСЂРѕРґР°Р¶Р° (СЂР°СЃС…РѕРґ РјРѕР№С‰РёРєР°)
  label: string;
}

// --- Structures for Shift Management ---

export type ShiftType = 'day' | 'night'; // РґРµРЅСЊ: 08:00-20:00, РЅРѕС‡СЊ: 20:00-08:00
export type WashId = 'wash_1' | 'wash_2';

export type ShiftStatus = 'scheduled' | 'active' | 'completed';

export interface Shift {
  id: string;
  washId: WashId;
  date: string; // YYYY-MM-DD
  boxNumber: 1 | 2; // РќРѕРјРµСЂ Р±РѕРєСЃР° (1 РёР»Рё 2)
  employeeIds: string[]; // 1-2 СЃРѕС‚СЂСѓРґРЅРёРєР° РЅР° СЃРјРµРЅРµ
  shiftType: ShiftType; // РўРёРї СЃРјРµРЅС‹ (РґРµРЅСЊ/РЅРѕС‡СЊ)
  startTime: string; // "08:00" РёР»Рё "20:00"
  endTime: string; // "20:00" РёР»Рё "08:00"
  releasedEmployeeId?: string; // ID РѕС‚РїСѓС‰РµРЅРЅРѕРіРѕ РЅР°РїР°СЂРЅРёРєР° (РµСЃР»Рё РѕРґРёРЅ СЂР°Р±РѕС‚Р°РµС‚ СЃР°Рј)
  isAutoAssigned?: boolean; // Р¤Р»Р°Рі Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё РЅР°Р·РЅР°С‡РµРЅРЅРѕР№ СЃРјРµРЅС‹
  status?: ShiftStatus;
  startedAt?: string;
  closedAt?: string;
}

export type ShiftRequestType = 'giveaway' | 'swap';
export type ShiftRequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

export interface ShiftSwapRequest {
  id: string;
  type: ShiftRequestType; // 'giveaway' - РѕС‚РґР°С‚СЊ СЃРјРµРЅСѓ, 'swap' - РѕР±РјРµРЅСЏС‚СЊСЃСЏ
  createdAt: string; // ISO timestamp
  requesterId: string; // РљС‚Рѕ СЃРѕР·РґР°Р» Р·Р°СЏРІРєСѓ
  requesterShiftId: string; // РЎРјРµРЅР° РёРЅРёС†РёР°С‚РѕСЂР°
  targetEmployeeId?: string; // РљРѕРјСѓ РїСЂРµРґР»Р°РіР°РµС‚СЃСЏ (РґР»СЏ giveaway РёР»Рё swap)
  targetShiftId?: string; // РќР° РєР°РєСѓСЋ СЃРјРµРЅСѓ РјРµРЅСЏРµС‚СЃСЏ (РґР»СЏ swap)
  status: ShiftRequestStatus;
  resolvedAt?: string; // РљРѕРіРґР° Р·Р°СЏРІРєР° Р±С‹Р»Р° РїСЂРёРЅСЏС‚Р°/РѕС‚РєР»РѕРЅРµРЅР°
}

// РќРѕРІС‹Р№ С‚РёРї РґР»СЏ Р·Р°РїСЂРѕСЃРѕРІ РЅР° РЅР°Р·РЅР°С‡РµРЅРёРµ СЃРјРµРЅС‹ (employee requests to be assigned to a shift)
export interface ShiftAssignmentRequest {
  id: string;
  washId: WashId;
  createdAt: string; // ISO timestamp
  employeeId: string; // РљС‚Рѕ Р·Р°РїСЂР°С€РёРІР°РµС‚ СЃРјРµРЅСѓ
  date: string; // YYYY-MM-DD - РЅР° РєР°РєСѓСЋ РґР°С‚Сѓ
  shiftType: ShiftType; // РўРёРї СЃРјРµРЅС‹ (РґРµРЅСЊ/РЅРѕС‡СЊ)
  boxNumber: 1 | 2; // Р–РµР»Р°РµРјС‹Р№ Р±РѕРєСЃ
  status: ShiftRequestStatus; // pending, accepted, rejected, cancelled
  resolvedAt?: string; // РљРѕРіРґР° РјРµРЅРµРґР¶РµСЂ РїСЂРёРЅСЏР»/РѕС‚РєР»РѕРЅРёР»
  resolvedBy?: string; // ID РјРµРЅРµРґР¶РµСЂР°, РєРѕС‚РѕСЂС‹Р№ РїСЂРёРЅСЏР» СЂРµС€РµРЅРёРµ
  comment?: string; // РљРѕРјРјРµРЅС‚Р°СЂРёР№ СЃРѕС‚СЂСѓРґРЅРёРєР°
}

// --- Structures for Employee Day Status (Schedule Planning) ---

export type EmployeeDayStatus =
  | 'free'           // РЎРІРѕР±РѕРґРµРЅ - РјРѕР¶РµС‚ СЃС‚Р°С‚СЊ РєР°Рє СЂР°Р±РѕС‡РёРј, С‚Р°Рє Рё РІС‹С…РѕРґРЅС‹Рј
  | 'doesnt_want'    // Р Р°Р±РѕС‚Р°С‚СЊ РЅРµ С…РѕС‡РµС‚ - РЅРµ РЅР°Р·РЅР°С‡Р°С‚СЊ, РЅРѕ РЅРµ СѓРјРµРЅСЊС€Р°С‚СЊ РѕР±С‰РµРµ РєРѕР»РёС‡РµСЃС‚РІРѕ РґРЅРµР№
  | 'vacation_sick'  // РћС‚РїСѓСЃРє РёР»Рё Р±РѕР»СЊРЅРёС‡РЅС‹Р№ - РЅРµ РЅР°Р·РЅР°С‡Р°С‚СЊ, СѓРјРµРЅСЊС€РёС‚СЊ РѕР±С‰РµРµ РєРѕР»РёС‡РµСЃС‚РІРѕ СЃРјРµРЅ РїСЂРѕРїРѕСЂС†РёРѕРЅР°Р»СЊРЅРѕ
  | 'must_work'      // Р”РѕР»Р¶РµРЅ СЂР°Р±РѕС‚Р°С‚СЊ - РѕР±СЏР·Р°С‚РµР»СЊРЅР°СЏ СЃРјРµРЅР°
  | 'auto_assigned'; // РђРІС‚РѕРјР°С‚РёС‡РµСЃРєРё РЅР°Р·РЅР°С‡РµРЅ - РјРѕР¶РµС‚ РёР·РјРµРЅРёС‚СЊСЃСЏ РїСЂРё РїРµСЂРµСЃС‡С‘С‚Рµ

export interface EmployeeDayStatusEntry {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  status: EmployeeDayStatus;
  shiftType?: ShiftType; // Р”Р»СЏ СЃС‚Р°С‚СѓСЃР° 'must_work' - РЅР° РєР°РєСѓСЋ СЃРјРµРЅСѓ (РґРµРЅСЊ/РЅРѕС‡СЊ)
  boxNumber?: 1 | 2; // Р”Р»СЏ СЃС‚Р°С‚СѓСЃР° 'must_work' - РЅР° РєР°РєРѕР№ Р±РѕРєСЃ
}

// --- Structures for Schedule Plans ---

export interface SchedulePlan {
  id: string;
  washId: WashId;
  name: string; // "РџР»Р°РЅ РЅР° РґРµРєР°Р±СЂСЊ 2025"
  month: string; // "2025-12"
  createdAt: string; // ISO timestamp
  createdBy: string; // manager ID
  clonedFrom?: string; // ID РїР»Р°РЅР°, РёР· РєРѕС‚РѕСЂРѕРіРѕ Р±С‹Р» СЃРєР»РѕРЅРёСЂРѕРІР°РЅ
  isActive?: boolean; // РђРєС‚РёРІРЅС‹Р№ РїР»Р°РЅ (РїСЂРёРјРµРЅСЏРµС‚СЃСЏ Рє СЂР°СЃРїРёСЃР°РЅРёСЋ)

  // РљРѕРЅС„РёРіСѓСЂР°С†РёСЏ РїР»Р°РЅР°
  employeeConfigs: EmployeePlanConfig[];
  dailyRequirements: DailyRequirement[]; // РЎРєРѕР»СЊРєРѕ Р»СЋРґРµР№ РЅСѓР¶РЅРѕ РєР°Р¶РґС‹Р№ РґРµРЅСЊ
  weeklyPattern?: WeeklyPattern; // РџР°С‚С‚РµСЂРЅ РїРѕ РґРЅСЏРј РЅРµРґРµР»Рё (РґР»СЏ РєР»РѕРЅРёСЂРѕРІР°РЅРёСЏ)
}

export interface EmployeePlanConfig {
  employeeId: string;
  targetShiftsCount: number; // РЎРєРѕР»СЊРєРѕ СЃРјРµРЅ РґРѕР»Р¶РµРЅ РѕС‚СЂР°Р±РѕС‚Р°С‚СЊ Р·Р° РјРµСЃСЏС†
  preferredShiftType?: 'day' | 'night' | 'any'; // РџСЂРµРґРїРѕС‡РёС‚Р°РµРјС‹Р№ С‚РёРї СЃРјРµРЅС‹
  wantsMoreShifts?: boolean; // Хочет больше смен при авторасределении (legacy)

  // Расширенные предпочтения расписания
  shiftLoadPreference?: 'less' | 'standard' | 'more'; // Нагрузка: меньше / стандарт / больше смен
  availableDays?: 'all' | 'weekdays_only' | 'weekends_only'; // Доступность: все / только будни / только выходные
  canWork24hShifts?: boolean; // Готов работать суточные (24ч) смены
  scheduleNote?: string; // Свободный комментарий сотрудника о пожеланиях

  // Менеджерские переопределения предпочтений
  managerOverrides?: {
    preferredShiftType?: 'day' | 'night' | 'any';
    weekdayPreferredShiftType?: 'day' | 'night' | 'any';
    weekendPreferredShiftType?: 'day' | 'night' | 'any';
    targetShiftsPerMonth?: number;
    shiftLoadPreference?: 'less' | 'standard' | 'more';
    availableDays?: 'all' | 'weekdays_only' | 'weekends_only';
    canWork24hShifts?: boolean;
    note?: string; // Комментарий менеджера
    updatedAt?: string; // Когда менеджер обновил
  };
}

export interface DailyRequirement {
  date: string; // YYYY-MM-DD
  requiredCount: number; // РЎРєРѕР»СЊРєРѕ СЃРѕС‚СЂСѓРґРЅРёРєРѕРІ РЅСѓР¶РЅРѕ РІ СЌС‚РѕС‚ РґРµРЅСЊ
  box1DayRequired?: number; // Р‘РѕРєСЃ 1, РґРЅРµРІРЅР°СЏ СЃРјРµРЅР°
  box1NightRequired?: number; // Р‘РѕРєСЃ 1, РЅРѕС‡РЅР°СЏ СЃРјРµРЅР°
  box2DayRequired?: number; // Р‘РѕРєСЃ 2, РґРЅРµРІРЅР°СЏ СЃРјРµРЅР°
  box2NightRequired?: number; // Р‘РѕРєСЃ 2, РЅРѕС‡РЅР°СЏ СЃРјРµРЅР°
}

export interface WeeklyPattern {
  monday: number;    // РЎРєРѕР»СЊРєРѕ Р»СЋРґРµР№ РЅСѓР¶РЅРѕ РїРѕ РїРѕРЅРµРґРµР»СЊРЅРёРєР°Рј
  tuesday: number;
  wednesday: number;
  thursday: number;
  friday: number;
  saturday: number;
  sunday: number;
}

// --- Structures for Inventory/Warehouse ---

export type MaterialCategory = 'chemical' | 'consumable' | 'equipment' | 'other';
export type MaterialUnit = 'grams' | 'kg' | 'liters' | 'pieces' | 'sets';

export interface InventoryMaterial {
  id: string;
  name: string;
  category: MaterialCategory;
  unit: MaterialUnit;
  currentStock: number; // Р’ Р±Р°Р·РѕРІС‹С… РµРґРёРЅРёС†Р°С… (РіСЂР°РјРјС‹ РґР»СЏ chemical, С€С‚СѓРєРё РґР»СЏ consumable)
  minStock?: number; // РџРѕСЂРѕРі РґР»СЏ РїСЂРµРґСѓРїСЂРµР¶РґРµРЅРёСЏ Рѕ РЅРёР·РєРѕРј РѕСЃС‚Р°С‚РєРµ
  pricePerUnit?: number; // Р¦РµРЅР° Р·Р° РµРґРёРЅРёС†Сѓ (РґР»СЏ СЂР°СЃС‡С‘С‚Р° СЃРµР±РµСЃС‚РѕРёРјРѕСЃС‚Рё)
  description?: string;
  isActive: boolean; // РђРєС‚РёРІРµРЅ Р»Рё РјР°С‚РµСЂРёР°Р»
  createdAt: string;
  updatedAt: string;
}

export type StockMovementType = 'purchase' | 'consumption' | 'issue' | 'return' | 'adjustment' | 'write_off';

export interface StockMovement {
  id: string;
  materialId: string;
  type: StockMovementType;
  amount: number; // РџРѕР»РѕР¶РёС‚РµР»СЊРЅРѕРµ РґР»СЏ РїСЂРёС…РѕРґР°, РѕС‚СЂРёС†Р°С‚РµР»СЊРЅРѕРµ РґР»СЏ СЂР°СЃС…РѕРґР°
  balanceAfter: number; // РћСЃС‚Р°С‚РѕРє РїРѕСЃР»Рµ РѕРїРµСЂР°С†РёРё
  date: string; // ISO timestamp
  description: string;
  relatedEntityType?: 'wash_event' | 'employee' | 'expense' | 'manual';
  relatedEntityId?: string; // ID РјРѕР№РєРё, СЃРѕС‚СЂСѓРґРЅРёРєР° РёР»Рё СЂР°СЃС…РѕРґР°
  employeeId?: string; // РљС‚Рѕ РІС‹РїРѕР»РЅРёР» РѕРїРµСЂР°С†РёСЋ РёР»Рё РєРѕРјСѓ РІС‹РґР°РЅРѕ
  createdBy?: string; // ID РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ, СЃРѕР·РґР°РІС€РµРіРѕ Р·Р°РїРёСЃСЊ
}

// РљР°РЅРёСЃС‚СЂР° С…РёРјРёРё Сѓ СЃРѕС‚СЂСѓРґРЅРёРєР°
export interface EmployeeChemicalCanister {
  id: string;
  employeeId: string;
  issuedAt: string; // Р”Р°С‚Р° РІС‹РґР°С‡Рё
  initialAmountGrams: number; // РќР°С‡Р°Р»СЊРЅС‹Р№ РѕР±СЉС‘Рј (РѕР±С‹С‡РЅРѕ 20000-21000 Рі)
  remainingAmountGrams: number; // РўРµРєСѓС‰РёР№ РѕСЃС‚Р°С‚РѕРє
  priceRub: number; // РЎС‚РѕРёРјРѕСЃС‚СЊ РєР°РЅРёСЃС‚СЂС‹ (РґРѕР»Рі СЃРѕС‚СЂСѓРґРЅРёРєР°)
  status: 'active' | 'empty' | 'returned';
  transactionId?: string; // РЎРІСЏР·СЊ СЃ С‚СЂР°РЅР·Р°РєС†РёРµР№ РґРѕР»РіР°
}

// РќР°СЃС‚СЂРѕР№РєРё СЃРєР»Р°РґР°
export interface InventorySettings {
  defaultChemicalConsumptionPerWash: number; // РќРѕСЂРјР° СЂР°СЃС…РѕРґР° РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ (РјР»)
  canisterWeightGrams: number; // Р’РµСЃ РєР°РЅРёСЃС‚СЂС‹ (22000 Рі = 22 РєРі)
  canisterVolumeMl: number; // РћР±СЉС‘Рј РєР°РЅРёСЃС‚СЂС‹ РІ РјР» (19000 РјР» = 19 Р»РёС‚СЂРѕРІ)
  canisterPriceRub: number; // Р¦РµРЅР° РєР°РЅРёСЃС‚СЂС‹ РґР»СЏ СЃРѕС‚СЂСѓРґРЅРёРєРѕРІ
  lowStockThresholdKg: number; // РџРѕСЂРѕРі РїСЂРµРґСѓРїСЂРµР¶РґРµРЅРёСЏ (РєРі)
  autoDeductChemical: boolean; // РђРІС‚РѕРјР°С‚РёС‡РµСЃРєРё СЃРїРёСЃС‹РІР°С‚СЊ С…РёРјРёСЋ РїСЂРё РјРѕР№РєРµ
  chemicalPricePerKg?: number; // Р¦РµРЅР° С…РёРјРёРё Р·Р° РєРі (РґР»СЏ СЂР°СЃС‡С‘С‚Р° СЃРµР±РµСЃС‚РѕРёРјРѕСЃС‚Рё)

  // РќР°СЃС‚СЂРѕР№РєРё СЂР°Р·Р±Р°РІР»РµРЅРёСЏ С…РёРјРёРё
  dilutionEnabled?: boolean; // Р’РєР»СЋС‡РµРЅР° Р»Рё СЃРёСЃС‚РµРјР° СЂР°Р·Р±Р°РІР»РµРЅРёСЏ
  dilutionRatio?: number; // РљРѕСЌС„С„РёС†РёРµРЅС‚ СЂР°Р·Р±Р°РІР»РµРЅРёСЏ (РЅР°РїСЂРёРјРµСЂ, 10 РѕР·РЅР°С‡Р°РµС‚ 1:10 - 1 С‡Р°СЃС‚СЊ РєРѕРЅС†РµРЅС‚СЂР°С‚Р° РЅР° 10 С‡Р°СЃС‚РµР№ РІРѕРґС‹)
  measuringContainerMl?: number; // РћР±СЉС‘Рј РјРµСЂРЅРѕРіРѕ РєРѕРЅС‚РµР№РЅРµСЂР° РІ РјР» (РЅР°РїСЂРёРјРµСЂ, 5000 = 5 Р»РёС‚СЂРѕРІ)
  solutionPerWash?: number; // РЎРєРѕР»СЊРєРѕ РјР» СЂР°Р±РѕС‡РµРіРѕ СЂР°СЃС‚РІРѕСЂР° РЅР° РѕРґРЅСѓ РјРѕР№РєСѓ (РЅР°РїСЂРёРјРµСЂ, 700 РјР»)
  solutionPerWashFull?: number; // Р Р°СЃС…РѕРґ СЂР°СЃС‚РІРѕСЂР° РїСЂРё РїРѕР»РЅРѕР№ РјРѕР№РєРµ "РІ РєСЂСѓРі" (РјР»)
  solutionPerWashPartial?: number; // Р Р°СЃС…РѕРґ СЂР°СЃС‚РІРѕСЂР° РїСЂРё С‡Р°СЃС‚РёС‡РЅРѕР№ РјРѕР№РєРµ (РјР»)
}

// Р Р°СЃС€РёСЂРµРЅРЅР°СЏ СЃС‚СЂСѓРєС‚СѓСЂР° РёРЅРІРµРЅС‚Р°СЂСЏ
export interface Inventory {
  chemicalStockGrams: number; // РћСЃС‚Р°С‚РѕРє С…РёРјРёРё РІ РјР» (РЅР°Р·РІР°РЅРёРµ СЃРѕС…СЂР°РЅРµРЅРѕ РґР»СЏ СЃРѕРІРјРµСЃС‚РёРјРѕСЃС‚Рё, РЅРѕ С‚РµРїРµСЂСЊ СЌС‚Рѕ РјР»)
  materials?: InventoryMaterial[]; // Р’СЃРµ РјР°С‚РµСЂРёР°Р»С‹
  settings?: InventorySettings; // РќР°СЃС‚СЂРѕР№РєРё СЃРєР»Р°РґР°
}

// --- Журнал действий сотрудников ---

export type AuditActionType =
  | 'login'
  | 'logout'
  | 'order_create'
  | 'order_update'
  | 'order_complete'
  | 'order_cancel'
  | 'payment_accept'
  | 'payment_refund'
  | 'shift_start'
  | 'shift_end'
  | 'settings_change'
  | 'employee_edit'
  | 'price_change'
  | 'other';

export interface AuditLogEntry {
  id: string;
  timestamp: string; // ISO string
  employeeId: string;
  employeeName: string;
  role: EmployeeRole;
  action: AuditActionType;
  description: string;
  entityType?: string; // 'order' | 'payment' | 'employee' | etc
  entityId?: string;
  metadata?: Record<string, unknown>;
  siteId?: string;
}

// --- Статусы заказа ---

export type OrderStatus = 'new' | 'in_progress' | 'ready' | 'paid' | 'closed' | 'cancelled';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'Новый',
  in_progress: 'В работе',
  ready: 'Готов',
  paid: 'Оплачен',
  closed: 'Закрыт',
  cancelled: 'Отменён',
};

// --- Active Session ---

export interface ActiveSessionBox {
  boxNumber: number;
  employeeIds: string[];
  shiftId?: string;
  isActive: boolean;
  startedAt?: string;
}

export interface ActiveSession {
  updatedAt: string;
  boxes: ActiveSessionBox[];
}

// --- Violations ---

export type ViolationType =
  | 'lateness'
  | 'early_leave'
  | 'no_show'
  | 'equipment_damage'
  | 'client_complaint'
  | 'quality_issue'
  | 'safety_violation'
  | 'other';

export const VIOLATION_TYPE_LABELS: Record<ViolationType, string> = {
  lateness: 'Опоздание',
  early_leave: 'Ранний уход',
  no_show: 'Неявка',
  equipment_damage: 'Порча оборудования',
  client_complaint: 'Жалоба клиента',
  quality_issue: 'Нарушение качества',
  safety_violation: 'Нарушение ТБ',
  other: 'Прочее',
};

export interface Violation {
  id: string;
  employeeId: string;
  date: string;
  type: ViolationType;
  description: string;
  penaltyAmount?: number;
  shiftId?: string;
  createdBy: string;
  createdAt: string;
  resolved?: boolean;
  resolvedComment?: string;
}
