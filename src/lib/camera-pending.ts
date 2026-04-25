import type { WashEvent } from '@/types';
import { getWashEventsData } from '@/lib/data-loader';
import { normalizeLicensePlate } from '@/lib/utils';
import { blocksCameraPendingQueue, isCompletedWashEvent } from '@/lib/wash-event-status';

const CAMERA_DASHBOARD_BASE_URL =
  process.env.CAMERA_DASHBOARD_BASE_URL?.trim() || 'http://192.168.1.59:8050';

type CameraShift = 'day' | 'night';

interface CameraSession {
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
}

export interface PendingCameraVehicle {
  id: string;
  boxNumber: 1 | 2;
  plateNumber: string | null;
  normalizedPlate: string;
  vehicleClass: string | null;
  start: string | null;
  end: string | null;
  durationSec: number;
  dirName: string;
  plateConfidence: number;
  hasThumbnail: boolean;
  hasGrid: boolean;
}

function getLinkedCameraSessionDir(event: WashEvent): string {
  const directLink = typeof event.cameraSession?.dirName === 'string'
    ? event.cameraSession.dirName.trim()
    : '';
  if (directLink) return directLink;

  const legacyMetadata = (event as WashEvent & { metadata?: Record<string, unknown> }).metadata;
  const legacyDir = typeof legacyMetadata?.cameraSessionDir === 'string'
    ? legacyMetadata.cameraSessionDir.trim()
    : '';
  return legacyDir;
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function parseSessionTime(value: string | null | undefined) {
  if (!value) return 0;
  const normalized = value.includes('_') ? value.replace('_', 'T') : value;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

async function fetchCameraSessionsByShift(shift: CameraShift): Promise<CameraSession[]> {
  try {
    const response = await fetch(
      `${CAMERA_DASHBOARD_BASE_URL}/api/sessions/today?shift=${shift}`,
      { cache: 'no-store' }
    );

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as unknown;
    return Array.isArray(data) ? (data as CameraSession[]) : [];
  } catch (error) {
    console.error(`Failed to fetch camera sessions for shift ${shift}:`, error);
    return [];
  }
}

export async function getCameraSessionsForToday(): Promise<CameraSession[]> {
  const todayKey = getTodayKey();
  const [daySessions, nightSessions] = await Promise.all([
    fetchCameraSessionsByShift('day'),
    fetchCameraSessionsByShift('night'),
  ]);

  const uniqueSessions = new Map<string, CameraSession>();

  for (const session of [...daySessions, ...nightSessions]) {
    if (!session?.dir_name) continue;
    if (session.start && !session.start.startsWith(todayKey)) continue;
    uniqueSessions.set(session.dir_name, session);
  }

  return Array.from(uniqueSessions.values()).sort(
    (left, right) => parseSessionTime(right.start) - parseSessionTime(left.start)
  );
}

export function buildPendingCameraVehicles(
  cameraSessions: CameraSession[],
  washEvents: WashEvent[]
): PendingCameraVehicle[] {
  const todayKey = getTodayKey();
  const processedCounts = new Map<string, number>();
  const processedSessionDirs = new Set<string>();

  for (const event of washEvents) {
    if (!event.timestamp?.startsWith(todayKey)) continue;
    const linkedDirName = getLinkedCameraSessionDir(event);
    if (linkedDirName && blocksCameraPendingQueue(event)) {
      processedSessionDirs.add(linkedDirName);
    }
    if (!isCompletedWashEvent(event)) continue;
    const normalizedPlate = normalizeLicensePlate(String(event.vehicleNumber || '').trim());
    if (!normalizedPlate) continue;
    processedCounts.set(normalizedPlate, (processedCounts.get(normalizedPlate) || 0) + 1);
  }

  const matchedCounts = new Map<string, number>();
  const sortedSessions = [...cameraSessions].sort(
    (left, right) => parseSessionTime(left.start) - parseSessionTime(right.start)
  );
  const pendingVehicles: PendingCameraVehicle[] = [];

  for (const session of sortedSessions) {
    const boxNumber = session.box === 2 ? 2 : session.box === 1 ? 1 : null;
    if (!boxNumber) continue;
    if (session.is_negative) continue;
    if (!session.end) continue;
    if (processedSessionDirs.has(session.dir_name)) continue;

    const plateNumber = String(session.plate_number || '').trim() || null;
    const normalizedPlate = normalizeLicensePlate(plateNumber || '');

    const processed = normalizedPlate ? (processedCounts.get(normalizedPlate) || 0) : 0;
    const matched = normalizedPlate ? (matchedCounts.get(normalizedPlate) || 0) : 0;

    if (normalizedPlate && matched < processed) {
      matchedCounts.set(normalizedPlate, matched + 1);
      continue;
    }

    const candidate: PendingCameraVehicle = {
      id: normalizedPlate ? `${session.dir_name}:${normalizedPlate}` : session.dir_name,
      boxNumber,
      plateNumber,
      normalizedPlate,
      vehicleClass: session.vehicle_class,
      start: session.start,
      end: session.end,
      durationSec: Number(session.duration_sec || 0),
      dirName: session.dir_name,
      plateConfidence: Number(session.plate_confidence || 0),
      hasThumbnail: Boolean(session.has_thumbnail),
      hasGrid: Boolean(session.has_grid),
    };

    pendingVehicles.push(candidate);
  }

  return pendingVehicles
    .sort(
      (left, right) =>
        parseSessionTime(right.end || right.start) -
        parseSessionTime(left.end || left.start)
    )
    .slice(0, 20);
}

export async function getPendingCameraVehicles(
  washEvents?: WashEvent[]
): Promise<PendingCameraVehicle[]> {
  const [cameraSessions, sourceWashEvents] = await Promise.all([
    getCameraSessionsForToday(),
    washEvents ? Promise.resolve(washEvents) : getWashEventsData(),
  ]);

  return buildPendingCameraVehicles(cameraSessions, sourceWashEvents);
}
