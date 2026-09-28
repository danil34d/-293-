export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { getAllFinanceDataForEmployee } from '@/lib/data';
import { requireAdmin } from '@/lib/server-auth';
import { withoutPassword } from '@/lib/employee-safe';

/**
 * Исходные данные для карточки финансов сотрудника (FinanceDashboard).
 *
 * 🔥 ФИКС 2026-09-28: раньше компонент вызывал getAllFinanceDataForEmployee
 * из data-loader напрямую как server action — без проверки роли и с паролями
 * всех сотрудников в ответе.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const data = await getAllFinanceDataForEmployee(params.id);
    return NextResponse.json({
      ...data,
      allEmployees: data.allEmployees.map(withoutPassword),
    });
  } catch (error) {
    console.error(`[employees/${params.id}/finance-data] ошибка чтения:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
