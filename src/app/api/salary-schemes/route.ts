export const dynamic = "force-dynamic";


import { NextResponse } from 'next/server';
import type { SalaryScheme } from '@/types';
import { getSalarySchemesData, invalidateSalarySchemesCache } from '@/lib/data';
import { requireAdmin } from '@/lib/server-auth';
import { saveEntity } from '@/lib/data/write-helpers';

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
    const newScheme: SalaryScheme = await request.json();
    if (!newScheme.id) {
       return NextResponse.json({ error: 'Scheme ID is required' }, { status: 400 });
    }
    await saveEntity('salaryScheme', newScheme);
    invalidateSalarySchemesCache();
    return NextResponse.json({ message: 'Scheme created successfully', scheme: newScheme }, { status: 201 });
  } catch (error) {
    console.error('Error creating scheme:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
