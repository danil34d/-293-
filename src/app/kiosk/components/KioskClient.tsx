'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Users, AlertTriangle } from 'lucide-react';
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

      {/* Сводка моек ТЕКУЩЕЙ смены (без чужих смен — приватность) */}
      <div className="grid grid-cols-3 gap-2">
        <SummaryTile label="Всего" value={String(shiftCount)} sublabel="моек" color="gray" />
        <SummaryTile label="Бокс 1" value={String(box1Count)} sublabel="моек" color="blue" />
        <SummaryTile label="Бокс 2" value={String(box2Count)} sublabel="моек" color="green" />
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
}: {
  label: string;
  value: string;
  sublabel: string;
  color: 'gray' | 'blue' | 'green';
}) {
  const colorClasses = {
    gray: 'text-gray-700 bg-gray-50',
    blue: 'text-blue-700 bg-blue-50',
    green: 'text-emerald-700 bg-emerald-50',
  };
  return (
    <div className={`rounded-lg p-3 ${colorClasses[color]} text-center`}>
      <div className="text-xs font-medium opacity-80">{label}</div>
      <div className="text-3xl font-bold mt-1">{value}</div>
      <div className="text-[11px] opacity-70">{sublabel}</div>
    </div>
  );
}
