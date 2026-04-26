export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import fs from 'fs/promises';
import path from 'path';
import { classifyGoodWeather, classifyStrongPrecip, getVyaznikiDailyForecast, STRONG_PRECIP_THRESHOLDS, VYAZNIKI_LOCATION, type VyaznikiForecastDay } from '@/services/weather-forecast-service';

function isMonthKey(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

// --- Load level: green (low) / yellow (normal) / orange (high) / red (peak) ---
type LoadLevel = 'low' | 'normal' | 'high' | 'peak';

// --- Weather icon (emoji) based on Open-Meteo weather code ---
function weatherIcon(code: number | null): string {
  if (code === null) return '❓';
  if (code === 0) return '☀️';           // clear
  if (code <= 2) return '🌤️';            // partly cloudy
  if (code === 3) return '☁️';            // overcast
  if (code <= 49) return '🌫️';           // fog
  if (code <= 59) return '🌦️';           // drizzle
  if (code <= 69) return '🌧️';           // rain
  if (code <= 79) return '🌨️';           // snow
  if (code <= 82) return '⛈️';           // rain shower
  if (code <= 86) return '🌨️';           // snow shower
  if (code <= 99) return '⛈️';           // thunderstorm
  return '❓';
}

// --- Human-readable hint for car wash manager ---
interface DayAnalysis {
  loadLevel: LoadLevel;
  recommendedBox1Day: number;
  recommendedBox2Day: number;
  recommendedTotal: number;
  reason: string;
  hint: string;    // short human phrase
  icon: string;    // emoji
  windHint: string | null;
}

// TODO(weather-patterns): эти жёстко прописанные правила — текущий движок прогноза.
// UI на /weather-patterns и /api/weather/patterns хранят пользовательские паттерны
// (AppConfig.weatherPatterns), но сюда они НЕ подключены. План: после накопления
// статистики (DailyStats: погода + кол-во моек + выручка) — заменить эти ветки на
// матчинг по обученным паттернам с весами и confirmations/corrections.
function analyzeDay(
  day: VyaznikiForecastDay,
  prevDay: VyaznikiForecastDay | null,
  nextDay: VyaznikiForecastDay | null,
): DayAnalysis {
  const tMin = day.tMin ?? -999;
  const tMax = day.tMax ?? 999;
  const wind = day.windMax ?? 0;
  const precip = day.precipMm;
  const snow = day.snowCm;
  const code = day.weatherCode ?? -1;
  const isRain = precip >= 3 || (code >= 51 && code <= 69) || (code >= 80 && code <= 82);
  const isSnow = snow >= 1 || (code >= 71 && code <= 77) || (code >= 85 && code <= 86);
  const isStrongPrecip = classifyStrongPrecip(day);
  const isSunny = classifyGoodWeather(day);
  const prevHadPrecip = prevDay ? classifyStrongPrecip(prevDay) : false;
  const prevHadAnyPrecip = prevDay ? (prevDay.precipMm >= 2 || prevDay.snowCm >= 0.5) : false;

  // Frost patterns
  const isFrost = tMin < -3;
  const isThaw = tMax > 2 && tMin < -1;    // daytime thaw + night freeze
  const isColdNoBlizzard = tMin < -5 && !isSnow && wind < 10;

  // Wind hint
  let windHint: string | null = null;
  if (wind >= 15) windHint = `Ветер ${Math.round(wind)} м/с — сильный, работать тяжело`;
  else if (wind >= 10) windHint = `Ветер ${Math.round(wind)} м/с — заметный`;
  else if (wind >= 7) windHint = `Ветер ${Math.round(wind)} м/с — шапку придержи`;

  const ic = weatherIcon(day.weatherCode);

  // === PATTERN: Active precipitation -> LOW ===
  if (isStrongPrecip) {
    return {
      loadLevel: 'low',
      recommendedBox1Day: 1, recommendedBox2Day: 0, recommendedTotal: 1,
      reason: 'strong_precip',
      hint: isSnow
        ? 'Снегопад — машин мало, можно 1 человека'
        : 'Сильный дождь — машин почти нет',
      icon: ic,
      windHint,
    };
  }

  // === PATTERN: Light rain/snow -> LOW-NORMAL ===
  if (isRain || isSnow) {
    return {
      loadLevel: 'low',
      recommendedBox1Day: 1, recommendedBox2Day: 0, recommendedTotal: 1,
      reason: 'light_precip',
      hint: isSnow
        ? 'Небольшой снег — поток слабый'
        : 'Дождик — мало кто едет мыть',
      icon: ic,
      windHint,
    };
  }

  // === PATTERN: Sun after precip -> PEAK ===
  if (prevHadPrecip && isSunny) {
    return {
      loadLevel: 'peak',
      recommendedBox1Day: 2, recommendedBox2Day: 1, recommendedTotal: 3,
      reason: 'surge_after_precip',
      hint: 'После осадков солнце — машины грязные, ПИК!',
      icon: '🔥',
      windHint,
    };
  }

  // === PATTERN: Dry after any precip -> HIGH ===
  if (prevHadAnyPrecip && !isRain && !isSnow) {
    return {
      loadLevel: 'high',
      recommendedBox1Day: 2, recommendedBox2Day: 1, recommendedTotal: 3,
      reason: 'after_precip_dry',
      hint: 'Подсохло после осадков — грязные машины поедут',
      icon: ic,
      windHint,
    };
  }

  // === PATTERN: Thaw + freeze -> HIGH (evening peak) ===
  if (isThaw) {
    return {
      loadLevel: 'high',
      recommendedBox1Day: 2, recommendedBox2Day: 0, recommendedTotal: 2,
      reason: 'thaw_freeze',
      hint: `Оттепель днём (${tMax > 0 ? '+' : ''}${Math.round(tMax)}°), ночью мороз (${Math.round(tMin)}°) — грязь корками, пик к вечеру`,
      icon: '🧊',
      windHint,
    };
  }

  // === PATTERN: Cold + no blizzard -> HIGH ===
  if (isColdNoBlizzard) {
    return {
      loadLevel: 'high',
      recommendedBox1Day: 2, recommendedBox2Day: 0, recommendedTotal: 2,
      reason: 'frost_no_blizzard',
      hint: `Мороз ${Math.round(tMin)}° без метели — реагенты на дорогах, машины грязные`,
      icon: '❄️',
      windHint,
    };
  }

  // === PATTERN: Sunny/clear -> NORMAL-HIGH ===
  if (isSunny) {
    const isWarm = tMax > 15;
    return {
      loadLevel: isWarm ? 'high' : 'normal',
      recommendedBox1Day: 2, recommendedBox2Day: 0, recommendedTotal: 2,
      reason: 'good_weather',
      hint: isWarm
        ? `Тепло и солнечно (+${Math.round(tMax)}°) — стабильный поток`
        : `Ясно, ${tMax > 0 ? '+' : ''}${Math.round(tMax)}° — нормальный день`,
      icon: ic,
      windHint,
    };
  }

  // === DEFAULT: Overcast / mild -> NORMAL ===
  return {
    loadLevel: 'normal',
    recommendedBox1Day: 2, recommendedBox2Day: 0, recommendedTotal: 2,
    reason: 'default',
    hint: `Облачно ${tMax !== 999 ? `${tMax > 0 ? '+' : ''}${Math.round(tMax)}°` : ''} — обычный день`,
    icon: ic,
    windHint,
  };
}

// --- Surge propagation: if day after strong precip is dry, mark 1-3 days as high/peak ---
function propagateSurge(days: (VyaznikiForecastDay & DayAnalysis)[]): void {
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    if (d.loadLevel !== 'low') continue; // only after precip days

    // Look ahead: how many dry days follow?
    let surgeLen = 0;
    for (let j = i + 1; j < days.length && surgeLen < 3; j++) {
      const nd = days[j];
      if (nd.loadLevel === 'low') break; // another precip day stops the surge
      surgeLen++;
    }

    if (surgeLen === 0) continue;

    // First dry day after precip is peak, next 1-2 are high
    for (let k = 0; k < surgeLen && k < 3; k++) {
      const idx = i + 1 + k;
      const target = days[idx];
      if (!target || target.loadLevel === 'low') break;
      if (target.reason === 'surge_after_precip') continue; // already marked

      if (k === 0) {
        target.loadLevel = 'peak';
        target.recommendedBox1Day = 2;
        target.recommendedBox2Day = 1;
        target.recommendedTotal = 3;
        target.reason = 'surge_after_precip';
        target.hint = 'После осадков — ПИК: машины грязные, все едут мыть!';
        target.icon = '🔥';
      } else if (target.loadLevel !== 'peak') {
        target.loadLevel = 'high';
        target.recommendedBox1Day = 2;
        target.recommendedBox2Day = Math.max(target.recommendedBox2Day, 1);
        target.recommendedTotal = target.recommendedBox1Day + target.recommendedBox2Day;
        target.reason = 'after_precip_dry';
        target.hint = 'Ещё едут после осадков — повышенный поток';
      }
    }
  }
}

