"use client";

import * as React from "react";
import { Calculator as CalculatorIcon, TrendingUp, Droplets, Users, Percent } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Phase 28a / V2-#22 — Калькулятор прибыли (общий симулятор).
 * Read-only, ничего не сохраняется. Параметры → расчёт прибыли с одной мойки
 * + дневной/месячный прогноз.
 */

function CalcRow({ label, value, onChange, suffix }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Label className="text-[13px] font-semibold text-slate-700 flex-1">{label}</Label>
      <div className="relative">
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-32 text-right tabular-nums font-bold pr-10"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 pointer-events-none">
          {suffix}
        </span>
      </div>
    </div>
  );
}

function CalcLine({ label, value, negative }: { label: string; value: number; negative?: boolean }) {
  return (
    <div className="flex items-baseline justify-between text-[13px]">
      <span className="text-slate-600">{label}</span>
      <span className={`font-bold tabular-nums ${negative ? "text-rose-700" : "text-emerald-700"}`}>
        {negative ? "−" : "+"}{value.toFixed(0)} ₽
      </span>
    </div>
  );
}

export function ProfitCalculator() {
  // Phase 28a: V2 defaults — типовая мойка 800 ₽, 300 гр химии, 22 рабочих дня
  const [washPrice, setWashPrice] = React.useState(800);
  const [chemGr, setChemGr] = React.useState(300);
  const [chemPricePerKg, setChemPricePerKg] = React.useState(150);
  const [washesPerDay, setWashesPerDay] = React.useState(20);
  const [salaryPercent, setSalaryPercent] = React.useState(45);
  const [workDaysPerMonth, setWorkDaysPerMonth] = React.useState(22);

  // Computed
  const chemCost = (chemGr / 1000) * chemPricePerKg;
  const employeeCost = (washPrice * salaryPercent) / 100;
  const profit = washPrice - chemCost - employeeCost;
  const margin = washPrice > 0 ? Math.round((profit / washPrice) * 100) : 0;
  const dailyRevenue = washPrice * washesPerDay;
  const dailyProfit = profit * washesPerDay;
  const monthlyProfit = dailyProfit * workDaysPerMonth;
  const monthlyRevenue = dailyRevenue * workDaysPerMonth;

  return (
    <div className="space-y-4 max-w-[1200px]">
      <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 flex items-center gap-2 text-[12px] text-emerald-900">
        <CalculatorIcon className="w-4 h-4 text-emerald-600 flex-shrink-0" />
        <div>
          <b>Симуляция · ничего не сохраняется.</b> Расчёт прибыли по одной мойке + дневной и месячный прогноз. Меняйте параметры — результат пересчитается мгновенно.
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LEFT: Параметры */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <div className="text-[13px] font-bold text-slate-900 flex items-center gap-2 pb-2 border-b border-slate-100">
            <CalculatorIcon className="w-4 h-4 text-blue-600" />
            Параметры
          </div>
          <CalcRow label="Цена мойки" value={washPrice} onChange={setWashPrice} suffix="₽" />
          <CalcRow label="Расход химии на мойку" value={chemGr} onChange={setChemGr} suffix="гр" />
          <CalcRow label="Цена химии за кг" value={chemPricePerKg} onChange={setChemPricePerKg} suffix="₽/кг" />

          <div className="border-t border-slate-100 pt-3 space-y-3">
            <CalcRow label="Моек в день" value={washesPerDay} onChange={setWashesPerDay} suffix="шт" />
            <CalcRow label="Процент мойщика" value={salaryPercent} onChange={setSalaryPercent} suffix="%" />
            <CalcRow label="Рабочих дней в месяце" value={workDaysPerMonth} onChange={setWorkDaysPerMonth} suffix="дн" />
          </div>
        </div>

        {/* RIGHT: Себестоимость + прогноз */}
        <div className="space-y-3">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-3">
              Себестоимость одной мойки
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500">Цена для клиента</div>
              <div className="text-[28px] font-extrabold tabular-nums mt-1 text-[#0088CC]">
                {washPrice.toFixed(0)} ₽
              </div>
            </div>

            <div className="border-t border-slate-100 mt-3 pt-3 space-y-2">
              <CalcLine label="Химия" value={chemCost} negative />
              <CalcLine label={`ЗП мойщика (${salaryPercent}%)`} value={employeeCost} negative />
            </div>

            <div className="border-t border-slate-100 mt-3 pt-3 flex items-baseline justify-between">
              <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500">
                Прибыль с одной мойки
              </span>
              <span className={`text-[24px] font-extrabold tabular-nums ${profit > 0 ? "text-emerald-700" : "text-rose-700"}`}>
                {profit.toFixed(0)} ₽
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-slate-500">Маржа</span>
              <span className={`font-bold tabular-nums ${margin > 30 ? "text-emerald-700" : margin > 15 ? "text-amber-700" : "text-rose-700"}`}>
                {margin}%
              </span>
            </div>
          </div>

          <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-5">
            <div className="text-[10px] uppercase tracking-wider font-bold text-emerald-800 mb-3 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />
              Прогноз
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">День</div>
                <div className="text-[18px] font-extrabold text-emerald-700 tabular-nums mt-1">
                  {dailyProfit.toFixed(0)} ₽
                </div>
                <div className="text-[10px] text-slate-500">прибыль</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Месяц</div>
                <div className="text-[18px] font-extrabold text-emerald-700 tabular-nums mt-1">
                  {(monthlyProfit / 1000).toFixed(0)}к ₽
                </div>
                <div className="text-[10px] text-slate-500">прибыль ({workDaysPerMonth} дн)</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Выручка/день</div>
                <div className="text-[18px] font-extrabold text-slate-900 tabular-nums mt-1">
                  {(dailyRevenue / 1000).toFixed(1)}к ₽
                </div>
                <div className="text-[10px] text-slate-500">{washesPerDay} × {washPrice} ₽</div>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-emerald-200 grid grid-cols-2 gap-3 text-[11px]">
              <div>
                <span className="text-slate-600">Выручка/месяц:</span>
                <span className="ml-2 font-bold tabular-nums text-slate-900">
                  {(monthlyRevenue / 1000).toFixed(0)}к ₽
                </span>
              </div>
              <div>
                <span className="text-slate-600">Профит/мойка:</span>
                <span className={`ml-2 font-bold tabular-nums ${profit > 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  {profit.toFixed(0)} ₽
                </span>
              </div>
            </div>
          </div>

          {/* Подсказки по интерпретации */}
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-2 text-[11px] text-slate-600">
            <div className="flex items-start gap-2">
              <Percent className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
              <div>
                <b>Маржа &gt;30%</b> — здоровая мойка. <b>15-30%</b> — норма. <b>&lt;15%</b> — стоит поднять цены или сократить расход химии.
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Droplets className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
              <div>
                <b>Расход 300 гр</b> — типовая легковая. Кроссовер 400 гр, внедорожник 500 гр, тягач 700, фура 900.
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Users className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
              <div>
                <b>Процент мойщика</b> — обычно 45% (стандарт), 30% (стажёр), 60% (опытный по уникальной схеме).
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
