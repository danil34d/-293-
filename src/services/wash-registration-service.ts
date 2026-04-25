import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { Aggregator, CounterAgent, Employee, PriceListItem, WashComment, WashEvent } from '@/types';
import {
  getActiveCounterAgentsData,
  getAggregatorsData,
  getEmployeesData,
  getRetailPriceConfig,
  getShiftsData,
  getWashEventById,
  getWashEventsData,
  invalidateAggregatorsCache,
} from '@/lib/data';
import { isEmployeeAdmin } from '@/lib/employee-role';
import { normalizeLicensePlate } from '@/lib/utils';
import {
  TelegramWashBootstrapResponse,
  TelegramWashDetectVehicleResponse,
  TelegramWashPaymentMethod,
  TelegramWashServiceItem,
  TelegramWashServicesResponse,
  TelegramWashSubmitRequest,
  TelegramWashSubmitResponse,
} from '@/types/telegram-bot';
import { saveEntity } from '@/lib/data/write-helpers';
import { createWashEvent } from './wash-event-create-service';

const PRIORITY_SERVICE_KEYWORDS = ['тягач', '90 кубов', 'европа', 'америка', 'полуприцеп', 'самосвал', 'цистерна'];
const DRAFT_STORE_PATH = path.join(process.cwd(), 'data', 'telegram-bot', 'wash-drafts.json');
const DEFAULT_PAGE_SIZE = 8;
const MAX_PAGE_SIZE = 20;
const DRAFT_TTL_DAYS = 7;
const DRAFT_LOCKS_DIR = path.join(process.cwd(), 'data', 'telegram-bot', 'wash-draft-locks');
const inFlightDraftSubmits = new Map<string, Promise<TelegramWashSubmitResponse>>();

interface WashDraftStoreItem {
  draftId: string;
  employeeId: string;
  chatId: string;
  washEventId: string;
  createdAt: string;
}

interface BuildCatalogInput {
  employeeId: string;
  vehicleNumber: string;
  paymentMethod: TelegramWashPaymentMethod;
  sourceId?: string;
  query?: string;
  page?: number;
  pageSize?: number;
}

