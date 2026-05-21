'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  Loader2, Clock, CheckCircle2, HandCoins, Truck, CalendarDays,
  AlertTriangle, ChevronRight, Phone,
} from 'lucide-react';
import type { DriverKickback, DriverKickbackStatus } from '@/types';
import { useToast } from '@/hooks/use-toast';

/**
 * Phase 51a / V2-#4: Журнал бонусов водителям для контрагента.
 *
 * Workflow:
 *   1. Менеджер видит pending (мойки оформлены, ждут оплаты счёта)
 *   2. После получения денег от контрагента: чекбоксы → «Перевести в "К выплате" (N)»
 *      → bulk POST /api/driver-kickbacks/ready → статус ready
 *   3. При выплате водителю наличными: кнопка «Выплатить» в строке
 *      → POST /api/driver-kickbacks/[id]/pay → status='paid' + Expense('driver-kickback')
 */

interface Props {
  agentId: string;
  agentName: string;
}

const STATUS_META: Record<DriverKickbackStatus, {
  label: string;
  color: string;
  bg: string;
  border: string;
  Icon: typeof Clock;
}> = {
  pending: {
    label: 'Ждёт оплаты',
    color: '#92400e',
    bg: '#fef3c7',
    border: '#fde68a',
    Icon: Clock,
  },
  ready: {
    label: 'К выплате',
    color: '#1e40af',
    bg: '#dbeafe',
    border: '#bfdbfe',
    Icon: HandCoins,
  },
  paid: {
    label: 'Выплачено',
    color: '#166534',
    bg: '#dcfce7',
    border: '#bbf7d0',
    Icon: CheckCircle2,
  },
};

function fmtMoney(n: number): string {
  return n.toLocaleString('ru-RU');
}