export async function GET(request: Request) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const month = String(searchParams.get('month') || '').trim();

    if (!month) {
      return NextResponse.json({ error: 'month is required (YYYY-MM)' }, { status: 400 });
    }
    if (!isMonthKey(month)) {
      return NextResponse.json({ error: 'month must be in YYYY-MM format' }, { status: 400 });
    }

    const snapshot = await getVyaznikiDailyForecast();
    const sortedAllDays = [...snapshot.days].sort((a, b) => String(a.date).localeCompare(String(b.date)));

    // Analyze each day
    const analyzed = sortedAllDays.map((d, i) => {
      const prev = i > 0 ? sortedAllDays[i - 1] : null;
      const next = i < sortedAllDays.length - 1 ? sortedAllDays[i + 1] : null;
      const analysis = analyzeDay(d, prev, next);
      return { ...d, ...analysis };
    });

    // Second pass: propagate surge after-precip pattern
    propagateSurge(analyzed);

    // Filter to requested month
    const days = analyzed
      .filter((d) => typeof d?.date === 'string' && d.date.startsWith(month))
      .map((d) => ({
        date: d.date,
        precipMm: d.precipMm,
        snowCm: d.snowCm,
        weatherCode: d.weatherCode,
        tMin: d.tMin,
        tMax: d.tMax,
        windMax: d.windMax,
        isStrongPrecip: classifyStrongPrecip(d),
        isGoodWeather: classifyGoodWeather(d),
        loadLevel: d.loadLevel,
        recommendedBox1Day: d.recommendedBox1Day,
        recommendedBox2Day: d.recommendedBox2Day,
        recommendedTotal: d.recommendedTotal,
        reason: d.reason,
        hint: d.hint,
        icon: d.icon,
        windHint: d.windHint,
      }));

    const strongDaysInMonth = days.filter((d) => d.isStrongPrecip).length;
    const surgeDaysInMonth = days.filter((d) => d.reason === 'surge_after_precip').length;
    const peakDays = days.filter((d) => d.loadLevel === 'peak').length;
    const highDays = days.filter((d) => d.loadLevel === 'high').length;
    const lowDays = days.filter((d) => d.loadLevel === 'low').length;

    const payload = {
      ok: true,
      location: {
        name: VYAZNIKI_LOCATION.name,
        lat: VYAZNIKI_LOCATION.latitude,
        lon: VYAZNIKI_LOCATION.longitude,
        timezone: VYAZNIKI_LOCATION.timezone,
      },
      targetMonth: month,
      generatedAt: snapshot.fetchedAt,
      stale: snapshot.stale,
      thresholds: { ...STRONG_PRECIP_THRESHOLDS },
      days,
      meta: {
        forecastDaysInMonth: days.length,
        strongDaysInMonth,
        surgeDaysInMonth,
        peakDays,
        highDays,
        lowDays,
        forecastWindow: snapshot.forecastWindow,
        source: snapshot.source,
      },
    };

    // Best-effort journal
    try {
      const journalDir = path.join(process.cwd(), 'data', '_meta', 'pattern-journal');
      await fs.mkdir(journalDir, { recursive: true });
      const journalFile = path.join(journalDir, `weather-recommendations-${month}.json`);
      await fs.writeFile(journalFile, JSON.stringify(payload, null, 2), 'utf-8');
      (payload as any).meta.journalFile = `data/_meta/pattern-journal/weather-recommendations-${month}.json`;
    } catch (e) {
      // ignore
    }

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error('Weather forecast error:', error);
    return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}
