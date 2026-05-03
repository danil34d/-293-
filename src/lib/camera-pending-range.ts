/**
 * Расширение camera-pending для произвольного диапазона дат.
 * Используется страницей /wash-log/unprocessed где видны все
 * неоформленные машины за период (а не только за сегодня + текущий shift).
 *
 * Backend: dashboard.py /api/sessions/range?from_date=...&to_date=...&grouped=1
 */

import type { WashEvent } from '@/types';
import { normalizeLicensePlate } from '@/lib/utils';
import { blocksCameraPendingQueue, isCompletedWashEvent } from '@/lib/wash-event-status';

const CAMERA_DASHBOARD_BASE_URL =
  process.env.CAMERA_DASHBOARD_BASE_URL?.trim() || 'http://192.168.1.59:8050';

interface CameraSessionRaw {
  box: number;
  dir_name: string;
  vehicle_class: string | null;
  start: string | null;
  end: string | null;
  duration_sec: number;
  washing_sec: number;
  yolo_detections: number;
  plate_number: string | null;
  plate_confidence: number;
  has_thumbnail: boolean;
  has_grid: boolean;
  is_negative: boolean;
  merged_into?: string | null;
  merge_group_id?: string | null;
  corrected_plate?: string | null;
  note?: string | null;
  is_for_retraining?: boolean;
  is_dismissed?: boolean;
  aggregated_count?: number;
  aggregated_duration_sec?: number;
  is_main?: boolean;
}

export interface UnprocessedCameraVehicle {
  id: string;
  boxNumber: 1 | 2;
  dirName: string;
  /** Распознанный номер (с учётом corrected_plate). null если OCR не нашёл и оператор не правил. */
  plateNumber: string | null;
  normalizedPlate: string;
  vehicleClass: string | null;
  /** Реальное время заезда (по камере, не «сегодня когда оформляют»). */
  actualStart: string | null;
  /** Реальное время выезда. Используется как timestamp для retroactive WashEvent. */
  actualEnd: string | null;
  /** Длительность по камере (с учётом merge-группы). */
  durationSec: number;
  /** YYYY-MM-DD календарной даты для группировки в UI. */
  dateKey: string;
  plateConfidence: number;
  hasThumbnail: boolean;
  hasGrid: boolean;
  isPlateCorrected: boolean;
  note: string | null;
  isMergedGroup: boolean;
  mergedSegmentsCount: number;
}

function parseSessionTime(value: string | null | undefined): number {
  if (!value) return 0;
  const normalized = value.includes('_') ? value.replace('_', 'T') : value;
  const ts = Date.parse(normalized);
  return Number.isFinite(ts) ? ts : 0;
}

function getDateKey(value: string | null | undefined): string {
  if (!value) return '';
  // Поддерживаем оба формата: 2026-05-01_02-07-43 и 2026-05-01T02:52:52
  return value.slice(0, 10);
}

function getLinkedCameraSessionDir(event: WashEvent): string {
  const direct =
    typeof event.cameraSession?.dirName === 'string' ? event.cameraSession.dirName.trim() : '';
  if (direct) return direct;
  const legacy = (event as WashEvent & { metadata?: Record<string, unknown> }).metadata;
  const legacyDir =
    typeof legacy?.cameraSessionDir === 'string' ? legacy.cameraSessionDir.trim() : '';
  return legacyDir;
}

export async function fetchCameraSessionsRange(
  fromDate: string,
  toDate: string
): Promise<CameraSessionRaw[]> {
  const url = `${CAMERA_DASHBOARD_BASE_URL}/api/sessions/range?from_date=${encodeURIComponent(
    fromDate
  )}&to_date=${encodeURIComponent(toDate)}&grouped=1`;
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      console.error(`fetchCameraSessionsRange ${url} -> ${response.status}`);
      return [];
    }
    const data = (await response.json()) as unknown;
    return Array.isArray(data) ? (data as CameraSessionRaw[]) : [];
  } catch (error) {
    console.error('fetchCameraSessionsRange failed:', error);
    return [];
  }
}

