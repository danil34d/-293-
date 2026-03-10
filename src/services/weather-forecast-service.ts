import fs from 'fs/promises';
import path from 'path';

export const VYAZNIKI_LOCATION = {
  name: 'Вязники, Владимирская область',
  // Approximate coordinates for Vyazniki, Vladimir Oblast (works well enough for local forecast).
  latitude: 56.2407,
  longitude: 42.1675,
  timezone: 'Europe/Moscow',
} as const;

export const STRONG_PRECIP_THRESHOLDS = {
  precipMm: 8,
  snowCm: 2,
} as const;

export interface VyaznikiForecastDay {
  date: string; // YYYY-MM-DD
  precipMm: number;
  snowCm: number;
  weatherCode: number | null;
  tMin: number | null;
  tMax: number | null;
  windMax: number | null;
}

export interface VyaznikiForecastSnapshot {
  fetchedAt: string; // ISO
  location: typeof VYAZNIKI_LOCATION;
  forecastWindow: { start: string | null; end: string | null };
  days: VyaznikiForecastDay[];
  source: {
    provider: 'open-meteo';
    url: string;
  };
}

export interface VyaznikiForecastResult extends VyaznikiForecastSnapshot {
  stale: boolean;
}

const WEATHER_CACHE_DIR = path.join(process.cwd(), 'data', '_meta', 'weather-cache');
const WEATHER_CACHE_FILE = path.join(WEATHER_CACHE_DIR, 'open-meteo_vyazniki.json');

const CACHE_TTL_MS = 5 * 60 * 60 * 1000; // 5 hours
const STALE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

function toFiniteNumber(value: unknown, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return num;
}

function toFiniteNumberOrNull(value: unknown): number | null {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  return num;
}

export function classifyStrongPrecip(day: Pick<VyaznikiForecastDay, 'precipMm' | 'snowCm'>): boolean {
  return (day.precipMm >= STRONG_PRECIP_THRESHOLDS.precipMm) || (day.snowCm >= STRONG_PRECIP_THRESHOLDS.snowCm);
}

export function classifyGoodWeather(day: Pick<VyaznikiForecastDay, 'precipMm' | 'snowCm' | 'weatherCode'>): boolean {
  // Open-Meteo weather codes:
  // 0 clear, 1 mainly clear, 2 partly cloudy, 3 overcast, ...
  // We treat "солнышко/хорошая погода" as codes 0..2 with low precipitation/snow.
  const code = day.weatherCode;
  const isSunnyCode = code === 0 || code === 1 || code === 2;
  if (!isSunnyCode) return false;
  if (day.precipMm >= 1) return false;
  if (day.snowCm >= 0.1) return false;
  return true;
}

async function readCacheFile(): Promise<VyaznikiForecastSnapshot | null> {
  try {
    const raw = await fs.readFile(WEATHER_CACHE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<VyaznikiForecastSnapshot>;
    if (!parsed || typeof parsed.fetchedAt !== 'string' || !Array.isArray(parsed.days)) return null;
    return parsed as VyaznikiForecastSnapshot;
  } catch {
    return null;
  }
}

async function writeCacheFile(snapshot: VyaznikiForecastSnapshot): Promise<void> {
  await fs.mkdir(WEATHER_CACHE_DIR, { recursive: true });
  await fs.writeFile(WEATHER_CACHE_FILE, JSON.stringify(snapshot, null, 2), 'utf-8');
}

async function fetchOpenMeteoForecast(): Promise<VyaznikiForecastSnapshot> {
  const { latitude, longitude, timezone } = VYAZNIKI_LOCATION;
  const params = new URLSearchParams();
  params.set('latitude', String(latitude));
  params.set('longitude', String(longitude));
  params.set('timezone', timezone);
  params.set('forecast_days', '16');
  params.set(
    'daily',
    [
      'weathercode',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_sum',
      'snowfall_sum',
      'windspeed_10m_max',
    ].join(',')
  );

  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Open-Meteo: HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }

  const json = await res.json() as any;
  const daily = json?.daily;
  const times = daily?.time;
  if (!Array.isArray(times) || times.length === 0) {
    throw new Error('Open-Meteo: нет daily.time');
  }

  const days: VyaznikiForecastDay[] = times.map((date: unknown, idx: number) => {
    const precipMm = toFiniteNumber(daily?.precipitation_sum?.[idx], 0);
    const snowCm = toFiniteNumber(daily?.snowfall_sum?.[idx], 0);
    return {
      date: String(date),
      precipMm,
      snowCm,
      weatherCode: toFiniteNumberOrNull(daily?.weathercode?.[idx]),
      tMin: toFiniteNumberOrNull(daily?.temperature_2m_min?.[idx]),
      tMax: toFiniteNumberOrNull(daily?.temperature_2m_max?.[idx]),
      windMax: toFiniteNumberOrNull(daily?.windspeed_10m_max?.[idx]),
    };
  });

  return {
    fetchedAt: new Date().toISOString(),
    location: VYAZNIKI_LOCATION,
    forecastWindow: { start: String(times[0]), end: String(times[times.length - 1]) },
    days,
    source: { provider: 'open-meteo', url },
  };
}

export async function getVyaznikiDailyForecast(options?: { forceRefresh?: boolean }): Promise<VyaznikiForecastResult> {
  const forceRefresh = options?.forceRefresh === true;
  const now = Date.now();

  const cached = await readCacheFile();
  if (cached && !forceRefresh) {
    const fetchedAtMs = Date.parse(cached.fetchedAt);
    const ageMs = Number.isFinite(fetchedAtMs) ? now - fetchedAtMs : Number.POSITIVE_INFINITY;
    if (ageMs <= CACHE_TTL_MS) {
      return { ...cached, stale: false };
    }
  }

  try {
    const fresh = await fetchOpenMeteoForecast();
    try {
      await writeCacheFile(fresh);
    } catch {
      // Cache is best-effort. Ignore file system errors to keep forecast usable.
    }
    return { ...fresh, stale: false };
  } catch (error) {
    if (cached) {
      const fetchedAtMs = Date.parse(cached.fetchedAt);
      const ageMs = Number.isFinite(fetchedAtMs) ? now - fetchedAtMs : Number.POSITIVE_INFINITY;
      if (ageMs <= STALE_MAX_AGE_MS) {
        return { ...cached, stale: true };
      }
    }
    throw error;
  }
}
