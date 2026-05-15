import type { Inventory, StockMovement, WashComment, WashEvent } from '@/types';
import {
  getInventory,
  invalidateInventoryCache,
  invalidateStockMovementsCache,
  invalidateWashEventsCache,
  getEmployeesData,
  isSalaryPeriodClosed,
  findShiftForTimestamp,
} from '@/lib/data';
import { createWashEventAtomic, readEntity } from '@/lib/data/write-helpers';
import { isCompletedWashEvent } from '@/lib/wash-event-status';
import { isKiosk } from '@/lib/employee-role';

function calculateTotalChemicalConsumption(washEvent: WashEvent, inventory: Inventory): number {
  if (!isCompletedWashEvent(washEvent)) {
    return 0;
  }

  let total = 0;

  if (washEvent.services.main.chemicalConsumption) {
    total += washEvent.services.main.chemicalConsumption;
  }

  if (Array.isArray(washEvent.services.additional)) {
    for (const service of washEvent.services.additional) {
      if (service.chemicalConsumption) {
        total += service.chemicalConsumption;
      }
    }
  }

  if (total === 0 && inventory.settings?.autoDeductChemical !== false) {
    const settings = inventory.settings;
    if (settings?.dilutionEnabled && settings?.dilutionRatio) {
      const solutionPerWash = settings.solutionPerWashFull ?? settings.solutionPerWash ?? 700;
      total = Math.round(solutionPerWash / (settings.dilutionRatio + 1));
    } else {
      total = settings?.defaultChemicalConsumptionPerWash ?? 700;
    }
  }

  return total;
}

function calculateChemicalCost(consumedGrams: number, inventory: Inventory): number {
  if (consumedGrams <= 0) return 0;

  const chemicalMaterial = inventory.materials?.find((item) => item.category === 'chemical' && item.isActive);
  if (chemicalMaterial?.pricePerUnit) {
    return Math.round(consumedGrams * chemicalMaterial.pricePerUnit * 100) / 100;
  }

  if (inventory.settings?.chemicalPricePerKg) {
    return Math.round((consumedGrams / 1000) * inventory.settings.chemicalPricePerKg * 100) / 100;
  }

  return 0;
}

function normalizeLegacyComments(washEvent: WashEvent): void {
  const legacyDriverComment = (washEvent as WashEvent & { driverComment?: WashComment }).driverComment;
  if (legacyDriverComment) {
    washEvent.driverComments = [legacyDriverComment];
    delete (washEvent as WashEvent & { driverComment?: WashComment }).driverComment;
  }
}

