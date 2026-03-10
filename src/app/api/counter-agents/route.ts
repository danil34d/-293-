export const dynamic = "force-dynamic";


import { NextResponse } from 'next/server';
import { getActiveCounterAgentsData, getCounterAgentsData } from '@/lib/data-loader';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const includeArchived = searchParams.get('includeArchived') === 'true';
    const agents = includeArchived
      ? await getCounterAgentsData()
      : await getActiveCounterAgentsData();
    return NextResponse.json(agents);
  } catch (error) {
    console.error('Error reading counter agents directory:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
