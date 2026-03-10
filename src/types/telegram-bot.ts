import type {
  ShiftType,
  ShiftRequestStatus,
  ShiftRequestType,
  EmployeeTransactionType,
  WashEvent,
  PriceListItem,
} from '@/types';

export interface TelegramEmployeeMap {
  [employeeId: string]: string;
}

export interface TelegramConversationState {
  flow: 'assignment_create' | 'swap_create' | 'wash_create';
  step:
    | 'date'
    | 'shift_type'
    | 'box_number'
    | 'comment'
    | 'select_shift'
    | 'select_target'
    | 'team'
    | 'vehicle_input'
    | 'payment_select'
    | 'aggregator_select'
    | 'counter_agent_select'
    | 'service_browse'
    | 'service_search'
    | 'custom_service_name'
    | 'custom_service_price'
    | 'confirm';
  payload: {
    date?: string;
    shiftType?: ShiftType;
    boxNumber?: 1 | 2;
    comment?: string;
    requesterShiftId?: string;
    targetEmployeeId?: string;
    availableShifts?: Array<{ id: string; date: string; boxNumber: 1 | 2; shiftType: ShiftType }>;
    availableEmployees?: Array<{ id: string; fullName: string }>;
    draftId?: string;
    teamEmployeeIds?: string[];
    vehicleInput?: string;
    normalizedVehicleNumber?: string;
    detectedCounterAgentId?: string;
    detectedCounterAgentName?: string;
    detectedAggregatorIds?: string[];
    selectedPaymentMethod?: WashEvent['paymentMethod'];
    selectedAggregatorId?: string;
    selectedCounterAgentId?: string;
    selectedServices?: TelegramWashServiceItem[];
    serviceSearchQuery?: string;
    servicePage?: number;
    lastWashServices?: TelegramWashServiceItem[];
    lastWashComment?: string;
    allowCustomServices?: boolean;
    priceListName?: string;
    serviceTokenMap?: Record<string, TelegramWashServiceItem>;
    servicePageTokens?: string[];
    ocrPlateNumber?: string;
    ocrImageBase64?: string;
    ocrPendingCorrection?: boolean;
    ocrFailedFilename?: string;
  };
  updatedAt: string;
}

export interface TelegramShiftSnapshotItem {
  id: string;
  date: string;
  boxNumber: 1 | 2;
  shiftType: ShiftType;
  startTime: string;
  endTime: string;
  employeeIds: string[];
  releasedEmployeeId?: string;
  signature: string;
}

export interface TelegramSwapRequestSnapshotItem {
  id: string;
  type: ShiftRequestType;
  requesterId: string;
  requesterShiftId: string;
  targetEmployeeId?: string;
  targetShiftId?: string;
  status: ShiftRequestStatus;
  createdAt: string;
  resolvedAt?: string;
}

export interface TelegramAssignmentRequestSnapshotItem {
  id: string;
  employeeId: string;
  date: string;
  shiftType: ShiftType;
  boxNumber: 1 | 2;
  status: ShiftRequestStatus;
  createdAt: string;
  resolvedAt?: string;
}

export interface TelegramTransactionSnapshotItem {
  id: string;
  type: EmployeeTransactionType;
  amount: number;
  description: string;
  date: string;
}

export interface TelegramWashSnapshotItem {
  id: string;
  timestamp: string;
  vehicleNumber: string;
  totalAmount: number;
  paymentMethod: 'cash' | 'card' | 'transfer' | 'aggregator' | 'counterAgentContract';
}

export interface TelegramEmployeeSnapshot {
  employeeId: string;
  generatedAt: string;
  shifts: TelegramShiftSnapshotItem[];
  swapRequests: TelegramSwapRequestSnapshotItem[];
  assignmentRequests: TelegramAssignmentRequestSnapshotItem[];
  transactions: TelegramTransactionSnapshotItem[];
  washEvents: TelegramWashSnapshotItem[];
}

