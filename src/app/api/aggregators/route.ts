export const dynamic = "force-dynamic";


import { NextResponse } from 'next/server';
import { getAggregatorsData } from '@/lib/data-loader';

export async function GET() {
  try {
    const aggregators = await getAggregatorsData();
    return NextResponse.json(aggregators);
  } catch (error) {
    console.error('Error reading aggregators directory:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
