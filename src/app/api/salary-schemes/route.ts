export const dynamic = "force-dynamic";


import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import type { SalaryScheme } from '@/types';
import { getSalarySchemesData, invalidateSalarySchemesCache } from '@/lib/data-loader';
import { requireAdmin } from '@/lib/server-auth';

const dataDir = path.join(process.cwd(), 'data', 'salary-schemes');

async function ensureDataDirectory() {
  try {
    await fs.access(dataDir);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      await fs.mkdir(dataDir, { recursive: true });
    } else {
      throw error;
    }
  }
}

export async function GET() {
  try {
    const schemes = await getSalarySchemesData();
    return NextResponse.json(schemes);
  } catch (error) {
    console.error('Error reading salary schemes directory:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    await ensureDataDirectory();
    const newScheme: SalaryScheme = await request.json();
    if (!newScheme.id) {
       return NextResponse.json({ error: 'Scheme ID is required' }, { status: 400 });
    }
    const filePath = path.join(dataDir, `${newScheme.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(newScheme, null, 2), 'utf-8');
    invalidateSalarySchemesCache();
    return NextResponse.json({ message: 'Scheme created successfully', scheme: newScheme }, { status: 201 });
  } catch (error) {
    console.error('Error creating scheme:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