export type TelegramNotificationEventType =
  | 'shift_assigned'
  | 'shift_updated'
  | 'shift_removed'
  | 'incoming_swap_request'
  | 'request_status_changed'
  | 'finance_transaction'
  | 'wash_event';

export interface TelegramNotificationEvent {
  id: string;
  type: TelegramNotificationEventType;
  employeeId: string;
  occurredAt: string;
  title: string;
  message: string;
  entityId: string;
  meta?: Record<string, string | number | boolean | null | undefined>;
}

export interface TelegramWorkerMetrics {
  date: string;
  startedAt: string;
  messagesSent: number;
  messageErrors: number;
  notificationsSent: number;
  notificationErrors: number;
  commandsHandled: number;
  callbacksHandled: number;
  apiErrors: number;
}

export interface TelegramInternalApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface TelegramWebAppSession {
  token: string;
  employeeId: string;
  chatId: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
}

export interface TelegramWebAppSessionCreateRequest {
  employeeId: string;
  chatId: string;
}

export interface TelegramWebAppSessionCreateResponse {
  token: string;
  url: string;
  expiresAt: string;
}

export interface TelegramFinanceSummary {
  employeeId: string;
  month: string;
  totals: {
    totalEarned: number;
    payments: number;
    bonuses: number;
    loansAndPurchases: number;
    debtWriteOffs: number;
    balance: number;
  };
  washesCount: number;
  transactionsCount: number;
}

export interface TelegramEmployeeCredentialsResponse {
  employeeId: string;
  fullName: string;
  username: string;
  password: string;
}

export type TelegramWashPaymentMethod = WashEvent['paymentMethod'];

export interface TelegramWashServiceItem extends Pick<PriceListItem, 'serviceName' | 'price'> {
  chemicalConsumption?: number;
  isCustom?: boolean;
  token?: string;
  isFromLastWash?: boolean;
}

export interface TelegramWashBootstrapResponse {
  employeeId: string;
  today: string;
  isAllowed: boolean;
  blockReason?: string;
  activeShift?: {
    id: string;
    date: string;
    boxNumber: 1 | 2;
    shiftType: ShiftType;
    startTime: string;
    endTime: string;
  };
  teamEmployees: Array<{ id: string; fullName: string }>;
}

export interface TelegramWashDetectVehicleResponse {
  vehicleNumber: string;
  normalizedVehicleNumber: string;
  recommendedPaymentMethod: TelegramWashPaymentMethod | 'cash';
  detectedCounterAgent?: { id: string; name: string };
  detectedAggregators: Array<{ id: string; name: string }>;
  availableAggregators: Array<{ id: string; name: string; isDetected?: boolean }>;
  availableCounterAgents: Array<{ id: string; name: string; isDetected?: boolean }>;
  lastWash?: {
    id: string;
    timestamp: string;
    services: TelegramWashServiceItem[];
    comment?: string;
  };
}

export interface TelegramWashServicesResponse {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  query: string;
  allowCustomServices: boolean;
  priceListName?: string;
  items: TelegramWashServiceItem[];
}

export interface TelegramWashSubmitRequest {
  employeeId: string;
  chatId: string;
  draftId: string;
  teamEmployeeIds: string[];
  vehicleNumber: string;
  paymentMethod: TelegramWashPaymentMethod;
  sourceId?: string;
  selectedServices: TelegramWashServiceItem[];
  comment?: string;
}

export interface TelegramWashSubmitResponse {
  washEventId: string;
  totalAmount: number;
  netAmount: number;
  paymentMethod: TelegramWashPaymentMethod;
  sourceId?: string;
  sourceName?: string;
  createdAt: string;
}

export interface TelegramPlateRecognitionRequest {
  employeeId: string;
  imageBase64: string;
}

export interface TelegramPlateRecognitionResponse {
  success: boolean;
  plateNumber?: string;
  error?: string;
  rawOutput?: string;
  failedFilename?: string;
}