function getTodayYmd(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeService(service: TelegramWashServiceItem): TelegramWashServiceItem | null {
  const serviceName = String(service.serviceName || '').trim();
  const price = Number(service.price);
  const chemicalConsumption = service.chemicalConsumption === undefined ? undefined : Number(service.chemicalConsumption);

  if (!serviceName) return null;
  if (!Number.isFinite(price) || price < 0) return null;

  return {
    serviceName,
    price,
    chemicalConsumption: Number.isFinite(Number(chemicalConsumption)) ? Number(chemicalConsumption) : undefined,
    isCustom: Boolean(service.isCustom),
  };
}

function deduplicateServices(services: TelegramWashServiceItem[]): TelegramWashServiceItem[] {
  const byName = new Map<string, TelegramWashServiceItem>();
  for (const item of services) {
    if (!byName.has(item.serviceName)) {
      byName.set(item.serviceName, item);
    }
  }
  return Array.from(byName.values());
}

function normalizeAndFilterServices(services: TelegramWashServiceItem[]): TelegramWashServiceItem[] {
  const normalized: TelegramWashServiceItem[] = [];
  for (const service of services) {
    const next = normalizeService(service);
    if (next) normalized.push(next);
  }
  return deduplicateServices(normalized);
}

function toSimpleEmployeeList(employees: Employee[]): Array<{ id: string; fullName: string }> {
  return employees.map((employee) => ({ id: employee.id, fullName: employee.fullName }));
}

function toSimpleClientList<T extends { id: string; name: string }>(items: T[]): Array<{ id: string; name: string }> {
  return items.map((item) => ({ id: item.id, name: item.name }));
}

function hasPlateMatch(plates: Array<{ licensePlate: string }>, normalizedPlate: string): boolean {
  return plates.some((car) => normalizeLicensePlate(car.licensePlate) === normalizedPlate);
}

function extractLastWashData(lastWash: WashEvent | undefined): TelegramWashDetectVehicleResponse['lastWash'] {
  if (!lastWash) return undefined;

  const rawServices: TelegramWashServiceItem[] = [lastWash.services.main, ...lastWash.services.additional].map((item) => ({
    serviceName: item.serviceName,
    price: Number(item.price || 0),
    chemicalConsumption: item.chemicalConsumption,
    isFromLastWash: true,
  }));

  const services = normalizeAndFilterServices(rawServices);
  const comment = Array.isArray(lastWash.driverComments) && lastWash.driverComments.length > 0
    ? lastWash.driverComments[lastWash.driverComments.length - 1].text
    : undefined;

  return {
    id: lastWash.id,
    timestamp: lastWash.timestamp,
    services,
    comment,
  };
}

function rankServicesForSearch(services: TelegramWashServiceItem[], queryRaw: string): TelegramWashServiceItem[] {
  const query = queryRaw.trim().toLowerCase();
  if (!query) return services;

  const numericQuery = query.replace(/[^\d.,]/g, '').replace(',', '.');
  const hasNumericQuery = numericQuery.length > 0;

  return services
    .map((service, index) => {
      const name = service.serviceName.toLowerCase();
      const priceText = String(service.price ?? '').toLowerCase();
      let score = 0;

      if (name === query) score += 120;
      else if (name.startsWith(query)) score += 90;
      else if (name.includes(query)) score += 60;

      if (hasNumericQuery) {
        if (priceText === numericQuery) score += 110;
        else if (priceText.startsWith(numericQuery)) score += 80;
        else if (priceText.includes(numericQuery)) score += 50;
      }

      return { service, score, index };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.index - b.index))
    .map((item) => item.service);
}

function sortServicesWithHistory(services: TelegramWashServiceItem[], lastWashServices: TelegramWashServiceItem[]): TelegramWashServiceItem[] {
  const lastWashNames = new Set(lastWashServices.map((item) => item.serviceName));
  return services
    .slice()
    .sort((a, b) => {
      const aFromLast = lastWashNames.has(a.serviceName);
      const bFromLast = lastWashNames.has(b.serviceName);
      if (aFromLast !== bFromLast) return aFromLast ? -1 : 1;

      const aName = a.serviceName.toLowerCase();
      const bName = b.serviceName.toLowerCase();
      const aPriority = PRIORITY_SERVICE_KEYWORDS.some((keyword) => aName.includes(keyword));
      const bPriority = PRIORITY_SERVICE_KEYWORDS.some((keyword) => bName.includes(keyword));
      if (aPriority !== bPriority) return aPriority ? -1 : 1;

      return a.serviceName.localeCompare(b.serviceName, 'ru');
    });
}

function resolvePageParams(page?: number, pageSize?: number): { page: number; pageSize: number } {
  const parsedPage = Number.isFinite(Number(page)) ? Math.max(1, Math.floor(Number(page))) : 1;
  const parsedSize = Number.isFinite(Number(pageSize)) ? Math.floor(Number(pageSize)) : DEFAULT_PAGE_SIZE;
  const normalizedSize = Math.max(1, Math.min(MAX_PAGE_SIZE, parsedSize));
  return { page: parsedPage, pageSize: normalizedSize };
}

async function readDraftStore(): Promise<WashDraftStoreItem[]> {
  try {
    const raw = await fs.readFile(DRAFT_STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is WashDraftStoreItem => {
        return (
          item &&
          typeof item.draftId === 'string' &&
          typeof item.employeeId === 'string' &&
          typeof item.chatId === 'string' &&
          typeof item.washEventId === 'string' &&
          typeof item.createdAt === 'string'
        );
      })
      .filter((item) => {
        const ts = Date.parse(item.createdAt);
        if (!Number.isFinite(ts)) return false;
        const ageMs = Date.now() - ts;
        return ageMs <= DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000;
      });
  } catch (error: any) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeDraftStore(items: WashDraftStoreItem[]): Promise<void> {
  await fs.mkdir(path.dirname(DRAFT_STORE_PATH), { recursive: true });
  await fs.writeFile(DRAFT_STORE_PATH, JSON.stringify(items, null, 2), 'utf-8');
}

async function registerDraftResult(item: WashDraftStoreItem): Promise<void> {
  const current = await readDraftStore();
  const filtered = current.filter((entry) => entry.draftId !== item.draftId);
  filtered.push(item);
  await writeDraftStore(filtered);
}

async function findDraftResult(draftId: string): Promise<WashDraftStoreItem | null> {
  const current = await readDraftStore();
  const found = current.find((entry) => entry.draftId === draftId);
  if (!found) return null;
  await writeDraftStore(current);
  return found;
}

function sanitizeDraftId(draftId: string): string {
  return draftId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withDraftFileLock<T>(draftId: string, action: () => Promise<T>): Promise<T> {
  await fs.mkdir(DRAFT_LOCKS_DIR, { recursive: true });
  const lockPath = path.join(DRAFT_LOCKS_DIR, `${sanitizeDraftId(draftId)}.lock`);
  let lockHandle: fs.FileHandle | null = null;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      lockHandle = await fs.open(lockPath, 'wx');
      break;
    } catch (error: any) {
      if (error?.code !== 'EEXIST') {
        throw error;
      }
      await delay(50);
    }
  }

  if (!lockHandle) {
    throw new Error('Не удалось получить блокировку draftId, попробуйте снова');
  }

  try {
    return await action();
  } finally {
    try {
      await lockHandle.close();
    } catch {
      // ignore close error
    }
    try {
      await fs.unlink(lockPath);
    } catch {
      // ignore lock cleanup error
    }
  }
}

async function resolveDraftToResponse(draftId: string): Promise<TelegramWashSubmitResponse | null> {
  const existingDraft = await findDraftResult(draftId);
  if (!existingDraft) return null;

  const existingEvent = await getWashEventById(existingDraft.washEventId);
  if (!existingEvent) return null;

  return {
    washEventId: existingEvent.id,
    totalAmount: existingEvent.totalAmount,
    netAmount: Number(existingEvent.netAmount ?? existingEvent.totalAmount),
    paymentMethod: existingEvent.paymentMethod,
    sourceId: existingEvent.sourceId,
    sourceName: existingEvent.sourceName,
    createdAt: existingEvent.timestamp,
  };
}

function ensurePaymentMethod(input: string): TelegramWashPaymentMethod {
  if (
    input !== 'cash' &&
    input !== 'card' &&
    input !== 'transfer' &&
    input !== 'aggregator' &&
    input !== 'counterAgentContract'
  ) {
    throw new Error('Некорректный метод оплаты');
  }
  return input;
}

function createTelegramWashEventId(draftId: string): string {
  const hash = crypto.createHash('sha1').update(draftId).digest('hex').slice(0, 12);
  return `we_tg_${hash}`;
}

export async function getWashBootstrap(employeeId: string): Promise<TelegramWashBootstrapResponse> {
  const normalizedEmployeeId = String(employeeId || '').trim();
  if (!normalizedEmployeeId) {
    throw new Error('employeeId is required');
  }

  const [employees, shifts] = await Promise.all([getEmployeesData(), getShiftsData()]);
  const employee = employees.find((item) => item.id === normalizedEmployeeId);
  if (!employee) {
    throw new Error('Сотрудник не найден');
  }

  const today = getTodayYmd();
  const todayShifts = shifts.filter((shift) => shift.date === today && shift.employeeIds.includes(normalizedEmployeeId));
  const activeShift = todayShifts[0];

  return {
    employeeId: normalizedEmployeeId,
    today,
    isAllowed: Boolean(activeShift),
    blockReason: activeShift ? undefined : 'Сотрудник не назначен в смену на сегодня',
    activeShift: activeShift
      ? {
          id: activeShift.id,
          date: activeShift.date,
          boxNumber: activeShift.boxNumber,
          shiftType: activeShift.shiftType,
          startTime: activeShift.startTime,
          endTime: activeShift.endTime,
        }
      : undefined,
    teamEmployees: toSimpleEmployeeList(employees.filter((item) => !isEmployeeAdmin(item))),
  };
}

export async function detectVehicleContext(vehicleNumber: string): Promise<TelegramWashDetectVehicleResponse> {
  const normalizedVehicleNumber = normalizeLicensePlate(String(vehicleNumber || '').trim());
  if (!normalizedVehicleNumber) {
    throw new Error('vehicleNumber is required');
  }

  const [counterAgents, aggregators, washEvents] = await Promise.all([
    getActiveCounterAgentsData(),
    getAggregatorsData(),
    getWashEventsData(),
  ]);

  const detectedCounterAgent = counterAgents.find((agent) => hasPlateMatch(agent.cars || [], normalizedVehicleNumber));
  const detectedAggregators = aggregators.filter((aggregator) => hasPlateMatch(aggregator.cars || [], normalizedVehicleNumber));

  const lastWash = washEvents.find((event) => normalizeLicensePlate(event.vehicleNumber) === normalizedVehicleNumber);
  const recommendedPaymentMethod: TelegramWashDetectVehicleResponse['recommendedPaymentMethod'] = detectedCounterAgent
    ? 'counterAgentContract'
    : detectedAggregators.length > 0
      ? 'aggregator'
      : 'cash';

  const detectedAggregatorIds = new Set(detectedAggregators.map((item) => item.id));
  const detectedCounterAgentId = detectedCounterAgent?.id;

  return {
    vehicleNumber: String(vehicleNumber || '').trim(),
    normalizedVehicleNumber,
    recommendedPaymentMethod,
    detectedCounterAgent: detectedCounterAgent ? { id: detectedCounterAgent.id, name: detectedCounterAgent.name } : undefined,
    detectedAggregators: toSimpleClientList(detectedAggregators),
    availableAggregators: aggregators.map((item) => ({
      id: item.id,
      name: item.name,
      isDetected: detectedAggregatorIds.has(item.id),
    })),
    availableCounterAgents: counterAgents.map((item) => ({
      id: item.id,
      name: item.name,
      isDetected: item.id === detectedCounterAgentId,
    })),
    lastWash: extractLastWashData(lastWash),
  };
}

function getAggregatorActiveList(aggregator: Aggregator): { name?: string; services: PriceListItem[] } {
  const activeList = aggregator.priceLists.find((item) => item.name === aggregator.activePriceListName) ?? aggregator.priceLists[0];
  return {
    name: activeList?.name,
    services: activeList?.services || [],
  };
}

export async function buildServicesCatalog(input: BuildCatalogInput): Promise<TelegramWashServicesResponse> {
  const paymentMethod = ensurePaymentMethod(String(input.paymentMethod || '').trim());
  const normalizedVehicleNumber = normalizeLicensePlate(String(input.vehicleNumber || '').trim());
  if (!normalizedVehicleNumber) {
    throw new Error('vehicleNumber is required');
  }

  const [retailPriceConfig, counterAgents, aggregators, washContext] = await Promise.all([
    getRetailPriceConfig(),
    getActiveCounterAgentsData(),
    getAggregatorsData(),
    detectVehicleContext(normalizedVehicleNumber),
  ]);

  const lastWashServices = washContext.lastWash?.services || [];
  let allowCustomServices = false;
  let priceListName: string | undefined;
  let sourceServices: PriceListItem[] = [];
  let additionalServices: PriceListItem[] = [];

  if (paymentMethod === 'aggregator') {
    const sourceId = String(input.sourceId || '').trim();
    if (!sourceId) {
      throw new Error('sourceId is required for aggregator payment');
    }
    const aggregator = aggregators.find((item) => item.id === sourceId);
    if (!aggregator) {
      throw new Error('Агрегатор не найден');
    }
    const activeList = getAggregatorActiveList(aggregator);
    sourceServices = activeList.services;
    priceListName = activeList.name;
    allowCustomServices = false;
  } else if (paymentMethod === 'counterAgentContract') {
    const sourceId = String(input.sourceId || '').trim() || washContext.detectedCounterAgent?.id || '';
    if (!sourceId) {
      throw new Error('sourceId is required for counterAgentContract payment');
    }
    const counterAgent = counterAgents.find((item) => item.id === sourceId);
    if (!counterAgent) {
      throw new Error('Контрагент не найден');
    }
    sourceServices = counterAgent.priceList || [];
    additionalServices = counterAgent.additionalPriceList || [];
    allowCustomServices = counterAgent.allowCustomServices ?? true;
  } else {
    sourceServices = retailPriceConfig.mainPriceList || [];
    additionalServices = retailPriceConfig.additionalPriceList || [];
    allowCustomServices = retailPriceConfig.allowCustomRetailServices ?? true;
  }

  const current = normalizeAndFilterServices([
    ...sourceServices.map((item) => ({
      serviceName: item.serviceName,
      price: Number(item.price || 0),
      chemicalConsumption: item.chemicalConsumption,
    })),
    ...additionalServices.map((item) => ({
      serviceName: item.serviceName,
      price: Number(item.price || 0),
      chemicalConsumption: item.chemicalConsumption,
    })),
  ]);

  const lastWashOnly = normalizeAndFilterServices(lastWashServices);
  const existingNames = new Set(current.map((item) => item.serviceName));
  const appendedLastWash = [...current];
  for (const item of lastWashOnly) {
    if (!existingNames.has(item.serviceName)) {
      appendedLastWash.push({ ...item, isFromLastWash: true });
    }
  }

  const sorted = sortServicesWithHistory(appendedLastWash, lastWashOnly);
  const query = String(input.query || '').trim();
  const filtered = query ? rankServicesForSearch(sorted, query) : sorted;

  const { page, pageSize } = resolvePageParams(input.page, input.pageSize);
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize).map((item, idx) => ({
    ...item,
    token: `i${start + idx}`,
  }));

  return {
    page: safePage,
    pageSize,
    totalItems,
    totalPages,
    query,
    allowCustomServices,
    priceListName,
    items: pageItems,
  };
}