export async function createWashEvent(washEvent: WashEvent): Promise<WashEvent> {
  if (!washEvent.id) {
    throw new Error('Wash event ID is required');
  }

  // Check for duplicate via data adapter (PG or JSON)
  const existing = await readEntity<WashEvent>('washEvent', washEvent.id);
  if (existing) {
    return existing;
  }

  // 🔥 Server-side подстраховка для bug 11b (retroactive timestamp).
  // Если есть привязка cameraSession и её end != null, и end отличается от
  // переданного timestamp больше чем на 5 минут — значит клиент мог не применить
  // правильный timestamp (старая версия APK или старая страница). Перезаписываем.
  const cs = (washEvent as WashEvent & { cameraSession?: { end?: string | null; start?: string | null } }).cameraSession;
  if (cs) {
    const csEndRaw = cs.end || cs.start;
    if (csEndRaw) {
      const normalized = csEndRaw.includes('_') ? csEndRaw.replace('_', 'T') : csEndRaw;
      const csTime = new Date(normalized);
      const evtTime = new Date(washEvent.timestamp);
      if (Number.isFinite(csTime.getTime()) && Number.isFinite(evtTime.getTime())) {
        const diffMs = Math.abs(csTime.getTime() - evtTime.getTime());
        if (diffMs > 5 * 60 * 1000) {
          console.warn(
            `[wash-event] timestamp mismatch with cameraSession (diff ${Math.round(diffMs / 60000)}min). ` +
            `Overriding ${washEvent.timestamp} → ${csTime.toISOString()} for retroactive consistency.`
          );
          washEvent.timestamp = csTime.toISOString();
        }
      }
    }
  }

  // 🔥 Phase 11 / finding #39: правильный shiftId на retroactive POST.
  // Раньше клиент проставлял shiftId из текущей смены бокса (workstation/page.tsx),
  // но при оформлении вчерашней мойки timestamp идёт от камеры (вчера), а shiftId
  // оставался сегодняшний. shift-report-service строка 57 матчит по shiftId →
  // вчерашняя мойка попадала в сегодняшний отчёт.
  //
  // Решение: если timestamp отстаёт от now() более чем на 30 минут, ищем
  // исторический shift по date+box+washId+shiftType и перезаписываем shiftId.
  // Если не нашли (смены не было) — оставляем как есть (клиент сам разберётся).
  try {
    const ts = washEvent.timestamp;
    const box = washEvent.boxNumber;
    if (ts && (box === 1 || box === 2)) {
      const ageMs = Date.now() - new Date(ts).getTime();
      if (ageMs > 30 * 60 * 1000) {
        const correctShiftId = await findShiftForTimestamp(ts, box);
        if (correctShiftId && correctShiftId !== washEvent.shiftId) {
          console.warn(
            `[wash-event] retroactive POST: shiftId перезаписан ${washEvent.shiftId ?? '∅'} → ${correctShiftId} (timestamp ${ts}, бокс ${box}). Wash ID: ${washEvent.id}`
          );
          washEvent.shiftId = correctShiftId;
        }
      }
    }
  } catch (err) {
    // Best-effort — если lookup упал, не блокируем создание.
    console.warn('[wash-event] shift lookup failed:', err);
  }

  // 🔥 Phase 8 / finding #38: проверка SalaryPeriod для retroactive POST.
  // PUT/DELETE wash-events уже блокируются 423 при closed period (Phase 4B).
  // Но POST с timestamp в прошлом обходил защиту — мог сломать выплаченный ZP.
  //
  // Решение владельца: НЕ блокировать (сотрудник может оформить вчерашнюю мойку
  // даже если месяц закрыт), но пометить флагом + написать какой период был закрыт.
  // Админ видит amber-бэйдж в /wash-log → решает вручную пересчитать ZP.
  try {
    const ts = washEvent.timestamp;
    if (ts) {
      const month = new Date(ts).toISOString().slice(0, 7);
      const closed = await isSalaryPeriodClosed(month);
      if (closed) {
        washEvent.createdInClosedPeriod = true;
        washEvent.closedPeriodAtCreate = month;
        console.warn(
          `[wash-event] retroactive POST в закрытый период ${month} — флаг createdInClosedPeriod=true. Wash ID: ${washEvent.id}`
        );
      }
    }
  } catch (err) {
    // Best-effort — если SalaryPeriod check упал, не блокируем создание мойки.
    console.warn('[wash-event] SalaryPeriod check failed:', err);
  }

  // 🔥 ФИКС 2026-05-05: Защита от попадания терминалов (kiosk/kiosk1) в employeeIds.
  // Терминал — устройство, не сотрудник. Если попал — мойка делилась на N+1 чел.
  // и устройство получало долю зарплаты. Server-side last line of defense.
  if (Array.isArray(washEvent.employeeIds) && washEvent.employeeIds.length > 0) {
    try {
      const allEmployees = await getEmployeesData();
      const filtered = washEvent.employeeIds.filter((id) => {
        const emp = allEmployees.find((e) => e.id === id);
        return emp && !isKiosk(emp);
      });
      if (filtered.length !== washEvent.employeeIds.length) {
        console.warn(
          `[wash-event] Отфильтрован терминал из employeeIds: ${washEvent.employeeIds.join(',')} → ${filtered.join(',')}`,
        );
        washEvent.employeeIds = filtered;
      }
    } catch (err) {
      console.error('[wash-event] не удалось проверить employeeIds на kiosk:', err);
    }
  }

  normalizeLegacyComments(washEvent);

  const inventory = await getInventory();
  const consumedChemicals = calculateTotalChemicalConsumption(washEvent, inventory);
  if (consumedChemicals > 0) {
    washEvent.chemicalConsumptionGrams = consumedChemicals;
    washEvent.chemicalCostRub = calculateChemicalCost(consumedChemicals, inventory);
  }

  // Prepare stock movement and inventory update
  let stockMovement: StockMovement | null = null;
  let updatedInventory: Inventory | null = null;

  if (consumedChemicals > 0 && inventory.settings?.autoDeductChemical !== false) {
    const newBalance = inventory.chemicalStockGrams - consumedChemicals;

    stockMovement = {
      id: `mov_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      materialId: 'mat_chemical_main',
      type: 'consumption',
      amount: -consumedChemicals,
      balanceAfter: newBalance,
      date: new Date().toISOString(),
      description: `Автосписание при мойке #${washEvent.id}`,
      relatedEntityType: 'wash_event',
      relatedEntityId: washEvent.id,
      employeeId: washEvent.employeeIds[0],
    };

    inventory.chemicalStockGrams = newBalance;
    const materials = inventory.materials ?? [];
    const chemicalMaterial = materials.find((item) => item.category === 'chemical' && item.isActive);
    if (chemicalMaterial) {
      const idx = materials.findIndex((item) => item.id === chemicalMaterial.id);
      if (idx >= 0) {
        materials[idx].currentStock = newBalance;
        materials[idx].updatedAt = new Date().toISOString();
      }
    }
    inventory.materials = materials;
    updatedInventory = inventory;
  }

  // Prepare client balance change
  const clientBalanceChange = (washEvent.sourceId && washEvent.totalAmount > 0)
    ? { sourceId: washEvent.sourceId, amount: -washEvent.totalAmount }
    : null;

  // Atomic write: wash event + stock movement + inventory + client balance
  // For PG: single transaction (all-or-nothing)
  // For JSON: sequential writes (backward compatible)
  await createWashEventAtomic({
    washEvent,
    stockMovement,
    inventory: updatedInventory,
    clientBalanceChange,
  });

  // Invalidate caches (no-op for PG, real for JSON)
  invalidateWashEventsCache();
  if (updatedInventory) {
    invalidateInventoryCache();
    invalidateStockMovementsCache();
  }

  return washEvent;
}
