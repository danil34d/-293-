export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import { archiveSalaryScheme, getSalarySchemeById, invalidateSalarySchemesCache } from '@/lib/data';

/**
 * UX-safety: soft-delete схемы зарплат.
 *
 * Вместо hard DELETE (который через `onDelete: SetNull` молча обнуляет
 * salarySchemeId у всех сотрудников этой схемы — см. АРХИТЕКТУРНЫЕ-НАХОДКИ #1)
 * — устанавливает archived=true, archivedAt=now().
 *
 * UI на /salary-schemes должен использовать этот endpoint когда у схемы есть
 * привязанные сотрудники. История ZP сохраняется, схема скрыта из таблицы.
 *
 * Гард: requireAdmin (только Менеджер Про).
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Scheme ID is required' }, { status: 400 });
  }

  try {
    const existing = await getSalarySchemeById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Salary scheme not found' }, { status: 404 });
    }
    if (existing.archived) {
      return NextResponse.json({ message: 'Already archived', scheme: existing });
    }

    await archiveSalaryScheme(id);
    await invalidateSalarySchemesCache();
    return NextResponse.json({ message: 'Scheme archived', schemeId: id });
  } catch (error: any) {
    console.error(`Error archiving salary scheme ${id}:`, error);
    return NextResponse.json({ error: error.message ?? 'Internal Server Error' }, { status: 500 });
  }
}