async function appendAggregatorCarIfMissing(aggregator: Aggregator, normalizedVehicleNumber: string): Promise<void> {
  if (hasPlateMatch(aggregator.cars || [], normalizedVehicleNumber)) {
    return;
  }

  const nextIndex = (aggregator.cars?.length || 0) + 1;
  const nextCar = {
    id: `car_${aggregator.id}_${nextIndex}_${normalizedVehicleNumber}`,
    licensePlate: normalizedVehicleNumber,
  };
  const updatedAggregator: Aggregator = {
    ...aggregator,
    cars: [...(aggregator.cars || []), nextCar],
  };

  await saveEntity('aggregator', updatedAggregator);
  invalidateAggregatorsCache();
}

function buildEmployeeConsumptions(
  service: TelegramWashServiceItem,
  teamEmployeeIds: string[]
): Array<{ employeeId: string; amount: number }> {
  const totalConsumption = Number(service.chemicalConsumption || 0);
  const perEmployee = teamEmployeeIds.length > 0 ? totalConsumption / teamEmployeeIds.length : 0;
  return teamEmployeeIds.map((employeeId) => ({ employeeId, amount: perEmployee }));
}

function createWashEventPayload(params: {
  eventId: string;
  employeeId: string;
  teamEmployeeIds: string[];
  normalizedVehicleNumber: string;
  paymentMethod: TelegramWashPaymentMethod;
  sourceId?: string;
  sourceName?: string;
  priceListName?: string;
  selectedServices: TelegramWashServiceItem[];
  comment?: string;
  cardAcquiringPercentage: number;
}): WashEvent {
  const mainService = params.selectedServices[0];
  const additionalServices = params.selectedServices.slice(1);
  const totalAmount = params.selectedServices.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const acquiringFee =
    params.paymentMethod === 'card' ? totalAmount * (Math.max(0, params.cardAcquiringPercentage) / 100) : 0;
  const netAmount = totalAmount - acquiringFee;

  const driverComment: WashComment | undefined = params.comment
    ? {
        text: params.comment,
        authorId: params.employeeId,
        date: new Date().toISOString(),
      }
    : undefined;

  return {
    id: params.eventId,
    timestamp: new Date().toISOString(),
    vehicleNumber: params.normalizedVehicleNumber,
    employeeIds: params.teamEmployeeIds,
    paymentMethod: params.paymentMethod,
    sourceId: params.sourceId,
    sourceName: params.sourceName,
    priceListName: params.priceListName,
    totalAmount,
    netAmount,
    acquiringFee,
    services: {
      main: {
        serviceName: mainService.serviceName,
        price: mainService.price,
        isCustom: Boolean(mainService.isCustom),
        chemicalConsumption: mainService.chemicalConsumption,
        employeeConsumptions: buildEmployeeConsumptions(mainService, params.teamEmployeeIds),
      },
      additional: additionalServices.map((item) => ({
        serviceName: item.serviceName,
        price: item.price,
        isCustom: Boolean(item.isCustom),
        chemicalConsumption: item.chemicalConsumption,
        employeeConsumptions: buildEmployeeConsumptions(item, params.teamEmployeeIds),
      })),
    },
    driverComments: driverComment ? [driverComment] : undefined,
  };
}

