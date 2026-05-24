'use client';

import * as React from 'react';
import { FolderOpen, Download, X } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import type { CounterAgent, WashEvent, ClientTransaction, OurCompany, Employee, SalaryScheme } from '@/types';

/**
 * Phase 59-report-month: кнопка «Отчёт за месяц» в header контрагента.
 *
 * Открывает модал → выбор месяца → клиентская генерация Markdown-отчёта
 * → автоматический download. Не требует backend API — все данные у клиента.
 *
 * Структура отчёта повторяет образец:
 *   `C:\Users\S\Desktop\Данил\контр агенты отчеты\ИП Орлов\ЭкоФуд\2026-05 Май\Отчёт за май 2026.md`
 */

interface Props {
  agent: CounterAgent;
  washEvents: WashEvent[];
  transactions: ClientTransaction[];
  ourCompany?: OurCompany | null;
  /** DriverKickback pending — необязательно, для секции кикбеков. Если не передан — секция упрощается. */
  driverKickbacks?: Array<{ driverName: string; amount: number; status: string; washEventId: string }> | null;
}

const formatMoney = (n: number) => n.toLocaleString('ru-RU') + ' ₽';

function isInMonth(timestamp: string | Date, year: number, monthIdx: number): boolean {
  const d = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  return d.getFullYear() === year && d.getMonth() === monthIdx;
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildReport(
  agent: CounterAgent,
  ourCompany: OurCompany | null | undefined,
  year: number,
  monthIdx: number,
  monthName: string,
  washes: WashEvent[],
  transactions: ClientTransaction[],
  kickbacks: Props['driverKickbacks'],
): string {
  const periodStart = startOfMonth(new Date(year, monthIdx));
  const periodEnd = endOfMonth(new Date(year, monthIdx));
  const total = washes.reduce((s, w) => s + (w.totalAmount ?? 0), 0);
  const payments = transactions.filter(t => isInMonth(t.date, year, monthIdx) && t.type === 'payment')
    .reduce((s, t) => s + (t.amount ?? 0), 0);

  // Aggregate services
  const serviceCounts = new Map<string, { count: number; price: number; total: number; isSplit: boolean }>();
  washes.forEach(w => {
    const list = [w.services?.main, ...(w.services?.additional || [])].filter(Boolean) as any[];
    list.forEach(s => {
      if (!s.serviceName) return;
      const key = s.serviceName;
      const existing = serviceCounts.get(key);
      const isSplit = !!s.split?.driverBonus;
      if (existing) {
        existing.count += 1;
        existing.total += s.price ?? 0;
      } else {
        serviceCounts.set(key, { count: 1, price: s.price ?? 0, total: s.price ?? 0, isSplit });
      }
    });
  });

  const kickbacksFiltered = (kickbacks || []).filter(k => {
    return washes.some(w => w.id === k.washEventId);
  });
  const kickbacksTotal = kickbacksFiltered.reduce((s, k) => s + k.amount, 0);
  const kickbacksByDriver = new Map<string, number>();
  kickbacksFiltered.forEach(k => {
    kickbacksByDriver.set(k.driverName, (kickbacksByDriver.get(k.driverName) ?? 0) + k.amount);
  });

  const lines: string[] = [];
  lines.push(`# Отчёт ${agent.name} — ${monthName} ${year}`);
  lines.push('');
  lines.push(`**Период:** ${format(periodStart, 'dd.MM.yyyy')} — ${format(periodEnd, 'dd.MM.yyyy')}`);
  lines.push(`**Контрагент:** ${agent.name}`);
  if (ourCompany) {
    lines.push(`**ИП-исполнитель:** ${ourCompany.fullName || ourCompany.shortName} (ИНН ${ourCompany.inn ?? '—'}${ourCompany.ogrn ? `, ОГРН ${ourCompany.ogrn}` : ''})`);
  }
  if (agent.cars && agent.cars.length > 0) {
    lines.push(`**Машина(ы):** ${agent.cars.map(c => c.licensePlate).join(', ')}`);
  }
  lines.push(`**Сгенерирован:** ${format(new Date(), 'dd.MM.yyyy HH:mm')}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // ─── 1. Журнал моек ───
  lines.push('## 1. Журнал моек');
  lines.push('');
  if (washes.length === 0) {
    lines.push('_Моек за период не было._');
  } else {
    lines.push('| # | Дата | Услуги | Сумма ₽ |');
    lines.push('|---|---|---|---:|');
    washes
      .slice()
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .forEach((w, idx) => {
        const date = format(new Date(w.timestamp), 'dd.MM.yyyy');
        const svcList: string[] = [];
        if (w.services?.main?.serviceName) {
          const isSplit = !!(w.services.main as any).split?.driverBonus;
          svcList.push(`${w.services.main.serviceName}${isSplit ? ' (split)' : ''}`);
        }
        if (Array.isArray(w.services?.additional)) {
          // Группируем одинаковые «Доп час»
          const groups = new Map<string, number>();
          w.services.additional.forEach(s => {
            if (s.serviceName) groups.set(s.serviceName, (groups.get(s.serviceName) ?? 0) + 1);
          });
          groups.forEach((count, name) => {
            svcList.push(count > 1 ? `${count}× ${name}` : name);
          });
        }
        lines.push(`| ${idx + 1} | ${date} | ${svcList.join(' + ')} | ${formatMoney(w.totalAmount ?? 0).replace(' ₽', '')} |`);
      });
    lines.push(`|   | **Итого** | | **${formatMoney(total).replace(' ₽', '')}** |`);
  }
  lines.push('');

  // ─── 2. Расшифровка услуг ───
  if (serviceCounts.size > 0) {
    lines.push('## 2. Расшифровка услуг');
    lines.push('');
    lines.push('| Услуга | Раз | Цена | Сумма |');
    lines.push('|---|---:|---:|---:|');
    Array.from(serviceCounts.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .forEach(([name, info]) => {
        lines.push(`| ${name}${info.isSplit ? ' (split)' : ''} | ${info.count} | ${formatMoney(info.price)} | ${formatMoney(info.total)} |`);
      });
    lines.push(`| **Итого** | | | **${formatMoney(total)}** |`);
    lines.push('');
  }

  // ─── 3. Кикбеки водителям ───
  if (kickbacksFiltered.length > 0) {
    lines.push('## 3. Кикбеки водителям');
    lines.push('');
    lines.push('| Водитель | Сумма | Статус |');
    lines.push('|---|---:|---|');
    kickbacksByDriver.forEach((sum, driver) => {
      lines.push(`| ${driver} | ${formatMoney(sum)} | ${kickbacksFiltered.find(k => k.driverName === driver)?.status === 'pending' ? '⏳ ждёт оплаты' : 'выплачен'} |`);
    });
    lines.push(`| **Итого** | **${formatMoney(kickbacksTotal)}** | |`);
    lines.push('');
  }

  // ─── 4. Финансы ───
  lines.push('## 4. Финансы');
  lines.push('');
  lines.push('| | ₽ |');
  lines.push('|---|---:|');
  lines.push(`| **Выручка (выставлено к оплате):** | **${formatMoney(total).replace(' ₽', '')}** |`);
  lines.push(`| Платежи от контрагента за месяц | ${formatMoney(payments).replace(' ₽', '')} |`);
  const monthEndDebt = total - payments;
  lines.push(`| **К доплате за месяц:** | **${formatMoney(monthEndDebt).replace(' ₽', '')}** |`);
  lines.push(`| **Текущий баланс контрагента:** | **${formatMoney(agent.balance ?? 0).replace(' ₽', '')}** |`);
  lines.push('');

  // ─── 5. Реквизиты ───
  if (ourCompany) {
    lines.push('## 5. Реквизиты для оплаты');
    lines.push('');
    lines.push(`**Получатель:** ${ourCompany.fullName || ourCompany.shortName}`);
    if (ourCompany.inn) lines.push(`**ИНН:** ${ourCompany.inn}`);
    if (ourCompany.ogrn) lines.push(`**ОГРН:** ${ourCompany.ogrn}`);
    if (ourCompany.legalAddress) lines.push(`**Адрес:** ${ourCompany.legalAddress}`);
    if (ourCompany.bankName) {
      lines.push('');
      lines.push(`**Банк:** ${ourCompany.bankName}`);
      if (ourCompany.settlementAccount) lines.push(`**Р/с:** ${ourCompany.settlementAccount}`);
      if (ourCompany.correspondentAccount) lines.push(`**К/с:** ${ourCompany.correspondentAccount}`);
      if (ourCompany.bik) lines.push(`**БИК:** ${ourCompany.bik}`);
    }
    lines.push('');
    lines.push(`**Назначение платежа:** Оплата за услуги мойки автотранспорта по договору за ${monthName.toLowerCase()} ${year} г. Сумма ${formatMoney(monthEndDebt).replace(' ₽', '')} рублей. Без НДС.`);
    lines.push('');
  }

  lines.push('---');
  lines.push(`_Отчёт сгенерирован автоматически из системы автомойки. Источник: webapp ${format(new Date(), 'dd.MM.yyyy HH:mm')}._`);

  return lines.join('\n');
}

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

/** Правильное склонение «мойка»: 1 мойка, 2-4 мойки, 5+ моек. */
function pluralWash(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'мойка';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'мойки';
  return 'моек';
}

export function MonthlyReportButton({ agent, washEvents, transactions, ourCompany, driverKickbacks }: Props) {
  const [open, setOpen] = React.useState(false);
  const now = new Date();
  const [year, setYear] = React.useState(now.getFullYear());
  const [monthIdx, setMonthIdx] = React.useState(now.getMonth());

  // Возможные года = от первой мойки до текущего
  const yearOptions = React.useMemo(() => {
    const years = new Set<number>();
    years.add(now.getFullYear());
    washEvents.forEach(w => {
      const y = new Date(w.timestamp).getFullYear();
      if (Number.isFinite(y)) years.add(y);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [washEvents, now]);

  // Подсчёт моек за выбранный месяц для preview
  const monthWashes = React.useMemo(() => {
    return washEvents.filter(w => {
      const linked = (w as any).counterAgentId ?? (w as any).sourceId;
      return linked === agent.id && isInMonth(w.timestamp, year, monthIdx);
    });
  }, [washEvents, agent.id, year, monthIdx]);

  const monthTotal = monthWashes.reduce((s, w) => s + (w.totalAmount ?? 0), 0);
  const monthName = MONTHS[monthIdx];

  function handleDownload() {
    const reportContent = buildReport(agent, ourCompany, year, monthIdx, monthName, monthWashes, transactions, driverKickbacks ?? null);
    const safeAgentName = agent.name.replace(/[^\wа-яА-ЯёЁ\- ]/g, '_').trim();
    const filename = `Отчёт ${safeAgentName} ${monthName} ${year}.md`;
    downloadTextFile(filename, reportContent);
    setOpen(false);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9"
        onClick={() => setOpen(true)}
      >
        <FolderOpen className="w-4 h-4 mr-1.5" /> Отчёт за месяц
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-indigo-500" />
              Отчёт за месяц — {agent.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[12px] font-semibold text-slate-600 mb-1">Месяц</label>
                <select
                  value={monthIdx}
                  onChange={(e) => setMonthIdx(Number(e.target.value))}
                  className="w-full px-2 py-2 text-sm border border-slate-200 rounded-md bg-white"
                >
                  {MONTHS.map((m, i) => (
                    <option key={i} value={i}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-slate-600 mb-1">Год</label>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="w-full px-2 py-2 text-sm border border-slate-200 rounded-md bg-white"
                >
                  {yearOptions.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className={`rounded-lg p-3 border ${monthWashes.length > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
              <div className="text-[12px] text-slate-600">Найдено за {monthName} {year}:</div>
              <div className="text-lg font-bold tabular-nums mt-1">
                {monthWashes.length} {pluralWash(monthWashes.length)} · {formatMoney(monthTotal)}
              </div>
              {monthWashes.length === 0 && (
                <div className="text-[11px] text-slate-500 mt-1">Отчёт всё равно сгенерируется — будет с пустым журналом и реквизитами.</div>
              )}
            </div>

            <div className="text-[11px] text-slate-500 leading-relaxed">
              Файл скачается как <code className="bg-slate-100 px-1 rounded">Отчёт {agent.name} {monthName} {year}.md</code>.
              Положи его в папку <code className="bg-slate-100 px-1 rounded">C:\Users\S\Desktop\Данил\контр агенты отчеты\{ourCompany?.shortName?.replace(/К\.Р\.$/, '').trim() || 'ИП'}\{agent.name}\{year}-{String(monthIdx + 1).padStart(2, '0')} {monthName}\</code>.
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              <X className="w-4 h-4 mr-1" /> Отмена
            </Button>
            <Button type="button" onClick={handleDownload} className="bg-indigo-600 hover:bg-indigo-700">
              <Download className="w-4 h-4 mr-1.5" /> Скачать .md
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
