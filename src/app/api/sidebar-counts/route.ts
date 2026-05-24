export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import {
  getEmployeesData,
  getActiveCounterAgentsData,
  getAggregatorsData,
  getEmployeeCanistersData,
  getDriverKickbacks,
} from '@/lib/data';

/**
 * Phase 54 / по карте handoff: counts для sidebar badges.
 *
 * GET /api/sidebar-counts → {
 *   employees: number (активные, !archived, !kiosk)
 *   counterAgents: number (активные !archived)
 *   aggregators: number (активные !archived)
 *   canisters: number (status='active')
 *   driverKickbacksPending: number (status='pending')
 * }
 *
 * Не блокирующий — если что-то упадёт, поле просто отсутствует.
 * Под requireAuth (любой залогиненный, sidebar видят все роли).
 */
export async function GET() {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  const result: Record<string, number> = {};

  // Каждый fetch независимый — если один упадёт, остальные работают.
  await Promise.allSettled([
    getEmployeesData().then((rows) => {
      result.employees = rows.filter((e) => !e.archived && e.role !== 'kiosk' && (e.role as any) !== 'kiosk1').length;
    }),
    getActiveCounterAgentsData().then((rows) => {
      result.counterAgents = rows.length;
    }),
    getAggregatorsData().then((rows) => {
      result.aggregators = rows.filter((a) => !a.archived).length;
    }),
    getEmployeeCanistersData().then((rows) => {
      result.canisters = rows.filter((c) => c.status === 'active').length;
    }),
    getDriverKickbacks({ status: 'pending' }).then((rows) => {
      result.driverKickbacksPending = rows.length;
    }),
  ]);

  return NextResponse.json(result);
}
