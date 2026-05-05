'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Users, AlertTriangle, ClipboardList } from 'lucide-react';
import type { Employee } from '@/types';

interface KioskClientProps {
  todayEmployeeIds: string[];
  employees: Employee[];           // только реальные люди (без kiosk/kiosk1)
  shiftCount: number;
  box1Count: number;
  box2Count: number;
  shiftTotal: number;              // только мойки текущей смены (приватность)
  shiftLabel: string;              // 'дневной смены' / 'ночной смены'
  unprocessedCount: number;
}

export function KioskClient({
  todayEmployeeIds,
  employees,
  shiftCount,
  box1Count,
  box2Count,
  shiftTotal,
  shiftLabel,
  unprocessedCount,
}: KioskClientProps) {
  const todayPeople = employees.filter((e) => todayEmployeeIds.includes(e.id));

  return (
    <div className="max-w-2xl mx-auto space-y-3 px-1">
      {/* Кто сегодня (только реальные люди — терминал не показываем) */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-blue-600" />
            <span className="font-semibold text-gray-900">Сегодня на смене</span>
          </div>
          {todayPeople.length === 0 ? (
            <p className="text-sm text-gray-500 italic">— нет запланированных смен —</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {todayPeople.map((emp) => (
                <span
                  key={emp.id}
                  className="inline-flex items-center px-3 py-1.5 rounded-full bg-blue-100 text-blue-800 text-sm font-semibold"
                >
                  {emp.fullName?.split(' ').slice(0, 2).join(' ') || emp.username}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 🚀 ГЛАВНОЕ ДЕЙСТВИЕ — большая кнопка «Оформить заказ».
          Bottom-nav Оформить — мелкая (для повторных переходов между страницами).
          Эта кнопка — основной CTA на главной (как «Заказать машину» в Uber).
          NB: вернулась после правки 5 мая — без неё мойщик с главной не понимал куда жать. */}
      <Link
        href="/kiosk/order"
        className="block bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl shadow-lg transition-colors min-h-[88px] flex items-center justify-center gap-3 px-4"
      >
        <ClipboardList className="h-7 w-7" />
        <span className="text-xl font-bold">Оформить машину</span>
      </Link>

      {/* Сводка моек ТЕКУЩЕЙ смены (без чужих смен — приватность).
          Плитки боксов кликабельны → ведут на оформление с preset бокса. */}
      <div className="grid grid-cols-3 gap-2">
        <SummaryTile label="Всего" value={String(shiftCount)} sublabel="моек" color="gray" />
        <SummaryTile label="Бокс 1" value={String(box1Count)} sublabel="моек" color="blue" href="/kiosk/order?box=1" />
        <SummaryTile label="Бокс 2" value={String(box2Count)} sublabel="моек" color="green" href="/kiosk/order?box=2" />
      </div>

      {/* Касса текущей смены (не за весь день — иначе видно выручку чужой смены) */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <span className="text-sm text-gray-600">Касса {shiftLabel}:</span>
          <span className="text-2xl font-bold text-green-700">
            {shiftTotal.toLocaleString('ru-RU')} ₽
          </span>
        </CardContent>
      </Card>

      {/* Алерт о неоформленных (если есть) */}
      {unprocessedCount > 0 && (
        <Link
          href="/kiosk/history"
          className="block bg-orange-50 border-2 border-orange-300 rounded-lg p-4 hover:bg-orange-100 active:bg-orange-200 transition-colors"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-orange-600 flex-shrink-0" />
            <div className="flex-1">
              <div className="font-bold text-orange-900">
                ⚠ Неоформленных моек: {unprocessedCount}
              </div>
              <div className="text-xs text-orange-700 mt-0.5">
                Тапните чтобы посмотреть и оформить →
              </div>
            </div>
          </div>
        </Link>
      )}
      {/* Блок подсказок убран — bottom-nav сама себя объясняет иконками+подписями. */}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  sublabel,
  color,
  href,
}: {
  label: string;
  value: string;
  sublabel: string;
  color: 'gray' | 'blue' | 'green';
  href?: string;            // если задан — плитка кликабельна
}) {
  const colorClasses = {
    gray: 'text-gray-700 bg-gray-50',
    blue: 'text-blue-700 bg-blue-50 hover:bg-blue-100 active:bg-blue-200',
    green: 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200',
  };
  const inner = (
    <>
      <div className="text-xs font-medium opacity-80">{label}</div>
      <div className="text-3xl font-bold mt-1">{value}</div>
      <div className="text-[11px] opacity-70">{sublabel}</div>
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className={`rounded-lg p-3 ${colorClasses[color]} text-center transition-colors block min-h-[80px]`}
      >
        {inner}
      </Link>
    );
  }
  return (
    <div className={`rounded-lg p-3 ${colorClasses[color]} text-center min-h-[80px]`}>{inner}</div>
  );
}