export function DriversTab({ agentId, agentName }: Props) {
  const { toast } = useToast();
  const [items, setItems] = React.useState<DriverKickback[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<DriverKickbackStatus | 'all'>('all');
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = React.useState(false);

  const reload = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/driver-kickbacks?counterAgentId=${encodeURIComponent(agentId)}`, {
        cache: 'no-store',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setItems(Array.isArray(data) ? data : []);
      setSelected(new Set());
    } catch (e: any) {
      setError(e.message || 'Не удалось загрузить журнал бонусов');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  // KPI computed
  const kpis = React.useMemo(() => {
    if (!items) return null;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const pending = items.filter((k) => k.status === 'pending');
    const ready = items.filter((k) => k.status === 'ready');
    const paidThisMonth = items.filter((k) => {
      if (k.status !== 'paid' || !k.paidAt) return false;
      return new Date(k.paidAt) >= monthStart;
    });
    return {
      pending: { count: pending.length, sum: pending.reduce((s, k) => s + k.amount, 0) },
      ready: { count: ready.length, sum: ready.reduce((s, k) => s + k.amount, 0) },
      paidThisMonth: { count: paidThisMonth.length, sum: paidThisMonth.reduce((s, k) => s + k.amount, 0) },
    };
  }, [items]);

  const filtered = React.useMemo(() => {
    if (!items) return [];
    return filter === 'all' ? items : items.filter((k) => k.status === filter);
  }, [items, filter]);

  function toggleSelect(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function selectAllPending() {
    if (!items) return;
    const pendingIds = items.filter((k) => k.status === 'pending').map((k) => k.id);
    setSelected(new Set(pendingIds));
  }

  async function bulkMarkReady() {
    if (selected.size === 0) return;
    setSubmitting(true);
    try {
      const r = await fetch('/api/driver-kickbacks/ready', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${r.status}`);
      }
      const { updated } = await r.json();
      toast({
        title: 'Готово',
        description: `${updated} бонусов переведены в «К выплате».`,
      });
      await reload();
    } catch (e: any) {
      toast({
        title: 'Ошибка',
        description: e.message || 'Не удалось перевести бонусы',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function payKickback(id: string, driverName: string, amount: number) {
    if (!confirm(`Выплатить ${fmtMoney(amount)}₽ водителю «${driverName}»? Создастся запись в расходах.`)) {
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch(`/api/driver-kickbacks/${id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${r.status}`);
      }
      toast({
        title: 'Выплачено',
        description: `${fmtMoney(amount)}₽ — ${driverName}. Запись в расходах создана.`,
      });
      await reload();
    } catch (e: any) {
      toast({
        title: 'Ошибка выплаты',
        description: e.message || 'Не удалось выплатить',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && items === null) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Загрузка журнала бонусов…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-rose-700 flex-shrink-0 mt-0.5" />
        <div className="text-[13px] text-rose-900">
          <b>Ошибка загрузки:</b> {error}
        </div>
      </div>
    );
  }

  if (items && items.length === 0) {
    return (
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-8 text-center">
        <Truck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
        <div className="text-[14px] font-semibold text-slate-700">
          Бонусов водителям пока нет
        </div>
        <div className="text-[12px] text-slate-500 mt-1 leading-snug max-w-md mx-auto">
          Когда «{agentName}» закажет split-услугу (например «Мойка скотовоза»), здесь
          появится журнал бонусов водителю. Сумма и статус будут отслеживаться
          через workflow Ждёт оплаты → К выплате → Выплачено.
        </div>
      </div>
    );
  }

  const selectedPendingTotal = items
    ? items.filter((k) => selected.has(k.id) && k.status === 'pending').reduce((s, k) => s + k.amount, 0)
    : 0;

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      {kpis && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <KpiTile
            label="Ждут оплаты"
            count={kpis.pending.count}
            sum={kpis.pending.sum}
            color={STATUS_META.pending.color}
            bg={STATUS_META.pending.bg}
            border={STATUS_META.pending.border}
            Icon={Clock}
          />
          <KpiTile
            label="К выплате"
            count={kpis.ready.count}
            sum={kpis.ready.sum}
            color={STATUS_META.ready.color}
            bg={STATUS_META.ready.bg}
            border={STATUS_META.ready.border}
            Icon={HandCoins}
          />
          <KpiTile
            label="Выплачено в этом месяце"
            count={kpis.paidThisMonth.count}
            sum={kpis.paidThisMonth.sum}
            color={STATUS_META.paid.color}
            bg={STATUS_META.paid.bg}
            border={STATUS_META.paid.border}
            Icon={CheckCircle2}
          />
        </div>
      )}

      {/* Filter + bulk action */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {([
            ['all', 'Все', items?.length ?? 0],
            ['pending', 'Ждут', kpis?.pending.count ?? 0],
            ['ready', 'К выплате', kpis?.ready.count ?? 0],
            ['paid', 'Выплачено', kpis?.paidThisMonth.count ?? 0],
          ] as const).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className="rounded-md px-3 py-1.5 text-[12px] font-semibold flex items-center gap-1.5 transition-all"
              style={{
                background: filter === id ? '#fff' : 'transparent',
                color: filter === id ? '#0088CC' : '#64748b',
                boxShadow: filter === id ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
              }}
            >
              {label} <span className="text-[10px] opacity-70">{count}</span>
            </button>
          ))}
        </div>

        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[12px] text-slate-600">
              Выбрано <b>{selected.size}</b> ({fmtMoney(selectedPendingTotal)}₽)
            </span>
            <button
              type="button"
              onClick={bulkMarkReady}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-3 py-1.5 text-[12px] font-bold transition-colors"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <HandCoins className="w-3.5 h-3.5" />}
              Перевести в «К выплате»
            </button>
          </div>
        )}

        {filter === 'pending' && selected.size === 0 && kpis && kpis.pending.count > 0 && (
          <button
            type="button"
            onClick={selectAllPending}
            className="ml-auto text-[12px] font-semibold text-blue-600 hover:text-blue-700"
          >
            Выбрать все {kpis.pending.count} →
          </button>
        )}
      </div>

      {/* Journal */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-slate-400">
            В этом фильтре записей нет
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((k) => {
              const meta = STATUS_META[k.status];
              const isPending = k.status === 'pending';
              const isReady = k.status === 'ready';
              const isPaid = k.status === 'paid';
              const checked = selected.has(k.id);
              return (
                <div
                  key={k.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/40 transition-colors"
                  style={{ borderLeft: `4px solid ${meta.color}` }}
                >
                  {/* Checkbox только для pending */}
                  {isPending ? (
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelect(k.id)}
                      className="w-4 h-4"
                    />
                  ) : (
                    <span className="w-4 h-4 flex items-center justify-center">
                      <meta.Icon className="w-3.5 h-3.5" style={{ color: meta.color }} />
                    </span>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-[13px]">{k.driverName}</span>
                      {k.driverPhone && (
                        <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {k.driverPhone}
                        </span>
                      )}
                      {k.plate && (
                        <code className="bg-amber-50 text-slate-900 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider">
                          {k.plate}
                        </code>
                      )}
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                        style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 inline-flex items-center gap-1.5">
                      <CalendarDays className="w-3 h-3" />
                      Создан {format(new Date(k.createdAt), 'd MMM HH:mm', { locale: ru })}
                      {k.readyAt && ` · готов с ${format(new Date(k.readyAt), 'd MMM HH:mm', { locale: ru })}`}
                      {k.paidAt && ` · выплачено ${format(new Date(k.paidAt), 'd MMM HH:mm', { locale: ru })}`}
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <div className="text-[15px] font-extrabold tabular-nums" style={{ color: meta.color }}>
                      {fmtMoney(k.amount)} ₽
                    </div>
                    {isReady && (
                      <button
                        type="button"
                        onClick={() => payKickback(k.id, k.driverName, k.amount)}
                        disabled={submitting}
                        className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white px-3 py-1 text-[11px] font-bold transition-colors"
                      >
                        <HandCoins className="w-3 h-3" />
                        Выплатить
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                    {isPaid && k.paidBy && (
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        admin: {k.paidBy.slice(0, 8)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function KpiTile({
  label, count, sum, color, bg, border, Icon,
}: {
  label: string;
  count: number;
  sum: number;
  color: string;
  bg: string;
  border: string;
  Icon: typeof Clock;
}) {
  return (
    <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: bg, border: `1px solid ${border}` }}>
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: '#fff' }}
      >
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider font-bold opacity-80" style={{ color }}>
          {label}
        </div>
        <div className="text-[18px] font-extrabold tabular-nums leading-tight" style={{ color }}>
          {count} <span className="text-[12px] opacity-70">бонусов</span>
        </div>
        <div className="text-[11px] tabular-nums" style={{ color, opacity: 0.85 }}>
          {fmtMoney(sum)} ₽
        </div>
      </div>
    </div>
  );
}