async function createWashFromTelegramDraftImpl(input: TelegramWashSubmitRequest): Promise<TelegramWashSubmitResponse> {
  const employeeId = String(input.employeeId || '').trim();
  const chatId = String(input.chatId || '').trim();
  const draftId = String(input.draftId || '').trim();
  const paymentMethod = ensurePaymentMethod(String(input.paymentMethod || '').trim());
  const normalizedVehicleNumber = normalizeLicensePlate(String(input.vehicleNumber || '').trim());

  if (!employeeId) throw new Error('employeeId is required');
  if (!chatId) throw new Error('chatId is required');
  if (!draftId) throw new Error('draftId is required');
  if (!normalizedVehicleNumber) throw new Error('vehicleNumber is required');

  const existing = await resolveDraftToResponse(draftId);
  if (existing) return existing;

  const [employees, retailPriceConfig, counterAgents, aggregators, detectedVehicle] = await Promise.all([
    getEmployeesData(),
    getRetailPriceConfig(),
    getActiveCounterAgentsData(),
    getAggregatorsData(),
    detectVehicleContext(normalizedVehicleNumber),
  ]);

  const actor = employees.find((item) => item.id === employeeId);
  if (!actor) throw new Error('Сотрудник не найден');
  if (isEmployeeAdmin(actor)) throw new Error('Администратор не может оформлять мойку через /wash');

  const requestedTeam = Array.isArray(input.teamEmployeeIds) ? input.teamEmployeeIds : [];
  const uniqueTeam = Array.from(new Set(requestedTeam.map((item) => String(item || '').trim()).filter(Boolean)));
  if (!uniqueTeam.includes(employeeId)) {
    uniqueTeam.unshift(employeeId);
  }

  const teamEmployees = uniqueTeam
    .map((teamEmployeeId) => employees.find((item) => item.id === teamEmployeeId))
    .filter((item): item is Employee => Boolean(item) && !isEmployeeAdmin(item!));

  const teamEmployeeIds = Array.from(new Set(teamEmployees.map((item) => item.id)));
  if (teamEmployeeIds.length === 0) {
    throw new Error('Команда исполнителей пуста');
  }
  if (!teamEmployeeIds.includes(employeeId)) {
    throw new Error('Инициатор мойки должен быть в команде');
  }

  const selectedServices = normalizeAndFilterServices(input.selectedServices || []);
  if (selectedServices.length === 0) {
    throw new Error('Не выбрано ни одной услуги');
  }

  let sourceId = String(input.sourceId || '').trim();
  let sourceName: string | undefined;
  let priceListName: string | undefined;

  if (paymentMethod === 'aggregator') {
    if (!sourceId) throw new Error('Для оплаты через агрегатор нужно выбрать агрегатора');
    const aggregator = aggregators.find((item) => item.id === sourceId);
    if (!aggregator) throw new Error('Агрегатор не найден');
    sourceName = aggregator.name;
    priceListName = getAggregatorActiveList(aggregator).name;
    await appendAggregatorCarIfMissing(aggregator, normalizedVehicleNumber);
  }

  if (paymentMethod === 'counterAgentContract') {
    if (!sourceId) {
      sourceId = detectedVehicle.detectedCounterAgent?.id || '';
    }
    if (!sourceId) throw new Error('Для оплаты по договору нужно выбрать контрагента');
    const counterAgent = counterAgents.find((item) => item.id === sourceId);
    if (!counterAgent) throw new Error('Контрагент не найден');
    sourceName = counterAgent.name;
  }

  if (paymentMethod === 'cash' || paymentMethod === 'card' || paymentMethod === 'transfer') {
    sourceId = '';
    sourceName = undefined;
    priceListName = undefined;
  }

  const washEvent = createWashEventPayload({
    eventId: createTelegramWashEventId(draftId),
    employeeId,
    teamEmployeeIds,
    normalizedVehicleNumber,
    paymentMethod,
    sourceId: sourceId || undefined,
    sourceName,
    priceListName,
    selectedServices,
    comment: String(input.comment || '').trim() || undefined,
    cardAcquiringPercentage: Number(retailPriceConfig.cardAcquiringPercentage || 0),
  });

  const savedEvent = await createWashEvent(washEvent);
  await registerDraftResult({
    draftId,
    employeeId,
    chatId,
    washEventId: savedEvent.id,
    createdAt: new Date().toISOString(),
  });

  return {
    washEventId: savedEvent.id,
    totalAmount: savedEvent.totalAmount,
    netAmount: Number(savedEvent.netAmount ?? savedEvent.totalAmount),
    paymentMethod: savedEvent.paymentMethod,
    sourceId: savedEvent.sourceId,
    sourceName: savedEvent.sourceName,
    createdAt: savedEvent.timestamp,
  };
}

export async function createWashFromTelegramDraft(input: TelegramWashSubmitRequest): Promise<TelegramWashSubmitResponse> {
  const draftId = String(input.draftId || '').trim();
  if (!draftId) {
    throw new Error('draftId is required');
  }

  const existing = await resolveDraftToResponse(draftId);
  if (existing) return existing;

  const activePromise = inFlightDraftSubmits.get(draftId);
  if (activePromise) {
    return activePromise;
  }

  const submitPromise = withDraftFileLock(draftId, async () => {
    const alreadySaved = await resolveDraftToResponse(draftId);
    if (alreadySaved) return alreadySaved;
    return createWashFromTelegramDraftImpl(input);
  });
  inFlightDraftSubmits.set(draftId, submitPromise);
  try {
    return await submitPromise;
  } finally {
    if (inFlightDraftSubmits.get(draftId) === submitPromise) {
      inFlightDraftSubmits.delete(draftId);
    }
  }
}
