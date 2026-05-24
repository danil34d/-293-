export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import { getEmployeeById, getEmployeeSchemeImpact, getSalarySchemesData } from '@/lib/data';

/**
 * GET /api/employees/[id]/scheme-impact
 *
 * Возвращает реальные финансовые метрики работы сотрудника для
 * Live Impact Preview в EmployeeForm (см. SchemeImpactPreview).
 *
 * Заменяет placeholder (monthsWorked=8, monthlyTurnover=78000) на реальные
 * данные из WashEvent. UI считает дельту ZP как:
 *   monthlyTurnover * deltaPercent / 100 * monthsWorked
 *
 * Опциональный query: ?newSchemeId=xxx — оценка финансового эффекта
 * с конкретной новой схемой (если она percentage). Если новая схема
 * 'unassigned' или rate-based — возвращает базовые метрики без projectedDelta.
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Employee ID is required' }, { status: 400 });
  }

  try {
    const employee = await getEmployeeById(id);
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    const impact = await getEmployeeSchemeImpact(id);

    // Optional: если передан newSchemeId — посчитать projected delta
    const url = new URL(request.url);
    const newSchemeId = url.searchParams.get('newSchemeId');

    let projection: {
      oldSchemeId: string | null;
      newSchemeId: string | null;
      oldPercent: number | null;
      newPercent: number | null;
      deltaPercent: number | null;
      monthlyDeltaRub: number | null;
      totalDeltaRub: number | null;
      reason?: string;
    } | null = null;

    if (newSchemeId) {
      const schemes = await getSalarySchemesData();
      const oldScheme = employee.salarySchemeId
        ? schemes.find(s => s.id === employee.salarySchemeId) ?? null
        : null;
      const newScheme = newSchemeId === 'unassigned'
        ? null
        : schemes.find(s => s.id === newSchemeId) ?? null;

      const oldPercent = oldScheme?.type === 'percentage' ? oldScheme.percentage ?? 0 : null;
      const newPercent = newScheme?.type === 'percentage' ? newScheme.percentage ?? 0 : null;

      // Если одна из схем не percentage — точно посчитать дельту нельзя
      // (rate-схема зависит от услуг, не от оборота)
      if (oldPercent === null || newPercent === null) {
        projection = {
          oldSchemeId: employee.salarySchemeId ?? null,
          newSchemeId: newSchemeId === 'unassigned' ? null : newSchemeId,
          oldPercent,
          newPercent,
          deltaPercent: null,
          monthlyDeltaRub: null,
          totalDeltaRub: null,
          reason: oldPercent === null && newPercent === null
            ? 'Обе схемы — rate-based, дельта зависит от услуг в каждой мойке'
            : 'Меняется тип схемы (percentage ↔ rate), точная дельта не вычисляется',
        };
      } else {
        const deltaPercent = newPercent - oldPercent;
        const monthlyDelta = Math.round((impact.monthlyTurnover * deltaPercent) / 100);
        const totalDelta = monthlyDelta * impact.monthsWorked;
        projection = {
          oldSchemeId: employee.salarySchemeId ?? null,
          newSchemeId: newSchemeId === 'unassigned' ? null : newSchemeId,
          oldPercent,
          newPercent,
          deltaPercent,
          monthlyDeltaRub: monthlyDelta,
          totalDeltaRub: totalDelta,
        };
      }
    }

    return NextResponse.json({
      employeeId: id,
      fullName: employee.fullName,
      currentSchemeId: employee.salarySchemeId ?? null,
      ...impact,
      projection,
    });
  } catch (error: any) {
    console.error(`Error computing scheme-impact for employee ${id}:`, error);
    return NextResponse.json(
      { error: error.message ?? 'Internal Server Error' },
      { status: 500 }
    );
  }
}
