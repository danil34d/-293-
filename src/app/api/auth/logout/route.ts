export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { serializeClearedEmployeeAuthCookie } from '@/lib/employee-auth-cookie';

export async function POST(request: Request) {
  const cookie = serializeClearedEmployeeAuthCookie(request);

  const response = NextResponse.json({ message: 'Logged out successfully' });
  response.headers.set('Set-Cookie', cookie);
  return response;
}
