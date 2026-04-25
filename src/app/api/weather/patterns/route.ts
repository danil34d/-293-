export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import { getWeatherPatterns } from '@/lib/data';
import { saveWeatherPatternsData } from '@/lib/data/write-helpers';

// GET — read all patterns
export async function GET() {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const data = await getWeatherPatterns();
  if (!data) {
    return NextResponse.json({ error: 'Файл паттернов не найден' }, { status: 404 });
  }
  return NextResponse.json(data);
}

// PUT — update a single pattern (by id) or add a new one
export async function PUT(request: Request) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { id, name, description, loadLevel, weight } = body;

    if (!id) {
      return NextResponse.json({ error: 'id обязателен' }, { status: 400 });
    }

    const data = await getWeatherPatterns();
    if (!data) {
      return NextResponse.json({ error: 'Файл паттернов не найден' }, { status: 404 });
    }

    const idx = data.patterns.findIndex((p: any) => p.id === id);
    if (idx === -1) {
      // Add new pattern
      data.patterns.push({
        id,
        name: name || id,
        description: description || '',
        loadLevel: loadLevel || 'normal',
        weight: weight ?? 1.0,
        confirmations: 0,
        corrections: 0,
      });
    } else {
      // Update existing
      if (name !== undefined) data.patterns[idx].name = name;
      if (description !== undefined) data.patterns[idx].description = description;
      if (loadLevel !== undefined) data.patterns[idx].loadLevel = loadLevel;
      if (weight !== undefined) data.patterns[idx].weight = weight;
    }

    data.lastUpdated = new Date().toISOString();
    await saveWeatherPatternsData(data);

    return NextResponse.json({ ok: true, patterns: data.patterns });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Ошибка сервера' }, { status: 500 });
  }
}

// DELETE — remove a custom pattern by id
export async function DELETE(request: Request) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id обязателен' }, { status: 400 });
    }

    // Don't allow deleting built-in patterns
    const builtIn = ['strong_precip', 'light_precip', 'surge_after_precip', 'after_precip_dry', 'thaw_freeze', 'frost_no_blizzard', 'good_weather', 'default'];
    if (builtIn.includes(id)) {
      return NextResponse.json({ error: 'Нельзя удалить встроенный паттерн' }, { status: 400 });
    }

    const data = await getWeatherPatterns();
    if (!data) {
      return NextResponse.json({ error: 'Файл паттернов не найден' }, { status: 404 });
    }

    data.patterns = data.patterns.filter((p: any) => p.id !== id);
    data.lastUpdated = new Date().toISOString();
    await saveWeatherPatternsData(data);

    return NextResponse.json({ ok: true, patterns: data.patterns });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Ошибка сервера' }, { status: 500 });
  }
}
