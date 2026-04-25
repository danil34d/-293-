import type { WashEvent, WashEventLogTimeline } from '@/types';

const CAMERA_DASHBOARD_BASE_URL =
  process.env.CAMERA_DASHBOARD_BASE_URL?.trim() || 'http://192.168.1.59:8050';

type CameraShift = 'day' | 'night';

interface CameraSessionTimeline {
  dir_name: string;
  start: string | null;
  end: string | null;
  duration_sec: number;
  washing_sec: number;
}

function normalizeCameraTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const rawMatch = /^(\d{4}-\d{2}-\d{2})[_ T](\d{2})[-:](\d{2})[-:](\d{2})$/.exec(trimmed);
  const normalized = rawMatch
    ? `${rawMatch[1]}T${rawMatch[2]}:${rawMatch[3]}:${rawMatch[4]}`
    : trimmed;

  return Number.isNaN(Date.parse(normalized)) ? null : normalized;
}

function diffSeconds(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const diff = Math.round((Date.parse(end) - Date.parse(start)) / 1000);
  return Number.isFinite(diff) && diff > 0 ? diff : null;
}

function getSortTimestamp(event: WashEvent): number {
  for (const candidate of [event.logTimeline?.entryAt, event.logTimeline?.exitAt, event.timestamp]) {
    if (!candidate) {
      continue;
    }

    const parsed = Date.parse(candidate);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

async function fetchCameraSessionsByShift(shift: CameraShift): Promise<CameraSessionTimeline[]> {
  try {
    const response = await fetch(
      `${CAMERA_DASHBOARD_BASE_URL}/api/sessions/today?shift=${shift}`,
      { cache: 'no-store' },
    );

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as unknown;
    return Array.isArray(data) ? (data as CameraSessionTimeline[]) : [];
  } catch (error) {
    console.error(`Failed to fetch wash-log camera sessions for ${shift}:`, error);
    return [];
  }
}

async function getTodayCameraSessionMap(): Promise<Map<string, CameraSessionTimeline>> {
  const [daySessions, nightSessions] = await Promise.all([
    fetchCameraSessionsByShift('day'),
    fetchCameraSessionsByShift('night'),
  ]);

  const byDirName = new Map<string, CameraSessionTimeline>();

  for (const session of [...daySessions, ...nightSessions]) {
    if (!session?.dir_name) continue;
    byDirName.set(session.dir_name, session);
  }

  return byDirName;
}

function buildFallbackTimeline(event: WashEvent): WashEventLogTimeline | undefined {
  const entryAt = normalizeCameraTime(event.cameraSession?.start);
  const exitAt = normalizeCameraTime(event.cameraSession?.end);

  if (!entryAt && !exitAt) {
    return undefined;
  }

  return {
    entryAt,
    exitAt,
    washDurationSeconds: diffSeconds(entryAt, exitAt),
    sessionDurationSeconds: diffSeconds(entryAt, exitAt),
    source: 'camera-session-link',
  };
}

function buildCameraTimeline(
  event: WashEvent,
  todaySessionsByDirName: Map<string, CameraSessionTimeline>,
): WashEventLogTimeline | undefined {
  const dirName = String(event.cameraSession?.dirName || '').trim();
  if (!dirName) {
    return buildFallbackTimeline(event);
  }

  const liveSession = todaySessionsByDirName.get(dirName);
  if (!liveSession) {
    return buildFallbackTimeline(event);
  }

  const entryAt = normalizeCameraTime(liveSession.start) || normalizeCameraTime(event.cameraSession?.start);
  const exitAt = normalizeCameraTime(liveSession.end) || normalizeCameraTime(event.cameraSession?.end);
  const sessionDurationSeconds = Number(liveSession.duration_sec || 0) || diffSeconds(entryAt, exitAt);
  const washDurationSeconds = Number(liveSession.washing_sec || 0) || sessionDurationSeconds;

  return {
    entryAt,
    exitAt,
    washDurationSeconds: washDurationSeconds || null,
    sessionDurationSeconds: sessionDurationSeconds || null,
    source: 'camera-dashboard',
  };
}

export async function enrichWashEventsForLog(washEvents: WashEvent[]): Promise<WashEvent[]> {
  const hasCameraSessions = washEvents.some((event) => Boolean(event.cameraSession?.dirName));

  if (!hasCameraSessions) {
    return [...washEvents].sort((left, right) => getSortTimestamp(right) - getSortTimestamp(left));
  }

  const todaySessionsByDirName = await getTodayCameraSessionMap();

  return [...washEvents]
    .map((event) => ({
      ...event,
      logTimeline: buildCameraTimeline(event, todaySessionsByDirName),
    }))
    .sort((left, right) => getSortTimestamp(right) - getSortTimestamp(left));
}