/**
 * Строит список неоформленных машин (без WashEvent) за указанный диапазон.
 *
 * Включает:
 *  - Все боксы (1, 2)
 *  - Сессии с end != null (т.е. машина уехала)
 *  - С номером (валидным) ИЛИ без — UI покажет «Номер не определён»
 *
 * Исключает:
 *  - is_negative=1 (ложные срабатывания YOLO)
 *  - is_dismissed=1 (оператор пометил «не оформлять»)
 *  - merged_into != null (дочерние merge-группы)
 *  - Сессии где УЖЕ есть привязанный WashEvent
 *  - Сессии чей нормализованный plate уже потреблён матчем по WashEvent.vehicleNumber
 */
export function buildUnprocessedVehicles(
  cameraSessions: CameraSessionRaw[],
  washEvents: WashEvent[],
  fromDate: string,
  toDate: string
): UnprocessedCameraVehicle[] {
  // 1. Соберём множество directly-linked dir_name из WashEvent
  const linkedDirs = new Set<string>();
  // 2. И счётчики plate-нормализаций (для матча неявного по номеру)
  const consumedByPlate = new Map<string, number>();

  for (const event of washEvents) {
    const ts = event.timestamp || '';
    const dateKey = ts.slice(0, 10);
    if (dateKey < fromDate || dateKey > toDate) continue; // вне окна

    const linkedDir = getLinkedCameraSessionDir(event);
    if (linkedDir && blocksCameraPendingQueue(event)) {
      linkedDirs.add(linkedDir);
    }
    if (!isCompletedWashEvent(event)) continue;
    const plate = normalizeLicensePlate(String(event.vehicleNumber || '').trim());
    if (!plate) continue;
    consumedByPlate.set(plate, (consumedByPlate.get(plate) || 0) + 1);
  }

  // 3. Сортируем камеры по времени (asc), чтобы матчинг шёл по хронологии
  const sortedSessions = [...cameraSessions].sort(
    (a, b) => parseSessionTime(a.start) - parseSessionTime(b.start)
  );

  const matched = new Map<string, number>();
  const result: UnprocessedCameraVehicle[] = [];

  for (const s of sortedSessions) {
    const boxNumber = s.box === 2 ? 2 : s.box === 1 ? 1 : null;
    if (!boxNumber) continue;
    if (s.is_negative) continue;
    if (s.is_dismissed) continue;
    if (s.merged_into) continue;
    if (!s.end) continue; // ещё едет (мойка не закончилась)
    if (linkedDirs.has(s.dir_name)) continue; // уже привязан к WashEvent

    const corrected = String(s.corrected_plate || '').trim() || null;
    const raw = String(s.plate_number || '').trim() || null;
    const plate = corrected || raw;
    const normalizedPlate = normalizeLicensePlate(plate || '');

    // Если есть номер — проверяем не съел ли его уже WashEvent
    if (normalizedPlate) {
      const consumed = consumedByPlate.get(normalizedPlate) || 0;
      const already = matched.get(normalizedPlate) || 0;
      if (already < consumed) {
        matched.set(normalizedPlate, already + 1);
        continue;
      }
    }

    const aggregatedCount = Number(s.aggregated_count || 1);
    const aggregatedDuration = Number(s.aggregated_duration_sec || s.duration_sec || 0);

    result.push({
      id: `${s.dir_name}`,
      boxNumber,
      dirName: s.dir_name,
      plateNumber: plate,
      normalizedPlate,
      vehicleClass: s.vehicle_class,
      actualStart: s.start,
      actualEnd: s.end,
      durationSec: aggregatedDuration,
      dateKey: getDateKey(s.end || s.start),
      plateConfidence: Number(s.plate_confidence || 0),
      hasThumbnail: Boolean(s.has_thumbnail),
      hasGrid: Boolean(s.has_grid),
      isPlateCorrected: Boolean(corrected),
      note: s.note || null,
      isMergedGroup: Boolean(s.is_main && aggregatedCount > 1),
      mergedSegmentsCount: aggregatedCount,
    });
  }

  // Сортировка: новые сверху
  return result.sort(
    (a, b) =>
      parseSessionTime(b.actualEnd || b.actualStart) -
      parseSessionTime(a.actualEnd || a.actualStart)
  );
}
