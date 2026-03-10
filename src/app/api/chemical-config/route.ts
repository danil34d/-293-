import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import type { ChemicalConfig } from '@/types';
import { requireAdmin } from '@/lib/server-auth';

const CHEMICAL_CONFIG_FILE = path.join(process.cwd(), 'data', 'chemical-config.json');

export async function GET() {
  try {
    const data = await fs.readFile(CHEMICAL_CONFIG_FILE, 'utf-8');
    const config: ChemicalConfig = JSON.parse(data);
    return NextResponse.json(config);
  } catch (error) {
    console.error('Error reading chemical config:', error);
    // Return default config if file doesn't exist
    const defaultConfig: ChemicalConfig = {
      concentratePricePer22kg: 3000,
      volumeWeightKg: 5.79,
      dilutionRatio: '1:3',
    };
    return NextResponse.json(defaultConfig);
  }
}

export async function PUT(req: NextRequest) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const config: ChemicalConfig = await req.json();

    // Validate the config
    if (!config.concentratePricePer22kg || config.concentratePricePer22kg <= 0) {
      return NextResponse.json(
        { error: 'Некорректная цена концентрата' },
        { status: 400 }
      );
    }

    if (!config.volumeWeightKg || config.volumeWeightKg <= 0) {
      return NextResponse.json(
        { error: 'Некорректный вес партии' },
        { status: 400 }
      );
    }

    if (!['1:3', '1:1'].includes(config.dilutionRatio)) {
      return NextResponse.json(
        { error: 'Некорректное разведение' },
        { status: 400 }
      );
    }

    await fs.writeFile(CHEMICAL_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    return NextResponse.json(config);
  } catch (error) {
    console.error('Error saving chemical config:', error);
    return NextResponse.json(
      { error: 'Ошибка сохранения настроек' },
      { status: 500 }
    );
  }
}
