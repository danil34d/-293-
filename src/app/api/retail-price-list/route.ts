export const dynamic = "force-dynamic";


import { NextResponse } from 'next/server';
import type { RetailPriceConfig } from '@/types';
import { getRetailPriceConfig, invalidateRetailPriceConfigCache } from '@/lib/data';
import { requireAdmin } from '@/lib/server-auth';
import { saveRetailPriceConfigData } from '@/lib/data/write-helpers';

export async function GET() {
  try {
    const data = await getRetailPriceConfig();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error reading retail price list:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
    const auth = requireAdmin();
    if (auth instanceof NextResponse) return auth;

    try {
        const newPriceConfig: RetailPriceConfig = await request.json();
        // Basic validation
        if (!newPriceConfig || !Array.isArray(newPriceConfig.mainPriceList) || !Array.isArray(newPriceConfig.additionalPriceList)) {
            return NextResponse.json({ error: 'Invalid data format.' }, { status: 400 });
        }
        await saveRetailPriceConfigData(newPriceConfig);
        invalidateRetailPriceConfigCache();
        return NextResponse.json({ message: 'Price list updated successfully' });
    } catch (error: any) {
        console.error('Error writing retail price list:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
