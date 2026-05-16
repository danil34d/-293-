/**
 * Phase 23: автогенерация title отчёта по периоду.
 * Вынесено в отдельный модуль чтобы pg-adapter.ts (импортируется из 'use server' flow)
 * не содержал sync-экспортов — Next.js валидирует, что все экспорты из server-action
 * цепочки async.
 *
 * "Отчёт за май 2026" если период = весь календарный месяц,
 * "Отчёт 01.05.2026 — 15.05.2026" иначе.
 */
export function generateReportTitle(periodStart: Date, periodEnd: Date): string {
  const monthsRu = [
    'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
    'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'
  ];
  const sameMonth = periodStart.getFullYear() === periodEnd.getFullYear()
    && periodStart.getMonth() === periodEnd.getMonth();
  const firstDay = periodStart.getDate() === 1;
  const lastDay = new Date(periodEnd.getFullYear(), periodEnd.getMonth() + 1, 0).getDate() === periodEnd.getDate();
  if (sameMonth && firstDay && lastDay) {
    return `Отчёт за ${monthsRu[periodStart.getMonth()]} ${periodStart.getFullYear()}`;
  }
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  return `Отчёт ${fmt(periodStart)} — ${fmt(periodEnd)}`;
}
