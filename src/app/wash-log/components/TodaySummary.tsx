import { TrendingUp, Users, DollarSign, Car, Wallet } from 'lucide-react';

/**
 * Итог дня на /wash-log.
 *
 * 🔥 Переписано 09.08.2026. Что было не так:
 *  1. «Всего моек» складывалось ПО СОТРУДНИКАМ — мойка с двумя исполнителями
 *     считалась дважды (09.08: 8 моек в базе → «15» на экране). Средний чек
 *     следом врал: 835 ₽ вместо 1565 ₽.
 *  2. Разбивка по людям вычислялась и тут же выбрасывалась — на экран попадали
 *     только четыре общие цифры. На вопрос «кто сколько заработал» ответа не было.
 *  3. То, что считалось «заработком», было долей выручки (сумма / число
 *     исполнителей) — без схем, процентов, split-услуг и вычетов.
 *     Теперь заработок считает generateSalaryReport на сервере, по схемам,
 *     и он же отсеивает роли-устройства (терминал больше не «сотрудник»).
 */

interface TodayTotals {
  revenue: number;
  washes: number;
  averageCheck: number;
}

interface TodayEarning {
  employeeId: string;
  employeeName: string;
  totalEarnings: number;
  washes: number;
}

interface TodaySummaryProps {
  totals: TodayTotals;
  earnings?: TodayEarning[];
}

export function TodaySummary({ totals, earnings = [] }: TodaySummaryProps) {
  const payrollTotal = earnings.reduce((sum, e) => sum + e.totalEarnings, 0);

  return (
    <div className="summary-card">
      <div className="summary-header">
        <div className="summary-icon">
          <TrendingUp size={20} />
        </div>
        <h3 className="summary-title">Итог за сегодня</h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div className="text-center">
          <div className="mb-2">
            <DollarSign className="w-8 h-8 mx-auto text-green-500" />
          </div>
          <div className="text-2xl font-bold text-green-600">
            {totals.revenue.toLocaleString('ru-RU')} ₽
          </div>
          <div className="text-sm text-gray-600">Общая выручка</div>
        </div>

        <div className="text-center">
          <div className="mb-2">
            <Car className="w-8 h-8 mx-auto text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-blue-600">{totals.washes}</div>
          <div className="text-sm text-gray-600">Всего моек</div>
        </div>

        <div className="text-center">
          <div className="mb-2">
            <Users className="w-8 h-8 mx-auto text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-purple-600">{earnings.length}</div>
          <div className="text-sm text-gray-600">Работали сегодня</div>
        </div>

        <div className="text-center">
          <div className="mb-2">
            <TrendingUp className="w-8 h-8 mx-auto text-orange-500" />
          </div>
          <div className="text-2xl font-bold text-orange-600">
            {totals.averageCheck.toLocaleString('ru-RU')} ₽
          </div>
          <div className="text-sm text-gray-600">Средний чек</div>
        </div>
      </div>

      {/* Кто сколько заработал — раньше этих данных на экране не было вовсе */}
      {earnings.length > 0 && (
        <div className="mt-5 border-t pt-4">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
              <Wallet className="h-4 w-4 text-slate-500" />
              Кто сколько заработал
            </h4>
            <span className="text-xs text-gray-500">
              всего к начислению{' '}
              <b className="text-gray-800">{Math.round(payrollTotal).toLocaleString('ru-RU')} ₽</b>
            </span>
          </div>

          <div className="space-y-1.5">
            {earnings.map((e) => {
              // Полоса — доля этого сотрудника в дневном фонде. Ширина считается
              // от максимума, а не от суммы: так видно разрыв между первым и
              // остальными, даже когда работали двое.
              const max = Math.max(...earnings.map((x) => x.totalEarnings), 1);
              const width = Math.max(4, Math.round((e.totalEarnings / max) * 100));
              return (
                <div key={e.employeeId} className="flex items-center gap-3 text-sm">
                  <span className="w-40 shrink-0 truncate text-gray-800">{e.employeeName}</span>
                  <span className="w-16 shrink-0 text-right text-xs text-gray-500">
                    {e.washes} {e.washes === 1 ? 'мойка' : e.washes < 5 ? 'мойки' : 'моек'}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <span
                      className="block h-full rounded-full bg-emerald-400"
                      style={{ width: `${width}%` }}
                    />
                  </span>
                  <span className="w-24 shrink-0 text-right font-semibold text-gray-900">
                    {Math.round(e.totalEarnings).toLocaleString('ru-RU')} ₽
                  </span>
                </div>
              );
            })}
          </div>

          <p className="mt-2 text-[11px] text-gray-500">
            Заработок посчитан по схемам зарплат на сегодняшние мойки. Вычеты и
            штрафы за период — в «Отчёте по зарплате».
          </p>
        </div>
      )}
    </div>
  );
}
